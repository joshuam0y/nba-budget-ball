import React, { useState } from "react";
import { getNBATeamsWithMeta, NUM_TEAMS, rf } from "../sim";
import { getRecordFromGameLog, standingsSort } from "../utils/standings";

export function StandingsTable({ aiTeams, myRecord, myName, highlight }) {
  const [viewMode, setViewMode] = useState("conference"); // "divisions" | "conference"
  const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
  const userRow = {
    name: myName,
    w: myRecord.w,
    l: myRecord.l,
    eff: myRecord.eff || 0,
    isPlayer: true,
    conference: userMeta.conference,
    division: userMeta.division,
  };
  const all = [
    userRow,
    ...aiTeams.map((t) => {
      const fromLog = getRecordFromGameLog(t.gameLog);
      const w = fromLog ? fromLog.w : t.w;
      const l = fromLog ? fromLog.l : t.l;
      return { name: t.name, w, l, eff: t.eff, isPlayer: false, conference: t.conference, division: t.division };
    }),
  ];
  const east = all.filter((t) => t.conference === "East").sort(standingsSort);
  const west = all.filter((t) => t.conference === "West").sort(standingsSort);

  const buildRankMap = (rows) => {
    const m = {};
    rows.forEach((t, i) => {
      m[t.name] = i + 1;
    });
    return m;
  };
  const eastRanks = buildRankMap(east);
  const westRanks = buildRankMap(west);

  const renderTable = (confLabel, color, rows, ranks) => (
    <table key={confLabel} style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 280 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #1e293b" }}>
          <th colSpan={6} style={{ padding: "6px 8px", textAlign: "left", color, fontWeight: 800, fontSize: 10, letterSpacing: 2 }}>
            {confLabel} ({rows.length})
          </th>
        </tr>
        <tr style={{ borderBottom: "1px solid #1e293b" }}>
          {[["#", "c"], ["TEAM", "left"], ["W", "c"], ["L", "c"], ["PCT", "c"], ["RTG", "c"]].map(([h, a]) => (
            <th key={h} style={{ padding: "4px 6px", textAlign: a === "c" ? "center" : "left", color: "#475569", fontSize: 10 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {viewMode === "divisions"
          ? Array.from(new Set(rows.map((t) => t.division))).sort().map((div) => {
              const divTeams = rows.filter((t) => t.division === div);
              if (!divTeams.length) return null;
              const divLeaderName = divTeams[0].name;
              return (
                <React.Fragment key={div}>
                  <tr style={{ background: "#020617" }}>
                    <td colSpan={6} style={{ padding: "4px 6px", fontSize: 9, color: "#64748b", fontWeight: 700, letterSpacing: 1 }}>
                      {div.toUpperCase()} DIVISION
                    </td>
                  </tr>
                  {divTeams.map((t) => {
                    const idx = (ranks[t.name] ?? 1) - 1;
                    const gp = t.w + t.l;
                    const pct = gp > 0 ? rf((t.w / gp) * 100, 1) : 0;
                    const isHL = highlight && t.isPlayer;
                    const isDivWinner = t.name === divLeaderName;
                    return (
                      <tr key={t.name} style={{ borderBottom: "1px solid #0d1626", background: isHL ? "#0d2137" : idx % 2 === 0 ? "#080f1e" : "#0a1221" }}>
                        <td style={{ textAlign: "center", padding: "4px 6px", color: idx < 6 ? "#22c55e" : idx < 10 ? "#f59e0b" : "#475569", fontWeight: 800 }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: "4px 6px", fontWeight: 700, color: t.isPlayer ? "#60a5fa" : "#e2e8f0" }}>
                          {t.isPlayer ? "🌟 " : ""}{t.name}
                          {isDivWinner && <span style={{ marginLeft: 4, fontSize: 9, background: "#0369a1", color: "#e0f2fe", borderRadius: 3, padding: "1px 4px" }}>DIV</span>}
                          {idx === 5 && <span style={{ marginLeft: 4, fontSize: 9, background: "#14532d", color: "#4ade80", borderRadius: 3, padding: "1px 4px" }}>6</span>}
                          {(idx === 6 || idx === 7) && <span style={{ marginLeft: 4, fontSize: 9, background: "#78350f", color: "#fbbf24", borderRadius: 3, padding: "1px 4px" }}>PI</span>}
                          {(idx === 8 || idx === 9) && <span style={{ marginLeft: 4, fontSize: 9, background: "#3b0764", color: "#c084fc", borderRadius: 3, padding: "1px 4px" }}>PI</span>}
                          {idx === 10 && <span style={{ marginLeft: 4, fontSize: 9, background: "#7f1d1d", color: "#fca5a5", borderRadius: 3, padding: "1px 4px" }}>OUT</span>}
                        </td>
                        <td style={{ textAlign: "center", color: "#22c55e", fontWeight: 700 }}>{t.w}</td>
                        <td style={{ textAlign: "center", color: "#f87171" }}>{t.l}</td>
                        <td style={{ textAlign: "center" }}>{pct}%</td>
                        <td style={{ textAlign: "center", color: "#a78bfa" }}>{rf(t.eff, 0)}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })
          : rows.map((t) => {
              const idx = (ranks[t.name] ?? 1) - 1;
              const gp = t.w + t.l;
              const pct = gp > 0 ? rf((t.w / gp) * 100, 1) : 0;
              const isHL = highlight && t.isPlayer;
              const isDivWinner =
                rows.find((x) => x.division === t.division) &&
                rows.filter((x) => x.division === t.division)[0].name === t.name;
              return (
                <tr key={t.name} style={{ borderBottom: "1px solid #0d1626", background: isHL ? "#0d2137" : idx % 2 === 0 ? "#080f1e" : "#0a1221" }}>
                  <td style={{ textAlign: "center", padding: "4px 6px", color: idx < 6 ? "#22c55e" : idx < 10 ? "#f59e0b" : "#475569", fontWeight: 800 }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: "4px 6px", fontWeight: 700, color: t.isPlayer ? "#60a5fa" : "#e2e8f0" }}>
                    {t.isPlayer ? "🌟 " : ""}{t.name}
                    {isDivWinner && <span style={{ marginLeft: 4, fontSize: 9, background: "#0369a1", color: "#e0f2fe", borderRadius: 3, padding: "1px 4px" }}>DIV</span>}
                    {idx === 5 && <span style={{ marginLeft: 4, fontSize: 9, background: "#14532d", color: "#4ade80", borderRadius: 3, padding: "1px 4px" }}>6</span>}
                    {(idx === 6 || idx === 7) && <span style={{ marginLeft: 4, fontSize: 9, background: "#78350f", color: "#fbbf24", borderRadius: 3, padding: "1px 4px" }}>PI</span>}
                    {(idx === 8 || idx === 9) && <span style={{ marginLeft: 4, fontSize: 9, background: "#3b0764", color: "#c084fc", borderRadius: 3, padding: "1px 4px" }}>PI</span>}
                    {idx === 10 && <span style={{ marginLeft: 4, fontSize: 9, background: "#7f1d1d", color: "#fca5a5", borderRadius: 3, padding: "1px 4px" }}>OUT</span>}
                  </td>
                  <td style={{ textAlign: "center", color: "#22c55e", fontWeight: 700 }}>{t.w}</td>
                  <td style={{ textAlign: "center", color: "#f87171" }}>{t.l}</td>
                  <td style={{ textAlign: "center" }}>{pct}%</td>
                  <td style={{ textAlign: "center", color: "#a78bfa" }}>{rf(t.eff, 0)}</td>
                </tr>
              );
            })}
      </tbody>
    </table>
  );

  return (
    <div style={{ background: "#0f172a", borderRadius: 10, overflow: "hidden", border: "1px solid #1e293b" }}>
      <div style={{ padding: "8px 12px", background: "#1e293b", fontWeight: 800, fontSize: 10, letterSpacing: 2, color: "#60a5fa", display:"flex",alignItems:"center",justifyContent:"space-between",gap:8 }}>
        <span>🏆 LEAGUE STANDINGS</span>
        <div style={{display:"flex",gap:4,fontSize:9}}>
          <button
            onClick={() => setViewMode("conference")}
            style={{
              padding:"3px 8px",
              borderRadius:999,
              border:"1px solid #334155",
              background:viewMode==="conference"?"#0f172a":"#020617",
              color:viewMode==="conference"?"#e5e7eb":"#64748b",
              cursor:"pointer",
              fontWeight:700,
            }}
          >
            CONFERENCE
          </button>
          <button
            onClick={() => setViewMode("divisions")}
            style={{
              padding:"3px 8px",
              borderRadius:999,
              border:"1px solid #334155",
              background:viewMode==="divisions"?"#0f172a":"#020617",
              color:viewMode==="divisions"?"#e5e7eb":"#64748b",
              cursor:"pointer",
              fontWeight:700,
            }}
          >
            DIVISIONS
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 10, overflowX: "auto" }}>
        {renderTable("EAST", "#3b82f6", east, eastRanks)}
        {renderTable("WEST", "#f59e0b", west, westRanks)}
      </div>
      <div style={{ padding: "6px 12px", borderTop: "2px dashed #1e293b", fontSize: 9, color: "#22c55e" }}>▲ You’re in {userMeta.conference} ({userMeta.division}) · Top 6 direct · 7–10 play-in</div>
    </div>
  );
}
