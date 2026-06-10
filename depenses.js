const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const { readCSV, writeCSV, invalidateCache } = require('./storage');
const { currentMonth, monthLabel } = require('./utils');

const HEADERS = ['Date','Fournisseur','Catégorie','Montant','Description'];
const CATEGORIES = { '1': 'carburant', '2': 'réparation', '3': 'assurance', '4': 'autre' };
const CHAT_ID = process.env.CHAT_ID;

// ── Saisie guidée /depense ────────────────────────────────────
async function handleDepenseStep(ctx, session) {
  const step = session.step;
  const text = ctx.message.text.trim();
  const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

  if (step === 0) {
    if (!DATE_RE.test(text)) return ctx.reply('⚠️ Format invalide. Ex : 03/06/2025 :');
    session.data.date = text;
    session.step++;
    return ctx.reply('🏪 *Fournisseur* :', { parse_mode: 'Markdown' });
  }
  if (step === 1) {
    session.data.fournisseur = text;
    session.step++;
    return ctx.reply(
      '📂 *Catégorie* :\n1. Carburant\n2. Réparation\n3. Assurance\n4. Autre',
      { parse_mode: 'Markdown' }
    );
  }
  if (step === 2) {
    const cat = CATEGORIES[text] || text.toLowerCase();
    if (!Object.values(CATEGORIES).includes(cat)) return ctx.reply('⚠️ Tape 1, 2, 3 ou 4 :');
    session.data.categorie = cat;
    session.step++;
    return ctx.reply('💶 *Montant (€)* :', { parse_mode: 'Markdown' });
  }
  if (step === 3) {
    const val = parseFloat(text.replace(',', '.'));
    if (isNaN(val)) return ctx.reply('⚠️ Montant invalide. Ex : 65.50 :');
    session.data.montant = val;
    session.step++;
    return ctx.reply('📝 *Description* (ou — pour passer) :', { parse_mode: 'Markdown' });
  }
  if (step === 4) {
    const d = session.data;
    const description = text === '—' || text === '-' ? '' : text;
    const newRow = [d.date, d.fournisseur, d.categorie, d.montant, description];

    invalidateCache('depenses');
    const existing = await readCSV(ctx.telegram, CHAT_ID, 'depenses');
    const rows = existing.map(r => [r['Date'], r['Fournisseur'], r['Catégorie'], r['Montant'], r['Description']]);
    rows.push(newRow);

    await writeCSV(ctx.telegram, CHAT_ID, 'depenses', HEADERS, rows);

    await ctx.reply(
      `✅ *Dépense enregistrée !*\n\n` +
      `📅 ${d.date}\n` +
      `🏪 ${d.fournisseur}\n` +
      `📂 ${d.categorie}\n` +
      `💶 ${d.montant} €\n` +
      `📝 ${description || '—'}`,
      { parse_mode: 'Markdown' }
    );
    return true;
  }
}

// ── /photo — Extraction via Claude API ───────────────────────
async function handlePhoto(ctx, sessions) {
  await ctx.reply('🔍 Analyse de la facture en cours...');
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const res = await fetch(fileLink.href);
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Extrait de cette facture : date (JJ/MM/AAAA), fournisseur/émetteur, montant total TTC en euros. Réponds UNIQUEMENT en JSON sans markdown : {"date":"JJ/MM/AAAA","fournisseur":"...","montant":0.00}. Si valeur introuvable, mets null.' },
        ],
      }],
    });

    const raw = result.content.map(b => b.text || '').join('');
    const ex = JSON.parse(raw.replace(/```json|```/g, '').trim());

    sessions[ctx.from.id] = {
      type: 'photo_confirm',
      data: {
        date: ex.date || '??/??/????',
        fournisseur: ex.fournisseur || 'Inconnu',
        categorie: 'autre',
        montant: ex.montant || 0,
        description: 'Photo facture',
      },
    };

    ctx.reply(
      `📄 *Informations extraites :*\n\n` +
      `📅 Date : ${ex.date || 'Non trouvée'}\n` +
      `🏪 Fournisseur : ${ex.fournisseur || 'Non trouvé'}\n` +
      `💶 Montant : ${ex.montant ?? 'Non trouvé'} €\n\n` +
      `✅ *Confirmer l'enregistrement ?* (oui/non)`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Photo error:', err.message);
    ctx.reply('❌ Impossible d\'analyser la photo. Utilise /depense pour saisir manuellement.');
  }
}

// ── Confirmation après /photo ─────────────────────────────────
async function confirmPhoto(ctx, session) {
  const d = session.data;
  const newRow = [d.date, d.fournisseur, d.categorie, d.montant, d.description];

  invalidateCache('depenses');
  const existing = await readCSV(ctx.telegram, CHAT_ID, 'depenses');
  const rows = existing.map(r => [r['Date'], r['Fournisseur'], r['Catégorie'], r['Montant'], r['Description']]);
  rows.push(newRow);

  await writeCSV(ctx.telegram, CHAT_ID, 'depenses', HEADERS, rows);
  ctx.reply('✅ Dépense enregistrée !');
}

// ── /liste_depenses ───────────────────────────────────────────
async function handleListeDepenses(ctx) {
  invalidateCache('depenses');
  const rows = await readCSV(ctx.telegram, CHAT_ID, 'depenses');
  const { month, year } = currentMonth();

  const liste = rows.filter(r => {
    const parts = (r['Date'] || '').split('/');
    return parseInt(parts[1]) === month && parseInt(parts[2]) === year;
  });

  if (!liste.length) return ctx.reply('📭 Aucune dépense ce mois-ci.');

  const total = liste.reduce((s, r) => s + parseFloat(r['Montant'] || 0), 0);
  let msg = `💸 *Dépenses — ${monthLabel(month, year)}*\n\n`;
  liste.forEach((r, i) => {
    msg += `${i+1}. *${r['Fournisseur']}* (${r['Catégorie']})\n`;
    msg += `   📅 ${r['Date']} — 💶 ${r['Montant']} €\n\n`;
  });
  msg += `💰 *Total : ${total.toFixed(2)} €*`;
  ctx.reply(msg, { parse_mode: 'Markdown' });
}

module.exports = { handleDepenseStep, handlePhoto, confirmPhoto, handleListeDepenses };
