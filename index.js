require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { loadData, saveData } = require('./storage');
const { handleNouvelle, handleNouvelleStep } = require('./handlers/recettes');
const { handleDepense, handleDepenseStep, handlePhoto } = require('./handlers/depenses');
const { handleListeRecettes, handleBilanRecettes, handleExportRecettes } = require('./handlers/recettes');
const { handleListeDepenses, handleExportDepenses } = require('./handlers/depenses');
const { sendMonthlyExport } = require('./handlers/export');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Sessions en mémoire pour les saisies guidées
const sessions = {};

// ─── RECETTES ────────────────────────────────────────────────
bot.command('nouvelle', (ctx) => {
  sessions[ctx.from.id] = { type: 'recette', step: 0, data: {} };
  ctx.reply('📅 *Date de début* (format JJ/MM/AAAA) :', { parse_mode: 'Markdown' });
});

bot.command('liste', (ctx) => handleListeRecettes(ctx));
bot.command('bilan', (ctx) => handleBilanRecettes(ctx));
bot.command('export', (ctx) => handleExportRecettes(ctx));

// ─── DÉPENSES ─────────────────────────────────────────────────
bot.command('depense', (ctx) => {
  sessions[ctx.from.id] = { type: 'depense', step: 0, data: {} };
  ctx.reply('📅 *Date de la dépense* (format JJ/MM/AAAA) :', { parse_mode: 'Markdown' });
});

bot.command('liste_depenses', (ctx) => handleListeDepenses(ctx));
bot.command('export_depenses', (ctx) => handleExportDepenses(ctx));

// ─── AIDE ─────────────────────────────────────────────────────
bot.command('start', (ctx) => {
  ctx.reply(
    `🚗 *SBR AUTO / RENTGO — Bot de gestion*\n\n` +
    `*Recettes :*\n` +
    `/nouvelle — Saisir une location\n` +
    `/liste — Locations du mois\n` +
    `/bilan — Résumé du mois\n` +
    `/export — Export CSV recettes\n\n` +
    `*Dépenses :*\n` +
    `/depense — Saisir une dépense\n` +
    `/photo — Scanner une facture\n` +
    `/liste\\_depenses — Dépenses du mois\n` +
    `/export\\_depenses — Export CSV dépenses`,
    { parse_mode: 'Markdown' }
  );
});

// ─── PHOTO FACTURE ────────────────────────────────────────────
bot.on('photo', async (ctx) => {
  const session = sessions[ctx.from.id];
  if (session && session.type === 'photo_confirm') {
    await handlePhoto(ctx, sessions);
  } else {
    sessions[ctx.from.id] = { type: 'photo_confirm', step: 'waiting' };
    await handlePhoto(ctx, sessions);
  }
});

// ─── SAISIE GUIDÉE (texte libre) ──────────────────────────────
bot.on('text', async (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session) return;

  if (session.type === 'recette') {
    const done = await handleNouvelleStep(ctx, session);
    if (done) delete sessions[ctx.from.id];
  } else if (session.type === 'depense') {
    const done = await handleDepenseStep(ctx, session);
    if (done) delete sessions[ctx.from.id];
  } else if (session.type === 'photo_confirm') {
    // Confirmation après extraction photo
    const text = ctx.message.text.toLowerCase();
    if (text === 'oui' || text === 'o') {
      const data = loadData();
      data.depenses.push(session.data);
      saveData(data);
      ctx.reply('✅ Dépense enregistrée !');
    } else {
      ctx.reply('❌ Annulé.');
    }
    delete sessions[ctx.from.id];
  }
});

// ─── EXPORT AUTOMATIQUE LE 1ER DU MOIS ───────────────────────
cron.schedule('0 8 1 * *', async () => {
  if (process.env.CHAT_ID) {
    await sendMonthlyExport(bot, process.env.CHAT_ID);
  }
}, { timezone: 'Europe/Paris' });

bot.launch();
console.log('🤖 Bot démarré');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
