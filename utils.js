// Génère un CSV propre avec BOM UTF-8 (pour Excel)
function generateCSV(headers, rows) {
  const BOM = '\uFEFF';
  const escape = (val) => {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers, ...rows].map(row => row.map(escape).join(','));
  return BOM + lines.join('\r\n');
}

// Parse JJ/MM/AAAA → Date
function parseDate(str) {
  const [j, m, a] = str.split('/');
  return new Date(parseInt(a), parseInt(m) - 1, parseInt(j));
}

// Différence en jours (inclusif)
function diffDays(d1, d2) {
  const ms = d2 - d1;
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return days <= 0 ? 1 : days;
}

// Mois/année courant
function currentMonth() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

module.exports = { generateCSV, parseDate, diffDays, currentMonth };
