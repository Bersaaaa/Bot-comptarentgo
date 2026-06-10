/**
 * storage.js — Le chat Telegram EST la base de données.
 *
 * Principe :
 *  - Un message épinglé par type de fichier (recettes / dépenses) par mois
 *  - Pour lire : on télécharge le fichier épinglé et on parse le CSV
 *  - Pour écrire : on ajoute la ligne, on renvoie le CSV, on épingle le nouveau message
 *
 * Le bot doit être ADMIN du groupe/channel avec droits :
 *   - Envoyer des fichiers
 *   - Épingler des messages
 */

const { generateCSV, parseCSV, csvFilename, currentMonth } = require('./utils');

// Cache en mémoire pour éviter de re-télécharger à chaque commande
const cache = {};

// ── Télécharge et parse le CSV épinglé ────────────────────────
async function readCSV(telegram, chatId, prefix) {
  const { month, year } = currentMonth();
  const key = `${prefix}_${month}_${year}`;

  if (cache[key]) return cache[key];

  try {
    const chat = await telegram.getChat(chatId);
    if (!chat.pinned_message) return [];

    // Cherche le bon fichier parmi les messages épinglés récents
    const filename = csvFilename(prefix, month, year);
    const msg = await findPinnedCSV(telegram, chatId, filename);
    if (!msg || !msg.document) return [];

    const fileLink = await telegram.getFileLink(msg.document.file_id);
    const res = await fetch(fileLink.href);
    const text = await res.text();
    const rows = parseCSV(text);
    cache[key] = rows;
    return rows;
  } catch (e) {
    console.error('readCSV error:', e.message);
    return [];
  }
}

// ── Cherche un message épinglé avec le bon nom de fichier ─────
async function findPinnedCSV(telegram, chatId, filename) {
  try {
    // Telegram ne permet de récupérer qu'un seul message épinglé via getChat
    // On utilise donc un canal dédié et on stocke les file_id dans le cache
    const chat = await telegram.getChat(chatId);
    const pinned = chat.pinned_message;
    if (pinned && pinned.document && pinned.document.file_name === filename) {
      return pinned;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Écrit (ou met à jour) le CSV épinglé ──────────────────────
async function writeCSV(telegram, chatId, prefix, headers, rows) {
  const { month, year } = currentMonth();
  const key = `${prefix}_${month}_${year}`;

  // Met à jour le cache
  cache[key] = rows;

  const csv = generateCSV(headers, rows);
  const filename = csvFilename(prefix, month, year);
  const buf = Buffer.from(csv, 'utf8');

  // Envoie le nouveau fichier
  const sent = await telegram.sendDocument(chatId, {
    source: buf,
    filename,
  }, {
    caption: `📁 *${filename}* — mis à jour`,
    parse_mode: 'Markdown',
  });

  // Épingle le nouveau message (remplace l'ancien)
  try {
    await telegram.pinChatMessage(chatId, sent.message_id, { disable_notification: true });
  } catch (e) {
    console.error('Pin error (vérifie que le bot est admin):', e.message);
  }

  return sent;
}

// ── Invalide le cache (forcer relecture) ──────────────────────
function invalidateCache(prefix) {
  const { month, year } = currentMonth();
  delete cache[`${prefix}_${month}_${year}`];
}

module.exports = { readCSV, writeCSV, invalidateCache };
