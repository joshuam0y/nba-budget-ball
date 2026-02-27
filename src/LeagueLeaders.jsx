import { useState, useMemo } from "react";
import { rf } from "./sim";

export function LeagueLeaders({ leaders, myTeamName }) {
  const [stat, setStat] = useState("ppg");
  const [ascending, setAscending] = useState(false);
  const [perMode, setPerMode] = useState("game"); // "game" | "per36"

  const rows = useMemo(() => {
    const arr = Object.values(leaders || {});
    const enriched = arr.map((p) => {
      const gp = p.gp || 1;
      const ppg = p.pts / gp;
      const rpg = p.reb / gp;
      const apg = p.ast / gp;
      const spg = p.stl / gp;
      const bpg = p.blk / gp;
      const tpg = p.tov / gp;
      const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;
      const tpPct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
      const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
      // Per-36 scaling: game stats are over 48 minutes, so per36 is 0.75x.
      const factor36 = 0.75;
      return {
        ...p,
        gp,
        ppg,
        rpg,
        apg,
        spg,
        bpg,
        tpg,
        ppg36: ppg * factor36,
        rpg36: rpg * factor36,
        apg36: apg * factor36,
        spg36: spg * factor36,
        bpg36: bpg * factor36,
        tpg36: tpg * factor36,
        fgPct,
        tpPct,
        ftPct,
      };
    });
    // Qualification filters so low-volume guys don't top % leaderboards.
    const qualified = enriched.filter((p) => {
      if (stat === "tpPct") {
        // Require at least 3 three-point attempts per game on average.
        return p.tpa >= p.gp * 3;
      }
      if (stat === "fgPct") {
        // Require at least 8 FGA per game.
        return p.fga >= p.gp * 8;
      }
      if (stat === "ftPct") {
        // Require at least 2 FTA per game.
        return p.fta >= p.gp * 2;
      }
      return true;
    });
    const key = stat;
    qualified.sort((a, b) => {
      const isPct = key === "fgPct" || key === "tpPct" || key === "ftPct";
      const field = !isPct && perMode === "per36" ? `${key}36` : key;
      const av = a[field] || 0;
      const bv = b[field] || 0;
      return ascending ? av - bv : bv - av;
    });
    return qualified.slice(0, 30);
  }, [leaders, stat, ascending, perMode]);

  const statOptions = [
    ["ppg", "PTS"],
    ["rpg", "REB"],
    ["apg", "AST"],
    ["spg", "STL"],
    ["bpg", "BLK"],
    ["tpg", "TOV"],
    ["fgPct", "FG%"],
    ["tpPct", "3P%"],
    ["ftPct", "FT%"],
  ];

  return (
    <div style={{ background: "#0f172a", borderRadius: 10, border: "1px solid #1e293b", padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: 2, color: "#f97316" }}>📊 LEAGUE LEADERS</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap:"wrap", justifyContent:"flex-end" }}>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <span style={{ fontSize: 9, color: "#64748b" }}>RATE</span>
            <div style={{display:"flex",gap:3}}>
              {[
                ["game","PER G"],
                ["per36","PER 36"],
              ].map(([mode,label])=>(
                <button
                  key={mode}
                  onClick={()=>setPerMode(mode)}
                  style={{
                    padding:"3px 7px",
                    borderRadius:999,
                    border:"1px solid #334155",
                    background: perMode===mode ? "#111827" : "#020617",
                    color: perMode===mode ? "#e5e7eb" : "#64748b",
                    fontSize:9,
                    fontWeight:700,
                    cursor:"pointer",
                    minWidth:42,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span style={{ fontSize: 9, color: "#64748b" }}>STAT</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {statOptions.map(([k,label])=>(
              <button
                key={k}
                onClick={()=>{
                  if(stat===k){
                    setAscending(a=>!a);
                  }else{
                    setStat(k);
                    setAscending(false);
                  }
                }}
                style={{
                  padding:"3px 7px",
                  borderRadius:999,
                  border:"1px solid #334155",
                  background: stat===k ? "#111827" : "#020617",
                  color: stat===k ? "#e5e7eb" : "#64748b",
                  fontSize:9,
                  fontWeight:700,
                  cursor:"pointer",
                  minWidth:38,
                  textAlign:"center",
                }}
              >
                {label}{stat===k ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 560 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["#", "PLAYER", "POS", "TEAM", "GP", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG%", "3P%", "FT%"].map((h) => (
                <th
                  key={h}
                  style={{ padding: "4px 6px", textAlign: h === "#" ? "center" : "left", color: "#475569", fontSize: 9 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const isMine = myTeamName && p.team === myTeamName;
              const statField = (field) => {
                const isPctField = field === "fgPct" || field === "tpPct" || field === "ftPct";
                const use36 = !isPctField && perMode === "per36";
                const keyName = use36 ? `${field}36` : field;
                return p[keyName];
              };
              return (
                <tr
                  key={`${p.name}|${p.team}`}
                  style={{
                    borderBottom: "1px solid #0b1220",
                    background: isMine ? "#022c22" : i % 2 === 0 ? "#020617" : "#030712",
                  }}
                >
                  <td style={{ textAlign: "center", padding: "5px 8px", color: isMine ? "#bbf7d0" : "#9ca3af", fontWeight: 700 }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "5px 8px", fontWeight: 700, color: isMine ? "#a7f3d0" : "#e5e7eb", whiteSpace: "nowrap" }}>
                    {p.name}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign:"center", color: "#9ca3af", fontSize: 10, minWidth:28 }}>
                    {p.pos || "-"}
                  </td>
                  <td style={{ padding: "5px 8px", color: isMine ? "#6ee7b7" : "#9ca3af", whiteSpace: "nowrap", fontSize: 10 }}>
                    {p.team}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "center", color: "#9ca3af" }}>{p.gp}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{rf(statField("ppg"), 1)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{rf(statField("rpg"), 1)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{rf(statField("apg"), 1)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{rf(statField("spg"), 1)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{rf(statField("bpg"), 1)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{rf(statField("tpg"), 1)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{rf(p.fgPct, 1)}%</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>
                    {p.tpa === 0 ? "N/A" : `${rf(p.tpPct, 1)}%`}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{rf(p.ftPct, 1)}%</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} style={{ padding: "6px 8px", fontSize: 9, color: "#64748b", textAlign: "center" }}>
                  No games played yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

