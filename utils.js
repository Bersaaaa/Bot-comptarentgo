// ── CSV ──────────────────────────────────────────────────────
const BOM = '\uFEFF';

function generateCSV(headers, rows) {
  const escape = (val) => {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return BOM + [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n');
}

function parseCSV(text) {
  // Retire le BOM si présent
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (cols[i] || '').trim());
    return obj;
  });
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

// ── Dates ─────────────────────────────────────────────────────
function parseDate(str) {
  const [j, m, a] = str.split('/');
  return new Date(parseInt(a), parseInt(m) - 1, parseInt(j));
}

function diffDays(d1, d2) {
  const ms = parseDate(d2) - parseDate(d1);
  const d = Math.round(ms / 86400000);
  return d <= 0 ? 1 : d;
}

function currentMonth() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function monthLabel(month, year) {
  const noms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  return `${noms[month-1]} ${year}`;
}

function csvFilename(prefix, month, year) {
  return `${prefix}_${year}_${String(month).padStart(2,'0')}.csv`;
}

module.exports = { generateCSV, parseCSV, parseDate, diffDays, currentMonth, monthLabel, csvFilename };
