import { useState } from "react";

export function SeasonHighs({ highs, careerHighs, myTeamName, title, seasonNumber }) {
  const [view, setView] = useState("season"); // "season" | "alltime"
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
  const seasonRows = defs.map(([key, label]) => {
    const h = highs?.[key];
    return { key, label, val: h?.val, name: h?.name, team: h?.team, pos: h?.pos, season: h?.season ?? null };
  });
  const allTimeRows = defs.map(([key, label]) => {
    const h = careerHighs?.[key];
    return { key, label, val: h?.val, name: h?.name, team: h?.team, pos: h?.pos, season: h?.season };
  });
  const hasSeason = seasonRows.some((r) => r && r.val != null);
  const hasAllTime = careerHighs && Object.keys(careerHighs).length > 0 && allTimeRows.some((r) => r && r.val != null);
  const showTabs = hasAllTime;

  const renderTable = (rows, showSeasonCol) => {
    const hasAny = rows.some((r) => r && r.val != null);
    if (!hasAny) return null;
    const withSeason = showSeasonCol || rows.some((r) => r && r.season != null);
    const headers = withSeason ? ["STAT", "PLAYER", "TEAM", "VALUE", "SEASON"] : ["STAT", "PLAYER", "TEAM", "VALUE"];
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: withSeason ? 480 : 420 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {headers.map((h) => (
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
                    {withSeason && <td style={{ padding: "4px 6px", color: "#4b5563" }}>—</td>}
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
                  {withSeason && <td style={{ padding: "4px 6px", color: "#94a3b8", fontSize: 9 }}>{r.season != null ? `S${r.season}` : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (!hasSeason && !hasAllTime) return null;
  return (
    <div style={{ background: "#020617", borderRadius: 10, border: "1px solid #1e293b", padding: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: 2, color: "#22c55e", marginBottom: 6 }}>
        {title || "📈 LEAGUE HIGHS (SINGLE GAME)"}
      </div>
      {showTabs && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setView("season")}
            style={{
              padding: "4px 10px",
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 6,
              border: "1px solid #334155",
              background: view === "season" ? "#1e3a5f" : "#1e293b",
              color: view === "season" ? "#93c5fd" : "#94a3b8",
              cursor: "pointer",
            }}
          >
            This season
          </button>
          <button
            type="button"
            onClick={() => setView("alltime")}
            style={{
              padding: "4px 10px",
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 6,
              border: "1px solid #334155",
              background: view === "alltime" ? "#1e3a5f" : "#1e293b",
              color: view === "alltime" ? "#93c5fd" : "#94a3b8",
              cursor: "pointer",
            }}
          >
            All-time
          </button>
        </div>
      )}
      {(!showTabs || view === "season") && renderTable(seasonRows, false)}
      {showTabs && view === "alltime" && (
        <>
          <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>Best single-game across all seasons (season achieved in table)</div>
          {renderTable(allTimeRows, true)}
        </>
      )}
    </div>
  );
}
