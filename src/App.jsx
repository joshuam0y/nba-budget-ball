import "./index.css";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { supabase } from "./supabase";
import { LeagueLeaders } from "./LeagueLeaders";
import {
  POSITIONS,
  BUDGET,
  SEASON_LENGTH,
  NUM_TEAMS,
  rf,
  processCSV,
  chemBoost,
  posMult,
  teamEff,
  buildSeasonSchedule,
  generateLeague,
  getNBATeamsWithMeta,
  simulate,
  quickSim,
  getTier,
  cellBg,
  getArchetype,
  getTeamBalance,
  emptySeason,
  addToSeason,
} from "./sim";

async function incrementPick(playerName) {
  await supabase.rpc('increment_pick', { player_name: playerName });
}
async function getTopPicks(limit = 5) {
  try {
    const { data, error } = await supabase
      .from("player_picks")
      .select("*")
      .order("picks", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("Error fetching top picks", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("Error fetching top picks", err);
    return [];
  }
}

function generateLineupImageBlob(roster, teamName, shareUrl, teamCode) {
  const W = 600, H = 420;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas not supported"));

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f59e0b";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText("NBA BUDGET BALL", W / 2, 44);
  if (teamName && teamName.trim()) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(teamName.trim(), W / 2, 72);
  }
  ctx.fillStyle = "#64748b";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("STARTING 5", W / 2, 96);

  const y0 = 118;
  const lineH = 50;
  POSITIONS.forEach((pos, i) => {
    const p = roster[pos];
    const y = y0 + i * lineH;
    const pillX = 32;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(pillX, y - 14, 40, 28);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.strokeRect(pillX, y - 14, 40, 28);
    ctx.fillStyle = "#60a5fa";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(pos, pillX + 10, y + 5);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 19px system-ui, sans-serif";
    ctx.fillText(p ? p.name : "—", 88, y + 5);
    if (p) {
      ctx.fillStyle = "#fbbf24";
      ctx.font = "15px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("$" + p.cost, W - 36, y + 5);
    }
    ctx.textAlign = "left";
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const name = (teamName && teamName.trim()) ? teamName.trim() : "my";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Here's " + name + "'s lineup — paste the code to try it or build your own!", W / 2, H - 42);
  if (teamCode) {
    ctx.fillStyle = "#64748b";
    ctx.fillText("Code: " + teamCode, W / 2, H - 30);
  }
  ctx.fillStyle = "#475569";
  const linkText = shareUrl || origin;
  let drawUrl = linkText;
  if (shareUrl && ctx.measureText(linkText).width > W - 24) {
    for (let i = linkText.length; i > 0; i--) {
      const t = linkText.slice(0, i) + "…";
      if (ctx.measureText(t).width <= W - 24) { drawUrl = t; break; }
    }
  }
  ctx.fillText(shareUrl ? "Play: " + drawUrl : "Play at " + origin, W / 2, H - 16);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}

const Tag = ({ label, color, bg }) => (
  <span
    style={{
      fontSize: 10,
      fontWeight: 800,
      background: bg,
      color,
      borderRadius: 4,
      padding: "1px 5px",
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </span>
);

function BoxScore({stats,acc,label}){
  return(
    <div style={{marginBottom:10,background:"#0f172a",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b"}}>
      <div style={{padding:"7px 14px",background:"#1e293b",fontWeight:800,fontSize:11,letterSpacing:2,color:acc}}>{label}</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:700}}>
          <thead><tr style={{borderBottom:"1px solid #1e293b"}}>
            {[["PLAYER","left"],["POS","c"],["PTS","c"],["REB","c"],["AST","c"],["STL","c"],["BLK","c"],["TOV","c"],["FGM-A","c"],["FG%","c"],["3PM-A","c"],["3P%","c"],["FTM-A","c"],["FT%","c"],["RTG","c"]].map(([h,a])=>(
              <th key={h} style={{padding:"5px 6px",textAlign:a==="c"?"center":"left",color:"#475569",fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {stats.map((s,i)=>(
              <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                <td style={{padding:"5px 6px",fontWeight:700,whiteSpace:"nowrap"}}>{s.hotCold&&<span style={{marginRight:3}}>{s.hotCold}</span>}{s.name}{s.oop&&<span style={{marginLeft:4,fontSize:9,background:"#78350f",color:"#fbbf24",borderRadius:3,padding:"1px 3px"}}>OOP</span>}</td>
                <td style={{textAlign:"center",color:"#64748b"}}>{s.pos}</td>
                <td style={{textAlign:"center",background:cellBg("pts",s.pts),fontWeight:700,padding:"5px 4px"}}>{s.pts}</td>
                <td style={{textAlign:"center",background:cellBg("reb",s.reb),padding:"5px 4px"}}>{s.reb}</td>
                <td style={{textAlign:"center",background:cellBg("ast",s.ast),padding:"5px 4px"}}>{s.ast}</td>
                <td style={{textAlign:"center",background:cellBg("stl",s.stl),padding:"5px 4px"}}>{s.stl}</td>
                <td style={{textAlign:"center",background:cellBg("blk",s.blk),padding:"5px 4px"}}>{s.blk}</td>
                <td style={{textAlign:"center",background:cellBg("tov",s.tov),padding:"5px 4px"}}>{s.tov}</td>
                <td style={{textAlign:"center",padding:"5px 4px",whiteSpace:"nowrap"}}>{s.fgm}-{s.fga}</td>
                <td style={{textAlign:"center",background:cellBg("fgPct",s.fgPct),padding:"5px 4px"}}>{s.fgPct}%</td>
                <td style={{textAlign:"center",padding:"5px 4px",whiteSpace:"nowrap"}}>{s.tpm}-{s.tpa}</td>
                <td style={{textAlign:"center",background:cellBg("tpPct",s.tpPct),padding:"5px 4px"}}>{s.tpPct}%</td>
                <td style={{textAlign:"center",padding:"5px 4px",whiteSpace:"nowrap"}}>{s.ftm}-{s.fta}</td>
                <td style={{textAlign:"center",padding:"5px 4px"}}>{s.ftPct}%</td>
                <td style={{textAlign:"center",background:`rgba(99,102,241,${s.rating/90})`,padding:"5px 4px",fontWeight:700,color:"#c7d2fe"}}>{s.rating}</td>
              </tr>
            ))}
            <tr style={{borderTop:"2px solid #1e293b",background:"#0d1626",fontWeight:800}}>
              <td style={{padding:"5px 6px",color:acc}}>TEAM</td><td/>
              <td style={{textAlign:"center",color:acc}}>{stats.reduce((s,x)=>s+x.pts,0)}</td>
              <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.ast,0)}</td>
              <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.reb,0)}</td>
              <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.stl,0)}</td>
              <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.blk,0)}</td>
              <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.tov,0)}</td>
              <td style={{textAlign:"center",whiteSpace:"nowrap"}}>{stats.reduce((s,x)=>s+x.fgm,0)}-{stats.reduce((s,x)=>s+x.fga,0)}</td>
              <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.fga,0)>0?rf(stats.reduce((s,x)=>s+x.fgm,0)/stats.reduce((s,x)=>s+x.fga,0)*100):0}%</td>
              <td style={{textAlign:"center",whiteSpace:"nowrap"}}>{stats.reduce((s,x)=>s+x.tpm,0)}-{stats.reduce((s,x)=>s+x.tpa,0)}</td>
              <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.tpa,0)>0?rf(stats.reduce((s,x)=>s+x.tpm,0)/stats.reduce((s,x)=>s+x.tpa,0)*100):0}%</td>
              <td style={{textAlign:"center",whiteSpace:"nowrap"}}>{stats.reduce((s,x)=>s+x.ftm,0)}-{stats.reduce((s,x)=>s+x.fta,0)}</td>
              <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.fta,0)>0?rf(stats.reduce((s,x)=>s+x.ftm,0)/stats.reduce((s,x)=>s+x.fta,0)*100):0}%</td>
              <td/>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getRecordFromGameLog(gameLog) {
  if (!gameLog || !Array.isArray(gameLog)) return null;
  const w = gameLog.filter((x) => x === 1).length;
  const l = gameLog.filter((x) => x === 0).length;
  return { w, l };
}

function standingsSort(a, b) {
  const gpA = a.w + a.l;
  const gpB = b.w + b.l;
  const pctA = gpA > 0 ? a.w / gpA : 0;
  const pctB = gpB > 0 ? b.w / gpB : 0;
  if (pctB !== pctA) return pctB - pctA;
  if (b.w !== a.w) return b.w - a.w;
  return (b.eff || 0) - (a.eff || 0);
}

function StandingsTable({ aiTeams, myRecord, myName, highlight }) {
  const [viewMode, setViewMode] = useState("divisions"); // "divisions" | "conference"
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
              const divLeaderName = divTeams[0].name; // rows already sorted by standingsSort
              return (
                <>
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
                </>
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

function SeasonHighs({ highs, myTeamName, title }) {
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

const EAST_DIVISIONS = ["Atlantic", "Central", "Southeast"];
const WEST_DIVISIONS = ["Northwest", "Pacific", "Southwest"];

function seedConference(teams, divisions) {
  const byDiv = {};
  divisions.forEach((d) => (byDiv[d] = teams.filter((t) => t.division === d)));
  const divWinners = divisions.map((d) => {
    const arr = byDiv[d].sort(standingsSort);
    return arr[0];
  }).filter(Boolean).sort(standingsSort);
  const rest = teams.filter((t) => !divWinners.includes(t)).sort(standingsSort);
  const seeds = [...divWinners, ...rest.slice(0, 7)];
  return seeds.slice(0, 10);
}

function buildBracket(seeds) {
  return {
    playIn: [
      { id: "pi1", top: seeds[6], bot: seeds[7], winner: null, games: [], label: "7 vs 8 — winner gets 7 seed" },
      { id: "pi2", top: seeds[8], bot: seeds[9], winner: null, games: [], label: "9 vs 10 — loser eliminated" },
      { id: "pi3", top: null, bot: null, winner: null, games: [], label: "Loser(7v8) vs Winner(9v10) — 8 seed" },
    ],
    firstRound: [
      { id: "fr1", top: seeds[0], bot: null, winner: null, games: [], label: "(1) vs (8)" },
      { id: "fr2", top: seeds[1], bot: null, winner: null, games: [], label: "(2) vs (7)" },
      { id: "fr3", top: seeds[2], bot: seeds[5], winner: null, games: [], label: "(3) vs (6)" },
      { id: "fr4", top: seeds[3], bot: seeds[4], winner: null, games: [], label: "(4) vs (5)" },
    ],
    semis: [
      { id: "sf1", top: null, bot: null, winner: null, games: [], label: "W(1v8) vs W(4v5)" },
      { id: "sf2", top: null, bot: null, winner: null, games: [], label: "W(2v7) vs W(3v6)" },
    ],
    finals: { id: "f1", top: null, bot: null, winner: null, games: [], label: "CONFERENCE FINALS" },
    champion: null,
  };
}

function MatchupCard({ matchup, onPlay, isActive, onPlayMatch }) {
  const { top, bot, winner, games, label } = matchup;
  const wA = games.filter((g) => g.winnerIdx === 0).length, wB = games.filter((g) => g.winnerIdx === 1).length, done = !!winner;
  return (
    <div style={{ background: "#0f172a", border: `1px solid ${done ? "#22c55e" : isActive ? "#6366f1" : "#1e293b"}`, borderRadius: 10, padding: 10, minWidth: 190 }}>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>{label}</div>
      {[top, bot].map((team, ti) => {
        const isW = winner?.name === team?.name, wins = ti === 0 ? wA : wB;
        return team ? (
          <div key={ti} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "5px 8px", borderRadius: 6, background: isW ? "#14532d" : done && !isW ? "#1a0a0a" : "#1e293b", border: `1px solid ${isW ? "#22c55e" : done && !isW ? "#3f0d0d" : "#334155"}` }}>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 800, color: team.isPlayer ? "#60a5fa" : "#e2e8f0" }}>{team.isPlayer ? "🌟 " : ""}{team.name}</div>
            {games.length > 0 && <div style={{ fontSize: 12, fontWeight: 900, color: isW ? "#22c55e" : "#94a3b8" }}>{wins}</div>}
            {isW && <span style={{ fontSize: 10 }}>✓</span>}
          </div>
        ) : (
          <div key={ti} style={{ marginBottom: 4, padding: "5px 8px", borderRadius: 6, background: "#0a0a0f", border: "1px dashed #1e293b" }}>
            <div style={{ fontSize: 10, color: "#334155", fontStyle: "italic" }}>TBD</div>
          </div>
        );
      })}
      {!done && top && bot && onPlay && (
        <button onClick={onPlay} style={{ width: "100%", marginTop: 6, background: top?.isPlayer || bot?.isPlayer ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#475569,#334155)", color: "white", border: "none", borderRadius: 6, padding: "6px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
          {top?.isPlayer || bot?.isPlayer ? `▶ PLAY GAME ${games.length + 1}` : `⚡ SIM GAME ${games.length + 1}`}
        </button>
      )}
      {done && <div style={{ textAlign: "center", fontSize: 10, color: "#22c55e", marginTop: 4, fontWeight: 700 }}>✓ DONE</div>}
    </div>
  );
}

function ConfBracketSection({ sub, confLabel, prefix, onPlayMatch, activeMatchId }) {
  if (!sub || !sub.playIn) return null;
  const { playIn, firstRound, semis, finals } = sub;
  const pi1done = !!playIn[0].winner, pi2done = !!playIn[1].winner, pi3done = !!playIn[2].winner, playInDone = pi1done && pi2done && pi3done;
  const fr1done = !!firstRound[0].winner, fr2done = !!firstRound[1].winner, fr3done = !!firstRound[2].winner, fr4done = !!firstRound[3].winner;
  const sf1done = !!semis[0].winner, sf2done = !!semis[1].winner, fdone = !!finals.winner;
  const pre = (s) => (s === "f1" ? `${prefix}f` : `${prefix}${s}`);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 12, color: confLabel === "EAST" ? "#3b82f6" : "#f59e0b", letterSpacing: 2, marginBottom: 8, textAlign: "center" }}>{confLabel} CONFERENCE</div>
      <div style={{ marginBottom: 10, background: "#0a0f1a", borderRadius: 10, padding: 10, border: "1px solid #1e293b" }}>
        <div style={{ fontSize: 9, color: "#f59e0b", fontWeight: 800, letterSpacing: 2, marginBottom: 8, textAlign: "center" }}>🎟 PLAY-IN</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <MatchupCard matchup={playIn[0]} isActive={activeMatchId === pre("pi1")} onPlay={() => onPlayMatch(pre("pi1"))} />
          <MatchupCard matchup={playIn[1]} isActive={activeMatchId === pre("pi2")} onPlay={() => onPlayMatch(pre("pi2"))} />
          <MatchupCard matchup={playIn[2]} isActive={activeMatchId === pre("pi3")} onPlay={() => onPlayMatch(pre("pi3"))} />
        </div>
      </div>
      {playInDone && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 12px 1fr 12px 1fr", gap: 4, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, textAlign: "center", marginBottom: 4 }}>FIRST ROUND</div>
            <MatchupCard matchup={firstRound[0]} isActive={activeMatchId === pre("fr1")} onPlay={() => onPlayMatch(pre("fr1"))} />
            <MatchupCard matchup={firstRound[1]} isActive={activeMatchId === pre("fr2")} onPlay={() => onPlayMatch(pre("fr2"))} />
            <MatchupCard matchup={firstRound[2]} isActive={activeMatchId === pre("fr3")} onPlay={() => onPlayMatch(pre("fr3"))} />
            <MatchupCard matchup={firstRound[3]} isActive={activeMatchId === pre("fr4")} onPlay={() => onPlayMatch(pre("fr4"))} />
          </div>
          <div style={{ textAlign: "center", color: "#1e293b", fontSize: 14, paddingTop: 30 }}>→</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, textAlign: "center", marginBottom: 4 }}>SEMIFINALS</div>
            <MatchupCard matchup={semis[0]} isActive={activeMatchId === pre("sf1")} onPlay={() => onPlayMatch(pre("sf1"))} />
            <MatchupCard matchup={semis[1]} isActive={activeMatchId === pre("sf2")} onPlay={() => onPlayMatch(pre("sf2"))} />
          </div>
          <div style={{ textAlign: "center", color: "#1e293b", fontSize: 14, paddingTop: 30 }}>→</div>
          <div>
            <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 1, textAlign: "center", marginBottom: 4 }}>CONF FINALS</div>
            <MatchupCard matchup={finals} isActive={activeMatchId === pre("f")} onPlay={() => onPlayMatch(pre("f"))} />
          </div>
        </div>
      )}
    </div>
  );
}

function BracketDisplay({ bracket, onPlayMatch, activeMatchId }) {
  const champion = bracket.champion;
  const hasConferences = bracket.east && bracket.west;
  return (
    <div style={{ background: "#080f1e", borderRadius: 14, padding: 14, border: "1px solid #1e293b" }}>
      <div style={{ fontWeight: 900, fontSize: 13, color: "#f59e0b", letterSpacing: 2, marginBottom: 12, textAlign: "center" }}>🏀 PLAYOFF BRACKET</div>
      {hasConferences ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <ConfBracketSection sub={bracket.east} confLabel="EAST" prefix="east-" onPlayMatch={onPlayMatch} activeMatchId={activeMatchId} />
            <ConfBracketSection sub={bracket.west} confLabel="WEST" prefix="west-" onPlayMatch={onPlayMatch} activeMatchId={activeMatchId} />
          </div>
          {bracket.finals && (bracket.finals.top || bracket.finals.bot) && (
            <div style={{ marginTop: 12, padding: 12, background: "#0a0f1a", borderRadius: 12, border: "2px solid #f59e0b" }}>
              <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 800, letterSpacing: 2, marginBottom: 8, textAlign: "center" }}>🏆 FINALS</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <MatchupCard matchup={bracket.finals} isActive={activeMatchId === "finals"} onPlay={() => onPlayMatch("finals")} />
              </div>
              {champion && (
                <div style={{ marginTop: 10, textAlign: "center", padding: "10px", background: "linear-gradient(135deg,#78350f,#92400e)", borderRadius: 10, border: "2px solid #fbbf24" }}>
                  <div style={{ fontSize: 18 }}>🏆</div>
                  <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 900, letterSpacing: 1 }}>CHAMPION</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: champion.isPlayer ? "#60a5fa" : "#e2e8f0" }}>{champion.isPlayer ? "🌟 " : ""}{champion.name}</div>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function App(){
  const [phase,setPhase]=useState("import");
  const [playerPool,setPlayerPool]=useState([]);
  const [teamRoster,setTeamRoster]=useState(null);
  const [importErr,setImportErr]=useState("");
  const [importInfo,setImportInfo]=useState("");
  const [roster,setRoster]=useState({PG:null,SG:null,SF:null,PF:null,C:null});
  const [slotSel,setSlotSel]=useState(null);
  const [aiTeams,setAiTeams]=useState([]);
  const [schedule,setSchedule]=useState(null);
  const [result,setResult]=useState(null);
  const [season,setSeason]=useState(emptySeason());
  const [gameNum,setGameNum]=useState(1);
  const [posF,setPosF]=useState("ALL");
  const [sortBy,setSortBy]=useState("cost");
  const [sortDir,setSortDir]=useState("desc"); // desc | asc
  const [search,setSearch]=useState("");
  const [archF,setArchF]=useState("ALL");
  const [yearF,setYearF]=useState("ALL");
  const [teamF,setTeamF]=useState("ALL");
  const [inSeason,setInSeason]=useState(false);
  const [bracket,setBracket]=useState(null);
  const [playoffResult,setPlayoffResult]=useState(null);
  const [activeMatchId,setActiveMatchId]=useState(null);
  const [showStandings,setShowStandings]=useState(false);
  const [elimInPlayoffs,setElimInPlayoffs]=useState(false);
  const [showHelp,setShowHelp]=useState(false);
  const [showLeaders,setShowLeaders]=useState(false);
  const [leagueLeaders,setLeagueLeaders]=useState({});
  const [seasonHighs,setSeasonHighs]=useState({});
  const [playoffLeaders,setPlayoffLeaders]=useState({});
  const [playoffHighs,setPlayoffHighs]=useState({});
  const [showPlayoffLeaders,setShowPlayoffLeaders]=useState(false);
  const [topPicks, setTopPicks] = useState([]);
  const [myTeamName, setMyTeamName] = useState("Your Team");
  const [teamNameHistory, setTeamNameHistory] = useState([]);
  const [difficulty, setDifficulty] = useState("standard"); // casual | standard | hardcore
  const [inspectPlayer, setInspectPlayer] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Load previously used team names (local history)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("nba-budget-ball-teamnames");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setTeamNameHistory(arr);
      }
    } catch {
      // ignore
    }
  }, []);

  // Load saved team name and roster from localStorage or URL once players are loaded
  useEffect(() => {
    if (typeof window === "undefined" || !playerPool.length) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const rosterParam = params.get("roster");
      if (rosterParam) {
        const parts = rosterParam.split("-");
        if (parts.length === POSITIONS.length) {
          const next = { PG: null, SG: null, SF: null, PF: null, C: null };
          let ok = true;
          for (let i = 0; i < POSITIONS.length; i++) {
            const id = parseInt(parts[i], 10);
            if (!id) continue;
            const p = playerPool.find((pl) => pl.id === id);
            if (!p) { ok = false; break; }
            next[POSITIONS[i]] = p;
          }
          if (ok) {
            setRoster(next);
            setPhase("draft");
            return;
          }
        }
      }
      const raw = window.localStorage.getItem("nba-budget-ball-state");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.teamName) setMyTeamName(saved.teamName);
      if (saved.difficulty) setDifficulty(saved.difficulty);
      if (saved.roster) {
        const next = { PG: null, SG: null, SF: null, PF: null, C: null };
        POSITIONS.forEach((pos) => {
          const id = saved.roster[pos];
          if (id != null) {
            const player = playerPool.find((p) => p.id === id);
            if (player) next[pos] = player;
          }
        });
        setRoster(next);
      }
    } catch {
      // ignore
    }
  }, [playerPool]);

  // Persist team name and roster whenever they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rosterIds = {};
      POSITIONS.forEach((pos) => {
        rosterIds[pos] = roster[pos]?.id ?? null;
      });
      const payload = {
        teamName: myTeamName,
        roster: rosterIds,
        difficulty,
      };
      window.localStorage.setItem(
        "nba-budget-ball-state",
        JSON.stringify(payload)
      );
    } catch {
      // ignore localStorage issues
    }
  }, [roster, myTeamName, difficulty]);

  const rememberTeamName = useCallback((name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setTeamNameHistory((prev) => {
      const next = [trimmed, ...prev.filter((n) => n !== trimmed)].slice(0, 8);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("nba-budget-ball-teamnames", JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);

  // First-time tutorial: show when entering draft if never seen
  useEffect(() => {
    if (typeof window === "undefined" || phase !== "draft") return;
    const seen = window.localStorage.getItem("nba-budget-ball-tutorial-seen");
    if (!seen) setShowTutorial(true);
  }, [phase]);

  const dismissTutorial = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("nba-budget-ball-tutorial-seen", "1");
    setShowTutorial(false);
  }, []);

  const handleCopyTeamCode = useCallback(() => {
    if (inSeason) return;
    const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
    const code = ids.join("-");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {
        window.prompt("Copy your team code:", code);
      });
    } else {
      window.prompt("Copy your team code:", code);
    }
  }, [roster, inSeason]);

  const handleLoadTeamCode = useCallback(() => {
    if (inSeason) return;
    const input =
      typeof window !== "undefined"
        ? window.prompt("Paste a team code to load:")
        : null;
    if (!input) return;
    const parts = input.split("-");
    if (parts.length !== POSITIONS.length) {
      window.alert("Invalid team code.");
      return;
    }
    const next = { PG: null, SG: null, SF: null, PF: null, C: null };
    for (let i = 0; i < POSITIONS.length; i++) {
      const id = parseInt(parts[i], 10);
      if (!id) continue;
      const p = playerPool.find((pl) => pl.id === id);
      if (!p) {
        window.alert("This team code does not match the current player pool.");
        return;
      }
      next[POSITIONS[i]] = p;
    }
    setRoster(next);
  }, [playerPool, inSeason]);

  const [shareImageStatus, setShareImageStatus] = useState(null);
  const handleShareLineup = useCallback(async () => {
    if (inSeason) return;
    const filled = POSITIONS.every((pos) => roster[pos]);
    if (!filled) {
      setShareImageStatus("Complete your lineup first");
      setTimeout(() => setShareImageStatus(null), 2000);
      return;
    }
    const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
    const code = ids.join("-");
    const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
    if (url) url.searchParams.set("roster", code);
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const name = (myTeamName && myTeamName.trim()) ? myTeamName.trim() : "my";
    const shareText = "Here's " + name + "'s lineup — paste the code to try it or build your own!\nCode: " + code + "\nPlay: " + baseUrl;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    try {
      await nav?.clipboard?.writeText(shareText);
      setShareImageStatus("message_copied");
    } catch {
      window.prompt("Copy this message:", shareText);
      setShareImageStatus("Copy the message above");
      setTimeout(() => setShareImageStatus(null), 3000);
      return;
    }
    setTimeout(() => setShareImageStatus(null), 5000);
  }, [roster, myTeamName, inSeason]);

  const handleCopyLineupImage = useCallback(async () => {
    if (inSeason) return;
    const filled = POSITIONS.every((pos) => roster[pos]);
    if (!filled) {
      setShareImageStatus("Complete your lineup first");
      setTimeout(() => setShareImageStatus(null), 2000);
      return;
    }
    setShareImageStatus("Creating image…");
    try {
      const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
      const code = ids.join("-");
      const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
      if (url) url.searchParams.set("roster", code);
      const shareUrl = url ? url.toString() : null;
      const blob = await generateLineupImageBlob(roster, myTeamName, shareUrl, code);
      if (navigator?.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setShareImageStatus("Image copied!");
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "nba-budget-ball-lineup.png";
        a.click();
        URL.revokeObjectURL(a.href);
        setShareImageStatus("Downloaded");
      }
    } catch {
      setShareImageStatus("Couldn’t copy image");
    }
    setTimeout(() => setShareImageStatus(null), 2500);
  }, [roster, myTeamName, inSeason]);

const audioRef = useRef(null);
const trackIndex = useRef(0);
const hasStarted = useRef(false);

const TRACKS = ['weonit.mp3','lovenwantiti.mp3','poppin.mp3','onepunch.mp3', 'photograph.mp3', 'ateam.mp3', 'cold.mp3','lemonade.mp3', 'outstanding.mp3', 'amazing.mp3', 'bestfriend.mp3', 'baddecisions.mp3', 'lightsplease.mp3', 'loveletter.mp3', 'didntchaknow.mp3', 'familyties.mp3', 'letmeknow.mp3', 'digital.mp3', 'dior.mp3', 'kaceytalk.mp3', 'gold.mp3', 'nowornever.mp3',  'whodowethinkweare.mp3'];

const playTrack = (index) => {
  const audio = audioRef.current;
  if(!audio) return;
  audio.src = TRACKS[index];
  audio.play().catch(() => {});
};

useEffect(() => {
  const audio = new Audio();
  audio.volume = 0.3;
  audioRef.current = audio;

  audio.addEventListener('ended', () => {
    let next;
    do { next = Math.floor(Math.random() * TRACKS.length); } while(next === trackIndex.current);
    trackIndex.current = next;
    playTrack(next);
});

  return () => { audio.pause(); audio.src = ''; };
}, []);

const skipSong = (e) => {
  e?.stopPropagation();
  e?.preventDefault();
  let next;
  do { next = Math.floor(Math.random() * TRACKS.length); } while(next === trackIndex.current);
  trackIndex.current = next;
  playTrack(next);
};

const handleFirstClick = useCallback(() => {
  if(hasStarted.current) return;
  hasStarted.current = true;
  playTrack(trackIndex.current)
}, []);

const skipBtn = (
  <button
    onMouseDown={(e) => { e.stopPropagation(); }}
    onClick={(e) => { e.stopPropagation(); e.preventDefault(); skipSong(e); }}
    style={{position:"fixed",bottom:16,right:16,zIndex:9999,background:"#1e293b",border:"1px solid #334155",borderRadius:"50%",width:36,height:36,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>
    ⏭
  </button>
);

const volumeSlider = (
  <div style={{position:"fixed",bottom:16,left:16,zIndex:9999,display:"flex",alignItems:"center",gap:6,background:"#1e293b",border:"1px solid #334155",borderRadius:20,padding:"4px 10px",boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>
    <span style={{fontSize:11}}>🔊</span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      defaultValue="0.3"
      onChange={(e) => { if(audioRef.current) audioRef.current.volume = parseFloat(e.target.value); }}
      style={{width:60,accentColor:"#6366f1",cursor:"pointer"}}
    />
  </div>
);

  const myIds=new Set(Object.values(roster).filter(Boolean).map(p=>p.id));
  const spent=Object.values(roster).reduce((s,p)=>s+(p?.cost||0),0);
  const rem=BUDGET-spent,filled=POSITIONS.filter(p=>roster[p]).length,full=filled===5;
  const myLineup=full?POSITIONS.map(pos=>({player:roster[pos],slot:pos})):null;
  const myEffVal=myLineup?rf(teamEff(myLineup,teamRoster),1):null;
  const myCh=myLineup?chemBoost(myLineup,teamRoster):0;
  const myRecord={w:season.w,l:season.l,eff:myEffVal||0};

  const getPlayerSeasonLine = useCallback(
    (name, teamLabel) => {
      const key = `${name}|${teamLabel}`;
      const rec = leagueLeaders[key];
      if (!rec || !rec.gp) return { pts: 0, reb: 0, ast: 0 };
      return {
        pts: rf(rec.pts / rec.gp, 1),
        reb: rf(rec.reb / rec.gp, 1),
        ast: rf(rec.ast / rec.gp, 1),
      };
    },
    [leagueLeaders]
  );

  const updateSeasonHighs = useCallback((res, teamALabel, teamBLabel) => {
    if (!res) return;
    setSeasonHighs((prev) => {
      const next = { ...prev };
      const apply = (stats, team) => {
        stats.forEach((s) => {
          const entries = [
            ["pts", s.pts],
            ["reb", s.reb],
            ["ast", s.ast],
            ["stl", s.stl],
            ["blk", s.blk],
            ["fgm", s.fgm],
            ["tpm", s.tpm],
            ["tov", s.tov],
            ["ftm", s.ftm],
          ];
          entries.forEach(([key, val]) => {
            if (val == null) return;
            const cur = next[key];
            if (!cur || val > cur.val) {
              next[key] = { val, name: s.name, team, pos: s.pos };
            }
          });
        });
      };
      apply(res.myStats, teamALabel);
      apply(res.oppStats, teamBLabel);
      return next;
    });
  }, []);

  const updatePlayoffLeaders = useCallback((res, teamALabel, teamBLabel) => {
    if (!res) return;
    setPlayoffLeaders((prev) => {
      const next = { ...prev };
      const applyTeam = (stats, teamLabel) => {
        stats.forEach((s) => {
          const key = `${s.name}|${teamLabel}`;
          const cur = next[key] || {
            name: s.name,
            team: teamLabel,
            pos: s.pos,
            gp: 0,
            pts: 0,
            reb: 0,
            ast: 0,
            stl: 0,
            blk: 0,
            tov: 0,
            fgm: 0,
            fga: 0,
            tpm: 0,
            tpa: 0,
            ftm: 0,
            fta: 0,
          };
          next[key] = {
            ...cur,
            pos: cur.pos || s.pos,
            gp: cur.gp + 1,
            pts: cur.pts + s.pts,
            reb: cur.reb + s.reb,
            ast: cur.ast + s.ast,
            stl: cur.stl + s.stl,
            blk: cur.blk + s.blk,
            tov: cur.tov + s.tov,
            fgm: cur.fgm + s.fgm,
            fga: cur.fga + s.fga,
            tpm: cur.tpm + s.tpm,
            tpa: cur.tpa + s.tpa,
            ftm: cur.ftm + s.ftm,
            fta: cur.fta + s.fta,
          };
        });
      };
      applyTeam(res.myStats, teamALabel);
      applyTeam(res.oppStats, teamBLabel);
      return next;
    });
  }, []);

  const updatePlayoffHighs = useCallback((res, teamALabel, teamBLabel) => {
    if (!res) return;
    setPlayoffHighs((prev) => {
      const next = { ...prev };
      const apply = (stats, team) => {
        stats.forEach((s) => {
          const entries = [
            ["pts", s.pts],
            ["reb", s.reb],
            ["ast", s.ast],
            ["stl", s.stl],
            ["blk", s.blk],
            ["fgm", s.fgm],
            ["tpm", s.tpm],
            ["ftm", s.ftm],
            ["tov", s.tov],
          ];
          entries.forEach(([key, val]) => {
            if (val == null) return;
            const cur = next[key];
            if (!cur || val > cur.val) {
              next[key] = { val, name: s.name, team, pos: s.pos };
            }
          });
        });
      };
      apply(res.myStats, teamALabel);
      apply(res.oppStats, teamBLabel);
      return next;
    });
  }, []);

  const updateLeagueLeaders = useCallback((res, myTeamLabel, oppTeamLabel, dayIndex) => {
    if (!res || dayIndex == null) return;
    setLeagueLeaders((prev) => {
      const next = { ...prev };
      const applyTeam = (stats, teamLabel) => {
        stats.forEach((s) => {
          const key = `${s.name}|${teamLabel}`;
          const cur = next[key] || {
            name: s.name,
            team: teamLabel,
            pos: s.pos,
            gp: 0,
            pts: 0,
            reb: 0,
            ast: 0,
            stl: 0,
            blk: 0,
            tov: 0,
            fgm: 0,
            fga: 0,
            tpm: 0,
            tpa: 0,
            ftm: 0,
            fta: 0,
            lastDay: -1,
          };
          if (cur.lastDay === dayIndex) {
            next[key] = cur;
            return;
          }
          next[key] = {
            ...cur,
            pos: cur.pos || s.pos,
            lastDay: dayIndex,
            gp: cur.gp + 1,
            pts: cur.pts + s.pts,
            reb: cur.reb + s.reb,
            ast: cur.ast + s.ast,
            stl: cur.stl + s.stl,
            blk: cur.blk + s.blk,
            tov: cur.tov + s.tov,
            fgm: cur.fgm + s.fgm,
            fga: cur.fga + s.fga,
            tpm: cur.tpm + s.tpm,
            tpa: cur.tpa + s.tpa,
            ftm: cur.ftm + s.ftm,
            fta: cur.fta + s.fta,
          };
        });
      };
      applyTeam(res.myStats, myTeamLabel);
      applyTeam(res.oppStats, oppTeamLabel);
      return next;
    });
  }, []);

  // Simulate all non-user games for a given game index (0-based).
  const applyDayResults = useCallback(
    (dayIndex, oppIndex, userWon) => {
      setAiTeams((prev) => {
        const USER_INDEX = NUM_TEAMS - 1;
        const next = prev.map((t) => ({
          ...t,
          gameLog: [...(t.gameLog || Array(SEASON_LENGTH).fill(null))],
        }));

        // Record opponent's result vs user for this day.
        if (oppIndex != null && next[oppIndex]) {
          next[oppIndex].gameLog[dayIndex] = userWon ? 0 : 1;
        }

        // Build list of AI teams that still need a game this day (exclude user opponent).
        const pool = [];
        for (let i = 0; i < NUM_TEAMS - 1; i++) {
          if (i === oppIndex) continue;
          pool.push(i);
        }
        // Shuffle for randomness.
        for (let k = pool.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1));
          [pool[k], pool[r]] = [pool[r], pool[k]];
        }
        // Pair off and simulate.
        while (pool.length > 1) {
          const a = pool.pop();
          const b = pool.pop();
          const teamA = next[a];
          const teamB = next[b];
          const res = simulate(teamA.lineup, teamB.lineup, teamRoster, { difficulty });
          const aWon = res.myScore > res.oppScore;
          next[a].gameLog[dayIndex] = aWon ? 1 : 0;
          next[b].gameLog[dayIndex] = aWon ? 0 : 1;
          updateLeagueLeaders(res, teamA.name, teamB.name, dayIndex);
          updateSeasonHighs(res, teamA.name, teamB.name);
        }

        // Recompute W/L from full log.
        for (let i = 0; i < next.length; i++) {
          const gl = next[i].gameLog;
          next[i].w = gl.filter((x) => x === 1).length;
          next[i].l = gl.filter((x) => x === 0).length;
        }
        return next;
      });
    },
    [teamRoster, updateLeagueLeaders]
  );

  useEffect(()=>{
    setImportInfo("Loading players...");
    Promise.all([
      fetch("/all_nba_filtered.csv").then(r=>r.ok?r.text():null).catch(()=>null),
      fetch("/current_nba_filtered.csv").then(r=>r.ok?r.text():null).catch(()=>null),
    ]).then(([allText,curText])=>{
      const combined=[allText,curText].filter(Boolean).join("\n");
      if(!combined)throw new Error("No CSV files found — place all_nba_filtered.csv and/or current_nba_filtered.csv in /public");
      const lines=combined.split("\n");
      const header=lines[0];
      const deduped=[header,...lines.slice(1).filter(l=>l.trim()&&!l.startsWith(header.split(",")[0]+","+header.split(",")[1]))];
      const res=processCSV(deduped.join("\n"));
      if(!res||res.players.length===0)throw new Error("CSV parsed but no valid players found");
      setPlayerPool(res.players);setTeamRoster(res.teamRoster);
      setImportInfo(`✓ ${res.players.length} players loaded`);
      setTimeout(()=>setPhase("teamSetup"),600);
    }).catch(err=>{setImportErr(err.message);setImportInfo("");});
  },[]);

 useEffect(()=>{ if(phase==="draft") getTopPicks().then(setTopPicks); },[phase]);

  const pickPlayer=useCallback((player)=>{
    if(inSeason)return;
    const targetSlot=slotSel||player.pos,prev=roster[targetSlot];
    if((player.cost-(prev?.cost||0))>rem)return;
    if(prev?.id===player.id){setRoster(r=>({...r,[targetSlot]:null}));setSlotSel(null);return;}
    setRoster(r=>({...r,[targetSlot]:player}));setSlotSel(null);
  },[roster,rem,slotSel,inSeason]);

  const drop=slot=>{if(inSeason)return;setRoster(r=>({...r,[slot]:null}));if(slotSel===slot)setSlotSel(null);};

const startSeason = async () => {
  if(!full) return;
  const sched = buildSeasonSchedule();
  const teams = generateLeague(myLineup, playerPool, myTeamName);
  // Initialize AI teams with empty 82-game logs; games will be added day-by-day.
  const ai = teams.slice(0, NUM_TEAMS - 1).map((t) => ({
    ...t,
    w: 0,
    l: 0,
    gameLog: Array(SEASON_LENGTH).fill(null),
  }));
  setSchedule(sched);
  setAiTeams(ai);
  setInSeason(true);
  setSeason(emptySeason());
  setGameNum(1);
  setResult(null);
  setPhase("game");
  setBracket(null);
  setPlayoffResult(null);
  setElimInPlayoffs(false);
  await Promise.all(myLineup.map(({player})=>incrementPick(player.name)));
  getTopPicks().then(setTopPicks);
};

  const playGame = () => {
    if (!full || !schedule || gameNum > SEASON_LENGTH) return;
    const USER_INDEX = NUM_TEAMS - 1;
    const oppIndex = schedule[USER_INDEX][gameNum - 1];
    const opp = aiTeams[oppIndex];
    if (!opp) return;
    const res = simulate(myLineup, opp.lineup, teamRoster, { difficulty });
    const won = res.myScore > res.oppScore;
    const uniqueStats = [...new Map(res.myStats.map((s) => [s.name, s])).values()];
    setSeason((s) => addToSeason(s, uniqueStats, won, res.myScore, res.oppScore));
    // Apply this day's results to all AI teams (including opponent vs user).
    const dayIndex = gameNum - 1;
    applyDayResults(dayIndex, oppIndex, won);
    updateLeagueLeaders(res, myTeamName, opp?.name || "Opponent", dayIndex);
    updateSeasonHighs(res, myTeamName, opp?.name || "Opponent");
    setResult(res);
  };

  const nextGame = () => {
    if (gameNum >= SEASON_LENGTH) {
      setPhase("seasonEnd");
      return;
    }
    setGameNum((g) => g + 1);
    setResult(null);
  };

  const simGames = (count) => {
    if (!full || !schedule || gameNum > SEASON_LENGTH) return;
    const toPlay = Math.min(count, SEASON_LENGTH - gameNum + 1);
    for (let k = 0; k < toPlay; k++) {
      const g = gameNum + k;
      const USER_INDEX = NUM_TEAMS - 1;
      const oppIndex = schedule[USER_INDEX][g - 1];
      const opp = aiTeams[oppIndex];
      const res = simulate(myLineup, opp.lineup, teamRoster, { difficulty });
      const won = res.myScore > res.oppScore;
      const uniqueStats = [...new Map(res.myStats.map((s) => [s.name, s])).values()];
      // Update season + all AI results for this day.
      const dayIndex = g - 1;
      setSeason((s) => addToSeason(s, uniqueStats, won, res.myScore, res.oppScore));
      applyDayResults(dayIndex, oppIndex, won);
      updateLeagueLeaders(res, myTeamName, opp?.name || "Opponent", dayIndex);
      updateSeasonHighs(res, myTeamName, opp?.name || "Opponent");
    }
    const nextGameNum = Math.min(gameNum + toPlay, SEASON_LENGTH);
    setGameNum(nextGameNum);
    setResult(null);
    if (gameNum + toPlay > SEASON_LENGTH) setPhase("seasonEnd");
  };

  const buildPlayoffBracket = (finalSeason, finalAi) => {
    const meta = getNBATeamsWithMeta();
    const userMeta = meta[NUM_TEAMS - 1];
    const userTeam = {
      name: myTeamName,
      w: finalSeason.w,
      l: SEASON_LENGTH - finalSeason.w,
      eff: myEffVal || 0,
      lineup: myLineup,
      isPlayer: true,
      division: userMeta.division,
      conference: userMeta.conference,
    };
    const all = [userTeam, ...finalAi.map((t) => ({ ...t, isPlayer: false }))];
    const east = all.filter((t) => t.conference === "East");
    const west = all.filter((t) => t.conference === "West");
    const eastSeeds = seedConference(east, EAST_DIVISIONS);
    const westSeeds = seedConference(west, WEST_DIVISIONS);
    const eastBracket = buildBracket(eastSeeds);
    const westBracket = buildBracket(westSeeds);
    const finalsMatchup = { id: "finals", top: null, bot: null, winner: null, games: [], label: "FINALS" };
    const newBracket = {
      east: eastBracket,
      west: westBracket,
      finals: finalsMatchup,
      champion: null,
    };
    setBracket(newBracket);
    setPhase("playoffs");
    setPlayoffResult(null);
    setActiveMatchId(getNextPlayerMatchId(newBracket) || getNextAIMatchId(newBracket) || null);
    setElimInPlayoffs(false);
    setPlayoffLeaders({});
    setPlayoffHighs({});
    setShowPlayoffLeaders(false);
  };

  function getPlayoffMatchup(b, matchId) {
    if (matchId === "finals") return { sub: b, matchup: b.finals, slot: "f1", conf: "finals" };
    const [conf, slot] = matchId.split("-");
    const sub = b[conf];
    if (!sub) return null;
    const slotMap = { pi1: sub.playIn?.[0], pi2: sub.playIn?.[1], pi3: sub.playIn?.[2], fr1: sub.firstRound?.[0], fr2: sub.firstRound?.[1], fr3: sub.firstRound?.[2], fr4: sub.firstRound?.[3], sf1: sub.semis?.[0], sf2: sub.semis?.[1], f: sub.finals };
    const matchup = slotMap[slot];
    return matchup ? { sub, matchup, slot: slot === "f" ? "f1" : slot, conf } : null;
  }

  function runOnePlayoffGame(b, matchId, tr, lineup, diff) {
    const parsed = getPlayoffMatchup(b, matchId);
    if (!parsed) return { bracket: b, result: null, playerEliminated: false };
    const { sub, matchup, slot, conf } = parsed;
    if (!matchup || matchup.winner) return { bracket: b, result: null, playerEliminated: false };
    const topIsPlayer = matchup.top?.isPlayer, botIsPlayer = matchup.bot?.isPlayer;
    let res = null, winnerIdx;
    if (topIsPlayer || botIsPlayer) {
      const pTop = topIsPlayer;
      res = simulate(lineup, pTop ? matchup.bot.lineup : matchup.top.lineup, { ...tr, _playoff: true }, { difficulty: diff });
      winnerIdx = (res.myScore > res.oppScore) ? (pTop ? 0 : 1) : (pTop ? 1 : 0);
      const myTeamLabel = pTop ? matchup.top.name : matchup.bot.name;
      const oppTeamLabel = pTop ? matchup.bot.name : matchup.top.name;
      updatePlayoffLeaders(res, myTeamLabel, oppTeamLabel);
      updatePlayoffHighs(res, myTeamLabel, oppTeamLabel);
    } else {
      // AI vs AI playoff game: use full simulate so we get stats.
      res = simulate(matchup.top.lineup, matchup.bot.lineup, { ...tr, _playoff: true }, { difficulty: diff });
      winnerIdx = res.myScore > res.oppScore ? 0 : 1;
      updatePlayoffLeaders(res, matchup.top.name, matchup.bot.name);
      updatePlayoffHighs(res, matchup.top.name, matchup.bot.name);
    }
    matchup.games.push({ winnerIdx, myScore: res?.myScore, oppScore: res?.oppScore, res });
    const wTop = matchup.games.filter((g) => g.winnerIdx === 0).length, wBot = matchup.games.filter((g) => g.winnerIdx === 1).length;
    let playerEliminated = false;
    if (wTop === 1 || wBot === 1) {
      matchup.winner = wTop === 1 ? matchup.top : matchup.bot;
      const w = matchup.winner;
      playerEliminated = (topIsPlayer && wBot === 1) || (botIsPlayer && wTop === 1);
      if (slot === "pi1") { sub.firstRound[1].bot = w; sub.playIn[2].top = wTop === 1 ? sub.playIn[0].bot : sub.playIn[0].top; }
      else if (slot === "pi2") sub.playIn[2].bot = w;
      else if (slot === "pi3") sub.firstRound[0].bot = w;
      else if (slot === "fr1") sub.semis[0].top = w;
      else if (slot === "fr2") sub.semis[0].bot = w;
      else if (slot === "fr3") sub.semis[1].top = w;
      else if (slot === "fr4") sub.semis[1].bot = w;
      else if (slot === "sf1") sub.finals.top = w;
      else if (slot === "sf2") sub.finals.bot = w;
      else if (slot === "f1") {
        if (conf === "east") b.finals.top = w;
        else if (conf === "west") b.finals.bot = w;
        else if (conf === "finals") { b.finals.winner = w; b.champion = w; }
      }
    }
    const result = res
      ? { ...res, playerIsTop: topIsPlayer, matchId, seriesOver: !!matchup.winner, winner: matchup.winner, topName: matchup.top.name, botName: matchup.bot.name }
      : { aiOnly: true, matchId, seriesOver: !!matchup.winner, winner: matchup.winner, topName: matchup.top?.name, botName: matchup.bot?.name };
    return { bracket: b, result, playerEliminated };
  }

  function getNextAIMatchId(b) {
    const order = ["pi1", "pi2", "pi3", "fr1", "fr2", "fr3", "fr4", "sf1", "sf2", "f1"];
    for (const conf of ["east", "west"]) {
      const sub = b[conf];
      if (!sub) continue;
      for (const slot of order) {
        const matchId = slot === "f1" ? `${conf}-f` : `${conf}-${slot}`;
        const parsed = getPlayoffMatchup(b, matchId);
        if (!parsed) continue;
        const m = parsed.matchup;
        if (m && !m.winner && m.top && m.bot && !m.top.isPlayer && !m.bot.isPlayer) return matchId;
      }
    }
    if (b.finals && b.finals.top && b.finals.bot && !b.finals.winner && !b.finals.top.isPlayer && !b.finals.bot.isPlayer) return "finals";
    return null;
  }

  function getNextPlayerMatchId(b) {
    const order = ["pi1", "pi2", "pi3", "fr1", "fr2", "fr3", "fr4", "sf1", "sf2", "f1"];
    for (const conf of ["east", "west"]) {
      const sub = b[conf];
      if (!sub) continue;
      for (const slot of order) {
        const matchId = slot === "f1" ? `${conf}-f` : `${conf}-${slot}`;
        const parsed = getPlayoffMatchup(b, matchId);
        if (!parsed) continue;
        const m = parsed.matchup;
        if (m && !m.winner && (m.top?.isPlayer || m.bot?.isPlayer)) return matchId;
      }
    }
    if (b.finals && b.finals.top && b.finals.bot && !b.finals.winner) return "finals";
    return null;
  }

  const playPlayoffGame=(matchId)=>{
    if(!bracket) return;
    const b = JSON.parse(JSON.stringify(bracket));
    const out = runOnePlayoffGame(b, matchId, teamRoster, myLineup, difficulty);
    if (out.playerEliminated) setElimInPlayoffs(true);
    setBracket(out.bracket);
    setPlayoffResult(out.result);
  };

  const simAllAIGames = useCallback(() => {
    if (!bracket) return;
    let b = JSON.parse(JSON.stringify(bracket));
    let id;
    while ((id = getNextAIMatchId(b)) !== null) {
      const out = runOnePlayoffGame(b, id, teamRoster, myLineup, difficulty);
      b = out.bracket;
      if (out.playerEliminated) setElimInPlayoffs(true);
    }
    setBracket(b);
    setPlayoffResult(null);
    setActiveMatchId(getNextPlayerMatchId(b) || null);
  }, [bracket, teamRoster, myLineup, difficulty]);

const newSeason = () => {
  setInSeason(false);
  setSeason(emptySeason());
  setGameNum(1);
  setResult(null);
  setPhase("teamSetup");
  setBracket(null);
  setPlayoffResult(null);
  setAiTeams([]);
  setSchedule(null);
  setElimInPlayoffs(false);
  setRoster({ PG: null, SG: null, SF: null, PF: null, C: null });
  setShowLeaders(false);
  setLeagueLeaders({});
  setSeasonHighs({});
  setPlayoffLeaders({});
  setPlayoffHighs({});
  setShowPlayoffLeaders(false);
  setImportInfo("");
  setImportErr("");
  getTopPicks().then(setTopPicks);
};

if(phase==="teamSetup") return(
  <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{maxWidth:400,width:"100%",textAlign:"center"}}>
      <div style={{fontSize:48,marginBottom:12}}>🏀</div>
      <h1 style={{margin:"0 0 6px",fontSize:28,fontWeight:900,background:"linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>NBA BUDGET BALL</h1>
      <div style={{fontSize:12,color:"#475569",marginBottom:32}}>Name your franchise before hitting the court</div>
      <div style={{background:"#0f172a",borderRadius:14,padding:24,border:"1px solid #1e293b"}}>
        <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:1,marginBottom:8}}>TEAM NAME</div>
        <input
          autoFocus
          value={myTeamName}
          onChange={e=>setMyTeamName(e.target.value)}
          onKeyDown={e=>{
            if(e.key==="Enter"&&myTeamName.trim()){
              rememberTeamName(myTeamName);
              setPhase("draft");
            }
          }}
          maxLength={20}
          placeholder="e.g. Hardwood Kings..."
          style={{width:"100%",background:"#080f1e",border:"1px solid #334155",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#e2e8f0",outline:"none",boxSizing:"border-box",marginBottom:16,textAlign:"center"}}
        />
        {teamNameHistory.length>0&&(
          <div style={{marginBottom:12,fontSize:10,color:"#64748b"}}>
            <div style={{marginBottom:4,fontWeight:700,letterSpacing:0.5}}>RECENT NAMES</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}}>
              {teamNameHistory.slice(0,6).map((name)=>(
                <button
                  key={name}
                  type="button"
                  onClick={()=>setMyTeamName(name)}
                  style={{borderRadius:999,background:"#020617",border:"1px solid #1e293b",padding:"4px 8px",color:"#e5e7eb",fontSize:10,cursor:"pointer"}}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={()=>{
            if(!myTeamName.trim()) return;
            rememberTeamName(myTeamName);
            setPhase("draft");
          }}
          disabled={!myTeamName.trim()}
          style={{width:"100%",background:myTeamName.trim()?"linear-gradient(135deg,#f59e0b,#d97706)":"#1e293b",color:myTeamName.trim()?"white":"#374151",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:800,cursor:myTeamName.trim()?"pointer":"not-allowed"}}>
          🏀 LET'S BUILD
        </button>
      </div>
    </div>
  </div>
);

  if(phase==="import") return(
    <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{maxWidth:400,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>💰</div>
        <h1 style={{margin:"0 0 6px",fontSize:28,fontWeight:900,background:"linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>NBA BUDGET BALL</h1>
        <div style={{fontSize:12,color:"#475569",marginBottom:32}}>v1.0 · 1974-Present · CSV-powered</div>
        {!importErr?(
          <div style={{background:"#0f172a",borderRadius:14,padding:24,border:"1px solid #1e293b"}}>
            <div style={{fontSize:28,marginBottom:10}}>⏳</div>
            <div style={{fontSize:13,color:"#60a5fa",fontWeight:700}}>{importInfo||"Loading player data..."}</div>
            <div style={{fontSize:11,color:"#334155",marginTop:8}}>Reading all_nba_filtered.csv + current_nba_filtered.csv from /public</div>
          </div>
        ):(
          <div style={{background:"#1a0a0a",borderRadius:14,padding:24,border:"1px solid #ef4444"}}>
            <div style={{fontSize:28,marginBottom:10}}>❌</div>
            <div style={{fontSize:12,color:"#f87171",fontWeight:700,marginBottom:12}}>{importErr}</div>
            <div style={{fontSize:11,color:"#64748b",lineHeight:1.6}}>Place <code style={{color:"#a78bfa"}}>all_nba_filtered.csv</code> or <code style={{color:"#a78bfa"}}>current_nba_filtered.csv</code> in your <code style={{color:"#a78bfa"}}>public/</code> folder and refresh.</div>
          </div>
        )}
      </div>
    </div>
  );

  if(phase==="playoffs"&&bracket){
    const champion=bracket.champion,playerWon=champion?.isPlayer;
    const finalAiRec = aiTeams;
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        {volumeSlider}{skipBtn}
        
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <h2 style={{margin:0,fontSize:18,fontWeight:900,color:"#f59e0b"}}>🏆 PLAYOFFS</h2>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <button onClick={()=>setShowStandings(s=>!s)} style={{background:"#1e293b",color:"#60a5fa",border:"1px solid #334155",borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{showStandings?"Hide":"Show"} Standings</button>
              <button onClick={()=>setShowPlayoffLeaders(s=>!s)} style={{background:"#1e293b",color:"#f97316",border:"1px solid #334155",borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{showPlayoffLeaders?"Hide":"Show"} Leaders</button>
              {getNextAIMatchId(bracket)&&<button onClick={simAllAIGames} style={{background:"#475569",color:"#e2e8f0",border:"1px solid #64748b",borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>⚡ Sim all AI games</button>}
              {champion&&<button onClick={newSeason} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:7,padding:"5px 14px",fontSize:11,fontWeight:800,cursor:"pointer"}}>🔄 New Season</button>}
              <button onClick={()=>setShowHelp(h=>!h)} style={{width:28,height:28,borderRadius:"50%",background:"#1e293b",border:"1px solid #334155",color:"#60a5fa",fontSize:14,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>?</button>
            </div>
          </div>
          {showHelp&&<div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #334155",fontSize:10,color:"#64748b",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
            <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
            <div style={{marginBottom:2}}>• 30-team league (2 conferences, 6 divisions) — 82-game season</div>
            <div style={{marginBottom:2}}>• ⚡ Chemistry: real teammates same season+team</div>
            <div style={{marginBottom:2}}>• 🧩 Archetypes: balance your roster for bonuses</div>
            <div style={{marginBottom:2}}>• Top 6 direct · 7-10 play-in tournament</div>
            <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginTop:6,marginBottom:2}}>OOP PENALTIES</div>
            <div>Adjacent ×0.82 · Wrong ×0.65</div>
          </div>}
          {showStandings&&<div style={{marginBottom:12}}><StandingsTable aiTeams={finalAiRec} myRecord={myRecord} myName={myTeamName} highlight/></div>}
          {showPlayoffLeaders&&(
            <div style={{marginBottom:12}}>
              <LeagueLeaders leaders={playoffLeaders} myTeamName={myTeamName}/>
              <div style={{marginTop:8}}>
                <SeasonHighs highs={playoffHighs} myTeamName={myTeamName} title="📈 PLAYOFF HIGHS (SINGLE GAME)"/>
              </div>
            </div>
          )}
          {champion&&(
            <div style={{textAlign:"center",padding:16,background:playerWon?"linear-gradient(135deg,#78350f,#92400e)":"#0f172a",borderRadius:16,border:`2px solid ${playerWon?"#fbbf24":"#475569"}`,marginBottom:12}}>
              <div style={{fontSize:36}}>{playerWon?"🏆":"👑"}</div>
              <div style={{fontSize:22,fontWeight:900,color:playerWon?"#fbbf24":"#e2e8f0",letterSpacing:2}}>{playerWon?"YOU ARE CHAMPIONS!":champion.name+" WIN THE CHAMPIONSHIP!"}</div>
            </div>
          )}
          {elimInPlayoffs&&!champion&&(
            <div style={{textAlign:"center",padding:12,background:"#1a0a0a",borderRadius:12,border:"2px solid #ef4444",marginBottom:12}}>
              <div style={{fontSize:24}}>💀</div><div style={{fontSize:16,fontWeight:900,color:"#ef4444"}}>YOUR SEASON IS OVER</div>
            </div>
          )}
          <BracketDisplay bracket={bracket} activeMatchId={activeMatchId} onPlayMatch={id=>{setActiveMatchId(id);setPlayoffResult(null);playPlayoffGame(id);}}/>
          {activeMatchId&&(()=>{
            const parsed=getPlayoffMatchup(bracket,activeMatchId);
            const matchup=parsed?.matchup;
            if(!matchup)return null;
            const wT=matchup.games.filter(g=>g.winnerIdx===0).length,wB=matchup.games.filter(g=>g.winnerIdx===1).length;
            const done=!!matchup.winner,pInv=matchup.top?.isPlayer||matchup.bot?.isPlayer;
            return(
              <div style={{marginTop:12}}>
                <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #334155",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{fontWeight:800,fontSize:13,color:"#a78bfa"}}>{matchup.label}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>Series: {matchup.top?.name} {wT}–{wB} {matchup.bot?.name}</div>
                  </div>
                  {!done&&pInv&&<button onClick={()=>playPlayoffGame(activeMatchId)} style={{marginTop:8,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:8,padding:"9px 24px",fontSize:13,fontWeight:800,cursor:"pointer"}}>▶ Play Game {matchup.games.length+1}</button>}
                  {!done&&!pInv&&<button onClick={()=>playPlayoffGame(activeMatchId)} style={{marginTop:8,background:"linear-gradient(135deg,#475569,#334155)",color:"white",border:"none",borderRadius:8,padding:"9px 24px",fontSize:13,fontWeight:800,cursor:"pointer"}}>⚡ Sim Game {matchup.games.length+1}</button>}
                  {done&&<div style={{marginTop:8,fontSize:12,color:"#22c55e",fontWeight:700}}>✓ {matchup.winner?.name} advance</div>}
                </div>
                {playoffResult&&!playoffResult.aiOnly&&playoffResult.matchId===activeMatchId&&(()=>{
                  const pr=playoffResult,pTop=pr.playerIsTop;
                  const myS=pr.myStats,oppS=pr.oppStats;
                  const myScore=pr.myScore,oppScore=pr.oppScore,won=myScore>oppScore;
                  return(<>
                    <div style={{textAlign:"center",padding:"12px",background:"#0f172a",borderRadius:12,border:`1px solid ${won?"#22c55e":"#ef4444"}`,marginBottom:10}}>
                      <div style={{fontSize:20,fontWeight:900,color:won?"#22c55e":"#ef4444"}}>{won?"✓ WIN":"✗ LOSS"}{pr.ot>0?` (${pr.ot}OT)`:""}</div>
                      <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:6}}>
                        <div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#60a5fa",fontWeight:700}}>{myTeamName}</div><div style={{fontSize:34,fontWeight:900,color:"#60a5fa"}}>{myScore}</div></div>
                        <div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#f87171",fontWeight:700}}>{pTop?pr.botName:pr.topName}</div><div style={{fontSize:34,fontWeight:900,color:"#f87171"}}>{oppScore}</div></div>
                      </div>
                      {pr.seriesOver&&<div style={{marginTop:6,fontSize:11,color:"#f59e0b",fontWeight:700}}>Series: {pr.winner?.name} win!</div>}
                    </div>
                    <BoxScore stats={myS} acc="#60a5fa" label={myTeamName}/>
                    <BoxScore stats={oppS} acc="#f87171" label={pTop?pr.botName:pr.topName}/>
                  </>);
                })()}
                {playoffResult?.aiOnly&&playoffResult.matchId===activeMatchId&&(
                  <div style={{textAlign:"center",padding:10,background:"#0f172a",borderRadius:10,border:"1px solid #334155"}}>
                    <div style={{fontSize:12,color:"#94a3b8"}}>{playoffResult.seriesOver?`✓ ${playoffResult.winner?.name} win the series!`:"Game simulated."}</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  if(phase==="seasonEnd"){
    const finalAi = aiTeams;
    const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
    const userRecord = { name: myTeamName, w: season.w, l: SEASON_LENGTH - season.w, eff: myEffVal || 0, isPlayer: true, division: userMeta.division, conference: userMeta.conference };
    const all = [userRecord, ...finalAi.map((t) => ({ ...t, isPlayer: false }))];
    const confTeams = all.filter((t) => t.conference === userMeta.conference).sort(standingsSort);
    const myRankInConf = confTeams.findIndex((t) => t.isPlayer) + 1;
    const playoff = myRankInConf <= 10;
    const playIn = myRankInConf >= 7 && myRankInConf <= 10;
    const mySeed = myRankInConf;
    const ppg=season.gp>0?rf(season.ptsFor/season.gp):0,papg=season.gp>0?rf(season.ptsAgainst/season.gp):0;
    const gpSafe = (s) => (s.gp > 0 ? s.gp : 1);
    let playerRows = Object.entries(season.players || {}).map(([name, s]) => ({
      name,
      gp: s.gp,
      pos: s.pos || null,
      ppg: rf(s.pts / gpSafe(s)),
      apg: rf(s.ast / gpSafe(s)),
      rpg: rf(s.reb / gpSafe(s)),
      spg: rf(s.stl / gpSafe(s)),
      bpg: rf(s.blk / gpSafe(s)),
      tpg: rf(s.tov / gpSafe(s)),
      fgPct: s.fga > 0 ? rf((s.fgm / s.fga) * 100) : 0,
      tpPct: s.tpa > 0 ? rf((s.tpm / s.tpa) * 100) : 0,
      ftPct: s.fta > 0 ? rf((s.ftm / s.fta) * 100) : 0,
    })).sort((a, b) => b.ppg - a.ppg);
    if (playerRows.length === 0 && myLineup && season.gp > 0) {
      playerRows = myLineup.map(({ player }) => ({
        name: player.name,
        gp: season.gp,
        ppg: 0, apg: 0, rpg: 0, spg: 0, bpg: 0, tpg: 0,
        fgPct: 0, tpPct: 0, ftPct: 0,
      }));
    }
    const mvp = playerRows[0];

    // League-wide awards (MVP & DPOY) based on normalized stats + team success.
    let leagueMVP = null;
    let leagueDPOY = null;
    const leaderEntries = Object.values(leagueLeaders || {});
    if (leaderEntries.length) {
      const teamWinPct = {};
      finalAi.forEach((t) => {
        const gp = t.w + t.l;
        teamWinPct[t.name] = gp > 0 ? t.w / gp : 0;
      });
      teamWinPct[myTeamName] = season.gp > 0 ? season.w / season.gp : 0;

      const leagueRows = leaderEntries.map((p) => {
        const gp = p.gp || 1;
        const ppg = p.pts / gp;
        const rpg = p.reb / gp;
        const apg = p.ast / gp;
        const spg = p.stl / gp;
        const bpg = p.blk / gp;
        const tpg = p.tov / gp;
        const fgPct = p.fga > 0 ? (p.fgm / p.fga) * 100 : 0;
        const tpPct = p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0;
        const teamPct = teamWinPct[p.team] ?? 0.4;
        return { ...p, gp, ppg, rpg, apg, spg, bpg, tpg, fgPct, tpPct, teamPct };
      });

      const maxOf = (key) => Math.max(1, ...leagueRows.map((r) => r[key] || 0));
      const maxPPG = maxOf("ppg");
      const maxRPG = maxOf("rpg");
      const maxAPG = maxOf("apg");
      const maxSPG = maxOf("spg");
      const maxBPG = maxOf("bpg");
      const maxTPG = maxOf("tpg");
      const maxFG = maxOf("fgPct");
      const max3P = maxOf("tpPct");

      leagueRows.forEach((r) => {
        const offScore =
          (r.ppg / maxPPG) * 3 +
          (r.apg / maxAPG) * 2 +
          (r.rpg / maxRPG) * 1.2;
        const effScore =
          (r.fgPct / maxFG) * 1.5 +
          (r.tpPct / max3P) * 0.8;
        const teamScore = r.teamPct * 3; // winning matters a lot
        const turnoverPenalty = (r.tpg / maxTPG) * 1.0;
        r.mvpScore = offScore + effScore + teamScore - turnoverPenalty;

        const defScore =
          (r.spg / maxSPG) * 2.5 +
          (r.bpg / maxBPG) * 2.5 +
          (r.rpg / maxRPG) * 1.0;
        const teamDefBonus = (1 - r.teamPct) * 0.0; // skip team defense for now
        r.dpoyScore = defScore + teamDefBonus;
      });

      leagueMVP = leagueRows.reduce(
        (best, r) => (!best || r.mvpScore > best.mvpScore ? r : best),
        null
      );
      leagueDPOY = leagueRows.reduce(
        (best, r) => (!best || r.dpoyScore > best.dpoyScore ? r : best),
        null
      );
    }
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        {volumeSlider}{skipBtn}
        <div style={{position:"absolute",top:16,right:16,zIndex:10}}>
          <button onClick={()=>setShowHelp(h=>!h)} style={{width:28,height:28,borderRadius:"50%",background:"#1e293b",border:"1px solid #334155",color:"#60a5fa",fontSize:14,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>?</button>
        </div>
        {showHelp&&<div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #334155",fontSize:10,color:"#64748b",marginBottom:14,maxWidth:800,marginLeft:"auto",marginRight:"auto"}}>
          <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
          <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
          <div style={{marginBottom:2}}>• 30-team league (2 conferences, 6 divisions) — 82-game season</div>
          <div style={{marginBottom:2}}>• ⚡ Chemistry: real teammates same season+team</div>
          <div style={{marginBottom:2}}>• 🧩 Archetypes: balance your roster for bonuses</div>
          <div style={{marginBottom:2}}>• Top 6 direct · 7-10 play-in tournament</div>
          <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginTop:6,marginBottom:2}}>OOP PENALTIES</div>
          <div>Adjacent ×0.82 · Wrong ×0.65</div>
        </div>}
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <div style={{textAlign:"center",padding:"16px",background:"#0f172a",borderRadius:16,border:`2px solid ${mySeed<=6?"#22c55e":playoff?"#f59e0b":"#ef4444"}`,marginBottom:14}}>
            <div style={{fontSize:36}}>{mySeed<=6?"🏆":playoff?"🎟":"💀"}</div>
            <div style={{fontSize:22,fontWeight:900,color:mySeed<=6?"#22c55e":playoff?"#f59e0b":"#ef4444",letterSpacing:2}}>
              {mySeed<=6?`PLAYOFFS BOUND — SEED #${mySeed}`:playoff?`PLAY-IN TOURNAMENT — SEED #${mySeed}`:"MISSED THE PLAYOFFS"}
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Final Record: {season.w}–{season.l} · PPG {ppg} · OPP {papg}</div>
          </div>
          <div style={{marginBottom:14}}><StandingsTable aiTeams={finalAi} myRecord={myRecord} myName={myTeamName} highlight/></div>
          {leagueMVP && (
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10,marginBottom:14}}>
              <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #fbbf24",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#fbbf24",fontWeight:800,letterSpacing:2,marginBottom:4}}>🏆 LEAGUE MVP</div>
              <div style={{fontSize:18,fontWeight:900}}>{leagueMVP.name}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
                {leagueMVP.pos || "—"} · {leagueMVP.team}
              </div>
                <div style={{fontSize:12,color:"#e5e7eb",marginTop:4}}>
                  {rf(leagueMVP.ppg,1)} PPG · {rf(leagueMVP.rpg,1)} RPG · {rf(leagueMVP.apg,1)} APG
                </div>
              </div>
              {leagueDPOY && (
                <div style={{background:"#020617",borderRadius:12,padding:12,border:"1px solid #22c55e",textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#22c55e",fontWeight:800,letterSpacing:2,marginBottom:4}}>🛡 DPOY</div>
                  <div style={{fontSize:18,fontWeight:900}}>{leagueDPOY.name}</div>
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
                    {leagueDPOY.pos || "—"} · {leagueDPOY.team}
                  </div>
                  <div style={{fontSize:12,color:"#e5e7eb",marginTop:4}}>
                    {rf(leagueDPOY.spg,1)} SPG · {rf(leagueDPOY.bpg,1)} BPG · {rf(leagueDPOY.rpg,1)} RPG
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:8}}>
            <button
              onClick={()=>setShowLeaders(s=>!s)}
              style={{background:"#1e293b",color:"#f97316",border:"1px solid #334155",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}
            >
              {showLeaders ? "Hide Leaders" : "Show Leaders"}
            </button>
          </div>
          {showLeaders&&(
            <div style={{marginBottom:14}}>
              <LeagueLeaders leaders={leagueLeaders} myTeamName={myTeamName}/>
            </div>
          )}
          {mvp&&(
            <div style={{background:"#0f172a",borderRadius:12,padding:12,marginBottom:14,border:"1px solid #fbbf24",textAlign:"center"}}>
              <div style={{fontSize:10,color:"#fbbf24",fontWeight:800,letterSpacing:2,marginBottom:4}}>
                🏅 TEAM MVP — {myTeamName}
              </div>
              <div style={{fontSize:18,fontWeight:900}}>{mvp.name}</div>
              <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>
                {mvp.pos || "—"} · {mvp.gp} GP
              </div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{mvp.ppg} PPG · {mvp.apg} APG · {mvp.rpg} RPG</div>
            </div>
          )}
          <div style={{background:"#0f172a",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b",marginBottom:14}}>
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>    
              <div style={{padding:"8px 12px",background:"#1e293b",fontWeight:800,fontSize:10,letterSpacing:2,color:"#60a5fa"}}>SEASON AVERAGES</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:"1px solid #1e293b"}}>
                  {[["PLAYER","left"],["POS","c"],["GP","c"],["PPG","c"],["RPG","c"],["APG","c"],["SPG","c"],["BPG","c"],["TPG","c"],["FG%","c"],["3P%","c"],["FT%","c"]].map(([h,a])=>(
                    <th key={h} style={{padding:"6px 8px",textAlign:a==="c"?"center":"left",color:"#475569",fontSize:10}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {playerRows.map((s,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                      <td style={{padding:"6px 8px",fontWeight:700}}>{i===0?"🏅 ":""}{s.name}</td>
                      <td style={{textAlign:"center",color:"#64748b"}}>{s.pos||"-"}</td>
                      <td style={{textAlign:"center",color:"#64748b"}}>{s.gp}</td>
                      <td style={{textAlign:"center",background:cellBg("pts",s.ppg*1.5),padding:"5px 4px",fontWeight:700}}>{s.ppg}</td>
                      <td style={{textAlign:"center",background:cellBg("reb",s.rpg*1.5),padding:"5px 4px"}}>{s.rpg}</td>
                      <td style={{textAlign:"center",background:cellBg("ast",s.apg*1.5),padding:"5px 4px"}}>{s.apg}</td>
                      <td style={{textAlign:"center",background:cellBg("stl",s.spg*2),padding:"5px 4px"}}>{s.spg}</td>
                      <td style={{textAlign:"center",background:cellBg("blk",s.bpg*2),padding:"5px 4px"}}>{s.bpg}</td>
                      <td style={{textAlign:"center",background:cellBg("tov",s.tpg*1.5),padding:"5px 4px"}}>{s.tpg}</td>
                      <td style={{textAlign:"center",background:cellBg("fgPct",s.fgPct),padding:"5px 4px"}}>{s.fgPct}%</td>
                      <td style={{textAlign:"center",background:cellBg("tpPct",s.tpPct),padding:"5px 4px"}}>{s.tpPct}%</td>
                      <td style={{textAlign:"center",background:cellBg("ftPct",s.ftPct),padding:"5px 4px"}}>{s.ftPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <SeasonHighs highs={seasonHighs} myTeamName={myTeamName} title="📈 SEASON HIGHS (SINGLE GAME)"/>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            {playoff&&<button onClick={()=>buildPlayoffBracket(season,finalAi)} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 18px rgba(245,158,11,0.3)"}}>
              {playIn?"🎟 START PLAY-IN":"🏆 START PLAYOFFS"}
            </button>}
            <button onClick={newSeason} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:800,cursor:"pointer"}}>🔄 NEW SEASON</button>
          </div>
        </div>
      </div>
    );
  }

  if(phase==="game"&&inSeason){
    const oppIndex = schedule && gameNum <= SEASON_LENGTH ? schedule[29][gameNum - 1] : null;
    const opp = oppIndex != null ? aiTeams[oppIndex] : null;
    const won = result ? result.myScore > result.oppScore : false;
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        {volumeSlider}{skipBtn}
        <div style={{maxWidth:1040,margin:"0 auto"}}>
          <div style={{background:"#0f172a",borderRadius:10,padding:"10px 14px",marginBottom:10,border:"1px solid #1e293b",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{fontSize:11,fontWeight:800,color:"#64748b"}}>GAME {gameNum} / {SEASON_LENGTH}</div>
            <div style={{flex:1,background:"#1e293b",borderRadius:4,height:5,minWidth:80}}>
              <div style={{height:"100%",width:`${((result?gameNum:gameNum-1)/SEASON_LENGTH)*100}%`,background:"linear-gradient(90deg,#3b82f6,#8b5cf6)",borderRadius:4,transition:"width 0.3s"}}/>
            </div>
            <div style={{fontSize:11,fontWeight:800,color:season.w>=season.l?"#22c55e":"#f87171"}}>{season.w}W–{season.l}L</div>
{(()=>{
  const log=season.gameLog||[];
  if(log.length===0)return null;
  let streak=1;
  const last=log[log.length-1].won;
  for(let i=log.length-2;i>=0;i--){if(log[i].won===last)streak++;else break;}
  const emoji=last?"🔥":"❄️";
  return <div style={{fontSize:10,fontWeight:800,color:last?"#f59e0b":"#60a5fa"}}>{emoji}{streak}</div>;
})()}
            <button onClick={()=>setShowStandings(s=>!s)} style={{background:"#1e293b",color:"#60a5fa",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{showStandings?"Hide":"Show"} Standings</button>
            <button onClick={()=>setShowLeaders(s=>!s)} style={{background:"#1e293b",color:"#f97316",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{showLeaders?"Hide":"Show"} Leaders</button>
            <button onClick={()=>setShowHelp(h=>!h)} style={{width:26,height:26,borderRadius:"50%",background:"#1e293b",border:"1px solid #334155",color:"#60a5fa",fontSize:12,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>?</button>
          </div>
          {showHelp&&<div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #334155",fontSize:10,color:"#64748b",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
            <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
            <div style={{marginBottom:2}}>• 30-team league (2 conferences, 6 divisions) — 82-game season</div>
            <div style={{marginBottom:2}}>• ⚡ Chemistry: real teammates same season+team</div>
            <div style={{marginBottom:2}}>• 🧩 Archetypes: balance your roster for bonuses</div>
            <div style={{marginBottom:2}}>• Top 6 direct · 7-10 play-in tournament</div>
            <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginTop:6,marginBottom:2}}>OOP PENALTIES</div>
            <div>Adjacent ×0.82 · Wrong ×0.65</div>
          </div>}
          {showStandings&&(
            <div style={{marginBottom:10}}>
              <StandingsTable
                aiTeams={aiTeams}
                myRecord={myRecord}
                myName={myTeamName}
                highlight
              />
            </div>
          )}
          {showLeaders&&(
            <div style={{marginBottom:10}}>
              <LeagueLeaders leaders={leagueLeaders} myTeamName={myTeamName}/>
            </div>
          )}
          <SeasonHighs highs={seasonHighs} myTeamName={myTeamName} title="📈 SEASON HIGHS (SINGLE GAME)"/>
          {!result?(
            <div style={{background:"#0f172a",borderRadius:16,padding:24,border:"1px solid #1e293b",textAlign:"center",marginBottom:10}}>
              <div style={{fontSize:13,color:"#64748b",marginBottom:14,fontWeight:700,letterSpacing:1}}>GAME {gameNum} vs {opp?.name}</div>
              <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:32,marginBottom:18}}>
                <div style={{textAlign:"center"}}><div style={{fontSize:12,color:"#60a5fa",fontWeight:800,marginBottom:4}}>{myTeamName}</div><div style={{fontSize:30,fontWeight:900,color:"#60a5fa"}}>{rf(teamEff(myLineup,teamRoster),0)}</div><div style={{fontSize:10,color:"#475569"}}>RTG</div></div>
                <div style={{fontSize:22,color:"#334155"}}>VS</div>
                <div style={{textAlign:"center"}}><div style={{fontSize:12,color:"#f87171",fontWeight:800,marginBottom:4}}>{opp?.name}</div><div style={{fontSize:30,fontWeight:900,color:"#f87171"}}>{opp?rf(opp.eff,0):"-"}</div><div style={{fontSize:10,color:"#475569"}}>RTG</div></div>
              </div>
              {opp&&(
  <div style={{marginBottom:14}}>
    <div style={{fontSize:10,color:"#475569",letterSpacing:1,fontWeight:700,marginBottom:6}}>OPPONENT LINEUP</div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
      {opp.lineup.map(({player,slot})=>(
        <div key={slot} style={{background:"#0a1221",borderRadius:8,padding:"6px 10px",border:"1px solid #1e293b",textAlign:"center",minWidth:80}}>
          <div style={{fontSize:9,color:"#475569",fontWeight:700,marginBottom:2}}>{slot}</div>
          <div style={{fontSize:10,fontWeight:800,color:"#f87171",whiteSpace:"nowrap"}}>{player.name}</div>
          <div style={{fontSize:9,color:getArchetype(player).color,marginTop:2}}>{getArchetype(player).label}</div>
          <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:4}}>
            {(() => {
              const line = getPlayerSeasonLine(player.name, opp.name);
              return [
                ["PTS", line.pts],
                ["REB", line.reb],
                ["AST", line.ast],
              ].map(([l,v])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontSize:8,color:"#475569"}}>{l}</div>
                  <div style={{fontSize:10,fontWeight:700,color:"#e2e8f0"}}>{rf(v,1)}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
              <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>
                <button
                  onClick={playGame}
                  style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"11px 32px",fontSize:14,fontWeight:800,cursor:"pointer"}}
                >
                  ▶ PLAY GAME {gameNum}
                </button>
                {gameNum < SEASON_LENGTH && (
                  <>
                    <button
                      onClick={()=>simGames(10)}
                      style={{background:"#4b5563",color:"white",border:"none",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:800,cursor:"pointer"}}
                    >
                      ⏩ SIM 10 GAMES
                    </button>
                    <button
                      onClick={()=>simGames(41)}
                      style={{background:"#475569",color:"white",border:"none",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:800,cursor:"pointer"}}
                    >
                      ⏩ SIM 41 GAMES
                    </button>
                    <button
                      onClick={()=>simGames(SEASON_LENGTH - gameNum + 1)}
                      style={{background:"#334155",color:"#94a3b8",border:"none",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:800,cursor:"pointer"}}
                    >
                      ⏭ SIM REST
                    </button>
                  </>
                )}
              </div>
            </div>
          ):(
            <>
              <div style={{textAlign:"center",padding:"12px",background:"#0f172a",borderRadius:14,border:`2px solid ${won?"#22c55e":"#ef4444"}`,marginBottom:10}}>
                <div style={{fontSize:24}}>{won?"🏆":"💀"}</div>
                <div style={{fontSize:20,fontWeight:900,color:won?"#22c55e":"#ef4444",letterSpacing:2}}>{won?"VICTORY":"DEFEAT"}{result.ot>0?` (${result.ot}OT)`:""}</div>
                <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:6}}>
                  {[[myTeamName,result.myScore,"#60a5fa",result.myEff],[opp?.name||"Opponent",result.oppScore,"#f87171",result.oppEff]].map(([l,sc,col,eff],i)=>(
                    <div key={i} style={{textAlign:"center"}}><div style={{fontSize:10,color:col,fontWeight:700}}>{l}</div><div style={{fontSize:38,fontWeight:900,color:col,lineHeight:1}}>{sc}</div><div style={{fontSize:9,color:"#475569"}}>RTG {eff}</div></div>
                  ))}
                </div>
                {(() => {
                  const topMy = [...result.myStats].sort((a,b)=>b.pts-a.pts)[0];
                  const topOpp = [...result.oppStats].sort((a,b)=>b.pts-a.pts)[0];
                  if (!topMy && !topOpp) return null;
                  return (
                    <div style={{marginTop:6,fontSize:10,color:"#f59e0b",fontWeight:700}}>
                      🏅 Top Performers —{" "}
                      {topMy && (
                        <span>
                          {topMy.name} ({myTeamName}) {topMy.pts} pts
                        </span>
                      )}
                      {topMy && topOpp && <span style={{color:"#64748b"}}>  ·  </span>}
                      {topOpp && (
                        <span>
                          {topOpp.name} ({opp?.name||"Opponent"}) {topOpp.pts} pts
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
              <BoxScore stats={result.myStats} acc="#60a5fa" label={myTeamName}/>
              <BoxScore stats={result.oppStats} acc="#f87171" label={opp?.name||"Opponent"}/>
              <div style={{display:"flex",gap:8,justifyContent:"center",paddingBottom:16}}>
                {gameNum<SEASON_LENGTH
                  ?<button onClick={nextGame} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"11px 28px",fontSize:13,fontWeight:800,cursor:"pointer"}}>▶ NEXT GAME ({gameNum+1}/{SEASON_LENGTH})</button>
                  :<button onClick={()=>setPhase("seasonEnd")} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:10,padding:"11px 28px",fontSize:13,fontWeight:800,cursor:"pointer"}}>🏆 VIEW SEASON RESULTS</button>
                }
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const allArchetypes=[...new Set(playerPool.map(p=>getArchetype(p).label))].sort();
  const allYears=[...new Set(playerPool.map(p=>String(p.season)))].sort((a,b)=>b-a);
  const allTeams=[...new Set(playerPool.map(p=>p.tm))].sort();
  const display=playerPool
    .filter(p=>(posF==="ALL"||p.pos===posF)&&(search===""||p.name.toLowerCase().includes(search.toLowerCase()))&&(archF==="ALL"||getArchetype(p).label===archF)&&(yearF==="ALL"||String(p.season)===yearF)&&(teamF==="ALL"||p.tm===teamF))
    .sort((a,b)=>{
      if(sortBy==="cost"){
        return sortDir==="desc"?b.cost-a.cost:a.cost-b.cost;
      }
      // name sort
      return sortDir==="desc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });

  return(
    <div onClick={handleFirstClick} style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:isMobile ? "14px 10px" : 14}}>
      {showTutorial&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#0f172a",borderRadius:16,border:"2px solid #334155",maxWidth:400,padding:24,color:"#e2e8f0"}}>
            <div style={{fontSize:28,fontWeight:900,marginBottom:12,color:"#f59e0b"}}>How to play</div>
            <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.6,marginBottom:20}}>
              <div style={{marginBottom:8}}>1. <strong style={{color:"#e2e8f0"}}>Draft 5 players</strong> (one per position) within your <strong style={{color:"#fbbf24"}}>${BUDGET}</strong> budget and build your lineup.</div>
              <div style={{marginBottom:8}}>2. Battle through a <strong style={{color:"#e2e8f0"}}>full {SEASON_LENGTH}-game season</strong> in a 30-team league with 2 conferences and 6 divisions — every win moves you up the standings.</div>
              <div style={{marginBottom:8}}>3. Track the league with <strong style={{color:"#e2e8f0"}}>League Leaders, Season Highs, and Playoff Highs</strong> — your players are highlighted in green anywhere they show up.</div>
              <div>4. <strong style={{color:"#e2e8f0"}}>Playoffs</strong>: top 6 in each conference go straight in; seeds 7–10 fight through the play-in. Win the bracket to become champion!</div>
            </div>
            <button onClick={dismissTutorial} style={{width:"100%",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:8,padding:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>Got it</button>
          </div>
        </div>
      )}
      <Analytics />
      <SpeedInsights />
      {volumeSlider}{skipBtn}
      <div style={{maxWidth:1200,margin:"0 auto",overflow:"visible",paddingBottom:80}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:900,background:"linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              💰 NBA BUDGET BALL <span style={{fontSize:11,color:"#475569",WebkitTextFillColor:"#475569"}}>v1.0</span>
            </h1>
            <div style={{fontSize:10,color:"#475569",marginTop:1}}>{playerPool.length} players · Budget ${BUDGET} · {SEASON_LENGTH}-game season · Play-in + Playoffs</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-end",flex:1}}>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <span style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:1}}>DIFFICULTY</span>
              <div style={{display:"flex",gap:3}}>
                {[
                  ["casual","CASUAL"],
                  ["standard","STANDARD"],
                  ["hardcore","HARDCORE"],
                ].map(([val,label])=>(
                  <button
                    key={val}
                    onClick={()=>!inSeason&&setDifficulty(val)}
                    style={{
                      background:difficulty===val?"#4b5563":"#111827",
                      color:difficulty===val?"#fef3c7":"#9ca3af",
                      border:"1px solid #374151",
                      borderRadius:999,
                      padding:"3px 8px",
                      fontSize:9,
                      fontWeight:700,
                      cursor:inSeason?"not-allowed":"pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button
                onClick={handleCopyTeamCode}
                disabled={inSeason}
                style={{
                  background:"#0f172a",
                  color:"#e2e8f0",
                  border:"1px solid #1e293b",
                  borderRadius:6,
                  padding:"4px 8px",
                  fontSize:10,
                  fontWeight:700,
                  cursor:inSeason?"not-allowed":"pointer",
                }}
              >
                🔗 Copy Code
              </button>
              <button
                onClick={handleShareLineup}
                disabled={inSeason}
                style={{
                  background:"#0f172a",
                  color:"#e2e8f0",
                  border:"1px solid #1e293b",
                  borderRadius:6,
                  padding:"4px 8px",
                  fontSize:10,
                  fontWeight:700,
                  cursor:inSeason?"not-allowed":"pointer",
                }}
              >
                📤 Share
              </button>
              {shareImageStatus=== "message_copied"&&<span style={{fontSize:10,color:"#94a3b8",alignSelf:"center",display:"flex",alignItems:"center",gap:6}}>Message copied! <button type="button" onClick={handleCopyLineupImage} style={{background:"#1e293b",color:"#a78bfa",border:"1px solid #334155",borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700,cursor:"pointer"}}>Copy image</button></span>}
              {shareImageStatus&&shareImageStatus!=="message_copied"&&<span style={{fontSize:10,color:"#94a3b8",alignSelf:"center"}}>{shareImageStatus}</span>}
              <button
                onClick={handleLoadTeamCode}
                disabled={inSeason}
                style={{
                  background:"#0f172a",
                  color:"#60a5fa",
                  border:"1px solid #1e293b",
                  borderRadius:6,
                  padding:"4px 8px",
                  fontSize:10,
                  fontWeight:700,
                  cursor:inSeason?"not-allowed":"pointer",
                }}
              >
                📥 Load Code
              </button>
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {[["BUDGET",`$${rem}`,rem<15?"#ef4444":rem<30?"#f59e0b":"#22c55e"],["SPENT",`$${spent}`,"#94a3b8"],["CHEM",myCh>0?`+${myCh}`:"-","#f472b6"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center",background:"#0f172a",borderRadius:7,padding:"4px 10px",border:"1px solid #1e293b"}}>
                <div style={{fontSize:9,color:"#475569",letterSpacing:1}}>{l}</div>
                <div style={{fontSize:15,fontWeight:900,color:c}}>{v}</div>
              </div>
            ))}
            <div style={{background:"#0f172a",borderRadius:7,padding:"4px 10px",border:"1px solid #1e293b",minWidth:0}}>
              <div style={{fontSize:9,color:"#475569",letterSpacing:1,marginBottom:1}}>TEAM CODE</div>
              <div style={{fontSize:11,fontWeight:800,color:"#a78bfa",fontFamily:"monospace",wordBreak:"break-all"}}>{filled===5?POSITIONS.map(pos=>roster[pos]?.id??"").join("-"):"—"}</div>
            </div>
          </div>
        </div>
        <div style={{background:"#1e293b",borderRadius:4,height:5,marginBottom:12,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${Math.min((spent/BUDGET)*100,100)}%`,background:"linear-gradient(90deg,#3b82f6,#8b5cf6,#ec4899)",transition:"width 0.3s",borderRadius:4}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"270px minmax(0,1fr)",gap:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #1e293b"}}>
              <div style={{fontWeight:800,fontSize:10,letterSpacing:2,color:"#60a5fa",marginBottom:8}}>YOUR STARTING 5</div>

              {POSITIONS.map(pos=>{
                const p=roster[pos],m=p?posMult(p,pos):1,tier=p?getTier(p.cost):null,isActive=slotSel===pos;
                return(
                  <div key={pos} onClick={()=>!inSeason&&setSlotSel(slotSel===pos?null:pos)} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,background:isActive?"#1a2a0a":p?"#0d2137":"#080f1e",borderRadius:8,padding:"7px 8px",border:`1px solid ${isActive?"#84cc16":p?"#1d4ed8":"#1e293b"}`,cursor:inSeason?"default":"pointer"}}>
                    <div style={{width:24,height:24,borderRadius:5,background:isActive?"#365314":p?"#1e3a5f":"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:isActive?"#84cc16":"#60a5fa",flexShrink:0}}>{pos}</div>
                    {p?(
                      <>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                          <div style={{display:"flex",gap:3,marginTop:1,flexWrap:"wrap"}}>
                            <Tag label={tier.label} color={tier.color} bg={tier.bg}/>
                            {m<1&&<Tag label={`OOP ×${m}`} color="#fbbf24" bg="#78350f"/>}
                            {myCh>0&&<Tag label="⚡CHEM" color="#f472b6" bg="#4a044e"/>}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:13,color:"#fbbf24",fontWeight:900}}>${p.cost}</div></div>
                        {!inSeason&&<button onClick={e=>{e.stopPropagation();drop(pos);}} style={{background:"#7f1d1d",border:"none",borderRadius:4,color:"#fca5a5",fontSize:11,width:18,height:18,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>}
                      </>
                    ):(
                      <div style={{fontSize:10,color:isActive?"#84cc16":"#334155",fontStyle:"italic"}}>{isActive?`Picking for ${pos} →`:`Click to set ${pos} →`}</div>
                    )}
                  </div>
                );
              })}
              {myCh>0&&<div style={{fontSize:11,color:"#f472b6",textAlign:"center",margin:"4px 0",fontWeight:700}}>⚡ Chemistry Boost +{myCh}</div>}
              {(()=>{
                const bal=getTeamBalance(myLineup);if(!bal)return null;
                return(
                  <div style={{marginTop:6,background:"#080f1e",borderRadius:8,padding:"6px 8px",border:"1px solid #1e293b"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:1}}>TEAM BALANCE</div>
                      <div style={{fontSize:16,fontWeight:900,color:bal.color}}>{bal.grade}</div>
                    </div>
                    {bal.archetypeBonus!==0&&<div style={{fontSize:10,color:"#a78bfa",fontWeight:700,marginBottom:3}}>🧩 Archetype Bonus {bal.archetypeBonus>0?`+${bal.archetypeBonus}`:bal.archetypeBonus}</div>}
                    {bal.missing.length>0&&<div style={{fontSize:9,color:"#f87171"}}>Missing: {bal.missing.join(", ")}</div>}
                  </div>
                );
              })()}
              <button onClick={startSeason} disabled={!full||inSeason} style={{width:"100%",marginTop:4,background:full&&!inSeason?"linear-gradient(135deg,#f59e0b,#d97706)":"#1e293b",color:full&&!inSeason?"white":"#374151",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:800,cursor:full&&!inSeason?"pointer":"not-allowed",transition:"all 0.2s"}}>
                {full?"🏀 START SEASON":`${5-filled} SLOT${5-filled!==1?"S":""} REMAINING`}
              </button>
            </div>

            <div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}>
              <button
                onClick={()=>setShowHelp(o=>!o)}
                style={{
                  width:28,
                  height:28,
                  borderRadius:"50%",
                  background:"#1e293b",
                  border:"1px solid #334155",
                  color:"#60a5fa",
                  fontSize:14,
                  fontWeight:900,
                  cursor:"pointer",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center",
                }}
              >
                ?
              </button>
            </div>
            {showHelp&&<div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #334155",fontSize:10,color:"#64748b",marginTop:6}}>
              <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
              <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
              <div style={{marginBottom:2}}>• 30-team league (2 conferences, 6 divisions) — 82-game season</div>
              <div style={{marginBottom:2}}>• ⚡ Chemistry: real teammates same season+team</div>
              <div style={{marginBottom:2}}>• 🧩 Archetypes: balance your roster for bonuses</div>
              <div style={{marginBottom:2}}>• Top 6 direct · 7-10 play-in tournament</div>
              <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginTop:6,marginBottom:2}}>OOP PENALTIES</div>
              <div>Adjacent ×0.82 · Wrong ×0.65</div>
            </div>}

          </div>
          <div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {["ALL",...POSITIONS].map(f=>(
                    <button key={f} onClick={()=>setPosF(f)} style={{background:posF===f?"#3b82f6":"#1e293b",color:posF===f?"white":"#94a3b8",border:"none",borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{f}</button>
                  ))}
                </div>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 10px",fontSize:11,color:"#e2e8f0",outline:"none",width:140}}/>
                <div style={{marginLeft:"auto",display:"flex",gap:3}}>
                  {[["cost","$"],["name","A–Z"]].map(([k,label])=>(
                    <button
                      key={k}
                      onClick={()=>{
                        if(sortBy===k){
                          setSortDir(d=>d==="desc"?"asc":"desc");
                        }else{
                          setSortBy(k);
                          setSortDir("desc");
                        }
                      }}
                      style={{
                        background:sortBy===k?"#4c1d95":"#1e293b",
                        color:sortBy===k?"#c4b5fd":"#64748b",
                        border:"none",
                        borderRadius:5,
                        padding:"4px 8px",
                        fontSize:10,
                        fontWeight:700,
                        cursor:"pointer",
                      }}
                    >
                      {label}{sortBy===k ? (sortDir==="desc" ? " ↓" : " ↑") : ""}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap",paddingBottom:4}}>
                {["ALL",...allArchetypes].map(f=>{
                  const arch=f==="ALL"?null:playerPool.find(p=>getArchetype(p).label===f);
                  const col=arch?getArchetype(arch).color:"#94a3b8";
                  return(<button key={f} onClick={()=>setArchF(f)} style={{background:archF===f?"#1e293b":"#0f172a",color:archF===f?col:"#475569",border:`1px solid ${archF===f?col:"#1e293b"}`,borderRadius:6,padding:"3px 8px",fontSize:9,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{f}</button>);
                })}
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <select value={yearF} onChange={e=>setYearF(e.target.value)} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 8px",fontSize:11,color:"#e2e8f0",outline:"none"}}>
                  <option value="ALL">All Years</option>
                  {allYears.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
                <select value={teamF} onChange={e=>setTeamF(e.target.value)} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 8px",fontSize:11,color:"#e2e8f0",outline:"none"}}>
                  <option value="ALL">All Teams</option>
                  {allTeams.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                {(archF!=="ALL"||yearF!=="ALL"||teamF!=="ALL")&&(
                  <button onClick={()=>{setArchF("ALL");setYearF("ALL");setTeamF("ALL");setSearch("");}} style={{background:"#7f1d1d",color:"#fca5a5",border:"none",borderRadius:6,padding:"5px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>✕ Clear</button>
                )}
                <div style={{fontSize:10,color:"#475569",marginLeft:"auto"}}>{display.length} players</div>
              </div>
            </div>
{topPicks.length > 0 && (
  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
    <span style={{fontSize:9,color:"#f59e0b",fontWeight:800,letterSpacing:1}}>🔥 MOST DRAFTED</span>
    {topPicks.map((p,i) => (
      <span key={p.name} onClick={()=>setSearch(p.name)} style={{fontSize:9,background:"#1e293b",border:"1px solid #f59e0b44",borderRadius:6,padding:"3px 8px",color:"#e2e8f0",whiteSpace:"nowrap",cursor:"pointer"}}>
        <span style={{color:"#475569",marginRight:3}}>#{i+1}</span>{p.name} <span style={{color:"#f59e0b",fontWeight:700}}>{p.picks}</span>
      </span>
    ))}
  </div>
)}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(auto-fill,minmax(180px,1fr))",gap:6,minWidth:0}}>
              {display.map(p=>{
                const inR=myIds.has(p.id),targetSlot=slotSel||p.pos,prev=roster[targetSlot];
                const delta=p.cost-(prev?.cost||0),afford=delta<=rem,tier=getTier(p.cost);
                const wouldOop=slotSel&&slotSel!==p.pos,mult=slotSel?posMult(p,slotSel):1;
                return(
                  <div key={p.id} className={`player-card${inR?" in-roster":""}`} onClick={()=>!inSeason&&(inR?drop(Object.keys(roster).find(pos=>roster[pos]?.id===p.id)):afford&&pickPlayer(p))} style={{background:inR?"#0d2a0d":slotSel&&afford?"#131a2e":"#0f172a",border:`1px solid ${inR?"#22c55e":slotSel&&afford?"#6366f1":"#1e293b"}`,borderRadius:9,padding:9,cursor:inR||!afford||inSeason?"not-allowed":"pointer",opacity:(!afford&&!inR)||inSeason?0.45:1,transition:"all 0.12s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                        <div style={{display:"flex",gap:2,marginTop:2,flexWrap:"wrap"}}>
                          <Tag label={p.pos} color="#93c5fd" bg="#1e3a5f"/>
                          <Tag label={tier.label} color={tier.color} bg={tier.bg}/>
                          {wouldOop&&afford&&<Tag label={`×${mult}`} color="#fbbf24" bg="#78350f"/>}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:5}}><div style={{fontSize:14,color:"#fbbf24",fontWeight:900}}>${p.cost}</div></div>
                    </div>
                    <div style={{marginTop:6,textAlign:"center"}}>
                      <span style={{fontSize:10,fontWeight:800,background:"#1e293b",color:getArchetype(p).color,borderRadius:5,padding:"2px 8px",letterSpacing:1}}>{getArchetype(p).label}</span>
                    </div>
                    {p.tm&&p.season&&<div style={{marginTop:3,fontSize:8,color:"#334155",textAlign:"center"}}>{p.tm} · {p.season}</div>}
<div style={{display:"flex",justifyContent:"center",gap:8,marginTop:4}}>
  {[["PTS",p.pts],["REB",p.reb],["AST",p.ast]].map(([l,v])=>(
    <div key={l} style={{textAlign:"center"}}>
      <div style={{fontSize:9,color:"#475569"}}>{l}</div>
      <div style={{fontSize:11,fontWeight:800,color:"#e2e8f0"}}>{rf(v,1)}</div>
    </div>
  ))}
</div>
                    {inR&&<div style={{marginTop:4,fontSize:9,color:"#22c55e",fontWeight:700,textAlign:"center"}}>✓ IN LINEUP</div>}
                    {!afford&&!inR&&<div style={{marginTop:4,fontSize:9,color:"#ef4444",textAlign:"center"}}>+${delta-rem} over</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}