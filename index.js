require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const fs = require('fs');

const { handleNouvelleStep, handleListeRecettes, handleBilanRecettes, handleExportRecettes } = require('./recettes');
const { handleDepenseStep, handlePhoto, confirmPhoto, handleListeDepenses } = require('./depenses');
const { readCSV, invalidateCache } = require('./storage');
const { currentMonth, monthLabel } = require('./utils');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const CHAT_ID = process.env.CHAT_ID;

// ── SESSIONS EN MÉMOIRE (avec sauvegarde fichier) ─────────────
const SESSION_FILE = '/tmp/sessions.json';
let sessions = {};

try {
  if (fs.existsSync(SESSION_FILE)) {
    sessions = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    console.log('Sessions rechargées:', Object.keys(sessions).length);
  }
} catch (e) { sessions = {}; }

function saveSessionsToDisk() {
  try { fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions), 'utf8'); } catch (e) {}
}

function sessionKey(ctx) {
  return `${ctx.chat?.id || ctx.from.id}_${ctx.from.id}`;
}

// ── /start ────────────────────────────────────────────────────
bot.command('start', (ctx) => ctx.reply(
  `🚗 *SBR AUTO / RENTGO*\n\n` +
  `*Recettes :*\n/nouvelle — Saisir une location\n/liste — Locations du mois\n/bilan — Résumé du mois\n\n` +
  `*Dépenses :*\n/depense — Saisir une dépense\n/photo — Scanner une facture\n/liste\_depenses — Dépenses du mois\n\n` +
  `📎 Les CSV sont épinglés dans ce chat.`,
  { parse_mode: 'Markdown' }
));

// ── Recettes ──────────────────────────────────────────────────
bot.command('nouvelle', (ctx) => {
  const key = sessionKey(ctx);
  sessions[key] = { type: 'recette', step: 0, data: {} };
  saveSessionsToDisk();
  ctx.reply('📅 *Date de début* (JJ/MM/AAAA) :', { parse_mode: 'Markdown' });
});

bot.command('liste', (ctx) => handleListeRecettes(ctx));
bot.command('bilan', (ctx) => handleBilanRecettes(ctx));
bot.command('export', (ctx) => handleExportRecettes(ctx));

// ── Dépenses ──────────────────────────────────────────────────
bot.command('depense', (ctx) => {
  const key = sessionKey(ctx);
  sessions[key] = { type: 'depense', step: 0, data: {} };
  saveSessionsToDisk();
  ctx.reply('📅 *Date de la dépense* (JJ/MM/AAAA) :', { parse_mode: 'Markdown' });
});

bot.command('liste_depenses', (ctx) => handleListeDepenses(ctx));

bot.command('annuler', (ctx) => {
  delete sessions[sessionKey(ctx)];
  saveSessionsToDisk();
  ctx.reply('❌ Saisie annulée.');
});

// ── Photo facture ─────────────────────────────────────────────
bot.on('photo', async (ctx) => {
  const key = sessionKey(ctx);
  sessions[key] = { type: 'photo_confirm' };
  saveSessionsToDisk();
  await handlePhoto(ctx, sessions, key);
});

// ── Texte libre ───────────────────────────────────────────────
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  const key = sessionKey(ctx);
  const session = sessions[key];

  if (!session) return;

  console.log(`[TEXT] key=${key} type=${session.type} step=${session.step} text="${ctx.message.text}"`);

  if (session.type === 'recette') {
    const done = await handleNouvelleStep(ctx, session);
    if (done === true) {
      delete sessions[key];
    }
    saveSessionsToDisk();

  } else if (session.type === 'depense') {
    const done = await handleDepenseStep(ctx, session);
    if (done === true) {
      delete sessions[key];
    }
    saveSessionsToDisk();

  } else if (session.type === 'photo_confirm') {
    const text = ctx.message.text.toLowerCase();
    if (text === 'oui' || text === 'o') {
      await confirmPhoto(ctx, session);
    } else {
      ctx.reply('❌ Annulé.');
    }
    delete sessions[key];
    saveSessionsToDisk();
  }
});

// ── Cron mensuel ──────────────────────────────────────────────
cron.schedule('0 8 1 * *', async () => {
  if (!CHAT_ID) return;
  const now = new Date();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  invalidateCache('recettes');
  invalidateCache('depenses');
  const recettes = await readCSV(bot.telegram, CHAT_ID, 'recettes');
  const depenses = await readCSV(bot.telegram, CHAT_ID, 'depenses');

  const totalR = recettes.reduce((s, r) => s + parseFloat(r['Montant TTC'] || 0), 0);
  const totalD = depenses.reduce((s, d) => s + parseFloat(d['Montant'] || 0), 0);

  await bot.telegram.sendMessage(CHAT_ID,
    `📊 *Clôture — ${monthLabel(month, year)}*\n\n` +
    `🟢 Recettes : *${recettes.length} locations* — ${totalR.toFixed(2)} €\n` +
    `🔴 Dépenses : *${depenses.length} entrées* — ${totalD.toFixed(2)} €\n` +
    `💰 Solde net : *${(totalR - totalD).toFixed(2)} €*`,
    { parse_mode: 'Markdown' }
  );
}, { timezone: 'Europe/Paris' });

bot.launch({ dropPendingUpdates: true });
console.log('🤖 Bot SBR AUTO démarré');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
