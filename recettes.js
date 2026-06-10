const { readCSV, writeCSV, invalidateCache } = require('./storage');
const { diffDays, currentMonth, monthLabel } = require('./utils');

const HEADERS = ['Date début','Date fin','Client','Véhicule','Immatriculation','Jours','Montant TTC','Caution'];
const CHAT_ID = process.env.CHAT_ID;

// ── Saisie guidée /nouvelle ───────────────────────────────────
async function handleNouvelleStep(ctx, session) {
  const step = session.step;
  const text = ctx.message.text.trim();

  const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

  if (step === 0) {
    if (!DATE_RE.test(text)) return ctx.reply('⚠️ Format invalide. Ex : 01/06/2025 :');
    session.data.date_debut = text;
    session.step++;
    return ctx.reply('📅 *Date de fin* (JJ/MM/AAAA) :', { parse_mode: 'Markdown' });
  }
  if (step === 1) {
    if (!DATE_RE.test(text)) return ctx.reply('⚠️ Format invalide. Ex : 05/06/2025 :');
    session.data.date_fin = text;
    session.step++;
    return ctx.reply('👤 *Nom du client* :', { parse_mode: 'Markdown' });
  }
  if (step === 2) {
    session.data.client = text;
    session.step++;
    return ctx.reply('🚗 *Véhicule* (ex : Renault Clio) :', { parse_mode: 'Markdown' });
  }
  if (step === 3) {
    session.data.vehicule = text;
    session.step++;
    return ctx.reply('🔢 *Immatriculation* :', { parse_mode: 'Markdown' });
  }
  if (step === 4) {
    session.data.immatriculation = text;
    session.step++;
    return ctx.reply('💶 *Montant total (€)* :', { parse_mode: 'Markdown' });
  }
  if (step === 5) {
    const val = parseFloat(text.replace(',', '.'));
    if (isNaN(val)) return ctx.reply('⚠️ Montant invalide. Ex : 280 ou 280.50 :');
    session.data.montant = val;
    session.step++;
    return ctx.reply('🔒 *Caution reçue ?* (oui/non) :', { parse_mode: 'Markdown' });
  }
  if (step === 6) {
    const caution = text.toLowerCase().startsWith('o') ? 'Oui' : 'Non';
    const d = session.data;
    const jours = diffDays(d.date_debut, d.date_fin);

    const newRow = [d.date_debut, d.date_fin, d.client, d.vehicule, d.immatriculation, jours, d.montant, caution];

    // Lire les lignes existantes et ajouter
    invalidateCache('recettes');
    const existing = await readCSV(ctx.telegram, CHAT_ID, 'recettes');
    const rows = existing.map(r => [
      r['Date début'], r['Date fin'], r['Client'], r['Véhicule'],
      r['Immatriculation'], r['Jours'], r['Montant TTC'], r['Caution']
    ]);
    rows.push(newRow);

    await writeCSV(ctx.telegram, CHAT_ID, 'recettes', HEADERS, rows);

    await ctx.reply(
      `✅ *Location enregistrée !*\n\n` +
      `👤 ${d.client}\n` +
      `🚗 ${d.vehicule} — ${d.immatriculation}\n` +
      `📅 ${d.date_debut} → ${d.date_fin} *(${jours} j)*\n` +
      `💶 ${d.montant} € | Caution : ${caution}`,
      { parse_mode: 'Markdown' }
    );
    return true; // session terminée
  }
}

// ── /liste ────────────────────────────────────────────────────
async function handleListeRecettes(ctx) {
  invalidateCache('recettes');
  const rows = await readCSV(ctx.telegram, CHAT_ID, 'recettes');
  const { month, year } = currentMonth();

  const liste = rows.filter(r => {
    const parts = (r['Date début'] || '').split('/');
    return parseInt(parts[1]) === month && parseInt(parts[2]) === year;
  });

  if (!liste.length) return ctx.reply('📭 Aucune location ce mois-ci.');

  let msg = `📋 *Locations — ${monthLabel(month, year)}*\n\n`;
  liste.forEach((r, i) => {
    msg += `${i+1}. *${r['Client']}* — ${r['Véhicule']}\n`;
    msg += `   📅 ${r['Date début']} → ${r['Date fin']} (${r['Jours']}j) — 💶 ${r['Montant TTC']} €\n\n`;
  });
  ctx.reply(msg, { parse_mode: 'Markdown' });
}

// ── /bilan ────────────────────────────────────────────────────
async function handleBilanRecettes(ctx) {
  invalidateCache('recettes');
  const rows = await readCSV(ctx.telegram, CHAT_ID, 'recettes');
  const { month, year } = currentMonth();

  const liste = rows.filter(r => {
    const parts = (r['Date début'] || '').split('/');
    return parseInt(parts[1]) === month && parseInt(parts[2]) === year;
  });

  const total = liste.reduce((s, r) => s + parseFloat(r['Montant TTC'] || 0), 0);
  const jours = liste.reduce((s, r) => s + parseInt(r['Jours'] || 0), 0);

  ctx.reply(
    `📊 *Bilan — ${monthLabel(month, year)}*\n\n` +
    `🔢 Nb locations : *${liste.length}*\n` +
    `💶 Total encaissé : *${total.toFixed(2)} €*\n` +
    `📅 Nb jours loués : *${jours}*`,
    { parse_mode: 'Markdown' }
  );
}

// ── /export ───────────────────────────────────────────────────
async function handleExportRecettes(ctx) {
  invalidateCache('recettes');
  const rows = await readCSV(ctx.telegram, CHAT_ID, 'recettes');

  if (!rows.length) return ctx.reply('📭 Aucune donnée à exporter ce mois-ci.');

  // Renvoie simplement le CSV depuis le chat (déjà épinglé)
  ctx.reply('📎 Le CSV est déjà épinglé dans ce chat. Utilise /nouvelle pour ajouter une location.');
}

module.exports = { handleNouvelleStep, handleListeRecettes, handleBilanRecettes, handleExportRecettes };
