import { useState } from "react";

export function TeamHighs({ teamSeasonHighs, careerTeamHighs, teamPlayoffHighs, roster, title, showPlayoff }) {
  const [view, setView] = useState("season"); // "season" | "alltime"
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
  // Career shape: { [name]: { pts: { value, season }, ... } }
  const buildCareerRows = (highs) => {
    if (!highs || Object.keys(highs).length === 0) return [];
    return defs.map(([key, label]) => {
      let best = null;
      myNames.forEach((name) => {
        const entry = highs[name] && highs[name][key];
        const v = entry && typeof entry.value === "number" ? entry.value : null;
        const season = entry && typeof entry.season === "number" ? entry.season : null;
        if (v != null && (!best || v > best.val)) best = { name, val: v, season };
      });
      return { key, label, ...best };
    });
  };
  // Simple shape: { [name]: { pts: 12, reb: 5, ... } }
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
  const careerRows = buildCareerRows(careerTeamHighs);
  const playoffRows = showPlayoff ? buildRows(teamPlayoffHighs) : [];
  const hasSeason = seasonRows.some((r) => r.val != null);
  const hasCareer = careerRows.some((r) => r.val != null);
  const hasPlayoff = playoffRows.some((r) => r.val != null);
  const hasAny = hasSeason || hasCareer || hasPlayoff;
  if (!hasAny) return null;

  const renderTable = (rows, showSeasonCol) => {
    const headers = showSeasonCol ? ["STAT", "PLAYER", "VALUE", "SEASON"] : ["STAT", "PLAYER", "VALUE"];
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: showPlayoff && hasPlayoff ? 8 : 0 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e293b" }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: "4px 6px", textAlign: h === "VALUE" || h === "SEASON" ? "center" : "left", color: "#475569", fontSize: 9 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderBottom: "1px solid #0b1220" }}>
              <td style={{ padding: "4px 6px", color: "#e5e7eb", fontWeight: 700 }}>{r.label}</td>
              <td style={{ padding: "4px 6px", color: "#a7f3d0", fontWeight: 700 }}>{r.name || "—"}</td>
              <td style={{ padding: "4px 6px", textAlign: "center", color: "#fbbf24", fontWeight: 800 }}>{r.val != null ? r.val : "—"}</td>
              {showSeasonCol && <td style={{ padding: "4px 6px", textAlign: "center", color: "#94a3b8", fontSize: 9 }}>{r.season != null ? `S${r.season}` : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div style={{ background: "#020617", borderRadius: 10, border: "1px solid #1e293b", padding: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: 2, color: "#22c55e", marginBottom: 4 }}>
        {title || "📈 TEAM HIGHS"}
      </div>
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
      {view === "season" && (
        <>
          {hasSeason && renderTable(seasonRows, false)}
          {!hasSeason && <div style={{ fontSize: 9, color: "#64748b", marginBottom: 8 }}>No regular-season highs yet.</div>}
        </>
      )}
      {view === "alltime" && (
        <>
          <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>Best single-game across all seasons (season in table)</div>
          {hasCareer && renderTable(careerRows, true)}
          {!hasCareer && <div style={{ fontSize: 9, color: "#64748b", marginBottom: 8 }}>No career highs yet.</div>}
        </>
      )}
      {showPlayoff && hasPlayoff && (
        <>
          <div style={{ fontSize: 9, color: "#64748b", marginTop: 8, marginBottom: 4 }}>Playoffs (this run)</div>
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
