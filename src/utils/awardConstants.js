/**
 * Shared award formula constants and vote key helper.
 * Tune MVP/DPOY/All-Star formulas here so they stay consistent.
 */

/** Unique key for a player in vote maps (must match across All-Star, MVP, DPOY). */
export function playerVoteKey(name, team) {
  return `${name}|${team}`;
}

/** All-Star: per-game votes. Base = pts + reb*R + ast*A, +pogBonus POG, +winBonus win. */
export const ALL_STAR = {
  reb: 0.4,
  ast: 0.8,
  pogBonus: 5,
  winBonus: 4, // Winning helps but doesn't overpower — stars on losing teams can still make it
};

/** MVP: per-game votes. Base = pts*P + reb*R + ast*A, +pogBonus POG, +winBonus win. */
export const MVP = {
  pts: 0.5,
  reb: 0.2,
  ast: 0.25,
  pogBonus: 6,
  winBonus: 35,
};

/** DPOY: per-game votes. Base = stl*S + blk*B + reb*R, +pogBonus POG, +winBonus win. */
export const DPOY = {
  stl: 3.0,
  blk: 2.0,
  reb: 0.15,
  pogBonus: 1,
  winBonus: 6,
};
