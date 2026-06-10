const { generateCSV, parseCSV, csvFilename, currentMonth } = require('./utils');
const fs = require('fs');

const FILEID_STORE = '/tmp/fileids.json';
const cache = {};

// Charge les file_ids sauvegardés
let fileIds = {};
try {
  if (fs.existsSync(FILEID_STORE)) {
    fileIds = JSON.parse(fs.readFileSync(FILEID_STORE, 'utf8'));
    console.log('FileIds rechargés:', Object.keys(fileIds));
  }
} catch (e) { fileIds = {}; }

function saveFileIds() {
  try { fs.writeFileSync(FILEID_STORE, JSON.stringify(fileIds), 'utf8'); } catch (e) {}
}

// ── Lire le CSV ───────────────────────────────────────────────
async function readCSV(telegram, chatId, prefix) {
  const { month, year } = currentMonth();
  const key = `${prefix}_${month}_${year}`;
  if (cache[key]) return cache[key];

  try {
    const filename = csvFilename(prefix, month, year);
    let fileId = null;

    // 1. Chercher dans le message épinglé
    try {
      const chat = await telegram.getChat(chatId);
      if (chat.pinned_message?.document?.file_name === filename) {
        fileId = chat.pinned_message.document.file_id;
        console.log(`readCSV: trouvé dans message épinglé`);
      }
    } catch (e) {}

    // 2. Sinon utiliser le file_id sauvegardé sur disque
    if (!fileId && fileIds[filename]) {
      fileId = fileIds[filename];
      console.log(`readCSV: trouvé dans fileIds persistants`);
    }

    if (!fileId) {
      console.log(`readCSV: ${filename} introuvable nulle part`);
      return [];
    }

    const fileLink = await telegram.getFileLink(fileId);
    const res = await fetch(fileLink.href);
    const text = await res.text();
    const rows = parseCSV(text);
    cache[key] = rows;
    console.log(`readCSV: ${rows.length} lignes chargées`);
    return rows;
  } catch (e) {
    console.error('readCSV error:', e.message);
    return [];
  }
}

// ── Écrire le CSV ─────────────────────────────────────────────
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

  // Sauvegarder le file_id sur disque
  fileIds[filename] = sent.document.file_id;
  saveFileIds();
  console.log(`writeCSV: ${filename} sauvegardé`);

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
