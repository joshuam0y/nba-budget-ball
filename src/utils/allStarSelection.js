/**
 * All-Star selection: East vs West, position-based (2G, 2F, 1C starters + 2G, 2F, 1C + 2 wildcards reserves).
 * Order is by accumulated VOTES (per-game: pts + 0.5·reb + 0.5·ast, +5 POG, +2 win). When votesMap is provided we use it; otherwise fallback to legacy score.
 */

/**
 * Per-game "votes" for All-Star (accumulated wherever this is called).
 * Formula: base = pts + 0.5*reb + 0.5*ast, +5 if POG, +2 if team won.
 * Keys are "name|team" — must match leagueLeaders so votes line up with leader rows.
 */
export function computeAllStarVotesForGame(res, myTeamLabel, oppLabel, pog, userWon) {
  const out = {};
  if (!res) return out;
  const add = (stats, teamLabel, won) => {
    (stats || []).forEach((s) => {
      if (!s || s.name == null) return;
      const key = `${s.name}|${teamLabel}`;
      const base = (Number(s.pts) || 0) + (Number(s.reb) || 0) * 0.5 + (Number(s.ast) || 0) * 0.5;
      let v = base;
      if (pog && pog.name === s.name && pog.team === teamLabel) v += 5;
      if (won) v += 2;
      if (!Number.isFinite(v)) return;
      out[key] = (out[key] || 0) + v;
    });
  };
  add(res.myStats, myTeamLabel, userWon);
  add(res.oppStats, oppLabel, !userWon);
  return out;
}

/**
 * Per-game "votes" for MVP (accumulated all season). Keys "name|team".
 * Standings-driven: wins matter a lot. Formula: small stat component + 35 per team win; +6 POG.
 */
export function computeMvpVotesForGame(res, myTeamLabel, oppLabel, pog, userWon) {
  const out = {};
  if (!res) return out;
  const add = (stats, teamLabel, won) => {
    (stats || []).forEach((s) => {
      if (!s || s.name == null) return;
      const key = `${s.name}|${teamLabel}`;
      const base = (Number(s.pts) || 0) * 0.5 + (Number(s.reb) || 0) * 0.2 + (Number(s.ast) || 0) * 0.2;
      let v = base;
      if (pog && pog.name === s.name && pog.team === teamLabel) v += 6;
      if (won) v += 35;
      if (!Number.isFinite(v)) return;
      out[key] = (out[key] || 0) + v;
    });
  };
  add(res.myStats, myTeamLabel, userWon);
  add(res.oppStats, oppLabel, !userWon);
  return out;
}

/**
 * Per-game "votes" for DPOY (accumulated all season). Keys "name|team".
 * Emphasizes steals + blocks (true defensive plays); rebounds and POG (offense-heavy) matter less.
 * Formula: stl×2.5 + blk×2.5 + 0.15×reb, +1 POG, +6 per win.
 */
export function computeDpoyVotesForGame(res, myTeamLabel, oppLabel, pog, userWon) {
  const out = {};
  if (!res) return out;
  const add = (stats, teamLabel, won) => {
    (stats || []).forEach((s) => {
      if (!s || s.name == null) return;
      const key = `${s.name}|${teamLabel}`;
      const base = (Number(s.stl) || 0) * 2.5 + (Number(s.blk) || 0) * 2.5 + (Number(s.reb) || 0) * 0.15;
      let v = base;
      if (pog && pog.name === s.name && pog.team === teamLabel) v += 1;
      if (won) v += 6;
      if (!Number.isFinite(v)) return;
      out[key] = (out[key] || 0) + v;
    });
  };
  add(res.myStats, myTeamLabel, userWon);
  add(res.oppStats, oppLabel, !userWon);
  return out;
}

const isGuard = (pos) => pos === "PG" || pos === "SG";
const isForward = (pos) => pos === "SF" || pos === "PF";
const isCenter = (pos) => pos === "C";

function allStarScore(row, teamWinPct, pogCount, maxPpg, maxRpg, maxApg, maxFg, max3p, maxTpg) {
  const gp = row.gp || 1;
  const ppg = (row.pts || 0) / gp;
  const rpg = (row.reb || 0) / gp;
  const apg = (row.ast || 0) / gp;
  const fgPct = row.fga > 0 ? (row.fgm / row.fga) * 100 : 0;
  const tpPct = row.tpa > 0 ? (row.tpm / row.tpa) * 100 : 0;
  const tpg = (row.tov || 0) / gp;
  const teamPct = teamWinPct[row.team] ?? 0.4;

  const statScore =
    (ppg / maxPpg) * 3 +
    (rpg / maxRpg) * 1.2 +
    (apg / maxApg) * 2 +
    (fgPct / maxFg) * 1 +
    (tpPct / max3p) * 0.8 -
    (tpg / maxTpg) * 0.5;
  const recordBonus = teamPct * 3;
  const pogBonus = (pogCount || 0) * 2;
  return statScore + recordBonus + pogBonus;
}

function groupByPosition(players) {
  const guard = [];
  const forward = [];
  const center = [];
  players.forEach((p) => {
    const pos = (p.pos || "").toUpperCase();
    if (isCenter(pos)) center.push(p);
    else if (isForward(pos)) forward.push(p);
    else if (isGuard(pos) || pos === "G") guard.push(p);
    else forward.push(p);
  });
  return { guard, forward, center };
}

/**
 * @param leagueLeaderEntries - array of { name, team, pos, gp, pts, reb, ... }
 * @param gamePogs - array of { name, team } for games 0..N-1 (first N games)
 * @param teamWinPct - { [teamName]: number } win percentage
 * @param conferenceTeams - { East: string[], West: string[] } team names per conference
 * @param votesMap - optional { "name|team": number } accumulated votes; when provided, order is by votes
 * @returns { east: { starters: [], reserves: [] }, west: { starters: [], reserves: [] } } with player rows + "Starter" | "Reserve"
 */
export function buildAllStarSelections(leagueLeaderEntries, gamePogs, teamWinPct, conferenceTeams, votesMap = {}) {
  const getVotes = (row) => (votesMap && votesMap[`${row.name}|${row.team}`]) || 0;

  const pogCount = {};
  (gamePogs || []).forEach((p) => {
    if (p && p.name) {
      const key = `${p.name}|${p.team}`;
      pogCount[key] = (pogCount[key] || 0) + 1;
    }
  });

  const maxPpg = Math.max(1, ...leagueLeaderEntries.map((r) => (r.pts || 0) / (r.gp || 1)));
  const maxRpg = Math.max(1, ...leagueLeaderEntries.map((r) => (r.reb || 0) / (r.gp || 1)));
  const maxApg = Math.max(1, ...leagueLeaderEntries.map((r) => (r.ast || 0) / (r.gp || 1)));
  const maxFg = Math.max(
    1,
    ...leagueLeaderEntries.map((r) => (r.fga > 0 ? (r.fgm / r.fga) * 100 : 0))
  );
  const max3p = Math.max(
    1,
    ...leagueLeaderEntries.map((r) => (r.tpa > 0 ? (r.tpm / r.tpa) * 100 : 0))
  );
  const maxTpg = Math.max(1, ...leagueLeaderEntries.map((r) => (r.tov || 0) / (r.gp || 1)));

  const score = (row) =>
    allStarScore(row, teamWinPct, pogCount[`${row.name}|${row.team}`] || 0, maxPpg, maxRpg, maxApg, maxFg, max3p, maxTpg);

  const result = { east: { starters: [], reserves: [] }, west: { starters: [], reserves: [] } };

  ["East", "West"].forEach((conf) => {
    const teamSet = new Set(conferenceTeams[conf] || []);
    const players = leagueLeaderEntries.filter((r) => teamSet.has(r.team));
    players.forEach((r) => {
      r._allStarScore = score(r);
      r._allStarVotes = getVotes(r);
    });
    const sortByVotes = (a, b) => (b._allStarVotes ?? 0) - (a._allStarVotes ?? 0);
    const sortByScore = (a, b) => (b._allStarScore || 0) - (a._allStarScore || 0);
    const useVotes = Object.keys(votesMap || {}).length > 0;
    const sortFn = useVotes ? sortByVotes : sortByScore;

    const { guard, forward, center } = groupByPosition(players);
    guard.sort(sortFn);
    forward.sort(sortFn);
    center.sort(sortFn);

    // Pick 2G, 2F, 1C with max 2 starters per team so one team can't fill all 5.
    const teamStarterCount = {};
    const starterUsed = new Set();
    const pickWithCap = (list, n) => {
      const out = [];
      for (const p of list) {
        if (out.length >= n) break;
        const key = `${p.name}|${p.team}`;
        if (starterUsed.has(key)) continue;
        if ((teamStarterCount[p.team] || 0) >= 2) continue;
        out.push(p);
        starterUsed.add(key);
        teamStarterCount[p.team] = (teamStarterCount[p.team] || 0) + 1;
      }
      return out;
    };
    const starterG = pickWithCap(guard, 2);
    const starterF = pickWithCap(forward, 2);
    const starterC = pickWithCap(center, 1);
    const starters = [...starterG, ...starterF, ...starterC].map((p) => ({ ...p, allStarRole: "Starter" }));
    result[conf.toLowerCase()].starters = starters;

    // Cap total All-Stars per team (starters + reserves) at 4 so one team can't take all 5+ spots.
    const teamTotalCount = {};
    starters.forEach((p) => { teamTotalCount[p.team] = (teamTotalCount[p.team] || 0) + 1; });
    const used = new Set(starters.map((p) => `${p.name}|${p.team}`));
    const pickReserveWithCap = (list, n, cap = 4) => {
      const out = [];
      for (const p of list) {
        if (out.length >= n) break;
        const key = `${p.name}|${p.team}`;
        if (used.has(key)) continue;
        if ((teamTotalCount[p.team] || 0) >= cap) continue;
        out.push(p);
        used.add(key);
        teamTotalCount[p.team] = (teamTotalCount[p.team] || 0) + 1;
      }
      return out;
    };
    let reserveG = pickReserveWithCap(guard.filter((p) => !used.has(`${p.name}|${p.team}`)), 2);
    let reserveF = pickReserveWithCap(forward.filter((p) => !used.has(`${p.name}|${p.team}`)), 2);
    let reserveC = pickReserveWithCap(center.filter((p) => !used.has(`${p.name}|${p.team}`)), 1);
    let remaining = [...guard, ...forward, ...center].filter((p) => !used.has(`${p.name}|${p.team}`)).sort(sortFn);
    let wildcards = pickReserveWithCap(remaining, 2);
    // If cap left slots empty, fill without cap so we always have 7 reserves
    const needG = 2 - reserveG.length, needF = 2 - reserveF.length, needC = 1 - reserveC.length, needW = 2 - wildcards.length;
    if (needG > 0 || needF > 0 || needC > 0 || needW > 0) {
      const extraG = guard.filter((p) => !used.has(`${p.name}|${p.team}`)).slice(0, needG);
      const extraF = forward.filter((p) => !used.has(`${p.name}|${p.team}`)).slice(0, needF);
      const extraC = center.filter((p) => !used.has(`${p.name}|${p.team}`)).slice(0, needC);
      extraG.forEach((p) => { used.add(`${p.name}|${p.team}`); teamTotalCount[p.team] = (teamTotalCount[p.team] || 0) + 1; });
      extraF.forEach((p) => { used.add(`${p.name}|${p.team}`); teamTotalCount[p.team] = (teamTotalCount[p.team] || 0) + 1; });
      extraC.forEach((p) => { used.add(`${p.name}|${p.team}`); teamTotalCount[p.team] = (teamTotalCount[p.team] || 0) + 1; });
      reserveG = reserveG.concat(extraG);
      reserveF = reserveF.concat(extraF);
      reserveC = reserveC.concat(extraC);
      remaining = [...guard, ...forward, ...center].filter((p) => !used.has(`${p.name}|${p.team}`)).sort(sortFn);
      const extraW = remaining.slice(0, needW);
      wildcards = wildcards.concat(extraW);
    }
    const reserves = [...reserveG, ...reserveF, ...reserveC, ...wildcards].map((p) => ({
      ...p,
      allStarRole: "Reserve",
    }));
    result[conf.toLowerCase()].reserves = reserves;
  });

  return result;
}
