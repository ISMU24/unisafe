const TIME_WINDOW_MS = 15 * 60 * 1000;

function tokenise(text) {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 3));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(t => b.has(t)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function checkDuplicate(description, category, recentReports = []) {
  if (!description || description.trim().length < 10) return null;
  const now = Date.now();
  const tokens = tokenise(description);
  const matches = recentReports.filter(r => {
    if (r.category !== category) return false;
    if (now - new Date(r.timestamp).getTime() > TIME_WINDOW_MS) return false;
    return jaccard(tokens, tokenise(r.description)) >= 0.25;
  });
  if (!matches.length) return null;
  return {
    clusterSize: matches.length + 1,
    firstReport: matches[0],
    similarity: Math.round(Math.max(...matches.map(m => jaccard(tokens, tokenise(m.description)))) * 100),
  };
}
