export function getRecordFromGameLog(gameLog) {
  if (!gameLog || !Array.isArray(gameLog)) return null;
  const w = gameLog.filter((x) => x === 1).length;
  const l = gameLog.filter((x) => x === 0).length;
  return { w, l };
}

export function standingsSort(a, b) {
  const gpA = a.w + a.l;
  const gpB = b.w + b.l;
  const pctA = gpA > 0 ? a.w / gpA : 0;
  const pctB = gpB > 0 ? b.w / gpB : 0;
  if (pctB !== pctA) return pctB - pctA;
  if (b.w !== a.w) return b.w - a.w;
  return (b.eff || 0) - (a.eff || 0);
}
