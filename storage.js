const { generateCSV, parseCSV, csvFilename, currentMonth } = require('./utils');

const cache = {};

// ── Télécharge et parse le CSV épinglé ────────────────────────
async function readCSV(telegram, chatId, prefix) {
  const { month, year } = currentMonth();
  const key = `${prefix}_${month}_${year}`;
  if (cache[key]) return cache[key];

  try {
    const filename = csvFilename(prefix, month, year);
    // Cherche dans les messages récents du chat
    const msg = await findCSVMessage(telegram, chatId, filename);
    if (!msg || !msg.document) {
      cache[key] = [];
      return [];
    }

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

// ── Cherche le CSV dans les messages récents ──────────────────
async function findCSVMessage(telegram, chatId, filename) {
  try {
    // D'abord essayer le message épinglé
    const chat = await telegram.getChat(chatId);
    if (chat.pinned_message?.document?.file_name === filename) {
      return chat.pinned_message;
    }

    // Sinon chercher dans l'historique récent via getUpdates workaround
    // On stocke le file_id du dernier CSV envoyé en cache
    const cacheKey = `file_id_${filename}`;
    if (cache[cacheKey]) {
      return { document: { file_id: cache[cacheKey] } };
    }

    return null;
  } catch (e) {
    console.error('findCSVMessage error:', e.message);
    return null;
  }
}

// ── Écrit le CSV et épingle ────────────────────────────────────
async function writeCSV(telegram, chatId, prefix, headers, rows) {
  const { month, year } = currentMonth();
  const key = `${prefix}_${month}_${year}`;
  cache[key] = rows;

  const csv = generateCSV(headers, rows);
  const filename = csvFilename(prefix, month, year);
  const buf = Buffer.from(csv, 'utf8');

  const sent = await telegram.sendDocument(chatId, {
    source: buf,
    filename,
  }, {
    caption: `📁 *${filename}* — mis à jour`,
    parse_mode: 'Markdown',
  });

  // Mémoriser le file_id pour lecture future
  cache[`file_id_${filename}`] = sent.document.file_id;

  try {
    await telegram.pinChatMessage(chatId, sent.message_id, { disable_notification: true });
  } catch (e) {
    console.error('Pin error:', e.message);
  }

  return sent;
}

function invalidateCache(prefix) {
  const { month, year } = currentMonth();
  delete cache[`${prefix}_${month}_${year}`];
}

module.exports = { readCSV, writeCSV, invalidateCache };
