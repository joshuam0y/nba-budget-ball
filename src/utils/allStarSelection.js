import { playerVoteKey, ALL_STAR, MVP, DPOY, gameScore } from "./awardConstants";

export { playerVoteKey };

/**
 * All-Star selection: East vs West, position-based (2G, 3 F/C starters + 2G, 3 F/C + 2 wildcards reserves).
 * Order is by accumulated VOTES (see awardConstants.ALL_STAR). When votesMap is provided we use it; otherwise fallback to legacy score.
 */

/**
 * Per-game "votes" for All-Star (accumulated wherever this is called).
 * Formula from awardConstants.ALL_STAR. Keys from playerVoteKey(name, team).
 */
export function computeAllStarVotesForGame(res, myTeamLabel, oppLabel, pog, userWon) {
  const out = {};
  if (!res) return out;
  const add = (stats, teamLabel, won) => {
    (stats || []).forEach((s) => {
      if (!s || s.name == null) return;
      const key = playerVoteKey(s.name, teamLabel);
      const base = gameScore(s);
      let v = base;
      if (pog && pog.name === s.name && pog.team === teamLabel) v += ALL_STAR.pogBonus;
      if (won) v += ALL_STAR.winBonus;
      if (!Number.isFinite(v)) return;
      out[key] = (out[key] || 0) + v;
    });
  };
  add(res.myStats, myTeamLabel, userWon);
  add(res.oppStats, oppLabel, !userWon);
  return out;
}

/**
 * Per-game "votes" for MVP (accumulated all season). Formula from awardConstants.MVP.
 */
export function computeMvpVotesForGame(res, myTeamLabel, oppLabel, pog, userWon) {
  const out = {};
  if (!res) return out;
  const add = (stats, teamLabel, won) => {
    (stats || []).forEach((s) => {
      if (!s || s.name == null) return;
      const key = playerVoteKey(s.name, teamLabel);
      const base = (Number(s.pts) || 0) * MVP.pts + (Number(s.reb) || 0) * MVP.reb + (Number(s.ast) || 0) * MVP.ast + (Number(s.stl) || 0) * MVP.stl + (Number(s.blk) || 0) * MVP.blk - (Number(s.tov) || 0) * MVP.tov;
      let v = base;
      if (pog && pog.name === s.name && pog.team === teamLabel) v += MVP.pogBonus;
      if (won) v += MVP.winBonus;
      if (!Number.isFinite(v)) return;
      out[key] = (out[key] || 0) + v;
    });
  };
  add(res.myStats, myTeamLabel, userWon);
  add(res.oppStats, oppLabel, !userWon);
  return out;
}

/**
 * Per-game "votes" for DPOY (accumulated all season). Formula from awardConstants.DPOY.
 */
export function computeDpoyVotesForGame(res, myTeamLabel, oppLabel, pog, userWon) {
  const out = {};
  if (!res) return out;
  const add = (stats, teamLabel, won) => {
    (stats || []).forEach((s) => {
      if (!s || s.name == null) return;
      const key = playerVoteKey(s.name, teamLabel);
      const base = (Number(s.stl) || 0) * DPOY.stl + (Number(s.blk) || 0) * DPOY.blk + (Number(s.reb) || 0) * DPOY.reb;
      let v = base;
      if (pog && pog.name === s.name && pog.team === teamLabel) v += DPOY.pogBonus;
      if (won) v += DPOY.winBonus;
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
  const getVotes = (row) => (votesMap && votesMap[playerVoteKey(row.name, row.team)]) || 0;

  const pogCount = {};
  (gamePogs || []).forEach((p) => {
    if (p && p.name) {
      const key = playerVoteKey(p.name, p.team);
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
    allStarScore(row, teamWinPct, pogCount[playerVoteKey(row.name, row.team)] || 0, maxPpg, maxRpg, maxApg, maxFg, max3p, maxTpg);

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
    const frontcourt = [...forward, ...center];
    frontcourt.sort(sortFn);

    // Starters: top 2G, 3 F/C by votes/score (no per-team cap).
    const starterG = guard.slice(0, 2);
    const starterFC = frontcourt.slice(0, 3);
    const starters = [...starterG, ...starterFC].map((p) => ({ ...p, allStarRole: "Starter" }));
    result[conf.toLowerCase()].starters = starters;

    // Reserves: next 2G, 3 F/C + 2 wildcards by votes/score, excluding starters (no per-team cap).
    const used = new Set(starters.map((p) => playerVoteKey(p.name, p.team)));
    const usedKey = (p) => used.has(playerVoteKey(p.name, p.team));
    const reserveG = guard.filter((p) => !usedKey(p)).slice(0, 2);
    const reserveFC = frontcourt.filter((p) => !usedKey(p)).slice(0, 3);
    reserveG.forEach((p) => used.add(playerVoteKey(p.name, p.team)));
    reserveFC.forEach((p) => used.add(playerVoteKey(p.name, p.team)));
    const remaining = [...guard, ...frontcourt].filter((p) => !usedKey(p)).sort(sortFn);
    const wildcards = remaining.slice(0, 2);
    const reserves = [...reserveG, ...reserveFC, ...wildcards].map((p) => ({
      ...p,
      allStarRole: "Reserve",
    }));
    result[conf.toLowerCase()].reserves = reserves;
  });

  return result;
}
