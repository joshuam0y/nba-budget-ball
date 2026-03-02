import { useMemo } from "react";
import { playerVoteKey } from "./utils/awardConstants";

const fmt1 = (v) => (v ?? 0).toFixed(1);
const fmt0 = (v) => Math.round(v ?? 0);

// Position groups: Guards = PG, SG. Forwards = SF, PF. Center = C. Frontcourt = SF, PF, C.
const isGuard = (pos) => pos === "PG" || pos === "SG";
const isForward = (pos) => pos === "SF" || pos === "PF";
const isCenter = (pos) => pos === "C";
const isFrontcourt = (pos) => pos === "SF" || pos === "PF" || pos === "C";

/**
 * All-NBA formula: record + counting stats + defense, position-based (1 C, 2 F, 2 G per team).
 * Score = teamWinPct + (ppg/max)*3.5 + (rpg/max)*1.2 + (apg/max)*1.6 + fg% + 3p% - tov + (spg/max)*1 + (bpg/max)*0.6 (steals weighted more than blocks).
 * When mvpVotes provided, MVP is guaranteed the 1st team slot at their position; rest filled by score.
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
    return teamPct * 3 + ppgN * 3.5 + rpgN * 1.2 + apgN * 1.6 + fgN + tpN - tovPen + spgN * 1 + bpgN * 0.6;
  };

  ["guard", "forward", "center"].forEach((key) => {
    byPos[key].forEach((r) => { r.allNbaScore = score(r); });
    byPos[key].sort((a, b) => (b.allNbaScore || 0) - (a.allNbaScore || 0));
  });

  let mvpPlayer = null;
  let mvpPosKey = null; // "guard" | "forward" | "center"
  if (mvpVotes && Object.keys(mvpVotes).length > 0) {
    const mvpEntry = Object.entries(mvpVotes).reduce((best, [key, v]) =>
      (!best || (Number(v) || 0) > (Number(best[1]) || 0) ? [key, v] : best), null);
    if (mvpEntry) {
      const [name, team] = mvpEntry[0].split("|");
      for (const key of ["guard", "forward", "center"]) {
        const found = byPos[key].find((r) => r.name === name && r.team === team);
        if (found) {
          mvpPlayer = found;
          mvpPosKey = key;
          break;
        }
      }
    }
  }

  const pickFirst = (key, n) => {
    const list = byPos[key];
    if (!mvpPlayer || mvpPosKey !== key) return list.slice(0, n);
    const rest = list.filter((r) => r !== mvpPlayer);
    return [mvpPlayer, ...rest.slice(0, n - 1)];
  };

  const first = [
    ...pickFirst("guard", 2),
    ...pickFirst("forward", 2),
    ...pickFirst("center", 1),
  ];
  const firstSet = new Set(first.map((p) => playerVoteKey(p.name, p.team)));
  const restOf = (key, excludeSet, n) => {
    return byPos[key].filter((r) => !excludeSet.has(playerVoteKey(r.name, r.team))).slice(0, n);
  };
  const second = [
    ...restOf("guard", firstSet, 2),
    ...restOf("forward", firstSet, 2),
    ...restOf("center", firstSet, 1),
  ];
  const secondSet = new Set([...firstSet, ...second.map((p) => playerVoteKey(p.name, p.team))]);
  const third = [
    ...restOf("guard", secondSet, 2),
    ...restOf("forward", secondSet, 2),
    ...restOf("center", secondSet, 1),
  ];
  return { first, second, third };
}

/**
 * All-Defensive: reflects DPOY race when dpoyVotes provided (2 G, 3 F/C per team).
 * With dpoyVotes: sort by vote total per position — DPOY winner = 1st team at his position, 2nd = 2nd team, etc.
 * Without dpoyVotes: fallback to defensive stat score (2 G, 3 F/C).
 */
export function buildAllDefensiveTeams(players, teamWinPct, dpoyVotes = null) {
  const guards = [];
  const forwards = [];
  const centers = [];
  players.forEach((p) => {
    const pos = (p.pos || "").toUpperCase();
    if (isGuard(pos) || pos === "G") guards.push(p);
    else if (isCenter(pos)) centers.push(p);
    else if (isForward(pos) || pos === "F") forwards.push(p);
    else forwards.push(p);
  });

  const getVotes = (r) => (dpoyVotes && Number(dpoyVotes[playerVoteKey(r.name, r.team)])) || 0;
  const useVotes = dpoyVotes && Object.keys(dpoyVotes).length > 0;

  if (useVotes) {
    guards.sort((a, b) => getVotes(b) - getVotes(a));
    const frontcourt = [...forwards, ...centers];
    frontcourt.sort((a, b) => getVotes(b) - getVotes(a));
    const first = [...guards.slice(0, 2), ...frontcourt.slice(0, 3)];
    const second = [...guards.slice(2, 4), ...frontcourt.slice(3, 6)];
    return { first, second };
  }

  const frontcourt = [...forwards, ...centers];
  const maxSpg = Math.max(0.01, ...players.map((r) => r.spg || 0));
  const maxBpg = Math.max(0.01, ...players.map((r) => r.bpg || 0));
  const maxRpg = Math.max(1, ...players.map((r) => r.rpg || 0));
  const score = (r) => {
    const teamPct = teamWinPct[r.team] ?? 0.4;
    const spgN = (r.spg || 0) / maxSpg;
    const bpgN = (r.bpg || 0) / maxBpg;
    const rpgN = (r.rpg || 0) / maxRpg;
    return teamPct * 1 + spgN * 3 + bpgN * 2 + rpgN * 0.5;
  };
  guards.forEach((r) => { r.allDefScore = score(r); });
  guards.sort((a, b) => (b.allDefScore || 0) - (a.allDefScore || 0));
  frontcourt.forEach((r) => { r.allDefScore = score(r); });
  frontcourt.sort((a, b) => (b.allDefScore || 0) - (a.allDefScore || 0));
  const first = [...guards.slice(0, 2), ...frontcourt.slice(0, 3)];
  const second = [...guards.slice(2, 4), ...frontcourt.slice(3, 6)];
  return { first, second };
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
        All-NBA: 1 C, 2 F, 2 G per team · PPG/RPG/APG/efficiency + small record bump. All-Defensive: 2 G, 3 F/C · follows DPOY race. Green = your team.
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
