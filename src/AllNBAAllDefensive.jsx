import { useMemo } from "react";
import { playerVoteKey } from "./utils/awardConstants";

const fmt1 = (v) => (v ?? 0).toFixed(1);
const fmt0 = (v) => Math.round(v ?? 0);

// Position groups: Guards = PG, SG. Forwards = SF, PF. Center = C. Frontcourt = SF, PF, C.
const isGuard = (pos) => pos === "PG" || pos === "SG";
const isForward = (pos) => pos === "SF" || pos === "PF";
const isCenter = (pos) => pos === "C";
const isFrontcourt = (pos) => pos === "SF" || pos === "PF" || pos === "C";

/** Position key for a player (guard / forward / center). */
function getPosKey(p) {
  const pos = (p.pos || "").toUpperCase();
  if (isCenter(pos)) return "center";
  if (isForward(pos)) return "forward";
  if (isGuard(pos) || pos === "G") return "guard";
  return "forward";
}

/**
 * All-NBA formula: record + counting stats + defense, position-based (1 C, 2 F, 2 G per team).
 * Score = teamWinPct*2 + (ppg/max)*4 + (rpg/max)*1.2 + (apg/max)*1.6 + fg%*0.5 + 3p%*0.3 - tov*0.5 + (spg/max)*0.9 + (bpg/max)*0.6.
 * Teams are filled in MVP race order (votes then score), so POG and wins matter for All-NBA too.
 */
export function buildAllNBATeams(players, teamWinPct, mvpVotes = null) {
  const byPos = { guard: [], forward: [], center: [] };
  players.forEach((p) => {
    const pos = (p.pos || "").toUpperCase();
    if (isCenter(pos)) byPos.center.push(p);
    else if (isForward(pos)) byPos.forward.push(p);
    else if (isGuard(pos)) byPos.guard.push(p);
    else if (pos === "G") byPos.guard.push(p);
    else byPos.forward.push(p); // F or unknown
  });

  const maxPpg = Math.max(1, ...players.map((r) => r.ppg || 0));
  const maxRpg = Math.max(1, ...players.map((r) => r.rpg || 0));
  const maxApg = Math.max(1, ...players.map((r) => r.apg || 0));
  const maxFg = Math.max(1, ...players.map((r) => r.fgPct || 0));
  const max3p = Math.max(1, ...players.map((r) => r.tpPct || 0));
  const maxTpg = Math.max(1, ...players.map((r) => r.tpg || 0));
  const maxSpg = Math.max(0.01, ...players.map((r) => r.spg ?? (r.stl != null ? r.stl / (r.gp || 1) : 0)));
  const maxBpg = Math.max(0.01, ...players.map((r) => r.bpg ?? (r.blk != null ? r.blk / (r.gp || 1) : 0)));

  const score = (r) => {
    const teamPct = teamWinPct[r.team] ?? 0.4;
    const ppgN = (r.ppg || 0) / maxPpg;
    const rpgN = (r.rpg || 0) / maxRpg;
    const apgN = (r.apg || 0) / maxApg;
    const fgN = ((r.fgPct || 0) / maxFg) * 0.5;
    const tpN = ((r.tpPct || 0) / max3p) * 0.3;
    const tovPen = (r.tpg || 0) / maxTpg * 0.5;
    const spgN = ((r.spg ?? (r.stl != null ? r.stl / (r.gp || 1) : 0)) || 0) / maxSpg;
    const bpgN = ((r.bpg ?? (r.blk != null ? r.blk / (r.gp || 1) : 0)) || 0) / maxBpg;
    return teamPct * 2 + ppgN * 4 + rpgN * 1.2 + apgN * 1.6 + fgN + tpN - tovPen + spgN * 0.9 + bpgN * 0.6;
  };

  ["guard", "forward", "center"].forEach((key) => {
    byPos[key].forEach((r) => { r.allNbaScore = score(r); });
  });

  // All-NBA order: by MVP race (votes then score), so POG and wins matter
  const getVote = (r) => (mvpVotes && Number(mvpVotes[playerVoteKey(r.name, r.team)])) || 0;
  const allNbaOrder = [...byPos.guard, ...byPos.forward, ...byPos.center].sort((a, b) => {
    const va = getVote(a), vb = getVote(b);
    if (vb !== va) return vb - va;
    return (b.allNbaScore || 0) - (a.allNbaScore || 0);
  });

  // Fill 1st, then 2nd, then 3rd team by MVP race order; each team gets 2 G, 2 F, 1 C
  const slots = { guard: 2, forward: 2, center: 1 };
  const teams = [
    { guard: [], forward: [], center: [] },
    { guard: [], forward: [], center: [] },
    { guard: [], forward: [], center: [] },
  ];
  for (const p of allNbaOrder) {
    const posKey = getPosKey(p);
    for (const team of teams) {
      if (team[posKey].length < slots[posKey]) {
        team[posKey].push(p);
        break;
      }
    }
  }

  const toFive = (t) => [
    ...t.guard,
    ...t.forward,
    ...t.center,
  ];
  return {
    first: toFive(teams[0]),
    second: toFive(teams[1]),
    third: toFive(teams[2]),
  };
}

/** All-Defensive position: guard (2 per team) or frontcourt (3 per team; F or C). */
function getDefensivePosKey(p) {
  const pos = (p.pos || "").toUpperCase();
  return isGuard(pos) || pos === "G" ? "guard" : "frontcourt";
}

/**
 * All-Defensive: same as All-NBA — teams filled in DPOY race order (2 G, 3 F/C per team).
 * Sort all players by DPOY vote total (then defensive score), then assign each to the first team with an open slot for their position (guard vs frontcourt).
 */
export function buildAllDefensiveTeams(players, teamWinPct, dpoyVotes = null) {
  const maxSpg = Math.max(0.01, ...players.map((r) => r.spg || 0));
  const maxBpg = Math.max(0.01, ...players.map((r) => r.bpg || 0));
  const maxRpg = Math.max(1, ...players.map((r) => r.rpg || 0));
  const score = (r) => {
    const teamPct = teamWinPct[r.team] ?? 0.4;
    const spgN = (r.spg || 0) / maxSpg;
    const bpgN = (r.bpg || 0) / maxBpg;
    const rpgN = (r.rpg || 0) / maxRpg;
    return teamPct * 1.0 + spgN * 3 + bpgN * 2 + rpgN * 0.5;
  };
  players.forEach((r) => { r.allDefScore = score(r); });

  const getVotes = (r) => (dpoyVotes && Number(dpoyVotes[playerVoteKey(r.name, r.team)])) || 0;
  const dpoyOrder = [...players].sort((a, b) => {
    const va = getVotes(a), vb = getVotes(b);
    if (vb !== va) return vb - va;
    return (b.allDefScore || 0) - (a.allDefScore || 0);
  });

  const slots = { guard: 2, frontcourt: 3 };
  const teams = [
    { guard: [], frontcourt: [] },
    { guard: [], frontcourt: [] },
  ];
  for (const p of dpoyOrder) {
    const posKey = getDefensivePosKey(p);
    for (const team of teams) {
      if (team[posKey].length < slots[posKey]) {
        team[posKey].push(p);
        break;
      }
    }
  }

  const toFive = (t) => [...t.guard, ...t.frontcourt];
  return {
    first: toFive(teams[0]),
    second: toFive(teams[1]),
  };
}

function PlayerRow({ p, isMine }) {
  const bg = isMine ? "#022c22" : "transparent";
  const color = isMine ? "#a7f3d0" : "#e5e7eb";
  return (
    <tr style={{ borderBottom: "1px solid #0b1220", background: bg }}>
      <td style={{ padding: "4px 8px", fontWeight: 700, color, whiteSpace: "nowrap" }}>{p.name}</td>
      <td style={{ padding: "4px 8px", textAlign: "center", color: "#9ca3af", fontSize: 10 }}>{p.pos || "—"}</td>
      <td style={{ padding: "4px 8px", color: isMine ? "#6ee7b7" : "#9ca3af", whiteSpace: "nowrap", fontSize: 10 }}>{p.team}</td>
      <td style={{ padding: "4px 8px", textAlign: "center", color: "#9ca3af" }}>{fmt0(p.gp || 0)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.ppg)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.rpg)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.apg)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.spg)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.bpg)}</td>
    </tr>
  );
}

function DefensiveRow({ p, isMine }) {
  const bg = isMine ? "#022c22" : "transparent";
  const color = isMine ? "#a7f3d0" : "#e5e7eb";
  return (
    <tr style={{ borderBottom: "1px solid #0b1220", background: bg }}>
      <td style={{ padding: "4px 8px", fontWeight: 700, color, whiteSpace: "nowrap" }}>{p.name}</td>
      <td style={{ padding: "4px 8px", textAlign: "center", color: "#9ca3af", fontSize: 10 }}>{p.pos || "—"}</td>
      <td style={{ padding: "4px 8px", color: isMine ? "#6ee7b7" : "#9ca3af", whiteSpace: "nowrap", fontSize: 10 }}>{p.team}</td>
      <td style={{ padding: "4px 8px", textAlign: "center", color: "#9ca3af" }}>{fmt0(p.gp || 0)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.ppg)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.rpg)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.apg)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.spg)}</td>
      <td style={{ padding: "4px 8px", textAlign: "center" }}>{fmt1(p.bpg)}</td>
    </tr>
  );
}

export function AllNBAAllDefensive({ leaders, teamRecords, myTeamName, dpoyVotes, mvpVotes }) {
  const { allNBA, allDefensive, teamWinPct } = useMemo(() => {
    const arr = Object.values(leaders || {});
    const teamWinPct = { ...(teamRecords || {}) };
    Object.keys(teamWinPct).forEach((name) => {
      const r = teamWinPct[name];
      if (r && typeof r.w === "number" && typeof r.l === "number") {
        const gp = r.w + r.l;
        teamWinPct[name] = gp > 0 ? r.w / gp : 0.4;
      }
    });

    const players = arr.map((p) => {
      const gp = p.gp || 1;
      return {
        ...p,
        gp,
        ppg: p.pts / gp,
        rpg: p.reb / gp,
        apg: p.ast / gp,
        spg: p.stl / gp,
        bpg: p.blk / gp,
        tpg: p.tov / gp,
        fgPct: p.fga > 0 ? (p.fgm / p.fga) * 100 : 0,
        tpPct: p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0,
      };
    });

    const allNBA = buildAllNBATeams(players, teamWinPct, mvpVotes);
    const allDefensive = buildAllDefensiveTeams(players, teamWinPct, dpoyVotes);
    return { allNBA, allDefensive, teamWinPct };
  }, [leaders, teamRecords, dpoyVotes, mvpVotes]);

  const isMine = (p) => myTeamName && p.team === myTeamName;

  const tableHeader = (
    <tr style={{ borderBottom: "1px solid #1e293b", background: "#0f172a" }}>
      <th style={{ padding: "4px 8px", textAlign: "left", color: "#475569", fontSize: 9 }}>PLAYER</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>POS</th>
      <th style={{ padding: "4px 8px", textAlign: "left", color: "#475569", fontSize: 9 }}>TEAM</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>GP</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>PTS</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>REB</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>AST</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>STL</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>BLK</th>
    </tr>
  );

  const defTableHeader = (
    <tr style={{ borderBottom: "1px solid #1e293b", background: "#0f172a" }}>
      <th style={{ padding: "4px 8px", textAlign: "left", color: "#475569", fontSize: 9 }}>PLAYER</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>POS</th>
      <th style={{ padding: "4px 8px", textAlign: "left", color: "#475569", fontSize: 9 }}>TEAM</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>GP</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>PTS</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>REB</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>AST</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>STL</th>
      <th style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9 }}>BLK</th>
    </tr>
  );

  return (
    <div style={{ background: "#0f172a", borderRadius: 10, border: "1px solid #1e293b", padding: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: 2, color: "#eab308", marginBottom: 8 }}>
        🏅 ALL-NBA & ALL-DEFENSIVE
      </div>
      <div style={{ fontSize: 9, color: "#64748b", marginBottom: 10 }}>
        All-NBA: 1 C, 2 F, 2 G per team · by MVP race (votes + score; POG & wins matter). All-Defensive: 2 G, 3 F/C · follows DPOY race. Green = your team.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>ALL-NBA FIRST TEAM</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>{tableHeader}</thead>
            <tbody>
              {allNBA.first.map((p, i) => (
                <PlayerRow key={`1st-${i}-${p.name}|${p.team}`} p={p} isMine={isMine(p)} />
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>ALL-NBA SECOND TEAM</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>{tableHeader}</thead>
            <tbody>
              {allNBA.second.map((p, i) => (
                <PlayerRow key={`2nd-${i}-${p.name}|${p.team}`} p={p} isMine={isMine(p)} />
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#78716b", marginBottom: 4 }}>ALL-NBA THIRD TEAM</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>{tableHeader}</thead>
            <tbody>
              {allNBA.third.map((p, i) => (
                <PlayerRow key={`3rd-${i}-${p.name}|${p.team}`} p={p} isMine={isMine(p)} />
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>ALL-DEFENSIVE FIRST TEAM</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>{defTableHeader}</thead>
            <tbody>
              {allDefensive.first.map((p, i) => (
                <DefensiveRow key={`d1-${i}-${p.name}|${p.team}`} p={p} isMine={isMine(p)} />
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>ALL-DEFENSIVE SECOND TEAM</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>{defTableHeader}</thead>
            <tbody>
              {allDefensive.second.map((p, i) => (
                <DefensiveRow key={`d2-${i}-${p.name}|${p.team}`} p={p} isMine={isMine(p)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
