export function SeasonHighs({ highs, myTeamName, title }) {
  const defs = [
    ["pts", "POINTS"],
    ["reb", "REBOUNDS"],
    ["ast", "ASSISTS"],
    ["stl", "STEALS"],
    ["blk", "BLOCKS"],
    ["fgm", "FGM"],
    ["tpm", "3PM"],
    ["ftm", "FT MADE"],
    ["tov", "TURNOVERS"],
  ];
  const rows = defs.map(([key, label]) => {
    const h = highs[key];
    return { key, label, ...h };
  });
  const hasAny = rows.some((r) => r && r.val != null);
  if (!hasAny) return null;
  return (
    <div style={{ background: "#020617", borderRadius: 10, border: "1px solid #1e293b", padding: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: 2, color: "#22c55e", marginBottom: 6 }}>
        {title || "📈 SEASON HIGHS (SINGLE GAME)"}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: 420 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["STAT", "PLAYER", "TEAM", "VALUE"].map((h) => (
                <th
                  key={h}
                  style={{ padding: "4px 6px", textAlign: h === "VALUE" ? "center" : "left", color: "#475569", fontSize: 9 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isMine = myTeamName && r.team === myTeamName;
              if (r.val == null) {
                return (
                  <tr key={r.key} style={{ borderBottom: "1px solid #0b1220", opacity: 0.4 }}>
                    <td style={{ padding: "4px 6px", color: "#6b7280" }}>{r.label}</td>
                    <td style={{ padding: "4px 6px", color: "#4b5563" }}>—</td>
                    <td style={{ padding: "4px 6px", color: "#4b5563" }}>—</td>
                    <td style={{ padding: "4px 6px", textAlign: "center", color: "#4b5563" }}>—</td>
                  </tr>
                );
              }
              return (
                <tr
                  key={r.key}
                  style={{
                    borderBottom: "1px solid #0b1220",
                    background: isMine ? "#022c22" : "transparent",
                  }}
                >
                  <td style={{ padding: "4px 6px", color: "#e5e7eb", fontWeight: 700 }}>{r.label}</td>
                  <td style={{ padding: "4px 6px", color: isMine ? "#a7f3d0" : "#e5e7eb", fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: "4px 6px", color: isMine ? "#6ee7b7" : "#9ca3af" }}>{r.team}</td>
                  <td style={{ padding: "4px 6px", textAlign: "center", color: "#fbbf24", fontWeight: 800 }}>{r.val}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
