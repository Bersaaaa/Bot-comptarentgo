require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const { handleNouvelleStep, handleListeRecettes, handleBilanRecettes, handleExportRecettes } = require('./recettes');
const { handleDepenseStep, handlePhoto, confirmPhoto, handleListeDepenses } = require('./depenses');
const { readCSV, invalidateCache } = require('./storage');
const { currentMonth, monthLabel } = require('./utils');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const CHAT_ID = process.env.CHAT_ID;

// ── SESSIONS PERSISTANTES (fichier JSON) ──────────────────────
const SESSION_FILE = '/tmp/sessions.json';

function loadSessions() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveSessions(sessions) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions), 'utf8');
  } catch (e) {}
}

const sessions = loadSessions();

function getSessionKey(ctx) {
  // Clé unique : chatId_userId pour éviter les conflits en groupe
  const chatId = ctx.chat?.id || ctx.from.id;
  const userId = ctx.from.id;
  return `${chatId}_${userId}`;
}

function setSession(ctx, data) {
  const key = getSessionKey(ctx);
  sessions[key] = data;
  saveSessions(sessions);
}

function getSession(ctx) {
  return sessions[getSessionKey(ctx)];
}

function deleteSession(ctx) {
  const key = getSessionKey(ctx);
  delete sessions[key];
  saveSessions(sessions);
}

// ── /start ────────────────────────────────────────────────────
bot.command('start', (ctx) => ctx.reply(
  `🚗 *SBR AUTO / RENTGO*\n\n` +
  `*Recettes :*\n` +
  `/nouvelle — Saisir une location\n` +
  `/liste — Locations du mois\n` +
  `/bilan — Résumé du mois\n\n` +
  `*Dépenses :*\n` +
  `/depense — Saisir une dépense\n` +
  `/photo — Scanner une facture\n` +
  `/liste\_depenses — Dépenses du mois\n\n` +
  `📎 Les CSV sont épinglés dans ce chat et mis à jour automatiquement.`,
  { parse_mode: 'Markdown' }
));

// ── Recettes ──────────────────────────────────────────────────
bot.command('nouvelle', (ctx) => {
  setSession(ctx, { type: 'recette', step: 0, data: {} });
  ctx.reply('📅 *Date de début* (JJ/MM/AAAA) :', { parse_mode: 'Markdown' });
});

bot.command('liste', (ctx) => handleListeRecettes(ctx));
bot.command('bilan', (ctx) => handleBilanRecettes(ctx));
bot.command('export', (ctx) => handleExportRecettes(ctx));

// ── Dépenses ──────────────────────────────────────────────────
bot.command('depense', (ctx) => {
  setSession(ctx, { type: 'depense', step: 0, data: {} });
  ctx.reply('📅 *Date de la dépense* (JJ/MM/AAAA) :', { parse_mode: 'Markdown' });
});

bot.command('liste_depenses', (ctx) => handleListeDepenses(ctx));

// ── Annuler ───────────────────────────────────────────────────
bot.command('annuler', (ctx) => {
  deleteSession(ctx);
  ctx.reply('❌ Saisie annulée.');
});

// ── Photo facture ─────────────────────────────────────────────
bot.on('photo', async (ctx) => {
  setSession(ctx, { type: 'photo_confirm' });
  await handlePhoto(ctx, sessions, getSessionKey(ctx));
});

// ── Texte libre (saisies guidées + confirmations) ─────────────
bot.on('text', async (ctx) => {
  // Ignorer les commandes
  if (ctx.message.text.startsWith('/')) return;

  const session = getSession(ctx);
  if (!session) return;

  console.log(`[TEXT] user=${ctx.from.id} chat=${ctx.chat?.id} type=${session.type} step=${session.step}`);

  if (session.type === 'recette') {
    const done = await handleNouvelleStep(ctx, session);
    if (done) {
      deleteSession(ctx);
    } else {
      setSession(ctx, session); // sauvegarder la progression
    }

  } else if (session.type === 'depense') {
    const done = await handleDepenseStep(ctx, session);
    if (done) {
      deleteSession(ctx);
    } else {
      setSession(ctx, session);
    }

  } else if (session.type === 'photo_confirm') {
    const text = ctx.message.text.toLowerCase();
    if (text === 'oui' || text === 'o') {
      await confirmPhoto(ctx, session);
    } else {
      ctx.reply('❌ Annulé.');
    }
    deleteSession(ctx);
  }
});

// ── Export automatique le 1er du mois à 8h ───────────────────
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
    `💰 Solde net : *${(totalR - totalD).toFixed(2)} €*\n\n` +
    `📎 Les CSV du mois sont épinglés ci-dessus.`,
    { parse_mode: 'Markdown' }
  );
}, { timezone: 'Europe/Paris' });

bot.launch({ dropPendingUpdates: true });
console.log('🤖 Bot SBR AUTO démarré');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
