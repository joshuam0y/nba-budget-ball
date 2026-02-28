import { useState, useMemo } from "react";
import { rf } from "./sim";

const fmt1 = (v) => (v ?? 0).toFixed(1);
const fmt0 = (v) => Math.round(v ?? 0);

export function LeagueLeaders({ leaders, myTeamName }) {
  const [stat, setStat] = useState("ppg");
  const [ascending, setAscending] = useState(false);
  const [perMode, setPerMode] = useState("game"); // "game" | "per36"

  const leagueLeadersRows = useMemo(() => {
    const arr = Object.values(leaders || {});
    const enriched = arr.map((p) => {
      const gp = p.gp || 1;
      const ppg = p.pts / gp;
      const rpg = p.reb / gp;
      const apg = p.ast / gp;
      const spg = p.stl / gp;
      const bpg = p.blk / gp;
      const tpg = p.tov / gp;
      const tpmg = p.tpm / gp;
      const tpag = p.tpa / gp;
      const fgmg = p.fgm / gp;
      const fgag = p.fga / gp;
      const ftmg = p.ftm / gp;
      const ftag = p.fta / gp;
      const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;
      const tpPct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
      const ftPct = p.fta > 0 ? (p.ftm / p.fta) * 100 : 0;
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
        tpmg,
        tpag,
        fgmg,
        fgag,
        ftmg,
        ftag,
        ppg36: ppg * factor36,
        rpg36: rpg * factor36,
        apg36: apg * factor36,
        spg36: spg * factor36,
        bpg36: bpg * factor36,
        tpg36: tpg * factor36,
        tpmg36: tpmg * factor36,
        tpag36: tpag * factor36,
        fgmg36: fgmg * factor36,
        fgag36: fgag * factor36,
        ftmg36: ftmg * factor36,
        ftag36: ftag * factor36,
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
    // Map stat key to actual sort field (totals like fgm/fga/tpm/tpa/ftm/fta have per-game names: fgmg, fgag, etc.; per36 uses *36 suffix)
    const sortFieldMap = {
      fgm: { game: "fgm", per36: "fgmg36" },
      fga: { game: "fga", per36: "fgag36" },
      tpm: { game: "tpm", per36: "tpmg36" },
      tpa: { game: "tpa", per36: "tpag36" },
      ftm: { game: "ftm", per36: "ftmg36" },
      fta: { game: "fta", per36: "ftag36" },
    };
    const getSortField = (key) => {
      if (key === "fgPct" || key === "tpPct" || key === "ftPct") return key;
      const mapped = sortFieldMap[key];
      if (mapped) return perMode === "per36" ? mapped.per36 : mapped.game;
      return perMode === "per36" ? `${key}36` : key;
    };
    const field = getSortField(stat);
    qualified.sort((a, b) => {
      const av = a[field] ?? 0;
      const bv = b[field] ?? 0;
      if (av !== bv) return ascending ? av - bv : bv - av;
      // Stable tiebreaker so rank column stays correct
      const nameCmp = (a.name || "").localeCompare(b.name || "");
      return nameCmp !== 0 ? nameCmp : (a.team || "").localeCompare(b.team || "");
    });
    const leagueRows = qualified.slice(0, 30);
    return { leagueRows };
  }, [leaders, stat, ascending, perMode, myTeamName]);

  const rows = leagueLeadersRows.leagueRows;

  const statOptions = [
    ["ppg", "PTS"],
    ["tpmg", "3PM"],
    ["tpag", "3PA"],
    ["rpg", "REB"],
    ["apg", "AST"],
    ["spg", "STL"],
    ["bpg", "BLK"],
    ["tpg", "TOV"],
    ["fgm", "FGM"],
    ["fga", "FGA"],
    ["tpm", "3PM"],
    ["tpa", "3PA"],
    ["ftm", "FTM"],
    ["fta", "FTA"],
    ["fgPct", "FG%"],
    ["tpPct", "3P%"],
    ["ftPct", "FT%"],
  ];

  const statLabel = statOptions.find(([k]) => k === stat)?.[1] ?? stat;
  return (
    <div style={{ background: "#0f172a", borderRadius: 10, border: "1px solid #1e293b", padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: 2, color: "#f97316" }}>📊 LEAGUE LEADERS</div>
          <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>Top 30 league-wide by {statLabel} · Green = your team</div>
        </div>
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
      <div style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", letterSpacing: 1, marginBottom: 6 }}>League leaders (top 30)</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 820 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", background: "#0f172a" }}>
              <th style={{ padding: "4px 6px", textAlign: "center", color: "#475569", fontSize: 9 }}>#</th>
              <th style={{ padding: "4px 6px", textAlign: "left", color: "#475569", fontSize: 9 }}>PLAYER</th>
              <th style={{ padding: "4px 6px", textAlign: "center", color: "#475569", fontSize: 9 }}>POS</th>
              <th style={{ padding: "4px 6px", textAlign: "left", color: "#475569", fontSize: 9 }}>TEAM</th>
              <th style={{ padding: "4px 6px", textAlign: "center", color: "#475569", fontSize: 9 }}>GP</th>
              <th colSpan={12} style={{ padding: "4px 8px", textAlign: "center", color: "#60a5fa", fontSize: 9, fontWeight: 800, borderLeft: "1px solid #334155", borderRight: "1px solid #334155" }}>PER GAME</th>
              <th colSpan={6} style={{ padding: "4px 8px", textAlign: "center", color: "#22c55e", fontSize: 9, fontWeight: 800, borderRight: "1px solid #334155" }}>TOTALS</th>
              <th colSpan={3} style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9, fontWeight: 800 }}>%</th>
            </tr>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["#", "PLAYER", "POS", "TEAM", "GP", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FGM", "FGA", "3PM", "3PA", "FTM", "FTA", "FGM", "FGA", "3PM", "3PA", "FTM", "FTA", "FG%", "3P%", "FT%"].map((h, idx) => (
                <th
                  key={idx}
                  style={{ padding: "4px 6px", textAlign: h === "#" || h === "GP" ? "center" : "left", color: "#475569", fontSize: 9 }}
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
                  key={`league-${i}-${p.name}|${p.team}`}
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
                  <td style={{ padding: "5px 8px", textAlign: "center", color: "#9ca3af" }}>{fmt0(p.gp || 0)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("ppg"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("rpg"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("apg"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("spg"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("bpg"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("tpg"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("fgmg"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("fgag"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("tpmg"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("tpag"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("ftmg"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(statField("ftag"))}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt0(p.fgm || 0)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt0(p.fga || 0)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt0(p.tpm || 0)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt0(p.tpa || 0)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt0(p.ftm || 0)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt0(p.fta || 0)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(p.fgPct)}%</td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>
                    {p.tpa === 0 ? "N/A" : `${fmt1(p.tpPct)}%`}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "center" }}>{fmt1(p.ftPct)}%</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={26} style={{ padding: "6px 8px", fontSize: 9, color: "#64748b", textAlign: "center" }}>
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

