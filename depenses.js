const Anthropic = require('@anthropic-ai/sdk');
const { loadData, saveData } = require('../storage');
const { generateCSV, currentMonth } = require('../utils');

const CATEGORIES = ['carburant', 'réparation', 'assurance', 'autre'];

// ─── SAISIE GUIDÉE /depense ───────────────────────────────────
async function handleDepenseStep(ctx, session) {
  const step = session.step;
  const text = ctx.message.text.trim();

  if (step === 0) {
    if (!text.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      ctx.reply('⚠️ Format invalide. Utilise JJ/MM/AAAA :');
      return false;
    }
    session.data.date = text;
    session.step++;
    ctx.reply('🏪 *Fournisseur* :', { parse_mode: 'Markdown' });
    return false;
  }

  if (step === 1) {
    session.data.fournisseur = text;
    session.step++;
    ctx.reply(
      '📂 *Catégorie* :\n1. Carburant\n2. Réparation\n3. Assurance\n4. Autre',
      { parse_mode: 'Markdown' }
    );
    return false;
  }

  if (step === 2) {
    const map = { '1': 'carburant', '2': 'réparation', '3': 'assurance', '4': 'autre' };
    const cat = map[text] || text.toLowerCase();
    if (!CATEGORIES.includes(cat)) {
      ctx.reply('⚠️ Tape 1, 2, 3 ou 4 :');
      return false;
    }
    session.data.categorie = cat;
    session.step++;
    ctx.reply('💶 *Montant (€)* :', { parse_mode: 'Markdown' });
    return false;
  }

  if (step === 3) {
    if (isNaN(parseFloat(text.replace(',', '.')))) {
      ctx.reply('⚠️ Montant invalide (ex: 45.00) :');
      return false;
    }
    session.data.montant = parseFloat(text.replace(',', '.'));
    session.step++;
    ctx.reply('📝 *Description* (ou "–" pour passer) :', { parse_mode: 'Markdown' });
    return false;
  }

  if (step === 4) {
    session.data.description = text === '–' ? '' : text;

    const depense = {
      ...session.data,
      created_at: new Date().toISOString(),
    };

    const data = loadData();
    data.depenses.push(depense);
    saveData(data);

    ctx.reply(
      `✅ *Dépense enregistrée !*\n\n` +
      `📅 ${depense.date}\n` +
      `🏪 ${depense.fournisseur}\n` +
      `📂 ${depense.categorie}\n` +
      `💶 ${depense.montant} €\n` +
      `📝 ${depense.description || '—'}`,
      { parse_mode: 'Markdown' }
    );
    return true;
  }
}

// ─── /photo — Extraction via Claude API ───────────────────────
async function handlePhoto(ctx, sessions) {
  ctx.reply('🔍 Analyse de la facture en cours...');

  try {
    // Récupérer la photo en base64
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const response = await fetch(fileLink.href);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Appel Claude API
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: 'Extrait de cette facture : la date (format JJ/MM/AAAA), le fournisseur/émetteur, et le montant total TTC en euros. Réponds UNIQUEMENT en JSON sans markdown, format : {"date":"JJ/MM/AAAA","fournisseur":"...","montant":0.00}. Si tu ne trouves pas une valeur, mets null.',
          },
        ],
      }],
    });

    const raw = result.content.map(b => b.text || '').join('');
    const extracted = JSON.parse(raw.replace(/```json|```/g, '').trim());

    sessions[ctx.from.id] = {
      type: 'photo_confirm',
      data: {
        date: extracted.date || '??/??/????',
        fournisseur: extracted.fournisseur || 'Inconnu',
        categorie: 'autre',
        montant: extracted.montant || 0,
        description: 'Importé via photo',
        created_at: new Date().toISOString(),
      },
    };

    ctx.reply(
      `📄 *Informations extraites :*\n\n` +
      `📅 Date : ${extracted.date || 'Non trouvée'}\n` +
      `🏪 Fournisseur : ${extracted.fournisseur || 'Non trouvé'}\n` +
      `💶 Montant : ${extracted.montant || 'Non trouvé'} €\n\n` +
      `✅ *Confirmer l'enregistrement ?* (oui/non)`,
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    console.error('Photo extraction error:', err);
    ctx.reply('❌ Impossible d\'analyser la facture. Essaie /depense pour saisir manuellement.');
  }
}

// ─── /liste_depenses ──────────────────────────────────────────
function handleListeDepenses(ctx) {
  const data = loadData();
  const { month, year } = currentMonth();
  const liste = data.depenses.filter(d => {
    const [j, m, a] = d.date.split('/');
    return parseInt(m) === month && parseInt(a) === year;
  });

  if (liste.length === 0) {
    return ctx.reply('📭 Aucune dépense ce mois-ci.');
  }

  const mois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  let msg = `💸 *Dépenses — ${mois[month-1]} ${year}*\n\n`;
  const total = liste.reduce((s, d) => s + d.montant, 0);

  liste.forEach((d, i) => {
    msg += `${i+1}. ${d.fournisseur} (${d.categorie})\n`;
    msg += `   📅 ${d.date} — 💶 ${d.montant} €\n\n`;
  });

  msg += `💰 *Total : ${total.toFixed(2)} €*`;
  ctx.reply(msg, { parse_mode: 'Markdown' });
}

// ─── /export_depenses ─────────────────────────────────────────
async function handleExportDepenses(ctx) {
  const data = loadData();
  const { month, year } = currentMonth();
  const liste = data.depenses.filter(d => {
    const [j, m, a] = d.date.split('/');
    return parseInt(m) === month && parseInt(a) === year;
  });

  const headers = ['Date','Fournisseur','Catégorie','Montant','Description'];
  const rows = liste.map(d => [d.date, d.fournisseur, d.categorie, d.montant, d.description]);

  const csv = generateCSV(headers, rows);
  const moisPad = String(month).padStart(2, '0');
  const filename = `depenses_${year}_${moisPad}.csv`;

  await ctx.replyWithDocument({ source: Buffer.from(csv, 'utf8'), filename });
}

module.exports = {
  handleDepenseStep,
  handlePhoto,
  handleListeDepenses,
  handleExportDepenses,
};
