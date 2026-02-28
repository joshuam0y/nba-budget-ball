export function TeamHighs({ teamSeasonHighs, teamPlayoffHighs, roster, title, showPlayoff }) {
  const defs = [
    ["pts", "PTS"],
    ["reb", "REB"],
    ["ast", "AST"],
    ["stl", "STL"],
    ["blk", "BLK"],
    ["fgm", "FGM"],
    ["tpm", "3PM"],
    ["ftm", "FT"],
    ["tov", "TOV"],
  ];
  const myNames = new Set(Object.values(roster || {}).filter(Boolean).map((p) => p.name));
  const buildRows = (highs) => {
    if (!highs || Object.keys(highs).length === 0) return [];
    return defs.map(([key, label]) => {
      let best = null;
      myNames.forEach((name) => {
        const v = highs[name] && highs[name][key];
        if (v != null && (!best || v > best.val)) best = { name, val: v };
      });
      return { key, label, ...best };
    });
  };
  const seasonRows = buildRows(teamSeasonHighs);
  const playoffRows = showPlayoff ? buildRows(teamPlayoffHighs) : [];
  const hasAny = seasonRows.some((r) => r.val != null) || playoffRows.some((r) => r.val != null);
  if (!hasAny) return null;
  return (
    <div style={{ background: "#020617", borderRadius: 10, border: "1px solid #1e293b", padding: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: 2, color: "#22c55e", marginBottom: 6 }}>{title || "📈 TEAM HIGHS (SINGLE GAME)"}</div>
      {seasonRows.some((r) => r.val != null) && (
        <>
          <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>Season</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 8 }}>
            <thead><tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["STAT", "PLAYER", "VALUE"].map((h) => (
                <th key={h} style={{ padding: "4px 6px", textAlign: h === "VALUE" ? "center" : "left", color: "#475569", fontSize: 9 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {seasonRows.map((r) => (
                <tr key={r.key} style={{ borderBottom: "1px solid #0b1220" }}>
                  <td style={{ padding: "4px 6px", color: "#e5e7eb", fontWeight: 700 }}>{r.label}</td>
                  <td style={{ padding: "4px 6px", color: "#a7f3d0", fontWeight: 700 }}>{r.name || "—"}</td>
                  <td style={{ padding: "4px 6px", textAlign: "center", color: "#fbbf24", fontWeight: 800 }}>{r.val != null ? r.val : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {showPlayoff && playoffRows.some((r) => r.val != null) && (
        <>
          <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>Playoffs</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead><tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["STAT", "PLAYER", "VALUE"].map((h) => (
                <th key={h} style={{ padding: "4px 6px", textAlign: h === "VALUE" ? "center" : "left", color: "#475569", fontSize: 9 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {playoffRows.map((r) => (
                <tr key={r.key} style={{ borderBottom: "1px solid #0b1220" }}>
                  <td style={{ padding: "4px 6px", color: "#e5e7eb", fontWeight: 700 }}>{r.label}</td>
                  <td style={{ padding: "4px 6px", color: "#a7f3d0", fontWeight: 700 }}>{r.name || "—"}</td>
                  <td style={{ padding: "4px 6px", textAlign: "center", color: "#fbbf24", fontWeight: 800 }}>{r.val != null ? r.val : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
