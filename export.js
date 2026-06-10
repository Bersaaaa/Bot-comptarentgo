const { loadData } = require('../storage');
const { generateCSV } = require('../utils');

async function sendMonthlyExport(bot, chatId) {
  const now = new Date();
  // On exporte le mois PRÉCÉDENT (puisqu'on est le 1er du nouveau mois)
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const moisPad = String(month).padStart(2, '0');

  const data = loadData();
  const moisNoms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  // ── Recettes ──
  const recettes = data.recettes.filter(r => {
    const [j, m, a] = r.date_debut.split('/');
    return parseInt(m) === month && parseInt(a) === year;
  });

  const csvR = generateCSV(
    ['Date début','Date fin','Client','Véhicule','Immatriculation','Jours','Montant TTC','Caution'],
    recettes.map(r => [r.date_debut, r.date_fin, r.client, r.vehicule, r.immatriculation, r.jours, r.montant, r.caution])
  );

  // ── Dépenses ──
  const depenses = data.depenses.filter(d => {
    const [j, m, a] = d.date.split('/');
    return parseInt(m) === month && parseInt(a) === year;
  });

  const csvD = generateCSV(
    ['Date','Fournisseur','Catégorie','Montant','Description'],
    depenses.map(d => [d.date, d.fournisseur, d.categorie, d.montant, d.description])
  );

  // ── Envoi ──
  const totalR = recettes.reduce((s, r) => s + r.montant, 0);
  const totalD = depenses.reduce((s, d) => s + d.montant, 0);

  await bot.telegram.sendMessage(
    chatId,
    `📊 *Export automatique — ${moisNoms[month-1]} ${year}*\n\n` +
    `🟢 Recettes : *${recettes.length} locations* — ${totalR.toFixed(2)} €\n` +
    `🔴 Dépenses : *${depenses.length} entrées* — ${totalD.toFixed(2)} €\n` +
    `💰 Solde : *${(totalR - totalD).toFixed(2)} €*`,
    { parse_mode: 'Markdown' }
  );

  await bot.telegram.sendDocument(chatId, {
    source: Buffer.from(csvR, 'utf8'),
    filename: `recettes_${year}_${moisPad}.csv`,
  });

  await bot.telegram.sendDocument(chatId, {
    source: Buffer.from(csvD, 'utf8'),
    filename: `depenses_${year}_${moisPad}.csv`,
  });
}

module.exports = { sendMonthlyExport };
