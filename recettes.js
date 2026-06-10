const { loadData, saveData } = require('../storage');
const { generateCSV, parseDate, diffDays, currentMonth } = require('../utils');

// ─── SAISIE GUIDÉE /nouvelle ──────────────────────────────────
const STEPS = [
  { key: 'date_debut',      label: '📅 *Date de fin* (JJ/MM/AAAA) :' },
  { key: 'date_fin',        label: '👤 *Nom du client* :' },
  { key: 'client',          label: '🚗 *Véhicule* (ex: Renault Clio) :' },
  { key: 'vehicule',        label: '🔢 *Immatriculation* :' },
  { key: 'immatriculation', label: '💶 *Montant total (€)* :' },
  { key: 'montant',         label: '🔒 *Caution reçue ?* (oui/non) :' },
  { key: 'caution',         label: null }, // dernière étape
];

async function handleNouvelleStep(ctx, session) {
  const stepIndex = session.step;
  const text = ctx.message.text.trim();

  // Validation basique
  if (stepIndex === 0 || stepIndex === 1) {
    if (!text.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      ctx.reply('⚠️ Format invalide. Utilise JJ/MM/AAAA :');
      return false;
    }
  }
  if (stepIndex === 5) {
    if (isNaN(parseFloat(text.replace(',', '.')))) {
      ctx.reply('⚠️ Montant invalide. Entre un nombre (ex: 350 ou 350.00) :');
      return false;
    }
  }

  // Stocker la réponse
  const keys = ['date_debut', 'date_fin', 'client', 'vehicule', 'immatriculation', 'montant', 'caution'];
  session.data[keys[stepIndex]] = text;
  session.step++;

  // Étape suivante ou fin
  if (session.step < STEPS.length) {
    ctx.reply(STEPS[session.step - 1].label, { parse_mode: 'Markdown' });
    return false;
  }

  // Enregistrement
  const d = session.data;
  const jours = diffDays(parseDate(d.date_debut), parseDate(d.date_fin));
  const caution = d.caution.toLowerCase().startsWith('o') ? 'Oui' : 'Non';

  const recette = {
    date_debut: d.date_debut,
    date_fin: d.date_fin,
    client: d.client,
    vehicule: d.vehicule,
    immatriculation: d.immatriculation,
    jours: jours,
    montant: parseFloat(d.montant.replace(',', '.')),
    caution,
    created_at: new Date().toISOString(),
  };

  const data = loadData();
  data.recettes.push(recette);
  saveData(data);

  ctx.reply(
    `✅ *Location enregistrée !*\n\n` +
    `👤 ${recette.client}\n` +
    `🚗 ${recette.vehicule} (${recette.immatriculation})\n` +
    `📅 ${recette.date_debut} → ${recette.date_fin} (${recette.jours} j)\n` +
    `💶 ${recette.montant} € | Caution : ${recette.caution}`,
    { parse_mode: 'Markdown' }
  );
  return true;
}

// ─── /liste ───────────────────────────────────────────────────
function handleListeRecettes(ctx) {
  const data = loadData();
  const { month, year } = currentMonth();
  const liste = data.recettes.filter(r => {
    const [j, m, a] = r.date_debut.split('/');
    return parseInt(m) === month && parseInt(a) === year;
  });

  if (liste.length === 0) {
    return ctx.reply('📭 Aucune location ce mois-ci.');
  }

  const mois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  let msg = `📋 *Locations — ${mois[month-1]} ${year}*\n\n`;
  liste.forEach((r, i) => {
    msg += `${i+1}. ${r.client} — ${r.vehicule}\n`;
    msg += `   📅 ${r.date_debut} → ${r.date_fin} (${r.jours}j) — 💶 ${r.montant} €\n\n`;
  });

  ctx.reply(msg, { parse_mode: 'Markdown' });
}

// ─── /bilan ───────────────────────────────────────────────────
function handleBilanRecettes(ctx) {
  const data = loadData();
  const { month, year } = currentMonth();
  const liste = data.recettes.filter(r => {
    const [j, m, a] = r.date_debut.split('/');
    return parseInt(m) === month && parseInt(a) === year;
  });

  const total = liste.reduce((s, r) => s + r.montant, 0);
  const jours = liste.reduce((s, r) => s + r.jours, 0);
  const mois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  ctx.reply(
    `📊 *Bilan — ${mois[month-1]} ${year}*\n\n` +
    `🔢 Nb locations : *${liste.length}*\n` +
    `💶 Total encaissé : *${total.toFixed(2)} €*\n` +
    `📅 Nb jours loués : *${jours}*`,
    { parse_mode: 'Markdown' }
  );
}

// ─── /export ──────────────────────────────────────────────────
async function handleExportRecettes(ctx) {
  const data = loadData();
  const { month, year } = currentMonth();
  const liste = data.recettes.filter(r => {
    const [j, m, a] = r.date_debut.split('/');
    return parseInt(m) === month && parseInt(a) === year;
  });

  const headers = ['Date début','Date fin','Client','Véhicule','Immatriculation','Jours','Montant TTC','Caution'];
  const rows = liste.map(r => [
    r.date_debut, r.date_fin, r.client, r.vehicule,
    r.immatriculation, r.jours, r.montant, r.caution
  ]);

  const csv = generateCSV(headers, rows);
  const mois = String(month).padStart(2, '0');
  const filename = `recettes_${year}_${mois}.csv`;

  await ctx.replyWithDocument({ source: Buffer.from(csv, 'utf8'), filename });
}

module.exports = {
  handleNouvelleStep,
  handleListeRecettes,
  handleBilanRecettes,
  handleExportRecettes,
};
