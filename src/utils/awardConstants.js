/**
 * Shared award formula constants and vote key helper.
 * Tune MVP/DPOY/All-Star formulas here so they stay consistent.
 */

/** Unique key for a player in vote maps (must match across All-Star, MVP, DPOY). */
export function playerVoteKey(name, team) {
  return `${name}|${team}`;
}

/** All-Star: per-game votes. Base = pts + reb*R + ast*A + stl*S + blk*B - tov*T, +pogBonus POG, +winBonus win. */
export const ALL_STAR = {
  reb: 0.4,
  ast: 0.8,
  stl: 1.5,
  blk: 1,
  tov: 1, // subtracted
  pogBonus: 5,
  winBonus: 4, // Winning helps but doesn't overpower — stars on losing teams can still make it
};

/** Game score (POG + All-Star base). Same formula so one place to tune. */
export function gameScore(s) {
  if (!s) return 0;
  return (Number(s.pts) || 0) + (Number(s.reb) || 0) * ALL_STAR.reb + (Number(s.ast) || 0) * ALL_STAR.ast + (Number(s.stl) || 0) * ALL_STAR.stl + (Number(s.blk) || 0) * ALL_STAR.blk - (Number(s.tov) || 0) * ALL_STAR.tov;
}

/** MVP: per-game votes. Base = pts*P + reb*R + ast*A + stl*S + blk*B - tov*T, +pogBonus POG, +winBonus win. Scaled like offense (stl/blk/tov modest). */
export const MVP = {
  pts: 0.5,
  reb: 0.2,
  ast: 0.25,
  stl: 0.15,
  blk: 0.1,
  tov: 0.1, // subtracted
  pogBonus: 6,
  winBonus: 35,
};

/** DPOY: per-game votes. Base = stl*S + blk*B + reb*R, +pogBonus POG, +winBonus win. Wins/POG matter less than for MVP. */
export const DPOY = {
  stl: 3.0,
  blk: 2.0,
  reb: 0.05,
  pogBonus: 0,
  winBonus: 4,
};
