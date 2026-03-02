import "./index.css";
import React, { Fragment, useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { supabase } from "./supabase";
import { StandingsTable } from "./components/StandingsTable";
import { BoxScore } from "./components/BoxScore";
import { TeamStatsPanel } from "./components/TeamStatsPanel";
import { TeamHighs } from "./components/TeamHighs";
import { SeasonHighs } from "./components/SeasonHighs";
import { standingsSort } from "./utils/standings";
import {
  POSITIONS,
  BUDGET,
  SEASON_LENGTH,
  NUM_TEAMS,
  ALL_STAR_GAME_AT,
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
import { buildAllStarSelections, computeAllStarVotesForGame, computeMvpVotesForGame, computeDpoyVotesForGame, playerVoteKey } from "./utils/allStarSelection";
import { gameScore } from "./utils/awardConstants";

// Lazy-loaded heavy components for better initial bundle size
const LeagueLeadersLazy = lazy(() =>
  import("./LeagueLeaders").then((m) => ({ default: m.LeagueLeaders }))
);
const AllNBAAllDefensiveLazy = lazy(() =>
  import("./AllNBAAllDefensive").then((m) => ({ default: m.AllNBAAllDefensive }))
);
import { buildAllNBATeams, buildAllDefensiveTeams } from "./AllNBAAllDefensive";
const BracketDisplayLazy = lazy(() =>
  import("./components/bracket").then((m) => ({ default: m.BracketDisplay }))
);
import { ACHIEVEMENTS } from "./utils/achievements";

const ACHIEVEMENT_META = {
  // Season / regular-season milestones
  first_win: { category: "Season milestones", difficulty: 1 },
  winning_season: { category: "Season milestones", difficulty: 2 },
  fifty_wins: { category: "Season milestones", difficulty: 3 },
  win_streak_10: { category: "Season milestones", difficulty: 3 },
  sixty_wins: { category: "Season milestones", difficulty: 4 },
  seventy_wins: { category: "Season milestones", difficulty: 5 },
  curry_who: { category: "Season milestones", difficulty: 6 },
  perfect_82: { category: "Season milestones", difficulty: 7 },
  one_seed: { category: "Season milestones", difficulty: 3 },
  play_in_survivor: { category: "Season milestones", difficulty: 2 },
  home_court: { category: "Season milestones", difficulty: 4 },
  road_warrior: { category: "Season milestones", difficulty: 3 },
  first_playoff: { category: "Season milestones", difficulty: 1 },
  first_playoff_win: { category: "Season milestones", difficulty: 1 },

  // Playoff runs / championships
  first_championship: { category: "Playoff runs", difficulty: 3 },
  three_peat: { category: "Playoff runs", difficulty: 5 },
  dynasty: { category: "Playoff runs", difficulty: 5 },
  cinderella: { category: "Playoff runs", difficulty: 4 },
  sweep: { category: "Playoff runs", difficulty: 3 },
  undefeated_playoffs: { category: "Playoff runs", difficulty: 5 },
  reverse_sweep: { category: "Playoff runs", difficulty: 5 },
  game_seven: { category: "Playoff runs", difficulty: 3 },
  upset: { category: "Playoff runs", difficulty: 2 },
  no_sweep: { category: "Playoff runs", difficulty: 1 },
  bounce_back: { category: "Playoff runs", difficulty: 4 },
  revenge: { category: "Playoff runs", difficulty: 3 },
  rivalry: { category: "Playoff runs", difficulty: 4 },

  // Player awards / titles
  mvp_winner: { category: "Player awards", difficulty: 3 },
  dpoy_winner: { category: "Player awards", difficulty: 3 },
  all_nba_winner: { category: "Player awards", difficulty: 2 },
  all_defensive_winner: { category: "Player awards", difficulty: 2 },
  all_star_1: { category: "Player awards", difficulty: 1 },
  all_star_2: { category: "Player awards", difficulty: 2 },
  all_star_3: { category: "Player awards", difficulty: 3 },
  all_star_4: { category: "Player awards", difficulty: 4 },
  all_five_all_star: { category: "Player awards", difficulty: 7 },
  all_star_starter: { category: "Player awards", difficulty: 5 },
  all_star_starter_2: { category: "Player awards", difficulty: 6 },
  triple_crown: { category: "Player awards", difficulty: 5 },
  scoring_title: { category: "Player awards", difficulty: 3 },
  rebounding_champion: { category: "Player awards", difficulty: 3 },
  assists_leader: { category: "Player awards", difficulty: 3 },
  steals_leader: { category: "Player awards", difficulty: 3 },
  blocks_leader: { category: "Player awards", difficulty: 3 },

  // Single-game feats / game moments
  triple_double: { category: "Game feats", difficulty: 2 },
  fifty_point_game: { category: "Game feats", difficulty: 3 },
  sixty_point_game: { category: "Game feats", difficulty: 4 },
  seventy_point_game: { category: "Game feats", difficulty: 5 },
  eighty_point_game: { category: "Game feats", difficulty: 6 },
  ninety_point_game: { category: "Game feats", difficulty: 7 },
  hundred_point_game: { category: "Game feats", difficulty: 8 },
  quadruple_double: { category: "Game feats", difficulty: 5 },
  blowout: { category: "Game feats", difficulty: 2 },
  overtime_win: { category: "Game feats", difficulty: 1 },
  clutch: { category: "Game feats", difficulty: 2 },
  five_double_figures: { category: "Game feats", difficulty: 3 },
  five_by_five: { category: "Game feats", difficulty: 5 },
  double_double: { category: "Game feats", difficulty: 2 },
  second_round: { category: "Playoff runs", difficulty: 2 },
  conference_finals: { category: "Playoff runs", difficulty: 3 },
  make_finals: { category: "Playoff runs", difficulty: 4 },
  elimination_win: { category: "Playoff runs", difficulty: 3 },
  beat_every_team: { category: "Season milestones", difficulty: 4 },
  all_league_leaders: { category: "Player awards", difficulty: 5 },
  three_point_leader: { category: "Player awards", difficulty: 3 },
  finals_mvp_winner: { category: "Player awards", difficulty: 4 },
  clinched_division: { category: "Season milestones", difficulty: 3 },
  mega_blowout: { category: "Game feats", difficulty: 3 },
  twenty_twenty: { category: "Game feats", difficulty: 4 },
  thirty_thirty: { category: "Game feats", difficulty: 5 },
  forty_forty: { category: "Game feats", difficulty: 6 },
  twenty_twenty_twenty: { category: "Game feats", difficulty: 5 },

  // Career / longevity
  seasons_10: { category: "Career grind", difficulty: 2 },
  seasons_20: { category: "Career grind", difficulty: 3 },
  seasons_50: { category: "Career grind", difficulty: 4 },
  seasons_100: { category: "Career grind", difficulty: 5 },
};

function sortAchievementsForDisplay(list) {
  const catOrder = ["Season milestones", "Game feats", "Player awards", "Playoff runs", "Career grind", "Other"];
  const safe = [...(list || [])].filter((a) => a && a.id);
  return safe.sort((a, b) => {
    if (a.id === "first_win") return -1;
    if (b.id === "first_win") return 1;
    const ma = ACHIEVEMENT_META[a.id] || { category: "Other", difficulty: 3 };
    const mb = ACHIEVEMENT_META[b.id] || { category: "Other", difficulty: 3 };
    const ia = catOrder.indexOf(ma.category);
    const ib = catOrder.indexOf(mb.category);
    if (ia !== ib) return ia - ib;
    if (ma.difficulty !== mb.difficulty) return ma.difficulty - mb.difficulty;
    return (a.label || "").localeCompare(b.label || "");
  });
}

const TUTORIAL_SEEN_KEY = "nba_budget_ball_tutorial_seen";
const SOUND_ON_KEY = "nba_budget_ball_sound_on";
const HINT_KEYS = { simBreak: "nba_budget_ball_hint_sim", chemistry: "nba_budget_ball_hint_chem", archetypes: "nba_budget_ball_hint_arch", difficulty: "nba_budget_ball_hint_diff" };
const GAME_HISTORY_MAX = 5;

// Basketball Reference–style award labels (full names)
const AWARD_LABELS = {
  MVP: "MVP",
  DPOY: "DPOY",
  TMVP: "Team MVP",
  "AS-E-S": "All-Star (East Starter)",
  "AS-E-R": "All-Star (East Reserve)",
  "AS-W-S": "All-Star (West Starter)",
  "AS-W-R": "All-Star (West Reserve)",
  NBA1: "All-NBA 1st Team",
  NBA2: "All-NBA 2nd Team",
  NBA3: "All-NBA 3rd Team",
  DEF1: "All-Defensive 1st Team",
  DEF2: "All-Defensive 2nd Team",
  CHAMP: "Champion",
  FINALSMVP: "Finals MVP",
};

/** Groups a player's award list by award type and returns [ { award, label, seasons } ] for BR-style display */
function groupAwardsByType(list) {
  if (!list || !list.length) return [];
  const byAward = {};
  list.forEach(({ season, award }) => {
    if (!byAward[award]) byAward[award] = [];
    byAward[award].push(season);
  });
  const order = ["MVP", "DPOY", "FINALSMVP", "CHAMP", "NBA1", "NBA2", "NBA3", "DEF1", "DEF2", "AS-E-S", "AS-E-R", "AS-W-S", "AS-W-R", "TMVP"];
  return order.filter((a) => byAward[a]).map((award) => ({
    award,
    label: AWARD_LABELS[award] || award,
    seasons: byAward[award].sort((a, b) => a - b),
  }));
}

/** One row per roster player: merge awards from playerAwards[name] and playerAwards[fullName], dedupe by (season, award). */
function getMyTeamAwardsByPlayer(roster, playerAwards) {
  const awards = playerAwards || {};
  const seen = new Set();
  return POSITIONS.map((pos) => roster[pos]).filter(Boolean).map((p) => {
    const list = [...(awards[p.name] || []), ...(awards[p.fullName] || []).filter((e) => e && p.name !== p.fullName)];
    const deduped = list.filter(({ season, award }) => {
      const key = `${p.name}|${season}|${award}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { displayName: p.name, list: deduped };
  }).filter(({ list }) => list && list.length > 0);
}

/** Resolve MVP/DPOY winner display name for a season from playerAwards; prefers roster display name when on our team. */
function getSeasonAwardWinner(playerAwards, roster, awardKey, seasonNum) {
  const awards = playerAwards || {};
  let nameFromAwards = null;
  for (const [key, list] of Object.entries(awards)) {
    if (list.some((e) => e.season === seasonNum && e.award === awardKey)) {
      nameFromAwards = key;
      break;
    }
  }
  if (!nameFromAwards) return null;
  const rosterPlayer = POSITIONS.map((pos) => roster[pos]).find((p) => p && (p.name === nameFromAwards || p.fullName === nameFromAwards));
  return rosterPlayer ? rosterPlayer.name : nameFromAwards;
}

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
  const W = 640;
  const H = 480;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const safeName = (teamName && teamName.trim()) ? teamName.trim() : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
  const totalCost = POSITIONS.reduce((s, pos) => s + (roster[pos]?.cost || 0), 0);

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawPillCentered(text, cx, y, bg, color, strokeColor) {
    ctx.font = "10px system-ui, sans-serif";
    const metrics = ctx.measureText(text);
    const w = metrics.width + 14;
    const h = 16;
    const x = cx - w / 2;
    roundRect(x, y, w, h, 8);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = strokeColor ?? "rgba(255,255,255,0.1)";
    ctx.lineWidth = strokeColor ? 1.5 : 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, y + h / 2 + 0.5);
  }

  function truncateText(text, maxWidth, font) {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 3 && ctx.measureText(t + "…").width > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + "…";
  }

  // Background with subtle gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#030712");
  bg.addColorStop(0.5, "#020617");
  bg.addColorStop(1, "#030712");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Thin gold accent bar at top
  const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
  accentGrad.addColorStop(0, "#f59e0b");
  accentGrad.addColorStop(0.5, "#eab308");
  accentGrad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, W, 5);

  // Court rectangle with subtle gradient
  const courtX = 40;
  const courtY = 118;
  const courtW = W - courtX * 2;
  const courtH = H - courtY - 80;
  const courtGrad = ctx.createLinearGradient(courtX, courtY, courtX + courtW, courtY + courtH);
  courtGrad.addColorStop(0, "#0f172a");
  courtGrad.addColorStop(0.5, "#0b1220");
  courtGrad.addColorStop(1, "#0f172a");
  ctx.fillStyle = courtGrad;
  roundRect(courtX, courtY, courtW, courtH, 26);
  ctx.fill();
  ctx.strokeStyle = "rgba(251, 191, 36, 0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Half-court lines and circle
  ctx.strokeStyle = "rgba(251, 191, 36, 0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(courtX + courtW / 2, courtY);
  ctx.lineTo(courtX + courtW / 2, courtY + courtH);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(courtX + courtW / 2, courtY + courtH * 0.25, 34, 0, Math.PI * 2);
  ctx.stroke();

  // Paint / key near bottom (basket)
  const keyW = courtW * 0.38;
  const keyX = courtX + (courtW - keyW) / 2;
  const keyY = courtY + courtH * 0.58;
  const keyH = courtH * 0.34;
  ctx.strokeStyle = "rgba(251, 191, 36, 0.8)";
  ctx.lineWidth = 2;
  roundRect(keyX, keyY, keyW, keyH, 10);
  ctx.stroke();

  // Rim + restricted circle
  const rimCx = courtX + courtW / 2;
  const rimCy = keyY + 10;
  ctx.beginPath();
  ctx.arc(rimCx, rimCy, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rimCx, rimCy + 18, 22, Math.PI * 0.25, Math.PI * 0.75);
  ctx.stroke();

  // Header text (yellow title, light blue subtitle)
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const titleGrad = ctx.createLinearGradient(0, 20, W, 50);
  titleGrad.addColorStop(0, "#fef3c7");
  titleGrad.addColorStop(0.5, "#fde68a");
  titleGrad.addColorStop(1, "#fef3c7");
  ctx.fillStyle = titleGrad;
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText("🏀 NBA BUDGET BALL", W / 2, 52);

  ctx.fillStyle = "#60a5fa";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.fillText("YOUR STARTING 5", W / 2, 74);

  if (safeName) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(safeName, W / 2, 96);
  }

  // Budget + code summary strip
  const summaryY = H - 64;
  ctx.font = "11px system-ui, sans-serif";
  const costText = `💰 Budget: $${totalCost}/${BUDGET}`;
  const codeText = teamCode ? `🔗 Code: ${teamCode}` : "";
  const smallGap = 14;
  const costW = ctx.measureText(costText).width;
  const codeW = codeText ? ctx.measureText(codeText).width : 0;
  const totalStripW = costW + (codeText ? codeW + smallGap * 2 : 0) + smallGap * 2;
  const stripX = (W - totalStripW) / 2;

  const stripGrad = ctx.createLinearGradient(stripX - 10, 0, stripX + totalStripW + 10, 0);
  stripGrad.addColorStop(0, "rgba(15, 23, 42, 0.95)");
  stripGrad.addColorStop(0.5, "rgba(30, 41, 59, 0.95)");
  stripGrad.addColorStop(1, "rgba(15, 23, 42, 0.95)");
  ctx.fillStyle = stripGrad;
  roundRect(stripX - 10, summaryY - 16, totalStripW + 20, 26, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(251, 191, 36, 0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Budget progress bar below strip
  const barW = totalStripW + 20;
  const barX = stripX - 10;
  const barY = summaryY + 14;
  const barH = 5;
  roundRect(barX, barY, barW, barH, 2);
  ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
  ctx.fill();
  const pct = Math.min(1, totalCost / BUDGET);
  roundRect(barX, barY, barW * pct, barH, 2);
  const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  barGrad.addColorStop(0, "#22c55e");
  barGrad.addColorStop(0.5, "#fbbf24");
  barGrad.addColorStop(1, pct > 1 ? "#ef4444" : "#22c55e");
  ctx.fillStyle = barGrad;
  ctx.fill();

  ctx.fillStyle = "#e5e7eb";
  ctx.textAlign = "left";
  let cursorX = stripX;
  ctx.fillText(costText, cursorX, summaryY);
  cursorX += costW + smallGap;
  if (codeText) {
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(codeText, cursorX, summaryY);
  }

  // Footer link
  const linkText = shareUrl || origin;
  ctx.textAlign = "center";
  ctx.fillStyle = "#475569";
  ctx.font = "10px system-ui, sans-serif";
  let drawUrl = linkText;
  if (shareUrl && ctx.measureText(linkText).width > W - 48) {
    for (let i = linkText.length; i > 0; i--) {
      const t = linkText.slice(0, i) + "…";
      if (ctx.measureText(t).width <= W - 48) {
        drawUrl = t;
        break;
      }
    }
  }
  ctx.fillStyle = "#64748b";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText(shareUrl ? "▶ Play: " + drawUrl : "▶ Play at " + origin, W / 2, H - 18);

  // Layout for 5 positions on the court
  const layout = {
    PG: { x: courtX + courtW * 0.22, y: courtY + courtH * 0.30 },
    SG: { x: courtX + courtW * 0.78, y: courtY + courtH * 0.30 },
    SF: { x: courtX + courtW * 0.50, y: courtY + courtH * 0.46 },
    PF: { x: courtX + courtW * 0.32, y: courtY + courtH * 0.68 },
    C:  { x: courtX + courtW * 0.68, y: courtY + courtH * 0.68 },
  };

  // Draw each starter node
  POSITIONS.forEach((pos) => {
    const spot = layout[pos];
    if (!spot) return;
    const p = roster[pos];
    const tier = p ? getTier(p.cost) : null;
    const arch = p ? getArchetype(p) : null;

    // Blue light / aura reflecting from each position (stronger like original)
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 52, 0, Math.PI * 2);
    if (p) {
      const glowGrad = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, 52);
      glowGrad.addColorStop(0, "rgba(56, 189, 248, 0.4)");
      glowGrad.addColorStop(0.4, "rgba(56, 189, 248, 0.18)");
      glowGrad.addColorStop(0.7, "rgba(56, 189, 248, 0.06)");
      glowGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
      ctx.fillStyle = glowGrad;
    } else {
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    }
    ctx.fill();

    // Position badge
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = p ? "#0f172a" : "#020617";
    ctx.fill();
    const badgeStroke = p ? "rgba(56, 189, 248, 0.9)" : "#1f2937";
    ctx.strokeStyle = badgeStroke;
    ctx.lineWidth = p ? 2.5 : 1.5;
    ctx.stroke();
    ctx.fillStyle = p ? "#e0f2fe" : "#4b5563";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pos, spot.x, spot.y);

    // Player name under badge
    const nameY = spot.y + 34;
    const rawName = p ? p.name : "Empty slot";
    const nameFont = "bold 13px system-ui, sans-serif";
    const maxNameWidth = 120;
    const nameText = truncateText(rawName, maxNameWidth, nameFont);
    ctx.font = nameFont;
    ctx.fillStyle = p ? "#f8fafc" : "#4b5563";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (p) {
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
    }
    ctx.fillText(nameText, spot.x, nameY);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    if (!p) return;

    // Tier + cost pills (row 1), archetype pill underneath (row 2) with its color
    const tierLabel = tier?.label || "";
    const archLabel = arch?.label || "";
    const costText = "$" + p.cost;
    const pillY = nameY + 8;
    const pillH = 16;
    const gap = 6;
    ctx.font = "10px system-ui, sans-serif";
    const tierW = tierLabel ? ctx.measureText(tierLabel).width + 14 : 0;
    ctx.font = "bold 12px system-ui, sans-serif";
    const costW = ctx.measureText(costText).width + 14;
    const row1W = tierW + (tierLabel ? gap : 0) + costW;
    let left = spot.x - row1W / 2;
    if (tierLabel) {
      drawPillCentered(tierLabel, left + tierW / 2, pillY, tier.bg, tier.color);
      left += tierW + gap;
    }
    const costX = left;
    const costY = pillY;
    const costH = pillH;
    roundRect(costX, costY, costW, costH, 8);
    ctx.fillStyle = "#78350f";
    ctx.fill();
    ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(costText, costX + costW / 2, costY + costH / 2 + 0.5);
    if (archLabel) {
      drawPillCentered(archLabel, spot.x, pillY + pillH + gap, "#1e293b", arch.color, arch.color);
    }
  });

  // Subtle vignette (darker corners)
  const vigGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.75);
  vigGrad.addColorStop(0, "rgba(0,0,0,0)");
  vigGrad.addColorStop(0.7, "rgba(0,0,0,0)");
  vigGrad.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);

  // Outer border (subtle gold accent)
  ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
      1
    );
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

// Simple formatting helpers for season summary
const fmt1 = (v) => (v ?? 0).toFixed(1);
const fmt0 = (v) => Math.round(v ?? 0);


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

export default function App(){
  const [phase,setPhase]=useState("import");
  const [playerPool,setPlayerPool]=useState([]);
  const [teamRoster,setTeamRoster]=useState(null);
  const [importErr,setImportErr]=useState("");
  const [importInfo,setImportInfo]=useState("");
  const [roster,setRoster]=useState({PG:null,SG:null,SF:null,PF:null,C:null});
  const [slotSel,setSlotSel]=useState(null);
  const [chemHoverKey, setChemHoverKey] = useState(null);
  const [rosterHoverId, setRosterHoverId] = useState(null);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      if (typeof window === "undefined") return true;
      const v = window.localStorage.getItem(SOUND_ON_KEY);
      return v !== "0" && v !== "false";
    } catch {
      return true;
    }
  });
  const volume = 0.5; // 50%
  const [aiTeams,setAiTeams]=useState([]);
  const [schedule,setSchedule]=useState(null);
  const [scheduleHome, setScheduleHome] = useState(null); // scheduleHome[i][g] = true if team i is home in game g
  const [result,setResult]=useState(null);
  const [season,setSeason]=useState(emptySeason());
  const [gameNum,setGameNum]=useState(1);
  const [seasonNumber,setSeasonNumber]=useState(0);
  const [careerStats,setCareerStats]=useState({
    seasonsPlayed: 0,
    totalWins: 0,
    totalLosses: 0,
    championships: 0,
    finalsAppearances: 0,
    playoffAppearances: 0,
    playoffWins: 0,
    bestSeasonWins: 0,
    lastSeasonMadePlayoffs: null, // null = first season; true/false = did we make playoffs last season
  });
  // Player awards: { playerName: [ { season, award } ] } — MVP, DPOY, TMVP (team MVP), NBA1, NBA2, NBA3, DEF1, DEF2, CHAMP, FINALSMVP
  const [playerAwards, setPlayerAwards] = useState({});
  const [currentSaveSlot, setCurrentSaveSlot] = useState(null); // null = single auto-save; 1|2|3 = slot
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [saveOverwriteSlot, setSaveOverwriteSlot] = useState(null); // slot awaiting overwrite confirm
  const saveToastTimerRef = useRef(null);
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
  const [showStandings,setShowStandings]=useState(true);
  const [elimInPlayoffs,setElimInPlayoffs]=useState(false);
  const [showHelp,setShowHelp]=useState(false);
  const [showLeaders,setShowLeaders]=useState(true);
  const [leagueLeaders,setLeagueLeaders]=useState({});
  const [seasonHighs,setSeasonHighs]=useState({});
  const [playoffLeaders,setPlayoffLeaders]=useState({});
  const [playoffHighs,setPlayoffHighs]=useState({});
  const [finalsLeaders, setFinalsLeaders] = useState({});
  const [showPlayoffLeaders,setShowPlayoffLeaders]=useState(false);
  const [playoffLeadersView, setPlayoffLeadersView] = useState("playoff"); // "playoff" | "season" — which leaders/highs to show when on playoffs screen
  const [playoffHighsPanelView, setPlayoffHighsPanelView] = useState("playoff"); // "playoff" | "season" — for always-visible league/playoff highs panel
  const [teamStatsPerMode, setTeamStatsPerMode] = useState("game"); // "game" | "per36"
  const [teamSeasonHighs, setTeamSeasonHighs] = useState({});
  const [teamPlayoffHighs, setTeamPlayoffHighs] = useState({});
  // Career best single-game highs for your roster (across all seasons): { [playerName]: { pts: { value, season }, ... } }
  const [careerTeamHighs, setCareerTeamHighs] = useState({});
  // League-wide all-time single-game highs: { pts: { val, name, team, pos, season }, ... } — same keys as seasonHighs
  const [careerLeagueHighs, setCareerLeagueHighs] = useState({});
  const [topPicks, setTopPicks] = useState([]);
  const [myTeamName, setMyTeamName] = useState("Your Team");
  const [teamNameHistory, setTeamNameHistory] = useState([]);
  const [difficulty, setDifficulty] = useState("standard"); // casual | standard | hardcore
  const [inspectPlayer, setInspectPlayer] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState("");
  const [gamePogs, setGamePogs] = useState(() => Array(SEASON_LENGTH).fill(null));
  const [allStarVotes, setAllStarVotes] = useState({});
  const [mvpVotes, setMvpVotes] = useState({});
  const [dpoyVotes, setDpoyVotes] = useState({});
  const [allStarSelections, setAllStarSelections] = useState(null);
  const [showAllStarSimThroughConfirm, setShowAllStarSimThroughConfirm] = useState(false);
  const [showAllStarTab, setShowAllStarTab] = useState(true);
  const [showMvpDpoyTab, setShowMvpDpoyTab] = useState(true);
  const [allStarRetry, setAllStarRetry] = useState(0);
  const simThroughBreakRequestedRef = useRef(false);
  const allStarPendingSimCountRef = useRef(null);
  const allStarResumeTimeoutRef = useRef(null);
  const [leagueName, setLeagueName] = useState("NBA");
  const [gameHistory, setGameHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showTrophyCase, setShowTrophyCase] = useState(false);
  const [seasonGameResults, setSeasonGameResults] = useState([]); // [{ oppName, home, myScore, oppScore, won, pog }] per game
  const [unlockedAchievements, setUnlockedAchievements] = useState([]); // per-save; persisted with slot
  const [newlyUnlockedAchievements, setNewlyUnlockedAchievements] = useState([]);
  const [reachedFirstRoundThisPlayoffs, setReachedFirstRoundThisPlayoffs] = useState(false);
  const [playerPlayoffSeedThisYear, setPlayerPlayoffSeedThisYear] = useState(null); // 1-10 when in playoffs
  const [lastEliminatorTeamName, setLastEliminatorTeamName] = useState(null); // team that eliminated us last run; for revenge
  const [teamsDefeatedInPlayoffs, setTeamsDefeatedInPlayoffs] = useState([]); // team names we beat in playoff series this run
  const [hintsDismissed, setHintsDismissed] = useState(() => {
    if (typeof window === "undefined") return {};
    const o = {};
    Object.keys(HINT_KEYS).forEach((k) => { o[k] = !!window.localStorage.getItem(HINT_KEYS[k]); });
    return o;
  });
  const dismissHint = useCallback((id) => {
    try {
      if (typeof window !== "undefined" && HINT_KEYS[id]) {
        window.localStorage.setItem(HINT_KEYS[id], "1");
        setHintsDismissed((prev) => ({ ...prev, [id]: true }));
      }
    } catch (_) {}
  }, []);

  const unlockAchievementForSave = useCallback((id) => {
    const list = unlockedAchievements || [];
    const already = list.includes(id);
    if (!already) setUnlockedAchievements((prev) => ((prev || []).includes(id) ? prev : [...(prev || []), id]));
    return !already; // true when newly unlocked (for toast)
  }, [unlockedAchievements]);

  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  const [bracketDensity, setBracketDensity] = useState(
    typeof window !== "undefined" && window.innerWidth < 768 ? "compact" : "comfortable"
  ); // comfortable | compact

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // On mobile: auto-scroll selected matchup into view
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (phase !== "playoffs" || !activeMatchId || !isMobile) return;
    const el = document.getElementById(`match-${activeMatchId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [phase, activeMatchId, isMobile]);

  // Persist sound preference
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage)
        window.localStorage.setItem(SOUND_ON_KEY, soundOn ? "1" : "0");
    } catch (_) {}
  }, [soundOn]);

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

  // Load saved team / season from localStorage (last-used key: default state or a slot), then fall back to URL roster
  useEffect(() => {
    if (typeof window === "undefined" || !playerPool.length) return;
    try {
      const lastKey = window.localStorage.getItem("nba_budget_ball_last_key") || "nba-budget-ball-state";
      const raw = window.localStorage.getItem(lastKey);
      let restored = false;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.currentSaveSlot != null) setCurrentSaveSlot(saved.currentSaveSlot);
        if (saved.teamName) setMyTeamName(saved.teamName);
        if (saved.leagueName) setLeagueName(saved.leagueName);
        if (saved.difficulty) setDifficulty(saved.difficulty);
        if (typeof saved.seasonNumber === "number") setSeasonNumber(saved.seasonNumber);
        if (saved.careerStats) setCareerStats(saved.careerStats);
        if (saved.playerAwards && typeof saved.playerAwards === "object") setPlayerAwards(saved.playerAwards);
        if (saved.careerTeamHighs && typeof saved.careerTeamHighs === "object") setCareerTeamHighs(saved.careerTeamHighs);
        if (saved.careerLeagueHighs && typeof saved.careerLeagueHighs === "object") setCareerLeagueHighs(saved.careerLeagueHighs);
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

        // Only treat as a restored session if we're past the import screen
        const hasRealPhase = saved.phase && saved.phase !== "import";

        // Restore in-progress season / playoffs if present (so CSV effect won't override phase)
        if (hasRealPhase) {
          restoredSessionRef.current = true;
          setPhase(saved.phase);
        }
        if (saved.season) setSeason(saved.season);
        if (saved.schedule) setSchedule(saved.schedule);
        if (saved.scheduleHome) setScheduleHome(saved.scheduleHome);
        if (saved.aiTeams) setAiTeams(saved.aiTeams);
        if (typeof saved.gameNum === "number") setGameNum(saved.gameNum);
        if (typeof saved.inSeason === "boolean") setInSeason(saved.inSeason);
        if (saved.bracket) setBracket(saved.bracket);
        if (saved.playoffResult) setPlayoffResult(saved.playoffResult);
        if (saved.activeMatchId != null) setActiveMatchId(saved.activeMatchId);
        if (typeof saved.elimInPlayoffs === "boolean") setElimInPlayoffs(saved.elimInPlayoffs);
        if (typeof saved.showStandings === "boolean") setShowStandings(saved.showStandings);
        if (typeof saved.showLeaders === "boolean") setShowLeaders(saved.showLeaders);
        if (saved.leagueLeaders) {
          setLeagueLeaders(saved.leagueLeaders);
          leagueLeadersRepairNeededRef.current = true;
        }
        if (saved.seasonHighs) setSeasonHighs(saved.seasonHighs);
        if (saved.playoffLeaders) setPlayoffLeaders(saved.playoffLeaders);
        if (saved.playoffHighs) setPlayoffHighs(saved.playoffHighs);
        if (saved.finalsLeaders) setFinalsLeaders(saved.finalsLeaders);
        if (typeof saved.showPlayoffLeaders === "boolean") setShowPlayoffLeaders(saved.showPlayoffLeaders);
        if (saved.playoffLeadersView) setPlayoffLeadersView(saved.playoffLeadersView);
        if (saved.teamStatsPerMode) setTeamStatsPerMode(saved.teamStatsPerMode);
        if (saved.teamSeasonHighs) setTeamSeasonHighs(saved.teamSeasonHighs);
        if (saved.teamPlayoffHighs) setTeamPlayoffHighs(saved.teamPlayoffHighs);
        if (Array.isArray(saved.gamePogs)) setGamePogs(saved.gamePogs);
        if (saved.allStarVotes && typeof saved.allStarVotes === "object") setAllStarVotes(saved.allStarVotes);
        if (saved.mvpVotes && typeof saved.mvpVotes === "object") setMvpVotes(saved.mvpVotes);
        if (saved.dpoyVotes && typeof saved.dpoyVotes === "object") setDpoyVotes(saved.dpoyVotes);
        if (saved.allStarSelections && typeof saved.allStarSelections === "object") {
          setAllStarSelections(saved.allStarSelections);
          if (saved.phase === "allStarBreak") allStarComputedRef.current = true;
        }
        if (Array.isArray(saved.achievementsUnlocked)) setUnlockedAchievements(saved.achievementsUnlocked);
        if (Array.isArray(saved.seasonGameResults)) setSeasonGameResults(saved.seasonGameResults);
        if (Array.isArray(saved.gameHistory)) setGameHistory(saved.gameHistory);
        if (saved.lastEliminatorTeamName != null) setLastEliminatorTeamName(saved.lastEliminatorTeamName);

        restored =
          !!saved.inSeason ||
          !!saved.bracket ||
          hasRealPhase ||
          !!(saved.season && saved.season.gp > 0);
      }

      // Only apply ?roster= if we did NOT restore an in-progress season/playoffs
      if (!restored) {
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
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }, [playerPool]);

  // Persist team + season state whenever it changes. Defer by one tick so all batched
  // state updates (e.g. leagueLeaders after a game) have committed before we save.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = setTimeout(() => {
      try {
        const rosterIds = {};
        POSITIONS.forEach((pos) => {
          rosterIds[pos] = roster[pos]?.id ?? null;
        });
        // When result is set, we've just finished a game — save next game to play (gameNum+1)
        const nextGameToPlay = result && gameNum < SEASON_LENGTH ? gameNum + 1 : gameNum;
        const payload = {
          teamName: myTeamName,
          leagueName: leagueName || "NBA",
          roster: rosterIds,
          difficulty,
          phase,
          season,
          schedule,
          scheduleHome,
          aiTeams,
          gameNum: nextGameToPlay,
          inSeason,
          bracket,
          playoffResult,
          activeMatchId,
          elimInPlayoffs,
          showStandings,
          showLeaders,
          leagueLeaders,
          seasonHighs,
          playoffLeaders,
          playoffHighs,
          finalsLeaders,
          showPlayoffLeaders,
          playoffLeadersView,
          teamStatsPerMode,
          teamSeasonHighs,
          teamPlayoffHighs,
          seasonNumber,
          careerStats,
          playerAwards,
          careerTeamHighs,
          careerLeagueHighs,
          currentSaveSlot,
          gamePogs,
          allStarVotes,
          allStarSelections,
          mvpVotes,
          dpoyVotes,
          achievementsUnlocked: unlockedAchievements,
          seasonGameResults: seasonGameResults || [],
          gameHistory: gameHistory || [],
          lastEliminatorTeamName: lastEliminatorTeamName || null,
        };
        const saveKey = currentSaveSlot ? `nba_budget_ball_save_${currentSaveSlot}` : "nba-budget-ball-state";
        window.localStorage.setItem(saveKey, JSON.stringify(payload));
        window.localStorage.setItem("nba_budget_ball_last_key", saveKey);
      } catch {
        // ignore localStorage issues
      }
    }, 0);
    return () => clearTimeout(id);
  }, [roster, myTeamName, leagueName, difficulty, phase, season, schedule, scheduleHome, aiTeams, gameNum, result, inSeason, bracket, playoffResult, activeMatchId, elimInPlayoffs, showStandings, showLeaders, leagueLeaders, seasonHighs, playoffLeaders, playoffHighs, finalsLeaders, showPlayoffLeaders, playoffLeadersView, teamStatsPerMode, teamSeasonHighs, teamPlayoffHighs, seasonNumber, careerStats, playerAwards, careerTeamHighs, careerLeagueHighs, currentSaveSlot, gamePogs, allStarVotes, allStarSelections, mvpVotes, dpoyVotes, unlockedAchievements, seasonGameResults, gameHistory, lastEliminatorTeamName]);

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

  const dismissTutorial = useCallback(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
      }
    } catch (_) {}
    setShowTutorial(false);
  }, []);

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

  const getSaveKey = useCallback((slot) => `nba_budget_ball_save_${slot}`, []);

  const getSlotSummaries = useCallback(() => {
    if (typeof window === "undefined") return [];
    return [1, 2, 3].map((slot) => {
      try {
        const raw = window.localStorage.getItem(getSaveKey(slot));
        if (!raw) return { slot, empty: true };
        const s = JSON.parse(raw);
        const phase = s.phase || "";
        const sn = s.seasonNumber ?? 0;
        const gn = s.gameNum ?? 1;
        const teamName = s.teamName || "—";
        const w = s.season?.w ?? 0;
        const l = s.season?.l ?? 0;
        const gp = (s.season?.gp ?? 0) || (w + l);
        const record = gp > 0 ? `${w}–${l}` : "—";
        const chips = s.careerStats?.championships ?? 0;
        const difficultyLabel = s.difficulty === "casual" ? "Casual" : s.difficulty === "hardcore" ? "Hardcore" : s.difficulty ? "Standard" : "";
        return { slot, empty: false, seasonNumber: sn, gameNum: gn, phase, teamName, record, championships: chips, difficultyLabel };
      } catch {
        return { slot, empty: true };
      }
    });
  }, [getSaveKey]);

  const loadFromSlot = useCallback((slot) => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(getSaveKey(slot));
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.currentSaveSlot != null) setCurrentSaveSlot(saved.currentSaveSlot);
      if (saved.teamName) setMyTeamName(saved.teamName);
      if (saved.leagueName) setLeagueName(saved.leagueName);
      if (saved.difficulty) setDifficulty(saved.difficulty);
      if (typeof saved.seasonNumber === "number") setSeasonNumber(saved.seasonNumber);
      if (saved.careerStats) setCareerStats(saved.careerStats);
      if (saved.playerAwards && typeof saved.playerAwards === "object") setPlayerAwards(saved.playerAwards);
      if (saved.careerTeamHighs && typeof saved.careerTeamHighs === "object") setCareerTeamHighs(saved.careerTeamHighs);
      if (saved.careerLeagueHighs && typeof saved.careerLeagueHighs === "object") setCareerLeagueHighs(saved.careerLeagueHighs);
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
      if (saved.phase) setPhase(saved.phase);
      if (saved.season) setSeason(saved.season);
      if (saved.schedule) setSchedule(saved.schedule);
      if (saved.scheduleHome) setScheduleHome(saved.scheduleHome);
      if (saved.aiTeams) setAiTeams(saved.aiTeams);
      if (typeof saved.gameNum === "number") setGameNum(saved.gameNum);
      if (typeof saved.inSeason === "boolean") setInSeason(saved.inSeason);
      if (saved.bracket) setBracket(saved.bracket);
      if (saved.playoffResult) setPlayoffResult(saved.playoffResult);
      if (saved.activeMatchId != null) setActiveMatchId(saved.activeMatchId);
      if (typeof saved.elimInPlayoffs === "boolean") setElimInPlayoffs(saved.elimInPlayoffs);
      if (typeof saved.showStandings === "boolean") setShowStandings(saved.showStandings);
      if (typeof saved.showLeaders === "boolean") setShowLeaders(saved.showLeaders);
      if (saved.leagueLeaders) {
        setLeagueLeaders(saved.leagueLeaders);
        leagueLeadersRepairNeededRef.current = true;
      }
      if (saved.seasonHighs) setSeasonHighs(saved.seasonHighs);
      if (saved.playoffLeaders) setPlayoffLeaders(saved.playoffLeaders);
      if (saved.playoffHighs) setPlayoffHighs(saved.playoffHighs);
      if (saved.finalsLeaders) setFinalsLeaders(saved.finalsLeaders);
      if (typeof saved.showPlayoffLeaders === "boolean") setShowPlayoffLeaders(saved.showPlayoffLeaders);
      if (saved.playoffLeadersView) setPlayoffLeadersView(saved.playoffLeadersView);
      if (saved.teamStatsPerMode) setTeamStatsPerMode(saved.teamStatsPerMode);
      if (saved.teamSeasonHighs) setTeamSeasonHighs(saved.teamSeasonHighs);
      if (saved.teamPlayoffHighs) setTeamPlayoffHighs(saved.teamPlayoffHighs);
      if (Array.isArray(saved.gamePogs)) setGamePogs(saved.gamePogs);
      if (saved.allStarVotes && typeof saved.allStarVotes === "object") setAllStarVotes(saved.allStarVotes);
      if (saved.allStarSelections && typeof saved.allStarSelections === "object") {
        setAllStarSelections(saved.allStarSelections);
        if (saved.phase === "allStarBreak") allStarComputedRef.current = true;
      }
      if (Array.isArray(saved.seasonGameResults)) setSeasonGameResults(saved.seasonGameResults);
      if (Array.isArray(saved.gameHistory)) setGameHistory(saved.gameHistory);
      if (Array.isArray(saved.achievementsUnlocked)) setUnlockedAchievements(saved.achievementsUnlocked);
      else setUnlockedAchievements([]);
      if (saved.lastEliminatorTeamName != null) setLastEliminatorTeamName(saved.lastEliminatorTeamName);
      seasonEndRecordedRef.current = !!saved.season?.gp && saved.phase === "seasonEnd";
      playoffRecordedRef.current = !!saved.bracket?.champion;
      seasonAwardsRecordedRef.current = !!saved.season?.gp && saved.phase === "seasonEnd";
      restoredSessionRef.current = true;
      setCurrentSaveSlot(slot);
      setShowLoadModal(false);
      if (typeof window.localStorage.setItem === "function") window.localStorage.setItem("nba_budget_ball_last_key", getSaveKey(slot));
    } catch {
      window.alert("Could not load save.");
    }
  }, [playerPool, getSaveKey]);

  const goToMainMenu = useCallback(() => {
    setCurrentSaveSlot(null); // so auto-save won't overwrite the user's slot; loading a slot restores it
    setRoster({ PG: null, SG: null, SF: null, PF: null, C: null });
    setSchedule(null);
    setAiTeams([]);
    setSeason(emptySeason());
    setGameNum(1);
    setResult(null);
    setInSeason(false);
    setBracket(null);
    setPlayoffResult(null);
    setPhase("teamSetup");
    // Whole new save: reset career/franchise state so "Let's Build" starts at Season 1 with no prior records
    setSeasonNumber(0);
    setCareerStats({
      seasonsPlayed: 0,
      totalWins: 0,
      totalLosses: 0,
      championships: 0,
      finalsAppearances: 0,
      playoffAppearances: 0,
      bestSeasonWins: 0,
    });
    setPlayerAwards({});
    setCareerTeamHighs({});
    setCareerLeagueHighs({});
    setLeagueLeaders({});
    setSeasonHighs({});
    setTeamSeasonHighs({});
    setGamePogs(() => Array(SEASON_LENGTH).fill(null));
    setAllStarVotes({});
    setMvpVotes({});
    setDpoyVotes({});
    setAllStarSelections(null);
    setAllStarRetry(0);
    setUnlockedAchievements([]);
    setTeamPlayoffHighs({});
    setPlayoffLeaders({});
    setPlayoffHighs({});
    setFinalsLeaders({});
  }, []);

  const deleteSave = useCallback((slot) => {
    if (typeof window === "undefined") return;
    if (!window.confirm("Delete this save? This cannot be undone.")) return;
    try {
      window.localStorage.removeItem(getSaveKey(slot));
      if (currentSaveSlot === slot) {
        setCurrentSaveSlot(null);
        const other = [1, 2, 3].find((s) => s !== slot && window.localStorage.getItem(getSaveKey(s)));
        if (other != null) window.localStorage.setItem("nba_budget_ball_last_key", getSaveKey(other));
        else window.localStorage.removeItem("nba_budget_ball_last_key");
      }
      setShowLoadModal(false);
    } catch {
      window.alert("Could not delete save.");
    }
  }, [currentSaveSlot, getSaveKey]);

  const saveToSlot = useCallback((slot) => {
    setCurrentSaveSlot(slot);
    setShowSaveModal(false);
    setSaveOverwriteSlot(null);
    try {
      if (typeof window === "undefined") return;
      const rosterIds = {};
      POSITIONS.forEach((pos) => { rosterIds[pos] = roster[pos]?.id ?? null; });
      const nextGameToPlay = result && gameNum < SEASON_LENGTH ? gameNum + 1 : gameNum;
      const payload = {
        teamName: myTeamName, leagueName: leagueName || "NBA", roster: rosterIds, difficulty, phase, season, schedule, scheduleHome, aiTeams, gameNum: nextGameToPlay, inSeason,
        bracket, playoffResult, activeMatchId, elimInPlayoffs, showStandings, showLeaders, leagueLeaders, seasonHighs,
        playoffLeaders, playoffHighs, finalsLeaders, showPlayoffLeaders, playoffLeadersView, teamStatsPerMode,
        teamSeasonHighs, teamPlayoffHighs, seasonNumber, careerStats, playerAwards, careerTeamHighs, careerLeagueHighs, currentSaveSlot: slot,
        gamePogs, allStarSelections,
        achievementsUnlocked: unlockedAchievements,
        seasonGameResults: seasonGameResults || [],
        gameHistory: gameHistory || [],
        lastEliminatorTeamName: lastEliminatorTeamName || null,
      };
      window.localStorage.setItem(getSaveKey(slot), JSON.stringify(payload));
      window.localStorage.setItem("nba_budget_ball_last_key", getSaveKey(slot));
      setSaveToast(true);
      if (saveToastTimerRef.current) clearTimeout(saveToastTimerRef.current);
      saveToastTimerRef.current = setTimeout(() => { setSaveToast(false); saveToastTimerRef.current = null; }, 2000);
    } catch {
      window.alert("Could not save.");
    }
  }, [roster, myTeamName, difficulty, phase, season, schedule, scheduleHome, aiTeams, gameNum, result, inSeason, bracket, playoffResult, activeMatchId, elimInPlayoffs, showStandings, showLeaders, leagueLeaders, seasonHighs, playoffLeaders, playoffHighs, finalsLeaders, showPlayoffLeaders, playoffLeadersView, teamStatsPerMode, teamSeasonHighs, teamPlayoffHighs, seasonNumber, careerStats, playerAwards, careerTeamHighs, careerLeagueHighs, gamePogs, allStarSelections, unlockedAchievements, seasonGameResults, gameHistory, lastEliminatorTeamName, getSaveKey]);

  const handleSaveSlotClick = useCallback((slot, empty) => {
    if (empty) {
      saveToSlot(slot);
    } else {
      setSaveOverwriteSlot(slot);
    }
  }, [saveToSlot]);

  const [shareStatus, setShareStatus] = useState(null);
  const shareStatusTimerRef = useRef(null);
  const clearShareStatus = useCallback(() => {
    if (shareStatusTimerRef.current) clearTimeout(shareStatusTimerRef.current);
    shareStatusTimerRef.current = setTimeout(() => setShareStatus(null), 3000);
  }, []);
  const handleCopyTeamCode = useCallback(() => {
    const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
    const code = ids.join("-");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        setShareStatus({ type: "success", msg: "Code copied!" });
        clearShareStatus();
      }).catch(() => {
        window.prompt("Copy your team code:", code);
      });
    } else {
      window.prompt("Copy your team code:", code);
    }
  }, [roster, clearShareStatus]);
  const handleShareLineup = useCallback(async () => {
    const filled = POSITIONS.every((pos) => roster[pos]);
    if (!filled) {
      setShareStatus({ type: "error", msg: "Complete your lineup first" });
      clearShareStatus();
      return;
    }
    const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
    const code = ids.join("-");
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const name = (myTeamName && myTeamName.trim()) ? myTeamName.trim() : "my";
    const shareText = "🏀 Here's " + name + "'s lineup — paste the code to try it or build your own!\n🔗 Code: " + code + "\n▶ Play: " + origin;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    try {
      if (nav?.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
        await nav.share({ title: "NBA Budget Ball", text: shareText, url: origin });
        setShareStatus({ type: "success", msg: "Shared!" });
      } else {
        await nav?.clipboard?.writeText(shareText);
        setShareStatus({ type: "success", msg: "Copied to clipboard" });
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      try {
        await nav?.clipboard?.writeText(shareText);
        setShareStatus({ type: "success", msg: "Copied to clipboard" });
      } catch {
        window.prompt("Copy this message:", shareText);
        setShareStatus({ type: "info", msg: "Paste from the prompt above" });
      }
    }
    clearShareStatus();
  }, [roster, myTeamName, clearShareStatus]);

  const handleShareAchievement = useCallback(async (a) => {
    if (!a || !a.id) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareText = `Just unlocked ${a.icon || ""} ${a.label || ""} in NBA Budget Ball — ${a.desc || ""}\n\n▶ Play: ${origin}`;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    try {
      if (nav?.share && /mobile|android|iphone|ipad/i.test(navigator?.userAgent || "")) {
        await nav.share({ title: `${a.icon} ${a.label}`, text: shareText, url: origin });
        setShareStatus({ type: "success", msg: "✓ Link copied!" });
      } else {
        await nav?.clipboard?.writeText(shareText);
        setShareStatus({ type: "success", msg: "✓ Link copied!" });
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      try {
        await nav?.clipboard?.writeText(shareText);
        setShareStatus({ type: "success", msg: "✓ Link copied!" });
      } catch {
        window.prompt("Copy this message:", shareText);
        setShareStatus({ type: "info", msg: "Paste from the prompt above" });
      }
    }
    clearShareStatus();
  }, [clearShareStatus]);

  const handleCopyLineupImage = useCallback(async () => {
    const filled = POSITIONS.every((pos) => roster[pos]);
    if (!filled) {
      setShareStatus({ type: "error", msg: "Complete your lineup first" });
      clearShareStatus();
      return;
    }
    try {
      const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
      const code = ids.join("-");
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const blob = await generateLineupImageBlob(roster, myTeamName, origin, code);
      const nav = typeof navigator !== "undefined" ? navigator : null;
      // Always try clipboard first (user clicked "Copy Image")
      if (nav?.clipboard?.write) {
        try {
          await nav.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setShareStatus({ type: "success", msg: "Image copied!" });
          clearShareStatus();
          return;
        } catch (clipErr) {
          // Clipboard may fail (e.g. Firefox, or not in secure context) — fall through to download
        }
      }
      // Fallback: download the image
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "nba-budget-ball-lineup.png";
      a.click();
      URL.revokeObjectURL(a.href);
      setShareStatus({ type: "success", msg: "Image downloaded" });
    } catch (e) {
      if (e?.name === "AbortError") return;
      setShareStatus({ type: "error", msg: "Couldn't copy image" });
    }
    clearShareStatus();
  }, [roster, myTeamName, clearShareStatus]);

const soundtrackRef = useRef(null);
  const trackIndexRef = useRef(0);
  const soundOnRef = useRef(soundOn);
  const volumeRef = useRef(volume);
  const audioUnlockedRef = useRef(false);
  const seasonEndRecordedRef = useRef(false);
  const playoffRecordedRef = useRef(false);
  const seasonAwardsRecordedRef = useRef(false);
  const restoredSessionRef = useRef(false);
  const leagueLeadersRepairNeededRef = useRef(false);

  const SOUNDTRACK_TRACKS = ["/1.mp3", "/2.mp3", "/3.mp3", "/4.mp3"];

  soundOnRef.current = soundOn;
  volumeRef.current = volume;

  // Record career stats when season ends (one-time per season)
  useEffect(() => {
    if (phase !== "seasonEnd" || !season?.gp || !aiTeams?.length) return;
    if (seasonEndRecordedRef.current) return;
    seasonEndRecordedRef.current = true;
    const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
    const userRecord = { name: myTeamName, w: season.w, l: season.l, eff: 0, isPlayer: true, division: userMeta.division, conference: userMeta.conference };
    const all = [userRecord, ...aiTeams.map((t) => ({ ...t, isPlayer: false }))];
    const confTeams = all.filter((t) => t.conference === userMeta.conference).sort(standingsSort);
    const myRankInConf = confTeams.findIndex((t) => t.isPlayer) + 1;
    setCareerStats((prev) => ({
      ...prev,
      seasonsPlayed: prev.seasonsPlayed + 1,
      totalWins: prev.totalWins + (season.w || 0),
      totalLosses: prev.totalLosses + (season.l || 0),
      bestSeasonWins: Math.max(prev.bestSeasonWins, season.w || 0),
    }));
  }, [phase, season, aiTeams, myTeamName]);

  // Record player awards at season end (MVP, DPOY by vote; NBA1/2/3, DEF1/2 by formula)
  useEffect(() => {
    if (phase !== "seasonEnd" || !season?.gp || !aiTeams?.length || !leagueLeaders || Object.keys(leagueLeaders).length === 0) return;
    if (seasonAwardsRecordedRef.current) return;
    seasonAwardsRecordedRef.current = true;
    const teamWinPct = {};
    aiTeams.forEach((t) => {
      const gp = t.w + t.l;
      teamWinPct[t.name] = gp > 0 ? t.w / gp : 0.4;
    });
    teamWinPct[myTeamName] = season.gp > 0 ? season.w / season.gp : 0.4;
    const leaderEntries = Object.values(leagueLeaders);
    const leagueRows = leaderEntries.map((p) => {
      const gp = p.gp || 1;
      return {
        ...p,
        name: p.name,
        team: p.team,
        pos: p.pos,
        gp,
        ppg: p.pts / gp,
        rpg: p.reb / gp,
        apg: p.ast / gp,
        spg: p.stl / gp,
        bpg: p.blk / gp,
        tpg: p.tov / gp,
        fgPct: p.fga > 0 ? (p.fgm / p.fga) * 100 : 0,
        tpPct: p.tpa > 0 ? (p.tpm / p.tpa) * 100 : 0,
        teamPct: teamWinPct[p.team] ?? 0.4,
      };
    });
    const maxOf = (key) => Math.max(1, ...leagueRows.map((r) => r[key] || 0));
    const maxPPG = maxOf("ppg"), maxRPG = maxOf("rpg"), maxAPG = maxOf("apg");
    const maxSPG = maxOf("spg"), maxBPG = maxOf("bpg"), maxTPG = maxOf("tpg");
    const maxFG = maxOf("fgPct"), max3P = maxOf("tpPct");
    leagueRows.forEach((r) => {
      r.mvpScore = (r.ppg / maxPPG) * 3 + (r.apg / maxAPG) * 2 + (r.rpg / maxRPG) * 1.2 + (r.fgPct / maxFG) * 1.5 + (r.tpPct / max3P) * 0.8 + r.teamPct * 3 - (r.tpg / maxTPG) * 1;
      r.dpoyScore = (r.spg / maxSPG) * 3 + (r.bpg / maxBPG) * 2 + (r.rpg / maxRPG) * 1;
    });
    const voteLeader = (votesMap) => {
      if (!votesMap || Object.keys(votesMap).length === 0) return null;
      const ent = Object.entries(votesMap).reduce((best, [key, v]) => (!best || (Number(v) || 0) > (Number(best[1]) || 0) ? [key, v] : best), null);
      return ent ? ent[0].split("|")[0] : null;
    };
    const mvpNameByVotes = voteLeader(mvpVotes);
    const dpoyNameByVotes = voteLeader(dpoyVotes);
    const leagueMVP = leagueRows.reduce((best, r) => (!best || r.mvpScore > best.mvpScore ? r : best), null);
    const leagueDPOY = leagueRows.reduce((best, r) => (!best || r.dpoyScore > best.dpoyScore ? r : best), null);
    const myTeamRows = leagueRows.filter((r) => r.team === myTeamName);
    const teamMVP = myTeamRows.length > 0 ? myTeamRows.reduce((best, r) => (!best || r.mvpScore > best.mvpScore ? r : best), null) : null;
    const allNBA = buildAllNBATeams(leagueRows, teamWinPct, mvpVotes);
    const allDefensive = buildAllDefensiveTeams(leagueRows, teamWinPct, dpoyVotes);
    const toAdd = [];
    if (mvpNameByVotes) toAdd.push([mvpNameByVotes, "MVP"]);
    else if (leagueMVP?.name) toAdd.push([leagueMVP.name, "MVP"]);
    if (dpoyNameByVotes) toAdd.push([dpoyNameByVotes, "DPOY"]);
    else if (leagueDPOY?.name) toAdd.push([leagueDPOY.name, "DPOY"]);
    if (teamMVP?.name) toAdd.push([teamMVP.name, "TMVP"]);
    allNBA.first.forEach((p) => toAdd.push([p.name, "NBA1"]));
    allNBA.second.forEach((p) => toAdd.push([p.name, "NBA2"]));
    allNBA.third.forEach((p) => toAdd.push([p.name, "NBA3"]));
    allDefensive.first.forEach((p) => toAdd.push([p.name, "DEF1"]));
    allDefensive.second.forEach((p) => toAdd.push([p.name, "DEF2"]));
    const myTeamAllNBA = [...allNBA.first, ...allNBA.second, ...allNBA.third].some((p) => p.team === myTeamName);
    if (myTeamAllNBA && unlockAchievementForSave("all_nba_winner")) setNewlyUnlockedAchievements((prev) => [...prev, "all_nba_winner"]);
    const myTeamAllDef = [...(allDefensive.first || []), ...(allDefensive.second || [])].some((p) => p.team === myTeamName);
    if (myTeamAllDef && unlockAchievementForSave("all_defensive_winner")) setNewlyUnlockedAchievements((prev) => [...prev, "all_defensive_winner"]);
    setPlayerAwards((prev) => {
      const next = { ...prev };
      toAdd.forEach(([name, award]) => {
        if (!name) return;
        next[name] = [...(next[name] || []), { season: seasonNumber, award }];
      });
      return next;
});
    }, [phase, season, aiTeams, myTeamName, leagueLeaders, seasonNumber, mvpVotes, dpoyVotes, unlockAchievementForSave]);

  // Achievements: check at season end and set newly unlocked for toast
  const maxWinStreak = useMemo(() => {
    let max = 0, cur = 0;
    (seasonGameResults || []).forEach(({ won }) => {
      if (won) { cur++; max = Math.max(max, cur); } else cur = 0;
    });
    return max;
  }, [seasonGameResults]);

  // Clinching: only true when mathematically locked (no one can catch you)
  const clinchStatus = useMemo(() => {
    if (!season?.gp || !aiTeams?.length) return { clinchedPlayoffs: false, clinchedPlayIn: false, clinchedTopSeed: false, clinchedDivision: false };
    const userW = season.w ?? 0, userL = season.l ?? 0;
    const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
    const all = [{ name: myTeamName, w: userW, l: userL, conference: userMeta.conference, division: userMeta.division }, ...(aiTeams || []).map((t) => ({ name: t.name, w: t.w, l: t.l, conference: t.conference, division: t.division }))];
    const gr = (t) => 82 - ((t.w || 0) + (t.l || 0));
    const conf = all.filter((t) => t.conference === userMeta.conference).sort((a, b) => (b.w - b.l) - (a.w - a.l));
    const userRank = conf.findIndex((t) => t.name === myTeamName) + 1;
    const seventh = conf[6], eleventh = conf[10], second = conf[1];
    const clinchedPlayoffs = userRank >= 1 && userRank <= 6 && seventh && userW >= (seventh.w || 0) + gr(seventh);
    const clinchedPlayIn = userRank >= 1 && userRank <= 10 && eleventh && userW >= (eleventh.w || 0) + gr(eleventh);
    const clinchedTopSeed = userRank === 1 && second && userW >= (second.w || 0) + gr(second);
    const divTeams = all.filter((t) => t.division === userMeta.division).sort((a, b) => (b.w - b.l) - (a.w - a.l));
    const divSecond = divTeams[1];
    const clinchedDivision = divTeams[0]?.name === myTeamName && divSecond && userW >= (divSecond.w || 0) + gr(divSecond);
    return { clinchedPlayoffs, clinchedPlayIn, clinchedTopSeed, clinchedDivision };
  }, [season, aiTeams, myTeamName]);

  // In-season achievements: pop as soon as they're earned (don't wait for season end)
  useEffect(() => {
    if (phase !== "game" && phase !== "allStarBreak") return;
    const unlocked = [];
    if (phase === "game" && season?.gp) {
      const userW = season.w ?? 0, userL = season.l ?? 0;
      if (userW >= 50 && unlockAchievementForSave("fifty_wins")) unlocked.push("fifty_wins");
      if (userW >= 60 && unlockAchievementForSave("sixty_wins")) unlocked.push("sixty_wins");
      if (userW >= 70 && unlockAchievementForSave("seventy_wins")) unlocked.push("seventy_wins");
      if (userW >= 74 && unlockAchievementForSave("curry_who")) unlocked.push("curry_who");
      if (maxWinStreak >= 10 && unlockAchievementForSave("win_streak_10")) unlocked.push("win_streak_10");
      const opponentsBeaten = new Set((seasonGameResults || []).filter((r) => r?.won && r?.oppName).map((r) => r.oppName));
      if (opponentsBeaten.size >= 29 && unlockAchievementForSave("beat_every_team")) unlocked.push("beat_every_team");
      if (userW > 41 && unlockAchievementForSave("winning_season")) unlocked.push("winning_season");
      if (userW + userL >= 82 && userW === 82 && unlockAchievementForSave("perfect_82")) unlocked.push("perfect_82");
      if (clinchStatus.clinchedTopSeed && unlockAchievementForSave("one_seed")) unlocked.push("one_seed");
      if (clinchStatus.clinchedPlayoffs && unlockAchievementForSave("first_playoff")) unlocked.push("first_playoff");
      if (clinchStatus.clinchedDivision && unlockAchievementForSave("clinched_division")) unlocked.push("clinched_division");
      const homeAway = (seasonGameResults || []).reduce((acc, r) => {
        if (r && r.home === true) acc.homeW += r.won ? 1 : 0; else if (r && r.home === false) acc.awayW += r.won ? 1 : 0;
        if (r && r.home === true) acc.homeL += r.won ? 0 : 1; else if (r && r.home === false) acc.awayL += r.won ? 0 : 1;
        return acc;
      }, { homeW: 0, homeL: 0, awayW: 0, awayL: 0 });
      if (homeAway.homeW === 41 && homeAway.homeL === 0 && unlockAchievementForSave("home_court")) unlocked.push("home_court");
      if (homeAway.awayW >= 25 && unlockAchievementForSave("road_warrior")) unlocked.push("road_warrior");
    }
    if (phase === "allStarBreak" && allStarSelections) {
      const myTeamAllStars = (() => {
        const east = [...(allStarSelections.east?.starters || []), ...(allStarSelections.east?.reserves || [])];
        const west = [...(allStarSelections.west?.starters || []), ...(allStarSelections.west?.reserves || [])];
        return east.concat(west).filter((p) => p?.team === myTeamName).length;
      })();
      if (myTeamAllStars >= 1 && unlockAchievementForSave("all_star_1")) unlocked.push("all_star_1");
      if (myTeamAllStars >= 2 && unlockAchievementForSave("all_star_2")) unlocked.push("all_star_2");
      if (myTeamAllStars >= 3 && unlockAchievementForSave("all_star_3")) unlocked.push("all_star_3");
      if (myTeamAllStars >= 4 && unlockAchievementForSave("all_star_4")) unlocked.push("all_star_4");
      if (myTeamAllStars >= 5 && unlockAchievementForSave("all_five_all_star")) unlocked.push("all_five_all_star");
      const myTeamAllStarStarters = (() => {
        const eastStarters = allStarSelections.east?.starters || [];
        const westStarters = allStarSelections.west?.starters || [];
        return eastStarters.concat(westStarters).filter((p) => p?.team === myTeamName).length;
      })();
      if (myTeamAllStarStarters >= 1 && unlockAchievementForSave("all_star_starter")) unlocked.push("all_star_starter");
      if (myTeamAllStarStarters >= 2 && unlockAchievementForSave("all_star_starter_2")) unlocked.push("all_star_starter_2");
    }
    if (unlocked.length > 0) setNewlyUnlockedAchievements((prev) => [...prev, ...unlocked]);
  }, [phase, season, seasonGameResults, aiTeams, myTeamName, allStarSelections, maxWinStreak, clinchStatus, unlockAchievementForSave]);

  useEffect(() => {
    if (phase !== "seasonEnd" || !season?.gp) return;
    const userW = season.w ?? 0, userL = season.l ?? 0;
    const myTeamAllStars = allStarSelections ? (() => {
      const east = [...(allStarSelections.east?.starters || []), ...(allStarSelections.east?.reserves || [])];
      const west = [...(allStarSelections.west?.starters || []), ...(allStarSelections.west?.reserves || [])];
      return east.concat(west).filter((p) => p?.team === myTeamName).length;
    })() : 0;
    const rosterNames = new Set(POSITIONS.map((p) => roster[p]).filter(Boolean).map((p) => p.name));
    const mvpName = (() => {
      if (mvpVotes && Object.keys(mvpVotes).length > 0) {
        const ent = Object.entries(mvpVotes).reduce((b, [k, v]) => (!b || (Number(v) || 0) > (Number(b[1]) || 0) ? [k, v] : b), null);
        return ent ? ent[0].split("|")[0] : null;
      }
      return null;
    })();
    const dpoyName = (() => {
      if (dpoyVotes && Object.keys(dpoyVotes).length > 0) {
        const ent = Object.entries(dpoyVotes).reduce((b, [k, v]) => (!b || (Number(v) || 0) > (Number(b[1]) || 0) ? [k, v] : b), null);
        return ent ? ent[0].split("|")[0] : null;
      }
      return null;
    })();
    const unlocked = [];
    if (userW + userL >= 82 && userW === 82 && unlockAchievementForSave("perfect_82")) unlocked.push("perfect_82");
    if (myTeamAllStars >= 1 && unlockAchievementForSave("all_star_1")) unlocked.push("all_star_1");
    if (myTeamAllStars >= 2 && unlockAchievementForSave("all_star_2")) unlocked.push("all_star_2");
    if (myTeamAllStars >= 3 && unlockAchievementForSave("all_star_3")) unlocked.push("all_star_3");
    if (myTeamAllStars >= 4 && unlockAchievementForSave("all_star_4")) unlocked.push("all_star_4");
    if (myTeamAllStars >= 5 && unlockAchievementForSave("all_five_all_star")) unlocked.push("all_five_all_star");
    const myTeamAllStarStarters = allStarSelections ? (() => {
      const eastStarters = allStarSelections.east?.starters || [];
      const westStarters = allStarSelections.west?.starters || [];
      return eastStarters.concat(westStarters).filter((p) => p?.team === myTeamName).length;
    })() : 0;
    if (myTeamAllStarStarters >= 1 && unlockAchievementForSave("all_star_starter")) unlocked.push("all_star_starter");
    if (myTeamAllStarStarters >= 2 && unlockAchievementForSave("all_star_starter_2")) unlocked.push("all_star_starter_2");
    if (maxWinStreak >= 10 && unlockAchievementForSave("win_streak_10")) unlocked.push("win_streak_10");
    if (mvpName && rosterNames.has(mvpName) && unlockAchievementForSave("mvp_winner")) unlocked.push("mvp_winner");
    if (dpoyName && rosterNames.has(dpoyName) && unlockAchievementForSave("dpoy_winner")) unlocked.push("dpoy_winner");
    const MIN_GP_STAT_TITLE = 41;
    const leaderEntries = Object.values(leagueLeaders || {}).filter((r) => r && (r.gp || 0) >= MIN_GP_STAT_TITLE);
    if (leaderEntries.length > 0) {
      const withPerGame = leaderEntries.map((p) => {
        const gp = p.gp || 1;
        return { ...p, ppg: (p.pts || 0) / gp, rpg: (p.reb || 0) / gp, apg: (p.ast || 0) / gp, spg: (p.stl || 0) / gp, bpg: (p.blk || 0) / gp };
      });
      const leaderFor = (key) => withPerGame.reduce((best, r) => (!best || (r[key] || 0) > (best[key] || 0) ? r : best), null);
      const ptsLeader = leaderFor("ppg"), rebLeader = leaderFor("rpg"), astLeader = leaderFor("apg"), stlLeader = leaderFor("spg"), blkLeader = leaderFor("bpg");
      if (ptsLeader && rosterNames.has(ptsLeader.name) && unlockAchievementForSave("scoring_title")) unlocked.push("scoring_title");
      if (rebLeader && rosterNames.has(rebLeader.name) && unlockAchievementForSave("rebounding_champion")) unlocked.push("rebounding_champion");
      if (astLeader && rosterNames.has(astLeader.name) && unlockAchievementForSave("assists_leader")) unlocked.push("assists_leader");
      if (stlLeader && rosterNames.has(stlLeader.name) && unlockAchievementForSave("steals_leader")) unlocked.push("steals_leader");
      if (blkLeader && rosterNames.has(blkLeader.name) && unlockAchievementForSave("blocks_leader")) unlocked.push("blocks_leader");
      const tpmLeader = leaderEntries.length > 0 ? withPerGame.reduce((best, r) => (!best || (r.tpm || 0) > (best.tpm || 0) ? r : best), null) : null;
      if (tpmLeader && rosterNames.has(tpmLeader.name) && unlockAchievementForSave("three_point_leader")) unlocked.push("three_point_leader");
      const teamEntries = leaderEntries.filter((r) => rosterNames.has(r.name));
      if (teamEntries.length > 0) {
        const teamWithPG = teamEntries.map((p) => { const gp = p.gp || 1; return { ...p, ppg: (p.pts || 0) / gp, rpg: (p.reb || 0) / gp, apg: (p.ast || 0) / gp, spg: (p.stl || 0) / gp, bpg: (p.blk || 0) / gp }; });
        const teamBest = (key) => teamWithPG.reduce((b, r) => (!b || (r[key] || 0) > (b[key] || 0) ? r : b), null);
        const tp = teamBest("ppg"), tr = teamBest("rpg"), ta = teamBest("apg"), tst = teamBest("spg"), tb = teamBest("bpg");
        if (tp && tr && ta && tst && tb && tp.name === tr.name && tr.name === ta.name && ta.name === tst.name && tst.name === tb.name && unlockAchievementForSave("all_league_leaders")) unlocked.push("all_league_leaders");
      }
    }
    const opponentsBeaten = new Set((seasonGameResults || []).filter((r) => r?.won && r?.oppName).map((r) => r.oppName));
    if (opponentsBeaten.size >= 29 && unlockAchievementForSave("beat_every_team")) unlocked.push("beat_every_team");
    const confRank = (() => {
      const all = [{ name: myTeamName, w: userW, l: userL, isPlayer: true }, ...(aiTeams || []).map((t) => ({ name: t.name, w: t.w, l: t.l, isPlayer: false }))];
      const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
      const conf = all.filter((t) => t.name === myTeamName || (aiTeams || []).find((a) => a.name === t.name)?.conference === userMeta.conference);
      conf.sort((a, b) => (b.w - b.l) - (a.w - a.l));
      const idx = conf.findIndex((t) => t.name === myTeamName);
      return idx >= 0 ? idx + 1 : 15;
    })();
    if (userW >= 50 && unlockAchievementForSave("fifty_wins")) unlocked.push("fifty_wins");
    if (userW >= 60 && unlockAchievementForSave("sixty_wins")) unlocked.push("sixty_wins");
    if (userW >= 70 && unlockAchievementForSave("seventy_wins")) unlocked.push("seventy_wins");
    if (userW >= 74 && unlockAchievementForSave("curry_who")) unlocked.push("curry_who");
    if (confRank === 1 && unlockAchievementForSave("one_seed")) unlocked.push("one_seed");
    if (userW > 41 && unlockAchievementForSave("winning_season")) unlocked.push("winning_season");
    const homeAway = (seasonGameResults || []).reduce((acc, r) => {
      if (r && r.home === true) acc.homeW += r.won ? 1 : 0; else if (r && r.home === false) acc.awayW += r.won ? 1 : 0;
      if (r && r.home === true) acc.homeL += r.won ? 0 : 1; else if (r && r.home === false) acc.awayL += r.won ? 0 : 1;
      return acc;
    }, { homeW: 0, homeL: 0, awayW: 0, awayL: 0 });
    if (homeAway.homeW === 41 && homeAway.homeL === 0 && unlockAchievementForSave("home_court")) unlocked.push("home_court");
    if (homeAway.awayW >= 25 && unlockAchievementForSave("road_warrior")) unlocked.push("road_warrior");
    if (seasonNumber >= 10 && unlockAchievementForSave("seasons_10")) unlocked.push("seasons_10");
    if (seasonNumber >= 20 && unlockAchievementForSave("seasons_20")) unlocked.push("seasons_20");
    if (seasonNumber >= 50 && unlockAchievementForSave("seasons_50")) unlocked.push("seasons_50");
    if (seasonNumber >= 100 && unlockAchievementForSave("seasons_100")) unlocked.push("seasons_100");
    if (unlocked.length > 0) setNewlyUnlockedAchievements((prev) => [...prev, ...unlocked]);
  }, [phase, season, allStarSelections, myTeamName, mvpVotes, dpoyVotes, roster, aiTeams, maxWinStreak, unlockAchievementForSave, seasonGameResults, seasonNumber, leagueLeaders]);

  const allStarComputedRef = useRef(false);
  useEffect(() => {
    if (phase !== "allStarBreak" || gameNum !== ALL_STAR_GAME_AT) return;
    // When user chose "sim through break", show the All-Star panel briefly then auto-continue.
    // Do NOT clear this timeout in effect cleanup: re-runs (e.g. leagueLeaders update) would cancel it and we'd never continue.
    if (simThroughBreakRequestedRef.current) {
      if (!allStarResumeTimeoutRef.current) {
        allStarResumeTimeoutRef.current = setTimeout(() => {
          allStarResumeTimeoutRef.current = null;
          simThroughBreakRequestedRef.current = false;
          allStarPendingSimCountRef.current = SEASON_LENGTH - ALL_STAR_GAME_AT;
          setPhase("game");
          setGameNum(ALL_STAR_GAME_AT + 1);
          setResult(null);
        }, 2200);
      }
      return;
    }
    if (allStarComputedRef.current) return;
    const run = () => {
      const leaderEntries = Object.values(leagueLeaders || {}).filter((r) => r && (r.gp || 0) > 0);
      if (leaderEntries.length === 0) {
        if (allStarRetry < 15) setTimeout(() => setAllStarRetry((c) => c + 1), 80);
        return;
      }
      const teamWinPct = {};
      if (season?.gp) teamWinPct[myTeamName] = season.w / Math.max(season.gp, 1);
      (aiTeams || []).forEach((t) => {
        const gl = (t.gameLog || []).slice(0, ALL_STAR_GAME_AT);
        const w = gl.filter((x) => x === 1).length;
        const l = gl.filter((x) => x === 0).length;
        const gp = w + l || 1;
        teamWinPct[t.name] = w / gp;
      });
      const conferenceTeams = { East: [], West: [] };
      const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
      conferenceTeams[userMeta.conference].push(myTeamName);
      (aiTeams || []).forEach((t) => {
        if (t.conference && conferenceTeams[t.conference]) conferenceTeams[t.conference].push(t.name);
      });
      const selections = buildAllStarSelections(leaderEntries, gamePogs.slice(0, ALL_STAR_GAME_AT), teamWinPct, conferenceTeams, allStarVotes);
      setAllStarSelections(selections);
      const toAdd = [];
      ["east", "west"].forEach((conf) => {
        [...(selections[conf].starters || []), ...(selections[conf].reserves || [])].forEach((p) => {
          if (p.name) toAdd.push([p.name, `AS-${conf === "east" ? "E" : "W"}-${p.allStarRole === "Starter" ? "S" : "R"}`]);
        });
      });
      setPlayerAwards((prev) => {
        const next = { ...prev };
        toAdd.forEach(([name, award]) => {
          if (!name) return;
          const list = next[name] || [];
          if (list.some((e) => e.season === seasonNumber && e.award === award)) return;
          next[name] = [...list, { season: seasonNumber, award }];
        });
        return next;
      });
      allStarComputedRef.current = true;
    };
    setTimeout(run, 0);
  }, [phase, gameNum, leagueLeaders, gamePogs, season, aiTeams, myTeamName, seasonNumber, allStarRetry, allStarVotes]);

  // After "sim through break", we land at game 51 with a pending sim count; run it once state has updated
  useEffect(() => {
    if (phase !== "game" || gameNum !== ALL_STAR_GAME_AT + 1 || allStarPendingSimCountRef.current == null) return;
    const count = allStarPendingSimCountRef.current;
    allStarPendingSimCountRef.current = null;
    runSimGames(count);
  }, [phase, gameNum]);

  // When we reach first round (or started in it): count as "made playoffs" and unlock first_playoff / play_in_survivor
  useEffect(() => {
    if (phase !== "playoffs" || !bracket) return;
    const nextId = getNextPlayerMatchId(bracket);
    if (!nextId) return;
    const isPlayIn = /-(pi1|pi2|pi3)$/.test(nextId);
    if (isPlayIn) return;
    setReachedFirstRoundThisPlayoffs(true);
    const ach = [];
    if (unlockAchievementForSave("first_playoff")) ach.push("first_playoff");
    if (playerPlayoffSeedThisYear >= 7 && playerPlayoffSeedThisYear <= 10 && unlockAchievementForSave("play_in_survivor")) ach.push("play_in_survivor");
    if (ach.length > 0) setNewlyUnlockedAchievements((prev) => [...prev, ...ach]);
  }, [phase, bracket, playerPlayoffSeedThisYear, unlockAchievementForSave]);

  // Record championships/finals when playoffs end (one-time per playoff) + CHAMP & FINALSMVP awards + playoffAppearances (first round only)
  useEffect(() => {
    if (phase !== "playoffs" || !bracket?.champion) return;
    if (playoffRecordedRef.current) return;
    playoffRecordedRef.current = true;
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 150);
    const wonChip = bracket.champion?.isPlayer === true;
    const madeFinals = bracket.finals?.top?.isPlayer || bracket.finals?.bot?.isPlayer;
    setCareerStats((prev) => ({
      ...prev,
      championships: prev.championships + (wonChip ? 1 : 0),
      finalsAppearances: prev.finalsAppearances + (madeFinals ? 1 : 0),
      playoffAppearances: prev.playoffAppearances + (reachedFirstRoundThisPlayoffs ? 1 : 0),
    }));
    // CHAMP: every player on champion lineup; FINALSMVP: best from finals leaders (champion team only) or fallback
    const champLineup = bracket.champion?.lineup || [];
    const champPlayerNames = new Set();
    champLineup.forEach(({ player }) => {
      if (player?.fullName) champPlayerNames.add(player.fullName);
      if (player?.name) champPlayerNames.add(player.name);
    });
    const toAdd = [];
    champLineup.forEach(({ player }) => {
      const name = player?.fullName || player?.name;
      if (name) toAdd.push([name, "CHAMP"]);
    });
    let finalsMVPName = null;
    const arr = Object.values(finalsLeaders || {}).filter((p) => p.team === bracket.champion?.name && champPlayerNames.has(p.name));
    if (arr.length > 0) {
      const withScore = arr.map((p) => {
        const gp = p.gp || 1;
        return { ...p, fmvpScore: (p.pts / gp) * 2 + (p.reb / gp) * 0.8 + (p.ast / gp) * 1.5 };
      });
      const best = withScore.reduce((a, b) => (a.fmvpScore > b.fmvpScore ? a : b));
      if (champPlayerNames.has(best.name)) finalsMVPName = best.name;
    }
    if (!finalsMVPName && champLineup.length) {
      const best = champLineup.reduce((a, b) => ((a?.player?.rating ?? 0) >= (b?.player?.rating ?? 0) ? a : b));
      finalsMVPName = best?.player?.fullName || best?.player?.name;
    }
    if (finalsMVPName) toAdd.push([finalsMVPName, "FINALSMVP"]);
    setPlayerAwards((prev) => {
      const next = { ...prev };
      toAdd.forEach(([name, award]) => {
        next[name] = [...(next[name] || []), { season: seasonNumber, award }];
      });
      return next;
    });
    const ach = [];
    if (wonChip && unlockAchievementForSave("first_championship")) ach.push("first_championship");
    const playoffUndefeated = (() => {
      if (!wonChip || !bracket) return false;
      let wins = 0, losses = 0;
      const collect = (matchup) => {
        if (!matchup?.games?.length) return;
        const topIsPlayer = matchup.top?.isPlayer, botIsPlayer = matchup.bot?.isPlayer;
        if (!topIsPlayer && !botIsPlayer) return;
        const ourIdx = topIsPlayer ? 0 : 1;
        matchup.games.forEach((g) => { if (g.winnerIdx === ourIdx) wins++; else losses++; });
      };
      ["east", "west"].forEach((conf) => {
        const sub = bracket[conf];
        if (!sub) return;
        [...(sub.playIn || []), ...(sub.firstRound || []), ...(sub.semis || [])].forEach(collect);
        if (sub.finals) collect(sub.finals);
      });
      if (bracket.finals) collect(bracket.finals);
      return losses === 0 && wins >= 4;
    })();
    if (wonChip && playoffUndefeated && unlockAchievementForSave("undefeated_playoffs")) ach.push("undefeated_playoffs");
    if (wonChip && (careerStats?.championships ?? 0) + 1 >= 3 && unlockAchievementForSave("three_peat")) ach.push("three_peat");
    if (wonChip && (careerStats?.championships ?? 0) + 1 >= 5 && unlockAchievementForSave("dynasty")) ach.push("dynasty");
    if (wonChip && playerPlayoffSeedThisYear >= 6 && playerPlayoffSeedThisYear <= 8 && unlockAchievementForSave("cinderella")) ach.push("cinderella");
    const rosterNames = new Set(POSITIONS.map((p) => roster[p]).filter(Boolean).map((p) => [p.name, p.fullName]).flat().filter(Boolean));
    const hasMVPAndDPOYThisSeason = rosterNames.size > 0 && Object.entries(playerAwards || {}).some(([name, list]) => {
      if (!rosterNames.has(name) || !list) return false;
      const hasMVP = list.some((e) => e.season === seasonNumber && e.award === "MVP");
      const hasDPOY = list.some((e) => e.season === seasonNumber && e.award === "DPOY");
      return hasMVP && hasDPOY;
    });
    if (wonChip && hasMVPAndDPOYThisSeason && unlockAchievementForSave("triple_crown")) ach.push("triple_crown");
    const finalsMVPOnOurTeam = wonChip && finalsMVPName && rosterNames.has(finalsMVPName);
    if (finalsMVPOnOurTeam && unlockAchievementForSave("finals_mvp_winner")) ach.push("finals_mvp_winner");
    const finalsLoser = bracket.finals?.top && bracket.champion ? (bracket.champion === bracket.finals.top ? bracket.finals.bot : bracket.finals.top) : null;
    if (wonChip && lastEliminatorTeamName && finalsLoser?.name === lastEliminatorTeamName && unlockAchievementForSave("revenge")) {
      ach.push("revenge");
      setLastEliminatorTeamName(null);
    }
    if (madeFinals && unlockAchievementForSave("make_finals")) ach.push("make_finals");
    if (wonChip && careerStats?.lastSeasonMadePlayoffs === false && unlockAchievementForSave("bounce_back")) ach.push("bounce_back");
    if (wonChip && teamsDefeatedInPlayoffs?.length > 0 && seasonGameResults?.length > 0) {
      const regWinsVs = {};
      (seasonGameResults || []).forEach((r) => {
        if (r?.won && r?.oppName) regWinsVs[r.oppName] = (regWinsVs[r.oppName] || 0) + 1;
      });
      const hasRivalry = teamsDefeatedInPlayoffs.some((opp) => (regWinsVs[opp] || 0) >= 4);
      if (hasRivalry && unlockAchievementForSave("rivalry")) ach.push("rivalry");
    }
    if (ach.length > 0) setNewlyUnlockedAchievements((prev) => [...prev, ...ach]);
    setCareerStats((prev) => ({ ...prev, lastSeasonMadePlayoffs: reachedFirstRoundThisPlayoffs }));
    setReachedFirstRoundThisPlayoffs(false);
    setPlayerPlayoffSeedThisYear(null);
    setTeamsDefeatedInPlayoffs([]);
  }, [phase, bracket, finalsLeaders, seasonNumber, careerStats, unlockAchievementForSave, playerPlayoffSeedThisYear, playerAwards, roster, lastEliminatorTeamName, reachedFirstRoundThisPlayoffs, teamsDefeatedInPlayoffs, seasonGameResults]);

  const pickNextTrack = useCallback((excludeIndex) => {
    const others = [0, 1, 2, 3].filter((i) => i !== excludeIndex);
    return others[Math.floor(Math.random() * others.length)];
  }, []);

  const skipSong = useCallback(() => {
    const audio = soundtrackRef.current;
    if (!audio) return;
    const next = pickNextTrack(trackIndexRef.current);
    trackIndexRef.current = next;
    audio.src = SOUNDTRACK_TRACKS[next];
    audio.volume = volumeRef.current;
    if (soundOnRef.current) audio.play().catch(() => {});
  }, [pickNextTrack]);

  // Background soundtrack: 4 tracks, random next (never same)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio(SOUNDTRACK_TRACKS[0]);
    audio.volume = volume;
    audio.preload = "auto";
    audio.load(); // start loading immediately so play() can start without delay
    const onEnded = () => {
      if (!soundOnRef.current) return;
      const next = pickNextTrack(trackIndexRef.current);
      trackIndexRef.current = next;
      audio.src = SOUNDTRACK_TRACKS[next];
      audio.volume = volumeRef.current;
      audio.play().catch(() => {});
    };
    audio.addEventListener("ended", onEnded);
    soundtrackRef.current = audio;
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      soundtrackRef.current = null;
    };
  }, [pickNextTrack]);

  // Unlock audio on first user interaction (browsers block autoplay until then)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      const audio = soundtrackRef.current;
      if (!audio || !soundOnRef.current) return;
      audio.play().then(() => {
        audioUnlockedRef.current = true;
      }).catch(() => {});
    };
    const events = ["click", "touchstart", "keydown"];
    const opts = { once: true, capture: true };
    events.forEach((e) => document.addEventListener(e, unlock, opts));
    return () => events.forEach((e) => document.removeEventListener(e, unlock, opts));
  }, []);

  useEffect(() => {
    const audio = soundtrackRef.current;
    if (!audio) return;
    volumeRef.current = volume;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = soundtrackRef.current;
    if (!audio) return;
    if (soundOn) {
      audio.src = SOUNDTRACK_TRACKS[trackIndexRef.current];
      audio.volume = volumeRef.current;
      audio.play().then(() => { audioUnlockedRef.current = true; }).catch(() => {});
    } else {
      audio.pause();
    }
  }, [soundOn]);

  const myIds=new Set(Object.values(roster).filter(Boolean).map(p=>p.id));
  const spent=Object.values(roster).reduce((s,p)=>s+(p?.cost||0),0);
  const rem=BUDGET-spent,filled=POSITIONS.filter(p=>roster[p]).length,full=filled===5;
  const openPositions = POSITIONS.filter((pos) => !roster[pos]);
  const remainingPerOpenSlot = openPositions.length > 0 ? Math.floor(rem / openPositions.length) : 0;
  const myLineup=full?POSITIONS.map(pos=>({player:roster[pos],slot:pos})):null;
  const myEffVal=myLineup?rf(teamEff(myLineup,teamRoster),1):null;
  const myCh=myLineup?chemBoost(myLineup,teamRoster):0;
  const myRecord={w:season.w,l:season.l,eff:myEffVal||0};

  const teamSeasonStats = (() => {
    const players = season.players || {};
    const names = Object.values(roster).filter(Boolean).map((p) => p.name);
    if (!season.gp || names.length === 0) return null;
    const tot = { gp: season.gp, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
    names.forEach((name) => {
      const p = players[name];
      if (!p) return;
      tot.pts += p.pts || 0;
      tot.reb += p.reb || 0;
      tot.ast += p.ast || 0;
      tot.stl += p.stl || 0;
      tot.blk += p.blk || 0;
      tot.tov += p.tov || 0;
      tot.fgm += p.fgm || 0;
      tot.fga += p.fga || 0;
      tot.tpm += p.tpm || 0;
      tot.tpa += p.tpa || 0;
      tot.ftm += p.ftm || 0;
      tot.fta += p.fta || 0;
    });
    return tot;
  })();

  const teamPlayoffStats = (() => {
    const list = Object.values(playoffLeaders || {}).filter((p) => p.team === myTeamName);
    if (list.length === 0) return null;
    const gp = list[0]?.gp || 0;
    if (!gp) return null;
    const tot = { gp, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
    list.forEach((p) => {
      tot.pts += p.pts || 0;
      tot.reb += p.reb || 0;
      tot.ast += p.ast || 0;
      tot.stl += p.stl || 0;
      tot.blk += p.blk || 0;
      tot.tov += p.tov || 0;
      tot.fgm += p.fgm || 0;
      tot.fga += p.fga || 0;
      tot.tpm += p.tpm || 0;
      tot.tpa += p.tpa || 0;
      tot.ftm += p.ftm || 0;
      tot.fta += p.fta || 0;
    });
    return tot;
  })();

  const playerSeasonRows = (() => {
    const players = season.players || {};
    return POSITIONS.map((pos) => roster[pos]).filter(Boolean).map((p) => {
      const s = players[p.name];
      if (!s || !s.gp) return null;
      return { name: p.name, pos: p.pos || pos, gp: s.gp, pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov, fgm: s.fgm, fga: s.fga, tpm: s.tpm, tpa: s.tpa, ftm: s.ftm, fta: s.fta };
    }).filter(Boolean);
  })();

  const playerPlayoffRows = (() => {
    const list = Object.values(playoffLeaders || {}).filter((p) => p.team === myTeamName);
    return list.map((p) => ({
      name: p.name,
      pos: p.pos,
      gp: p.gp || 1,
      pts: p.pts || 0,
      reb: p.reb || 0,
      ast: p.ast || 0,
      stl: p.stl || 0,
      blk: p.blk || 0,
      tov: p.tov || 0,
      fgm: p.fgm || 0,
      fga: p.fga || 0,
      tpm: p.tpm || 0,
      tpa: p.tpa || 0,
      ftm: p.ftm || 0,
      fta: p.fta || 0,
    }));
  })();

  const getPlayerSeasonLine = useCallback(
    (name, teamLabel) => {
      const key = playerVoteKey(name, teamLabel);
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

  const updateSeasonHighs = useCallback((res, teamALabel, teamBLabel, myTeam) => {
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
      setCareerLeagueHighs((cPrev) => {
        const cNext = { ...cPrev };
        Object.entries(next).forEach(([key, entry]) => {
          if (!entry || entry.val == null) return;
          const cur = cNext[key];
          const curVal = cur?.val ?? -Infinity;
          if (entry.val >= curVal) cNext[key] = { ...entry, season: seasonNumber };
        });
        return cNext;
      });
      return next;
    });
    if (myTeam && (teamALabel === myTeam || teamBLabel === myTeam)) {
      const myStats = teamALabel === myTeam ? res.myStats : res.oppStats;
      const statKeys = ["pts", "reb", "ast", "stl", "blk", "fgm", "tpm", "tov", "ftm"];
      setTeamSeasonHighs((prev) => {
        const next = { ...prev };
        myStats.forEach((s) => {
          if (!next[s.name]) next[s.name] = {};
          const p = next[s.name];
          statKeys.forEach((key) => {
            const v = s[key];
            if (v != null && (p[key] == null || v > p[key])) p[key] = v;
          });
        });
        setCareerTeamHighs((cPrev) => {
          const cNext = { ...cPrev };
          myStats.forEach((s) => {
            if (!cNext[s.name]) cNext[s.name] = {};
            statKeys.forEach((key) => {
              const v = next[s.name]?.[key];
              if (v == null) return;
              const cur = cNext[s.name][key];
              const curVal = cur && typeof cur.value === "number" ? cur.value : -Infinity;
              if (v >= curVal) cNext[s.name][key] = { value: v, season: seasonNumber };
            });
          });
          return cNext;
        });
        return next;
      });
    }
  }, [seasonNumber]);

  const updatePlayoffLeaders = useCallback((res, teamALabel, teamBLabel) => {
    if (!res) return;
    setPlayoffLeaders((prev) => {
      const next = { ...prev };
      const applyTeam = (stats, teamLabel) => {
        stats.forEach((s) => {
          const key = playerVoteKey(s.name, teamLabel);
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

  const updateFinalsLeaders = useCallback((res, teamALabel, teamBLabel) => {
    if (!res) return;
    setFinalsLeaders((prev) => {
      const next = { ...prev };
      const applyTeam = (stats, teamLabel) => {
        stats.forEach((s) => {
          const key = playerVoteKey(s.name, teamLabel);
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

  const updatePlayoffHighs = useCallback((res, teamALabel, teamBLabel, myTeam) => {
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
              next[key] = { val, name: s.name, team, pos: s.pos, season: seasonNumber };
            }
          });
        });
      };
      apply(res.myStats, teamALabel);
      apply(res.oppStats, teamBLabel);
      return next;
    });
    if (myTeam && (teamALabel === myTeam || teamBLabel === myTeam)) {
      const myStats = teamALabel === myTeam ? res.myStats : res.oppStats;
      setTeamPlayoffHighs((prev) => {
        const next = { ...prev };
        myStats.forEach((s) => {
          if (!next[s.name]) next[s.name] = {};
          const p = next[s.name];
          ["pts", "reb", "ast", "stl", "blk", "fgm", "tpm", "tov", "ftm"].forEach((key) => {
            const v = s[key];
            if (v != null && (p[key] == null || v > p[key])) p[key] = v;
          });
        });
        return next;
      });
    }
  }, [seasonNumber]);

  const updateLeagueLeaders = useCallback((res, myTeamLabel, oppTeamLabel, dayIndex) => {
    if (!res || dayIndex == null) return;
    setLeagueLeaders((prev) => {
      const next = { ...prev };
      const applyTeam = (stats, teamLabel) => {
        stats.forEach((s) => {
          const key = playerVoteKey(s.name, teamLabel);
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

  // After load, sync user's team in leagueLeaders from season.players (authoritative source).
  // Fixes: saved leagueLeaders missing games, or save taken before leagueLeaders updated.
  // Only runs once per load (leagueLeadersRepairNeededRef) so we never overwrite games played after load.
  useEffect(() => {
    if (!leagueLeadersRepairNeededRef.current) return;
    if (!inSeason && phase !== "game" && phase !== "seasonEnd") return;
    const wantGp = season?.gp ?? 0;
    if (wantGp <= 0 || !myTeamName || !roster) return;
    leagueLeadersRepairNeededRef.current = false;
    const players = season?.players || {};
    setLeagueLeaders((prev) => {
      let changed = false;
      const next = { ...prev };
      POSITIONS.forEach((pos) => {
        const p = roster[pos];
        if (!p) return;
        const key = playerVoteKey(p.name, myTeamName);
        const play = players[p.name];
        const wantPts = play?.pts ?? 0, wantReb = play?.reb ?? 0, wantAst = play?.ast ?? 0;
        const wantStl = play?.stl ?? 0, wantBlk = play?.blk ?? 0, wantTov = play?.tov ?? 0;
        const wantFgm = play?.fgm ?? 0, wantFga = play?.fga ?? 0, wantTpm = play?.tpm ?? 0, wantTpa = play?.tpa ?? 0;
        const wantFtm = play?.ftm ?? 0, wantFta = play?.fta ?? 0;
        const cur = next[key];
        const curGp = cur?.gp ?? 0;
        if (curGp === wantGp && cur?.pts === wantPts && cur?.reb === wantReb) return;
        next[key] = {
          name: p.name,
          team: myTeamName,
          pos: cur?.pos ?? p.pos,
          gp: wantGp,
          pts: wantPts,
          reb: wantReb,
          ast: wantAst,
          stl: wantStl,
          blk: wantBlk,
          tov: wantTov,
          fgm: wantFgm,
          fga: wantFga,
          tpm: wantTpm,
          tpa: wantTpa,
          ftm: wantFtm,
          fta: wantFta,
          lastDay: wantGp - 1,
        };
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [inSeason, phase, season, season?.gp, season?.players, myTeamName, roster]);

  // Simulate all non-user games for a given game index (0-based).
  // When currentAiTeams is passed (e.g. from simGames batch), returns { nextAiTeams, voteDeltas } so caller can merge AI votes into accVotes.
  const computeOneDayResults = useCallback((prev, dayIndex, oppIndex, userWon) => {
    if (!Array.isArray(prev) || prev.length === 0) return { nextAiTeams: prev, voteDeltas: {} };
    const next = prev.map((t) => ({
      ...t,
      gameLog: [...(t.gameLog || Array(SEASON_LENGTH).fill(null))],
    }));
    if (oppIndex != null && next[oppIndex]) next[oppIndex].gameLog[dayIndex] = userWon ? 0 : 1;
    const pool = [];
    for (let i = 0; i < NUM_TEAMS - 1; i++) {
      if (i === oppIndex) continue;
      if (!next[i]) continue;
      pool.push(i);
    }
    for (let k = pool.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      [pool[k], pool[r]] = [pool[r], pool[k]];
    }
    const aiVoteDeltas = {};
    const aiMvpDeltas = {};
    const aiDpoyDeltas = {};
    while (pool.length > 1) {
      const a = pool.pop();
      const b = pool.pop();
      const teamA = next[a];
      const teamB = next[b];
      if (!teamA || !teamB || !Array.isArray(teamA.lineup) || !Array.isArray(teamB.lineup)) continue;
      const res = simulate(teamA.lineup, teamB.lineup, teamRoster, { difficulty });
      if (!res) continue;
      const aWon = res.myScore > res.oppScore;
      next[a].gameLog[dayIndex] = aWon ? 1 : 0;
      next[b].gameLog[dayIndex] = aWon ? 0 : 1;
      updateLeagueLeaders(res, teamA.name, teamB.name, dayIndex);
      updateSeasonHighs(res, teamA.name, teamB.name);
      const allStats = [
        ...(res.myStats || []).map((s) => ({ ...s, team: teamA.name })),
        ...(res.oppStats || []).map((s) => ({ ...s, team: teamB.name })),
      ];
      const pog = allStats.length ? allStats.reduce((best, s) => (!best || gameScore(s) > gameScore(best) ? s : best), null) : null;
      const voteDeltas = computeAllStarVotesForGame(res, teamA.name, teamB.name, pog, aWon);
      Object.entries(voteDeltas || {}).forEach(([key, v]) => { aiVoteDeltas[key] = (aiVoteDeltas[key] || 0) + (Number(v) || 0); });
      const mvpD = computeMvpVotesForGame(res, teamA.name, teamB.name, pog, aWon);
      Object.entries(mvpD || {}).forEach(([key, v]) => { aiMvpDeltas[key] = (aiMvpDeltas[key] || 0) + (Number(v) || 0); });
      const dpoyD = computeDpoyVotesForGame(res, teamA.name, teamB.name, pog, aWon);
      Object.entries(dpoyD || {}).forEach(([key, v]) => { aiDpoyDeltas[key] = (aiDpoyDeltas[key] || 0) + (Number(v) || 0); });
    }
    for (let i = 0; i < next.length; i++) {
      const gl = next[i].gameLog || [];
      next[i].w = gl.filter((x) => x === 1).length;
      next[i].l = gl.filter((x) => x === 0).length;
    }
    return { nextAiTeams: next, voteDeltas: aiVoteDeltas, mvpDeltas: aiMvpDeltas, dpoyDeltas: aiDpoyDeltas };
  }, [teamRoster, updateLeagueLeaders, updateSeasonHighs]);

  const applyDayResults = useCallback(
    (dayIndex, oppIndex, userWon, currentAiTeams = null) => {
      if (currentAiTeams != null) {
        const { nextAiTeams, voteDeltas, mvpDeltas, dpoyDeltas } = computeOneDayResults(currentAiTeams, dayIndex, oppIndex, userWon);
        setAiTeams(nextAiTeams);
        if (Object.keys(voteDeltas || {}).length > 0) {
          setAllStarVotes((prev) => {
            const next = { ...prev };
            Object.entries(voteDeltas).forEach(([key, v]) => { next[key] = (next[key] || 0) + (Number(v) || 0); });
            return next;
          });
        }
        return { nextAiTeams, voteDeltas, mvpDeltas: mvpDeltas || {}, dpoyDeltas: dpoyDeltas || {} };
      }
      setAiTeams((prev) => {
        try {
          const { nextAiTeams, voteDeltas, mvpDeltas, dpoyDeltas } = computeOneDayResults(prev, dayIndex, oppIndex, userWon);
          if (Object.keys(voteDeltas || {}).length > 0) {
            setAllStarVotes((p) => {
              const n = { ...p };
              Object.entries(voteDeltas).forEach(([key, v]) => { n[key] = (n[key] || 0) + (Number(v) || 0); });
              return n;
            });
          }
          if (Object.keys(mvpDeltas || {}).length > 0) {
            setMvpVotes((p) => {
              const n = { ...p };
              Object.entries(mvpDeltas).forEach(([key, v]) => { n[key] = (n[key] || 0) + (Number(v) || 0); });
              return n;
            });
          }
          if (Object.keys(dpoyDeltas || {}).length > 0) {
            setDpoyVotes((p) => {
              const n = { ...p };
              Object.entries(dpoyDeltas).forEach(([key, v]) => { n[key] = (n[key] || 0) + (Number(v) || 0); });
              return n;
            });
          }
          return nextAiTeams;
        } catch (err) {
          console.error("applyDayResults error:", err);
          return prev;
        }
      });
      return undefined;
    },
    [computeOneDayResults, setAllStarVotes]
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
      setTimeout(() => {
        if (!restoredSessionRef.current) setPhase("teamSetup");
      }, 600);
    }).catch(err=>{setImportErr(err.message);setImportInfo("");});
  },[]);

 useEffect(()=>{ if(phase==="draft") getTopPicks().then(setTopPicks); },[phase]);

  const pickPlayer=useCallback((player)=>{
    if(inSeason)return;
    const targetSlot=slotSel||player.pos,prev=roster[targetSlot];
    const nameKey = player.fullName || player.name;
    const alreadyInRoster = Object.values(roster).some(
      (p) => p && (p.fullName || p.name) === nameKey && p.id !== player.id
    );
    if (alreadyInRoster) return;
    if((player.cost-(prev?.cost||0))>rem)return;
    if(prev?.id===player.id){setRoster(r=>({...r,[targetSlot]:null}));setSlotSel(null);return;}
    setRoster(r=>({...r,[targetSlot]:player}));setSlotSel(null);
  },[roster,rem,slotSel,inSeason]);

  const drop=slot=>{if(inSeason)return;setRoster(r=>({...r,[slot]:null}));if(slotSel===slot)setSlotSel(null);};

const startSeason = async () => {
  if(!full) return;
  setSeasonNumber((n) => (n <= 0 ? 1 : n + 1));
  const sched = buildSeasonSchedule();
  const teams = generateLeague(myLineup, playerPool, myTeamName);
  const ai = teams.slice(0, NUM_TEAMS - 1).map((t) => ({
    ...t,
    w: 0,
    l: 0,
    gameLog: Array(SEASON_LENGTH).fill(null),
  }));
  setSchedule(sched.schedule);
  setScheduleHome(sched.scheduleHome);
  setAiTeams(ai);
  setInSeason(true);
  setSeason(emptySeason());
  setGameNum(1);
  setResult(null);
  setPhase("game");
  setBracket(null);
  setPlayoffResult(null);
  setElimInPlayoffs(false);
  setLeagueLeaders({});
  setSeasonHighs({});
  setTeamSeasonHighs({});
  setGamePogs(() => Array(SEASON_LENGTH).fill(null));
    setAllStarVotes({});
    setMvpVotes({});
    setDpoyVotes({});
    setAllStarSelections(null);
    setAllStarRetry(0);
    allStarComputedRef.current = false;
    allStarPendingSimCountRef.current = null;
    if (allStarResumeTimeoutRef.current) {
      clearTimeout(allStarResumeTimeoutRef.current);
      allStarResumeTimeoutRef.current = null;
    }
    seasonEndRecordedRef.current = false;
  playoffRecordedRef.current = false;
  seasonAwardsRecordedRef.current = false;
  setSeasonGameResults([]);
  setGameHistory([]);
  await Promise.all(myLineup.map(({player})=>incrementPick(player.name)));
  getTopPicks().then(setTopPicks);
};

  const runItBack = () => {
    if (!full || !myLineup) return;
    if (phase === "seasonEnd") setCareerStats((prev) => ({ ...prev, lastSeasonMadePlayoffs: false }));
    setSeasonNumber((n) => n + 1);
    const sched = buildSeasonSchedule();
    // Keep same AI teams (names + lineups) so awards and league structure stay consistent across seasons
    const ai =
      aiTeams?.length >= NUM_TEAMS - 1
        ? aiTeams.slice(0, NUM_TEAMS - 1).map((t) => ({
            ...t,
            w: 0,
            l: 0,
            gameLog: Array(SEASON_LENGTH).fill(null),
          }))
        : (() => {
            const teams = generateLeague(myLineup, playerPool, myTeamName);
            return teams.slice(0, NUM_TEAMS - 1).map((t) => ({
              ...t,
              w: 0,
              l: 0,
              gameLog: Array(SEASON_LENGTH).fill(null),
            }));
          })();
    setSchedule(sched.schedule);
    setScheduleHome(sched.scheduleHome);
    setAiTeams(ai);
    setInSeason(true);
    setSeason(emptySeason());
    setGameNum(1);
    setResult(null);
    setPhase("game");
    setBracket(null);
    setPlayoffResult(null);
    setElimInPlayoffs(false);
    setLeagueLeaders({});
    setSeasonHighs({});
    setTeamSeasonHighs({});
    setGamePogs(() => Array(SEASON_LENGTH).fill(null));
    setAllStarVotes({});
    setMvpVotes({});
    setDpoyVotes({});
    setAllStarSelections(null);
    setSeasonGameResults([]);
    setGameHistory([]);
    setTeamsDefeatedInPlayoffs([]);
    setAllStarRetry(0);
    allStarComputedRef.current = false;
    allStarPendingSimCountRef.current = null;
    if (allStarResumeTimeoutRef.current) {
      clearTimeout(allStarResumeTimeoutRef.current);
      allStarResumeTimeoutRef.current = null;
    }
    seasonEndRecordedRef.current = false;
    playoffRecordedRef.current = false;
    seasonAwardsRecordedRef.current = false;
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const playGame = () => {
    if (!full || !schedule || gameNum > SEASON_LENGTH) return;
    const USER_INDEX = NUM_TEAMS - 1;
    const oppIndex = schedule[USER_INDEX][gameNum - 1];
    const opp = aiTeams[oppIndex];
    if (!opp) return;
    const winsBeforeThisGame = (careerStats?.totalWins ?? 0) + (season?.w ?? 0);
    const isHome = scheduleHome?.[USER_INDEX]?.[gameNum - 1] ?? null;
    const res = simulate(myLineup, opp.lineup, teamRoster, { difficulty, isHome });
    const won = res.myScore > res.oppScore;
    const uniqueStats = [...new Map(res.myStats.map((s) => [s.name, s])).values()];
    setSeason((s) => addToSeason(s, uniqueStats, won, res.myScore, res.oppScore));
    const dayIndex = gameNum - 1;
    applyDayResults(dayIndex, oppIndex, won);
    updateLeagueLeaders(res, myTeamName, opp?.name || "Opponent", dayIndex);
    updateSeasonHighs(res, myTeamName, opp?.name || "Opponent", myTeamName);
    const allStats = [
      ...(res.myStats || []).map((s) => ({ ...s, team: myTeamName })),
      ...(res.oppStats || []).map((s) => ({ ...s, team: opp?.name || "Opponent" })),
    ];
    const pog = allStats.length ? allStats.reduce((best, s) => (!best || gameScore(s) > gameScore(best) ? s : best), null) : null;
    if (pog) setGamePogs((prev) => { const n = [...prev]; n[dayIndex] = { name: pog.name, team: pog.team }; return n; });
    const voteDeltas = computeAllStarVotesForGame(res, myTeamName, opp?.name || "Opponent", pog, won);
    setAllStarVotes((prev) => {
      const next = { ...prev };
      Object.entries(voteDeltas).forEach(([key, v]) => { next[key] = (next[key] || 0) + (Number(v) || 0); });
      return next;
    });
    const mvpD = computeMvpVotesForGame(res, myTeamName, opp?.name || "Opponent", pog, won);
    Object.keys(mvpD || {}).length > 0 && setMvpVotes((prev) => {
      const next = { ...prev };
      Object.entries(mvpD).forEach(([key, v]) => { next[key] = (next[key] || 0) + (Number(v) || 0); });
      return next;
    });
    const dpoyD = computeDpoyVotesForGame(res, myTeamName, opp?.name || "Opponent", pog, won);
    Object.keys(dpoyD || {}).length > 0 && setDpoyVotes((prev) => {
      const next = { ...prev };
      Object.entries(dpoyD).forEach(([key, v]) => { next[key] = (next[key] || 0) + (Number(v) || 0); });
      return next;
    });
    setGameHistory((prev) => {
      const entry = { gameNum, oppName: opp?.name || "Opponent", myScore: res.myScore, oppScore: res.oppScore, won, myStats: res.myStats, oppStats: res.oppStats };
      return [entry, ...prev].slice(0, GAME_HISTORY_MAX);
    });
    const pogEntry = pog ? {
      name: pog.name,
      team: pog.team,
      pts: pog.pts, reb: pog.reb, ast: pog.ast, stl: pog.stl, blk: pog.blk,
      tpm: pog.tpm, tpa: pog.tpa,
    } : null;
    setSeasonGameResults((prev) => {
      const next = [...prev];
      next[dayIndex] = { oppName: opp?.name || "Opponent", home: isHome, myScore: res.myScore, oppScore: res.oppScore, won, pog: pogEntry };
      return next;
    });
    setResult(res);
    const ach = [];
    if (won && winsBeforeThisGame === 0 && unlockAchievementForSave("first_win")) ach.push("first_win");
    if (won && (res.myScore || 0) - (res.oppScore || 0) >= 40 && unlockAchievementForSave("blowout")) ach.push("blowout");
    if (won && (res.myScore || 0) - (res.oppScore || 0) >= 50 && unlockAchievementForSave("mega_blowout")) ach.push("mega_blowout");
    if (won && (res.ot || 0) > 0 && unlockAchievementForSave("overtime_win")) ach.push("overtime_win");
    const margin = (res.myScore || 0) - (res.oppScore || 0);
    if (won && margin >= 1 && margin <= 3 && unlockAchievementForSave("clutch")) ach.push("clutch");
    const with10Plus = (res.myStats || []).filter((s) => (s.pts || 0) >= 10).length;
    if (with10Plus >= 5 && unlockAchievementForSave("five_double_figures")) ach.push("five_double_figures");
    (res.myStats || []).forEach((s) => {
      const p = s.pts || 0, r = s.reb || 0, a = s.ast || 0, st = s.stl || 0, b = s.blk || 0;
      if (p >= 50 && !ach.includes("fifty_point_game") && unlockAchievementForSave("fifty_point_game")) ach.push("fifty_point_game");
      if (p >= 60 && !ach.includes("sixty_point_game") && unlockAchievementForSave("sixty_point_game")) ach.push("sixty_point_game");
      if (p >= 70 && !ach.includes("seventy_point_game") && unlockAchievementForSave("seventy_point_game")) ach.push("seventy_point_game");
      if (p >= 80 && !ach.includes("eighty_point_game") && unlockAchievementForSave("eighty_point_game")) ach.push("eighty_point_game");
      if (p >= 90 && !ach.includes("ninety_point_game") && unlockAchievementForSave("ninety_point_game")) ach.push("ninety_point_game");
      if (p >= 100 && !ach.includes("hundred_point_game") && unlockAchievementForSave("hundred_point_game")) ach.push("hundred_point_game");
      const tripleDouble = p >= 10 && r >= 10 && a >= 10;
      const quadDouble = tripleDouble && (st >= 10 || b >= 10);
      if (quadDouble && !ach.includes("quadruple_double") && unlockAchievementForSave("quadruple_double")) ach.push("quadruple_double");
      else if (tripleDouble && !ach.includes("triple_double") && unlockAchievementForSave("triple_double")) ach.push("triple_double");
      const doubleDouble = (p >= 10 && r >= 10 && a < 10) || (p >= 10 && a >= 10 && r < 10) || (r >= 10 && a >= 10 && p < 10);
      if (doubleDouble && !ach.includes("double_double") && unlockAchievementForSave("double_double")) ach.push("double_double");
      if (p >= 5 && r >= 5 && a >= 5 && st >= 5 && b >= 5 && !ach.includes("five_by_five") && unlockAchievementForSave("five_by_five")) ach.push("five_by_five");
      const two20 = (p >= 20 && r >= 20) || (p >= 20 && a >= 20) || (r >= 20 && a >= 20);
      const two30 = (p >= 30 && r >= 30) || (p >= 30 && a >= 30) || (r >= 30 && a >= 30);
      const two40 = (p >= 40 && r >= 40) || (p >= 40 && a >= 40) || (r >= 40 && a >= 40);
      const three20 = p >= 20 && r >= 20 && a >= 20;
      if (two20 && !ach.includes("twenty_twenty") && unlockAchievementForSave("twenty_twenty")) ach.push("twenty_twenty");
      if (two30 && !ach.includes("thirty_thirty") && unlockAchievementForSave("thirty_thirty")) ach.push("thirty_thirty");
      if (two40 && !ach.includes("forty_forty") && unlockAchievementForSave("forty_forty")) ach.push("forty_forty");
      if (three20 && !ach.includes("twenty_twenty_twenty") && unlockAchievementForSave("twenty_twenty_twenty")) ach.push("twenty_twenty_twenty");
    });
    if (ach.length > 0) setNewlyUnlockedAchievements((prev) => [...prev, ...ach]);
  };

  const nextGame = () => {
    if (gameNum >= SEASON_LENGTH) {
      setPhase("seasonEnd");
      return;
    }
    if (gameNum === ALL_STAR_GAME_AT) {
      setPhase("allStarBreak");
      return;
    }
    setGameNum((g) => g + 1);
    setResult(null);
  };

  const mergeGameIntoLeaders = (acc, res, myTeamLabel, oppTeamLabel) => {
    const applyTeam = (stats, teamLabel) => {
      (stats || []).forEach((s) => {
        const key = playerVoteKey(s.name, teamLabel);
        const cur = acc[key] || {
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
        acc[key] = {
          ...cur,
          pos: cur.pos || s.pos,
          gp: cur.gp + 1,
          pts: cur.pts + (s.pts || 0),
          reb: cur.reb + (s.reb || 0),
          ast: cur.ast + (s.ast || 0),
          stl: cur.stl + (s.stl || 0),
          blk: cur.blk + (s.blk || 0),
          tov: cur.tov + (s.tov || 0),
          fgm: cur.fgm + (s.fgm || 0),
          fga: cur.fga + (s.fga || 0),
          tpm: cur.tpm + (s.tpm || 0),
          tpa: cur.tpa + (s.tpa || 0),
          ftm: cur.ftm + (s.ftm || 0),
          fta: cur.fta + (s.fta || 0),
        };
      });
    };
    applyTeam(res.myStats, myTeamLabel);
    applyTeam(res.oppStats, oppTeamLabel);
  };

  const simGames = (count) => {
    if (!full || !schedule || !aiTeams?.length || gameNum > SEASON_LENGTH) {
      setIsSimulating(false);
      return;
    }
    let toPlay = Math.min(count, SEASON_LENGTH - gameNum + 1);
    if (gameNum <= ALL_STAR_GAME_AT && gameNum + toPlay > ALL_STAR_GAME_AT && !simThroughBreakRequestedRef.current) {
      toPlay = ALL_STAR_GAME_AT - gameNum + 1;
    }
    const accLeaders = {};
    Object.entries(leagueLeaders || {}).forEach(([key, entry]) => {
      if (entry && (entry.gp || 0) > 0) accLeaders[key] = { ...entry };
    });
    const accPogs = [...(gamePogs || Array(SEASON_LENGTH).fill(null))];
    const accVotes = { ...(allStarVotes || {}) };
    const accMvpVotes = { ...(mvpVotes || {}) };
    const accDpoyVotes = { ...(dpoyVotes || {}) };
    let accAiTeams = aiTeams ?? [];
    let accSeason = season ?? emptySeason();
    let localW = season?.w ?? 0;
    let localL = season?.l ?? 0;
    let localGp = season?.gp ?? 0;
    const accSimResults = [];
    const accSimHistory = [];
    const careerTotalWins = careerStats?.totalWins ?? 0;
    const accSimAchievements = [];
    try {
      for (let k = 0; k < toPlay; k++) {
        const totalWinsBeforeGame = careerTotalWins + localW;
        const g = gameNum + k;
        const USER_INDEX = NUM_TEAMS - 1;
        const oppIndex = schedule[USER_INDEX]?.[g - 1];
        const opp = oppIndex != null ? accAiTeams[oppIndex] : null;
        if (!opp?.lineup) continue;
        const isHome = scheduleHome?.[USER_INDEX]?.[g - 1] ?? null;
        const res = simulate(myLineup, opp.lineup, teamRoster, { difficulty, isHome });
        const won = res.myScore > res.oppScore;
        if (won && totalWinsBeforeGame === 0 && unlockAchievementForSave("first_win")) accSimAchievements.push("first_win");
        if (won && (res.myScore || 0) - (res.oppScore || 0) >= 40 && unlockAchievementForSave("blowout")) accSimAchievements.push("blowout");
        if (won && (res.myScore || 0) - (res.oppScore || 0) >= 50 && unlockAchievementForSave("mega_blowout")) accSimAchievements.push("mega_blowout");
        if (won && (res.ot || 0) > 0 && unlockAchievementForSave("overtime_win")) accSimAchievements.push("overtime_win");
        const simMargin = (res.myScore || 0) - (res.oppScore || 0);
        if (won && simMargin >= 1 && simMargin <= 3 && unlockAchievementForSave("clutch")) accSimAchievements.push("clutch");
        const simWith10 = (res.myStats || []).filter((s) => (s.pts || 0) >= 10).length;
        if (simWith10 >= 5 && unlockAchievementForSave("five_double_figures")) accSimAchievements.push("five_double_figures");
        (res.myStats || []).forEach((s) => {
          const p = s.pts || 0, r = s.reb || 0, a = s.ast || 0, st = s.stl || 0, b = s.blk || 0;
          if (p >= 50 && !accSimAchievements.includes("fifty_point_game") && unlockAchievementForSave("fifty_point_game")) accSimAchievements.push("fifty_point_game");
          if (p >= 60 && !accSimAchievements.includes("sixty_point_game") && unlockAchievementForSave("sixty_point_game")) accSimAchievements.push("sixty_point_game");
          if (p >= 70 && !accSimAchievements.includes("seventy_point_game") && unlockAchievementForSave("seventy_point_game")) accSimAchievements.push("seventy_point_game");
          if (p >= 80 && !accSimAchievements.includes("eighty_point_game") && unlockAchievementForSave("eighty_point_game")) accSimAchievements.push("eighty_point_game");
          if (p >= 90 && !accSimAchievements.includes("ninety_point_game") && unlockAchievementForSave("ninety_point_game")) accSimAchievements.push("ninety_point_game");
          if (p >= 100 && !accSimAchievements.includes("hundred_point_game") && unlockAchievementForSave("hundred_point_game")) accSimAchievements.push("hundred_point_game");
          const tripleDouble = p >= 10 && r >= 10 && a >= 10;
          const quadDouble = tripleDouble && (st >= 10 || b >= 10);
          if (quadDouble && !accSimAchievements.includes("quadruple_double") && unlockAchievementForSave("quadruple_double")) accSimAchievements.push("quadruple_double");
          else if (tripleDouble && !accSimAchievements.includes("triple_double") && unlockAchievementForSave("triple_double")) accSimAchievements.push("triple_double");
          const doubleDouble = (p >= 10 && r >= 10 && a < 10) || (p >= 10 && a >= 10 && r < 10) || (r >= 10 && a >= 10 && p < 10);
          if (doubleDouble && !accSimAchievements.includes("double_double") && unlockAchievementForSave("double_double")) accSimAchievements.push("double_double");
          if (p >= 5 && r >= 5 && a >= 5 && st >= 5 && b >= 5 && !accSimAchievements.includes("five_by_five") && unlockAchievementForSave("five_by_five")) accSimAchievements.push("five_by_five");
          const simTwo20 = (p >= 20 && r >= 20) || (p >= 20 && a >= 20) || (r >= 20 && a >= 20);
          const simTwo30 = (p >= 30 && r >= 30) || (p >= 30 && a >= 30) || (r >= 30 && a >= 30);
          const simTwo40 = (p >= 40 && r >= 40) || (p >= 40 && a >= 40) || (r >= 40 && a >= 40);
          const simThree20 = p >= 20 && r >= 20 && a >= 20;
          if (simTwo20 && !accSimAchievements.includes("twenty_twenty") && unlockAchievementForSave("twenty_twenty")) accSimAchievements.push("twenty_twenty");
          if (simTwo30 && !accSimAchievements.includes("thirty_thirty") && unlockAchievementForSave("thirty_thirty")) accSimAchievements.push("thirty_thirty");
          if (simTwo40 && !accSimAchievements.includes("forty_forty") && unlockAchievementForSave("forty_forty")) accSimAchievements.push("forty_forty");
          if (simThree20 && !accSimAchievements.includes("twenty_twenty_twenty") && unlockAchievementForSave("twenty_twenty_twenty")) accSimAchievements.push("twenty_twenty_twenty");
        });
        const uniqueStats = [...new Map(res.myStats.map((s) => [s.name, s])).values()];
        const dayIndex = g - 1;
        const allStats = [
          ...(res.myStats || []).map((s) => ({ ...s, team: myTeamName })),
          ...(res.oppStats || []).map((s) => ({ ...s, team: opp?.name || "Opponent" })),
        ];
        const pog = allStats.length ? allStats.reduce((best, s) => (!best || gameScore(s) > gameScore(best) ? s : best), null) : null;
        const pogEntry = pog ? {
          name: pog.name,
          team: pog.team,
          pts: pog.pts, reb: pog.reb, ast: pog.ast, stl: pog.stl, blk: pog.blk,
          tpm: pog.tpm, tpa: pog.tpa,
        } : null;
        accSimHistory.push({ gameNum: g, oppName: opp?.name || "Opponent", myScore: res.myScore, oppScore: res.oppScore, won, myStats: res.myStats, oppStats: res.oppStats });
        accSimResults.push({ oppName: opp?.name || "Opponent", home: isHome, myScore: res.myScore, oppScore: res.oppScore, won, pog: pogEntry });
        accSeason = addToSeason(accSeason, uniqueStats, won, res.myScore, res.oppScore);
        const dayResult = applyDayResults(dayIndex, oppIndex, won, accAiTeams);
        if (dayResult?.nextAiTeams) accAiTeams = dayResult.nextAiTeams;
        if (dayResult?.voteDeltas && Object.keys(dayResult.voteDeltas).length > 0) {
          Object.entries(dayResult.voteDeltas).forEach(([key, v]) => { accVotes[key] = (accVotes[key] || 0) + (Number(v) || 0); });
        }
        if (dayResult?.mvpDeltas && Object.keys(dayResult.mvpDeltas).length > 0) {
          Object.entries(dayResult.mvpDeltas).forEach(([key, v]) => { accMvpVotes[key] = (accMvpVotes[key] || 0) + (Number(v) || 0); });
        }
        if (dayResult?.dpoyDeltas && Object.keys(dayResult.dpoyDeltas).length > 0) {
          Object.entries(dayResult.dpoyDeltas).forEach(([key, v]) => { accDpoyVotes[key] = (accDpoyVotes[key] || 0) + (Number(v) || 0); });
        }
        updateLeagueLeaders(res, myTeamName, opp?.name || "Opponent", dayIndex);
        updateSeasonHighs(res, myTeamName, opp?.name || "Opponent", myTeamName);
        mergeGameIntoLeaders(accLeaders, res, myTeamName, opp?.name || "Opponent");
        localGp++;
        if (won) localW++; else localL++;
        if (pog) {
          accPogs[dayIndex] = { name: pog.name, team: pog.team };
          setGamePogs((prev) => { const n = [...prev]; n[dayIndex] = { name: pog.name, team: pog.team }; return n; });
        }
        const voteDeltas = computeAllStarVotesForGame(res, myTeamName, opp?.name || "Opponent", pog, won);
        Object.entries(voteDeltas).forEach(([key, v]) => { accVotes[key] = (accVotes[key] || 0) + (Number(v) || 0); });
        const mvpD = computeMvpVotesForGame(res, myTeamName, opp?.name || "Opponent", pog, won);
        Object.entries(mvpD || {}).forEach(([key, v]) => { accMvpVotes[key] = (accMvpVotes[key] || 0) + (Number(v) || 0); });
        const dpoyD = computeDpoyVotesForGame(res, myTeamName, opp?.name || "Opponent", pog, won);
        Object.entries(dpoyD || {}).forEach(([key, v]) => { accDpoyVotes[key] = (accDpoyVotes[key] || 0) + (Number(v) || 0); });
        setAllStarVotes((prev) => {
          const next = { ...prev };
          Object.entries(voteDeltas).forEach(([key, v]) => { next[key] = (next[key] || 0) + (Number(v) || 0); });
          return next;
        });
        setMvpVotes(() => ({ ...accMvpVotes }));
        setDpoyVotes(() => ({ ...accDpoyVotes }));
      }
      if (accSimResults.length > 0) setSeason(accSeason);
      if (accSimResults.length > 0) setSeasonGameResults((prev) => {
        const next = [...prev];
        accSimResults.forEach((r, i) => { next[gameNum - 1 + i] = r; });
        return next;
      });
      if (accSimHistory.length > 0) {
        const recent = accSimHistory.slice(-GAME_HISTORY_MAX).reverse();
        setGameHistory((prev) => [...recent, ...prev].slice(0, GAME_HISTORY_MAX));
      }
      if (accSimAchievements.length > 0) {
        const unique = [...new Set(accSimAchievements)];
        setNewlyUnlockedAchievements((prev) => [...prev, ...unique]);
      }
      const gamesActuallyPlayed = accSimResults.length;
      const lastGameNum = gamesActuallyPlayed > 0 ? gameNum + gamesActuallyPlayed - 1 : gameNum - 1;
      const nextGameNum = Math.min(gameNum + gamesActuallyPlayed, SEASON_LENGTH);
      const crossedAllStarBreak = gameNum <= ALL_STAR_GAME_AT && nextGameNum > ALL_STAR_GAME_AT;
      if (crossedAllStarBreak) {
        setGameNum(ALL_STAR_GAME_AT);
      } else {
        setGameNum(nextGameNum);
      }
      setResult(null);
      if (nextGameNum === ALL_STAR_GAME_AT || crossedAllStarBreak) {
        const leaderEntries = Object.values(accLeaders).filter((r) => r && (r.gp || 0) > 0);
        if (leaderEntries.length > 0) {
          const teamWinPct = { [myTeamName]: localGp > 0 ? localW / localGp : 0.5 };
          (aiTeams || []).forEach((t) => { teamWinPct[t.name] = 0.5; });
          const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
          const conferenceTeams = { East: [], West: [] };
          conferenceTeams[userMeta.conference].push(myTeamName);
          (aiTeams || []).forEach((t) => { if (t.conference && conferenceTeams[t.conference]) conferenceTeams[t.conference].push(t.name); });
          const selections = buildAllStarSelections(leaderEntries, accPogs.slice(0, ALL_STAR_GAME_AT), teamWinPct, conferenceTeams, accVotes);
          setAllStarSelections(selections);
          const toAdd = [];
          ["east", "west"].forEach((conf) => {
            [...(selections[conf].starters || []), ...(selections[conf].reserves || [])].forEach((p) => {
              if (p.name) toAdd.push([p.name, `AS-${conf === "east" ? "E" : "W"}-${p.allStarRole === "Starter" ? "S" : "R"}`]);
            });
          });
          setPlayerAwards((prev) => {
            const next = { ...prev };
            toAdd.forEach(([name, award]) => {
              if (!name) return;
              next[name] = [...(next[name] || []), { season: seasonNumber, award }];
            });
            return next;
          });
          allStarComputedRef.current = true;
        }
        setPhase("allStarBreak");
      } else if (lastGameNum >= SEASON_LENGTH) {
        setPhase("seasonEnd");
      }
    } catch (err) {
      console.error("Sim games error:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  const runSimGames = (count) => {
    if (!full || !schedule || !aiTeams?.length || gameNum > SEASON_LENGTH || isSimulating) return;
    setIsSimulating(true);
    setTimeout(() => simGames(count), 0);
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
    eastSeeds.forEach((t, i) => { t.playoffSeed = i + 1; });
    westSeeds.forEach((t, i) => { t.playoffSeed = i + 1; });
    const eastBracket = buildBracket(eastSeeds);
    const westBracket = buildBracket(westSeeds);
    const finalsMatchup = { id: "finals", top: null, bot: null, winner: null, games: [], label: "FINALS" };
    const newBracket = {
      east: eastBracket,
      west: westBracket,
      finals: finalsMatchup,
      champion: null,
    };
    const nextPlayerId = getNextPlayerMatchId(newBracket) || getNextAIMatchId(newBracket);
    const isPlayInSlot = nextPlayerId && /-(pi1|pi2|pi3)$/.test(nextPlayerId);
    const myConf = userMeta.conference;
    const seeds = myConf === "East" ? eastSeeds : westSeeds;
    const mySeed = seeds.findIndex((t) => t.isPlayer) + 1;
    if (mySeed >= 1 && mySeed <= 10) setPlayerPlayoffSeedThisYear(mySeed);
    setReachedFirstRoundThisPlayoffs(!isPlayInSlot && !!nextPlayerId);
    setBracket(newBracket);
    setPhase("playoffs");
    setPlayoffResult(null);
    setActiveMatchId(nextPlayerId || null);
    setElimInPlayoffs(false);
    setPlayoffLeaders({});
    setPlayoffHighs({});
    setFinalsLeaders({});
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
      updatePlayoffHighs(res, myTeamLabel, oppTeamLabel, myTeamName);
    } else {
      // AI vs AI playoff game: use full simulate so we get stats.
      res = simulate(matchup.top.lineup, matchup.bot.lineup, { ...tr, _playoff: true }, { difficulty: diff });
      winnerIdx = res.myScore > res.oppScore ? 0 : 1;
      updatePlayoffLeaders(res, matchup.top.name, matchup.bot.name);
      updatePlayoffHighs(res, matchup.top.name, matchup.bot.name);
    }
    matchup.games.push({ winnerIdx, myScore: res?.myScore, oppScore: res?.oppScore, res });
    const wTop = matchup.games.filter((g) => g.winnerIdx === 0).length;
    const wBot = matchup.games.filter((g) => g.winnerIdx === 1).length;
    let playerEliminated = false;
    const winsNeeded = slot.startsWith("pi") ? 1 : 4;
    if (wTop === winsNeeded || wBot === winsNeeded) {
      matchup.winner = wTop === winsNeeded ? matchup.top : matchup.bot;
      const w = matchup.winner;
      const playerLost = (topIsPlayer && wBot === winsNeeded) || (botIsPlayer && wTop === winsNeeded);
      // Play-in pi1 (7v8): loser gets another chance in pi3 — not eliminated yet. pi2/pi3 and all later rounds: loser is out.
      if (playerLost && slot !== "pi1") playerEliminated = true;
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
    const aiOnlyGame = !topIsPlayer && !botIsPlayer;
    const result = res
      ? { ...res, playerIsTop: topIsPlayer, matchId, seriesOver: !!matchup.winner, winner: matchup.winner, topName: matchup.top.name, botName: matchup.bot.name, aiOnly: aiOnlyGame }
      : { aiOnly: true, matchId, seriesOver: !!matchup.winner, winner: matchup.winner, topName: matchup.top?.name, botName: matchup.bot?.name };
    return { bracket: b, result, playerEliminated };
  }

  // Stage = same slot across both conferences (e.g. pi1 = east-pi1 + west-pi1). Order: pi1, pi2, pi3, fr1..fr4, sf1, sf2, confF, finals.
  const PLAYOFF_STAGE_ORDER = ["pi1", "pi2", "pi3", "fr1", "fr2", "fr3", "fr4", "sf1", "sf2", "confF", "finals"];

  function getStageKey(matchId) {
    if (!matchId) return null;
    if (matchId === "finals") return "finals";
    const parts = matchId.split("-");
    if (parts.length !== 2) return null;
    const slot = parts[1];
    if (slot === "f") return "confF";
    return slot;
  }

  function getMatchIdsForStage(stageKey) {
    if (stageKey === "finals") return ["finals"];
    if (stageKey === "confF") return ["east-f", "west-f"];
    return ["east-" + stageKey, "west-" + stageKey];
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

  // Earliest stage that has a pending AI-only match; never past the user's current stage (so we stop until user plays).
  function getCurrentStageMatchIds(b) {
    const playerMatchId = getNextPlayerMatchId(b);
    const maxStageIndex = playerMatchId != null
      ? (() => {
          const k = getStageKey(playerMatchId);
          const idx = PLAYOFF_STAGE_ORDER.indexOf(k);
          return idx >= 0 ? idx : PLAYOFF_STAGE_ORDER.length - 1;
        })()
      : PLAYOFF_STAGE_ORDER.length - 1;

    for (let i = 0; i <= maxStageIndex; i++) {
      const stageKey = PLAYOFF_STAGE_ORDER[i];
      const ids = getMatchIdsForStage(stageKey);
      const pending = ids.filter((matchId) => {
        const parsed = getPlayoffMatchup(b, matchId);
        const m = parsed?.matchup;
        if (!m || m.winner || !m.top || !m.bot) return false;
        if (m.top.isPlayer || m.bot.isPlayer) return false; // never sim user's game
        return true;
      });
      if (pending.length > 0) return pending;
    }
    return [];
  }

  function getNextAIMatchId(b) {
    const stage = getCurrentStageMatchIds(b);
    return stage.length > 0 ? stage[0] : null;
  }

  function getStageGroup(stageKey) {
    if (!stageKey) return null;
    if (stageKey.startsWith("pi")) return "pi";
    if (stageKey.startsWith("fr")) return "fr";
    if (stageKey.startsWith("sf")) return "sf";
    if (stageKey === "confF") return "confF";
    if (stageKey === "finals") return "finals";
    return stageKey;
  }

  function getRoundLabel(stageKey) {
    if (!stageKey) return "";
    if (stageKey.startsWith("pi")) return "Play-in";
    if (stageKey.startsWith("fr")) return "First round";
    if (stageKey.startsWith("sf")) return "Conference semis";
    if (stageKey === "confF") return "Conference finals";
    if (stageKey === "finals") return "Finals";
    return stageKey;
  }

  const playPlayoffGame=(matchId)=>{
    if(!bracket) return;
    const b = JSON.parse(JSON.stringify(bracket));
    const out = runOnePlayoffGame(b, matchId, teamRoster, myLineup, difficulty);
    if (out.playerEliminated) {
      setElimInPlayoffs(true);
      if (out.result?.winner?.name) setLastEliminatorTeamName(out.result.winner?.name);
      const parsed = getPlayoffMatchup(out.bracket, matchId);
      const m = parsed?.matchup;
      if (m?.games) {
        const ourIdx = m.top?.isPlayer ? 0 : 1;
        const ourWins = m.games.filter((g) => g.winnerIdx === ourIdx).length;
        if (ourWins >= 1 && unlockAchievementForSave("no_sweep")) setNewlyUnlockedAchievements((prev) => [...prev, "no_sweep"]);
      }
    }
    if (out.result?.winner?.isPlayer) {
      const prevPlayoffWins = careerStats?.playoffWins ?? 0;
      setCareerStats((prev) => ({ ...prev, playoffWins: (prev.playoffWins ?? 0) + 1 }));
      if (prevPlayoffWins === 0 && unlockAchievementForSave("first_playoff_win")) setNewlyUnlockedAchievements((prev) => [...prev, "first_playoff_win"]);
      const elimParsed = getPlayoffMatchup(out.bracket, matchId);
      const elimMatchup = elimParsed?.matchup;
      const elimSlot = elimParsed?.slot ?? (matchId === "finals" ? "finals" : (matchId.split("-")[1] || ""));
      const elimOurIdx = elimMatchup?.top?.isPlayer ? 0 : 1;
      const elimGames = elimMatchup?.games || [];
      const lastG = elimGames[elimGames.length - 1];
      const weWonThisGame = lastG && lastG.winnerIdx === elimOurIdx;
      const elimWinsNeeded = elimSlot.startsWith("pi") ? 1 : 4;
      const oppWinsBefore = elimGames.slice(0, -1).filter((g) => g.winnerIdx === 1 - elimOurIdx).length;
      const wasEliminationGame = elimSlot.startsWith("pi") || (elimWinsNeeded === 4 && oppWinsBefore === 3);
      if (weWonThisGame && wasEliminationGame && unlockAchievementForSave("elimination_win")) setNewlyUnlockedAchievements((prev) => [...prev, "elimination_win"]);
      if (out.result?.seriesOver && out.result?.topName && out.result?.botName) {
        const beaten = out.result.playerIsTop ? out.result.botName : out.result.topName;
        setTeamsDefeatedInPlayoffs((prev) => [...prev, beaten]);
        const ach = [];
        const parsed = getPlayoffMatchup(out.bracket, matchId);
        const m = parsed?.matchup;
        const playerSeed = m ? (out.result.playerIsTop ? m.top?.playoffSeed : m.bot?.playoffSeed) : null;
        const oppSeed = m ? (out.result.playerIsTop ? m.bot?.playoffSeed : m.top?.playoffSeed) : null;
        if (!out.result?.playerIsTop && playerSeed != null && oppSeed != null && playerSeed > oppSeed && unlockAchievementForSave("upset")) ach.push("upset");
        if (m?.games) {
          const ourIdx = m.top?.isPlayer ? 0 : 1;
          const games = m.games;
          const n = games.length;
          if (n === 4 && games.every((g) => g.winnerIdx === ourIdx) && unlockAchievementForSave("sweep")) ach.push("sweep");
          if (n === 7 && games[6].winnerIdx === ourIdx && unlockAchievementForSave("game_seven")) ach.push("game_seven");
          if (n === 7 && games[0].winnerIdx !== ourIdx && games[1].winnerIdx !== ourIdx && games[2].winnerIdx !== ourIdx && unlockAchievementForSave("reverse_sweep")) ach.push("reverse_sweep");
        }
        const slot = matchId === "finals" ? "finals" : (matchId.split("-")[1] || "");
        if ((slot === "sf1" || slot === "sf2") && unlockAchievementForSave("conference_finals")) ach.push("conference_finals");
        if (slot === "f" && unlockAchievementForSave("make_finals")) ach.push("make_finals");
        if ((slot === "fr1" || slot === "fr2" || slot === "fr3" || slot === "fr4") && unlockAchievementForSave("second_round")) ach.push("second_round");
        if (ach.length > 0) setNewlyUnlockedAchievements((prev) => [...prev, ...ach]);
        if (lastEliminatorTeamName && beaten === lastEliminatorTeamName && unlockAchievementForSave("revenge")) {
          setNewlyUnlockedAchievements((prev) => [...prev, "revenge"]);
          setLastEliminatorTeamName(null);
        }
      }
    }
    setBracket(out.bracket);
    setPlayoffResult(out.result);
    if (matchId === "finals" && out.result && out.result.myStats) {
      updateFinalsLeaders(out.result, out.result.topName, out.result.botName);
    }
  };

  const simMySeries = (matchId) => {
    if (!bracket || !teamRoster) return;
    const parsed = getPlayoffMatchup(bracket, matchId);
    const matchup = parsed?.matchup;
    if (!matchup || matchup.winner || !matchup.top?.isPlayer && !matchup.bot?.isPlayer) return;
    const winsNeeded = parsed?.slot?.startsWith("pi") ? 1 : 4;
    let b = JSON.parse(JSON.stringify(bracket));
    let lastResult = null;
    while (true) {
      const out = runOnePlayoffGame(b, matchId, teamRoster, myLineup, difficulty);
      b = out.bracket;
      lastResult = out.result;
      if (out.playerEliminated) {
        setElimInPlayoffs(true);
        if (out.result?.winner?.name) setLastEliminatorTeamName(out.result.winner?.name);
        const parsedEl = getPlayoffMatchup(b, matchId);
        const mel = parsedEl?.matchup;
        if (mel?.games) {
          const ourIdx = mel.top?.isPlayer ? 0 : 1;
          const ourWins = mel.games.filter((g) => g.winnerIdx === ourIdx).length;
          if (ourWins >= 1 && unlockAchievementForSave("no_sweep")) setNewlyUnlockedAchievements((prev) => [...prev, "no_sweep"]);
        }
      }
      if (out.result?.seriesOver && out.result?.winner?.isPlayer && lastEliminatorTeamName && (out.result.playerIsTop ? out.result.botName : out.result.topName) === lastEliminatorTeamName && unlockAchievementForSave("revenge")) {
        setNewlyUnlockedAchievements((prev) => [...prev, "revenge"]);
        setLastEliminatorTeamName(null);
      }
      if (out.result?.winner?.isPlayer) {
        const simElimParsed = getPlayoffMatchup(b, matchId);
        const simElimM = simElimParsed?.matchup;
        const simElimSlot = simElimParsed?.slot ?? (matchId === "finals" ? "finals" : (matchId.split("-")[1] || ""));
        const simOurIdx = simElimM?.top?.isPlayer ? 0 : 1;
        const simElimGames = simElimM?.games || [];
        const simLastG = simElimGames[simElimGames.length - 1];
        const simWeWon = simLastG && simLastG.winnerIdx === simOurIdx;
        const simElimNeeded = simElimSlot.startsWith("pi") ? 1 : 4;
        const simOppBefore = simElimGames.slice(0, -1).filter((g) => g.winnerIdx === 1 - simOurIdx).length;
        const simWasElim = simElimSlot.startsWith("pi") || (simElimNeeded === 4 && simOppBefore === 3);
        if (simWeWon && simWasElim && unlockAchievementForSave("elimination_win")) setNewlyUnlockedAchievements((prev) => [...prev, "elimination_win"]);
      }
      if (matchId === "finals" && out.result?.myStats) {
        updateFinalsLeaders(out.result, out.result.topName, out.result.botName);
      }
      const parsed2 = getPlayoffMatchup(b, matchId);
      if (parsed2?.matchup?.winner) break;
    }
    if (lastResult?.winner?.isPlayer) {
      const parsed = getPlayoffMatchup(b, matchId);
      const m = parsed?.matchup;
      const ourIdx = m?.top?.isPlayer ? 0 : 1;
      const ourWinsInSeries = m?.games?.filter((g) => g.winnerIdx === ourIdx).length ?? 0;
      const prevPlayoffWins = careerStats?.playoffWins ?? 0;
      setCareerStats((prev) => ({ ...prev, playoffWins: (prev.playoffWins ?? 0) + ourWinsInSeries }));
      if (prevPlayoffWins === 0 && ourWinsInSeries >= 1 && unlockAchievementForSave("first_playoff_win")) setNewlyUnlockedAchievements((prev) => [...prev, "first_playoff_win"]);
      if (lastResult?.seriesOver && lastResult?.topName && lastResult?.botName) {
        const beaten = lastResult.playerIsTop ? lastResult.botName : lastResult.topName;
        setTeamsDefeatedInPlayoffs((prev) => [...prev, beaten]);
        const ach = [];
        const playerSeed = m ? (lastResult.playerIsTop ? m.top?.playoffSeed : m.bot?.playoffSeed) : null;
        const oppSeed = m ? (lastResult.playerIsTop ? m.bot?.playoffSeed : m.top?.playoffSeed) : null;
        if (!lastResult?.playerIsTop && playerSeed != null && oppSeed != null && playerSeed > oppSeed && unlockAchievementForSave("upset")) ach.push("upset");
        if (m?.games) {
          const games = m.games;
          const n = games.length;
          if (n === 4 && games.every((g) => g.winnerIdx === ourIdx) && unlockAchievementForSave("sweep")) ach.push("sweep");
          if (n === 7 && games[6].winnerIdx === ourIdx && unlockAchievementForSave("game_seven")) ach.push("game_seven");
          if (n === 7 && games[0].winnerIdx !== ourIdx && games[1].winnerIdx !== ourIdx && games[2].winnerIdx !== ourIdx && unlockAchievementForSave("reverse_sweep")) ach.push("reverse_sweep");
        }
        const seriesSlot = matchId === "finals" ? "finals" : (matchId.split("-")[1] || "");
        if ((seriesSlot === "sf1" || seriesSlot === "sf2") && unlockAchievementForSave("conference_finals")) ach.push("conference_finals");
        if (seriesSlot === "f" && unlockAchievementForSave("make_finals")) ach.push("make_finals");
        if ((seriesSlot === "fr1" || seriesSlot === "fr2" || seriesSlot === "fr3" || seriesSlot === "fr4") && unlockAchievementForSave("second_round")) ach.push("second_round");
        if (ach.length > 0) setNewlyUnlockedAchievements((prev) => [...prev, ...ach]);
      }
    }
    setBracket(b);
    setPlayoffResult(lastResult);
    setActiveMatchId(matchId);
  };

  const simAllAIGames = useCallback(() => {
    if (!bracket || !teamRoster) {
      setIsSimulating(false);
      return;
    }
    try {
      let b = JSON.parse(JSON.stringify(bracket));

      // Determine which round group to simulate (play-in, first round, semis, conf finals, or finals)
      const firstAIMatchId = getNextAIMatchId(b);
      if (!firstAIMatchId) return;
      const stageKey = getStageKey(firstAIMatchId);
      const targetGroup = getStageGroup(stageKey);
      if (!targetGroup) return;

      const stageKeysForGroup = PLAYOFF_STAGE_ORDER.filter(
        (k) => getStageGroup(k) === targetGroup
      );

      // All possible matchIds in this round group (east + west, all slots)
      const groupMatchIds = [];
      for (const sk of stageKeysForGroup) {
        groupMatchIds.push(...getMatchIdsForStage(sk));
      }

      // Keep simming until every AI-only series in this round group has a winner
      while (true) {
        let progressed = false;
        for (const matchId of groupMatchIds) {
          const parsed = getPlayoffMatchup(b, matchId);
          const m = parsed?.matchup;
          if (!m || m.winner || !m.top || !m.bot) continue;
          if (m.top.isPlayer || m.bot.isPlayer) continue; // never sim user's series
          if (!Array.isArray(m.top.lineup) || !Array.isArray(m.bot.lineup)) continue;

          const out = runOnePlayoffGame(b, matchId, teamRoster, myLineup, difficulty);
          b = out.bracket;
          progressed = true;
          if (out.playerEliminated) setElimInPlayoffs(true);
          if (matchId === "finals" && out.result?.myStats) {
            updateFinalsLeaders(out.result, out.result.topName, out.result.botName);
          }
        }
        if (!progressed) break;
      }

      setBracket(b);
      setPlayoffResult(null);
      setActiveMatchId(getNextPlayerMatchId(b) || null);
    } catch (err) {
      console.error("Sim CPU round error:", err);
    } finally {
      setSimMessage("");
      setIsSimulating(false);
    }
  }, [bracket, teamRoster, myLineup, difficulty]);

  const simAllCPURounds = useCallback(() => {
    if (!bracket || !teamRoster) {
      setIsSimulating(false);
      return;
    }
    try {
      let b = JSON.parse(JSON.stringify(bracket));
      let roundCount = 0;
      while (true) {
        const firstAIMatchId = getNextAIMatchId(b);
        if (!firstAIMatchId) break;
        const stageKey = getStageKey(firstAIMatchId);
        const targetGroup = getStageGroup(stageKey);
        if (!targetGroup) break;
        const stageKeysForGroup = PLAYOFF_STAGE_ORDER.filter((k) => getStageGroup(k) === targetGroup);
        const groupMatchIds = [];
        for (const sk of stageKeysForGroup) {
          groupMatchIds.push(...getMatchIdsForStage(sk));
        }
        let progressed = false;
        while (true) {
          let inner = false;
          for (const matchId of groupMatchIds) {
            const parsed = getPlayoffMatchup(b, matchId);
            const m = parsed?.matchup;
            if (!m || m.winner || !m.top || !m.bot || m.top.isPlayer || m.bot.isPlayer) continue;
            if (!Array.isArray(m.top.lineup) || !Array.isArray(m.bot.lineup)) continue;
            const out = runOnePlayoffGame(b, matchId, teamRoster, myLineup, difficulty);
            b = out.bracket;
            progressed = true;
            inner = true;
            if (out.playerEliminated) setElimInPlayoffs(true);
            if (matchId === "finals" && out.result?.myStats) {
              updateFinalsLeaders(out.result, out.result.topName, out.result.botName);
            }
          }
          if (!inner) break;
        }
        if (progressed) roundCount++;
        else break;
      }
      setBracket(b);
      setPlayoffResult(null);
      setActiveMatchId(getNextPlayerMatchId(b) || null);
    } catch (err) {
      console.error("Sim all CPU error:", err);
    } finally {
      setSimMessage("");
      setIsSimulating(false);
    }
  }, [bracket, teamRoster, myLineup, difficulty]);

  const runSimAllAIGames = () => {
    if (isSimulating || !bracket || !teamRoster) return;
    const nextAI = getNextAIMatchId(bracket);
    const rLabel = nextAI ? getRoundLabel(getStageKey(nextAI)) : "";
    setSimMessage(rLabel ? `Simulating ${rLabel}…` : "Simulating…");
    setIsSimulating(true);
    setTimeout(() => simAllAIGames(), 0);
  };

  const runSimAllCPURounds = () => {
    if (isSimulating || !bracket || !teamRoster) return;
    if (typeof window !== "undefined" && isMobile && !window.confirm("Sim all CPU games until your next matchup?")) return;
    setSimMessage("Simulating all CPU games…");
    setIsSimulating(true);
    setTimeout(() => simAllCPURounds(), 0);
  };

if(phase==="teamSetup") return(
  <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex",alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
    <div style={{position:"fixed",bottom:16,right:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
      <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
      <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
    </div>
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
              setUnlockedAchievements([]);
              setShowTutorial(true);
              setPhase("draft");
            }
          }}
          maxLength={20}
          placeholder="e.g. Hardwood Kings..."
          style={{width:"100%",background:"#080f1e",border:"1px solid #334155",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#e2e8f0",outline:"none",boxSizing:"border-box",marginBottom:12,textAlign:"center"}}
        />
        <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:1,marginBottom:6}}>LEAGUE NAME</div>
        <input
          value={leagueName}
          onChange={e=>setLeagueName(e.target.value)}
          placeholder="NBA"
          maxLength={24}
          style={{width:"100%",background:"#080f1e",border:"1px solid #334155",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#94a3b8",outline:"none",boxSizing:"border-box",marginBottom:16,textAlign:"center"}}
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
            setUnlockedAchievements([]);
            setShowTutorial(true);
            setPhase("draft");
          }}
          disabled={!myTeamName.trim()}
          style={{width:"100%",background:myTeamName.trim()?"linear-gradient(135deg,#f59e0b,#d97706)":"#1e293b",color:myTeamName.trim()?"white":"#374151",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:800,cursor:myTeamName.trim()?"pointer":"not-allowed"}}>
          🏀 LET'S BUILD
        </button>
        <button type="button" onClick={()=>setShowLoadModal(true)} style={{marginTop:12,width:"100%",background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:8,padding:"10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          📂 Load save
        </button>
        {showLoadModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowLoadModal(false)}>
            <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:20,maxWidth:360,width:"100%",maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:"#e2e8f0"}}>Load save</div>
              <p style={{fontSize:11,color:"#64748b",marginBottom:12}}>Pick a slot to continue that franchise. Your current progress will be replaced.</p>
              {getSlotSummaries().map(({ slot, empty, seasonNumber: sn, gameNum: gn, phase: p, teamName: tn, record, championships, difficultyLabel }) => (
                <div key={slot} style={{display:"flex",gap:6,marginBottom:8,alignItems:"stretch"}}>
                  <button type="button" onClick={()=>loadFromSlot(slot)} style={{flex:1,textAlign:"left",background:empty?"#1e293b":"#111827",border:"1px solid #334155",borderRadius:8,padding:12,color:empty?"#64748b":"#e2e8f0",fontSize:12,cursor:"pointer"}}>
                    {empty ? `Slot ${slot} — Empty` : `Slot ${slot}: Season ${sn} · ${p==="game"?"Game "+gn:p==="seasonEnd"?"Season complete":p==="playoffs"?"Playoffs":"Draft"} · ${tn} ${record!=="—"?"· "+record:""} ${championships>0?"· "+championships+" 🏆":""} ${difficultyLabel?"· "+difficultyLabel:""}`}
                  </button>
                  {!empty && <button type="button" onClick={(e)=>{ e.stopPropagation(); deleteSave(slot); }} style={{background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",borderRadius:8,padding:"12px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}} title="Delete save">🗑</button>}
                </div>
              ))}
              <button type="button" onClick={()=>setShowLoadModal(false)} style={{marginTop:8,width:"100%",background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);

  if(phase==="import") return(
    <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex",alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
      <div style={{position:"fixed",top:12,right:12,zIndex:50}}>
        <button onClick={()=>setShowTrophyCase(true)} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:700,color:"#fbbf24",cursor:"pointer"}} title="Achievements">🏆 {(unlockedAchievements||[]).length}/{ACHIEVEMENTS.length}</button>
      </div>
      {showTrophyCase&&(<div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setShowTrophyCase(false)}><div style={{background:"#0f172a",borderRadius:16,border:"2px solid #334155",maxWidth:420,width:"100%",maxHeight:"85vh",overflow:"auto",padding:20}} onClick={(e)=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:20,fontWeight:900,color:"#fbbf24"}}>🏆 Achievements</div><button onClick={()=>setShowTrophyCase(false)} style={{background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Close</button></div><div style={{display:"flex",flexDirection:"column",gap:10}}>{(()=>{const _groups=[];let _cur=null;sortAchievementsForDisplay(ACHIEVEMENTS).forEach(a=>{const cat=(ACHIEVEMENT_META[a.id]||{}).category||"Other";if(cat!==_cur){_groups.push({cat,items:[]});_cur=cat;}_groups[_groups.length-1].items.push(a);});return _groups.map(({cat,items})=>(<React.Fragment key={cat}><div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginTop:12,marginBottom:6,paddingBottom:4,borderBottom:"1px solid #1e293b"}}>{cat}</div>{items.map(a=>{const unlocked=(unlockedAchievements||[]).includes(a.id);return(<div key={a.id} style={{background:unlocked?"#1e293b":"#0f172a",border:"1px solid #334155",borderRadius:10,padding:12,opacity:unlocked?1:0.65}}><div style={{fontSize:14,fontWeight:700,color:unlocked?"#e2e8f0":"#64748b"}}>{a.icon} {a.label}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{a.desc}</div>{unlocked&&<div style={{fontSize:9,color:"#22c55e",marginTop:6,fontWeight:700}}>✓ Unlocked</div>}{unlocked&&<button onClick={(e)=>{e.stopPropagation();handleShareAchievement(a);}} style={{marginTop:8,background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📤 Share</button>}</div>);})}</React.Fragment>));})()}</div></div></div>)}
      {newlyUnlockedAchievements.map((id,idx)=>{const a=ACHIEVEMENTS.find((x)=>x.id===id);if(!a)return null;return(<div key={id} style={{position:"fixed",top:12+idx*44,left:"50%",transform:"translateX(-50%)",zIndex:9997,background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",padding:"10px 16px",borderRadius:12,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:8,maxWidth:"95vw"}}><span style={{fontWeight:800,fontSize:12}}>🏆 Achievement unlocked!</span><span style={{fontSize:11}}>{a.icon} {a.label}</span><button onClick={()=>handleShareAchievement(a)} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>📤 Share</button><button onClick={()=>setNewlyUnlockedAchievements((prev)=>prev.filter((x)=>x!==id))} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss</button><button onClick={()=>setNewlyUnlockedAchievements([])} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss all</button></div>);})}
      <div style={{position:"fixed",bottom:16,right:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
        <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
        <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
      </div>
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
    const nextPlayerMatchId = getNextPlayerMatchId(bracket) || null;
    const btnBase = { border:"1px solid #334155", borderRadius:10, fontWeight:700, cursor:"pointer", minHeight: isMobile ? 44 : undefined };
    const simulatingOverlayPlayoffs = isSimulating && (
      <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(8,15,30,0.85)",flexDirection:"column",gap:16}}>
        <style>{`@keyframes simSpin{to{transform:rotate(360deg);}}`}</style>
        <div style={{width:48,height:48,border:"4px solid #334155",borderTopColor:"#60a5fa",borderRadius:"50%",animation:"simSpin 0.8s linear infinite"}}/>
        <div style={{fontSize:14,fontWeight:700,color:"#94a3b8"}}>{simMessage || "Simulating…"}</div>
      </div>
    );
    return(
      <>
        {simulatingOverlayPlayoffs}
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex"}}>
        <aside style={{position:"fixed",left:0,top:0,bottom:0,width:120,background:"#0f172a",borderRight:"1px solid #1e293b",display:"flex",flexDirection:"column",alignItems:"stretch",paddingTop:12,paddingLeft:8,paddingRight:8,gap:4,zIndex:40,overflow:"hidden"}}>
          <button onClick={goToMainMenu} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>🏠</span> Menu</button>
          <button onClick={()=>setShowSaveModal(true)} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#a78bfa",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>💾</span> Save</button>
          <button onClick={()=>setShowLoadModal(true)} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>📂</span> Load</button>
          <button onClick={()=>setShowTrophyCase(true)} title={`Achievements (${(unlockedAchievements||[]).length}/${ACHIEVEMENTS.length})`} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#fbbf24",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}><span style={{fontSize:14,flexShrink:0}}>🏆</span> <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{(unlockedAchievements||[]).length}/{ACHIEVEMENTS.length}</span></button>
          <button onClick={()=>setShowHelp(h=>!h)} title="Help" style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#60a5fa",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14,fontWeight:900}}>?</span></button>
          <div style={{flex:1}} />
          <button onClick={handleLoadTeamCode} disabled={inSeason} style={{width:"100%",borderRadius:8,background:"#0f172a",border:"1px solid #1e293b",color:"#60a5fa",fontSize:11,fontWeight:700,cursor:inSeason?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>📥</span> Load code</button>
        </aside>
        <div style={{marginLeft:120,flex:1,padding: isMobile ? 12 : 16, paddingBottom: isMobile ? 96 : undefined}}>
        <div style={{maxWidth:1100,margin:"0 auto",minWidth:0,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom: isMobile ? 14 : 16,flexWrap:"wrap",gap: isMobile ? 8 : 10}}>
            <h2 style={{margin:0,fontSize: isMobile ? 18 : 20,fontWeight:900,color:"#f59e0b",letterSpacing:1}}>Season {seasonNumber} · 🏆 PLAYOFFS</h2>
            <div style={{display:"flex",gap: isMobile ? 6 : 8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:9,fontWeight:700,color:"#64748b",padding:"3px 8px",borderRadius:999,background:"#1e293b",border:"1px solid #334155",textTransform:"uppercase",letterSpacing:0.5}}>{difficulty === "casual" ? "Casual" : difficulty === "hardcore" ? "Hardcore" : "Standard"}</span>
              <div style={{display:"flex",gap:4,alignItems:"center",padding:"4px 6px",background:"#0f172a",borderRadius:8,border:"1px solid #334155"}}>
                <button onClick={handleCopyTeamCode} title="Copy team code" style={{...btnBase,background:"#1e293b",color:"#94a3b8",padding: isMobile ? "8px 10px" : "5px 10px",fontSize: isMobile ? 12 : 11}}>🔗 Copy code</button>
                <button onClick={handleShareLineup} title="Share link" style={{...btnBase,background:"#1e293b",color:"#94a3b8",padding: isMobile ? "8px 10px" : "5px 10px",fontSize: isMobile ? 12 : 11}}>📤 Share link</button>
                <button onClick={handleCopyLineupImage} title="Copy lineup image" style={{...btnBase,background:"linear-gradient(135deg,#60a5fa,#a78bfa)",color:"#0f172a",border:"none",padding: isMobile ? "8px 10px" : "5px 10px",fontSize: isMobile ? 12 : 11}}>🖼️ Share image</button>
              </div>
              {nextPlayerMatchId && (activeMatchId === null || nextPlayerMatchId !== activeMatchId) && (
                <button onClick={()=>{ setActiveMatchId(nextPlayerMatchId); setPlayoffResult(null); setTimeout(()=>{ const el=document.getElementById(`match-${nextPlayerMatchId}`); if(el)el.scrollIntoView({behavior:"smooth",block:"center"}); },50); }} style={{...btnBase,background:"#052e16",color:"#86efac",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11,border:"1px solid #14532d"}} title="Jump to your next series">⏭ Next series</button>
              )}
              <button onClick={()=>setShowStandings(s=>!s)} style={{...btnBase,background:showStandings?"#1e3a5f":"#1e293b",color:"#60a5fa",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11}}>{showStandings?"Hide":"Show"} Standings</button>
              <button onClick={()=>setShowPlayoffLeaders(s=>!s)} style={{...btnBase,background:showPlayoffLeaders?"#431407":"#1e293b",color:"#f97316",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11}}>{showPlayoffLeaders?"Hide":"Show"} Leaders</button>
              {(() => {
                const nextAI = getNextAIMatchId(bracket);
                const rLabel = nextAI ? getRoundLabel(getStageKey(nextAI)) : "";
                if (!nextAI) return null;
                return (
                  <>
                    <button onClick={runSimAllAIGames} disabled={isSimulating} title={rLabel ? `Sim all CPU games in ${rLabel}` : "Sim CPU round"} style={{...btnBase,background:isSimulating?"#374151":"linear-gradient(135deg,#475569,#334155)",color:"#e2e8f0",border:"none",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11,boxShadow:"0 2px 8px rgba(0,0,0,0.2)",opacity:isSimulating?0.8:1,cursor:isSimulating?"wait":"pointer"}}>⚡ Sim round{rLabel ? ` (${rLabel})` : ""}</button>
                    <button onClick={runSimAllCPURounds} disabled={isSimulating} title="Sim all CPU games until your next matchup" style={{...btnBase,background:isSimulating?"#374151":"linear-gradient(135deg,#334155,#1e293b)",color:"#94a3b8",border:"1px solid #475569",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11,opacity:isSimulating?0.8:1,cursor:isSimulating?"wait":"pointer"}}>⚡ Sim all CPU</button>
                  </>
                );
              })()}
              <button onClick={()=>setBracketDensity(d=>d==="compact"?"comfortable":"compact")} style={{...btnBase,background:bracketDensity==="compact"?"#111827":"#1e293b",color:"#e2e8f0",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11}}>{bracketDensity==="compact"?"Compact ✓":"Compact"}</button>
              {(champion || (elimInPlayoffs && !getNextAIMatchId(bracket))) && <button onClick={runItBack} style={{...btnBase,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11,fontWeight:800}} title="Same roster, new AI opponents">🔄 Next Season</button>}
            </div>
          </div>
          {saveToast&&(<div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:9996,fontSize:12,fontWeight:700,color:"#22c55e",padding:"10px 20px",background:"rgba(34,197,94,0.2)",borderRadius:8,border:"1px solid #22c55e"}}>✓ Saved</div>)}
          {shareStatus && (
            <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:9996,fontSize:10,fontWeight:600,color:(typeof shareStatus==="object"&&shareStatus.type==="error")?"#f87171":(typeof shareStatus==="object"&&shareStatus.type==="success")?"#22c55e":"#60a5fa",padding:"4px 12px",background:(typeof shareStatus==="object"&&shareStatus.type==="error")?"rgba(248,113,113,0.2)":(typeof shareStatus==="object"&&shareStatus.type==="success")?"rgba(34,197,94,0.2)":"rgba(96,165,250,0.2)",borderRadius:8}}>
              {typeof shareStatus==="object"?shareStatus.msg:shareStatus}
            </div>
          )}
          {showTrophyCase&&(
            <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setShowTrophyCase(false)}>
              <div style={{background:"#0f172a",borderRadius:16,border:"2px solid #334155",maxWidth:420,width:"100%",maxHeight:"85vh",overflow:"auto",padding:20}} onClick={(e)=>e.stopPropagation()}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div style={{fontSize:20,fontWeight:900,color:"#fbbf24"}}>🏆 Achievements</div>
                  <button onClick={()=>setShowTrophyCase(false)} style={{background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Close</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {(()=>{const _groups=[];let _cur=null;sortAchievementsForDisplay(ACHIEVEMENTS).forEach(a=>{const cat=(ACHIEVEMENT_META[a.id]||{}).category||"Other";if(cat!==_cur){_groups.push({cat,items:[]});_cur=cat;}_groups[_groups.length-1].items.push(a);});return _groups.map(({cat,items})=>(<Fragment key={cat}><div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginTop:12,marginBottom:6,paddingBottom:4,borderBottom:"1px solid #1e293b"}}>{cat}</div>{items.map(a=>{const unlocked=(unlockedAchievements||[]).includes(a.id);return(<div key={a.id} style={{background:unlocked?"#1e293b":"#0f172a",border:"1px solid #334155",borderRadius:10,padding:12,opacity:unlocked?1:0.65}}><div style={{fontSize:14,fontWeight:700,color:unlocked?"#e2e8f0":"#64748b"}}>{a.icon} {a.label}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{a.desc}</div>{unlocked&&<div style={{fontSize:9,color:"#22c55e",marginTop:6,fontWeight:700}}>✓ Unlocked</div>}{unlocked&&<button onClick={(e)=>{e.stopPropagation();handleShareAchievement(a);}} style={{marginTop:8,background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📤 Share</button>}</div>);})}</Fragment>));})()}
                </div>
              </div>
            </div>
          )}
          {newlyUnlockedAchievements.map((id,idx)=>{const a=ACHIEVEMENTS.find((x)=>x.id===id);if(!a)return null;return(<div key={id} style={{position:"fixed",top:12+idx*44,left:"50%",transform:"translateX(-50%)",zIndex:9997,background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",padding:"10px 16px",borderRadius:12,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:8,maxWidth:"95vw"}}><span style={{fontWeight:800,fontSize:12}}>🏆 Achievement unlocked!</span><span style={{fontSize:11}}>{a.icon} {a.label}</span><button onClick={()=>handleShareAchievement(a)} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>📤 Share</button><button onClick={()=>setNewlyUnlockedAchievements((prev)=>prev.filter((x)=>x!==id))} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss</button><button onClick={()=>setNewlyUnlockedAchievements([])} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss all</button></div>);})}
          {showSaveModal && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{ setShowSaveModal(false); setSaveOverwriteSlot(null); }}>
              <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:20,maxWidth:360,width:"100%",maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:"#e2e8f0"}}>💾 Save</div>
                {saveOverwriteSlot != null ? (
                  <>
                    <p style={{fontSize:11,color:"#94a3b8",marginBottom:14}}>Are you sure you want to overwrite Slot {saveOverwriteSlot}? This will replace the existing save.</p>
                    <div style={{display:"flex",gap:8}}>
                      <button type="button" onClick={()=>saveToSlot(saveOverwriteSlot)} style={{flex:1,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:8,padding:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>Yes, overwrite</button>
                      <button type="button" onClick={()=>setSaveOverwriteSlot(null)} style={{flex:1,background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:10,fontSize:12,cursor:"pointer"}}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{fontSize:11,color:"#64748b",marginBottom:12}}>Pick a slot. Empty slots save directly. Existing saves will ask for confirmation.</p>
                    {getSlotSummaries().map(({ slot, empty, seasonNumber: sn, gameNum: gn, phase: p, teamName: tn, record, championships, difficultyLabel }) => (
                      <button key={slot} type="button" onClick={()=>handleSaveSlotClick(slot, empty)} style={{width:"100%",textAlign:"left",background:empty?"#1e293b":"#111827",border:"1px solid #334155",borderRadius:8,padding:12,marginBottom:8,color:empty?"#64748b":"#e2e8f0",fontSize:12,cursor:"pointer"}}>
                        {empty ? `Slot ${slot} — Empty` : `Slot ${slot}: Season ${sn} · ${p==="game"?"Game "+gn:p==="seasonEnd"?"Complete":p==="playoffs"?"Playoffs":"Draft"} · ${tn} ${record!=="—"?"· "+record:""} ${championships>0?"· "+championships+" 🏆":""} ${difficultyLabel?"· "+difficultyLabel:""}`}
                      </button>
                    ))}
                    <button type="button" onClick={()=>setShowSaveModal(false)} style={{marginTop:8,width:"100%",background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          )}
          {showLoadModal && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowLoadModal(false)}>
              <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:20,maxWidth:360,width:"100%",maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:"#e2e8f0"}}>📂 Load save</div>
                {getSlotSummaries().map(({ slot, empty, seasonNumber: sn, gameNum: gn, phase: p, teamName: tn, record, championships, difficultyLabel }) => (
                  <div key={slot} style={{display:"flex",gap:6,marginBottom:8,alignItems:"stretch"}}>
                    <button type="button" onClick={()=>loadFromSlot(slot)} style={{flex:1,textAlign:"left",background:empty?"#1e293b":"#111827",border:"1px solid #334155",borderRadius:8,padding:12,color:empty?"#64748b":"#e2e8f0",fontSize:12,cursor:"pointer"}}>
                      {empty ? `Slot ${slot} — Empty` : `Slot ${slot}: Season ${sn} · ${p==="game"?"Game "+gn:p==="seasonEnd"?"Complete":p==="playoffs"?"Playoffs":"Draft"} · ${tn} ${record!=="—"?"· "+record:""} ${championships>0?"· "+championships+" 🏆":""} ${difficultyLabel?"· "+difficultyLabel:""}`}
                    </button>
                    {!empty && <button type="button" onClick={(e)=>{ e.stopPropagation(); deleteSave(slot); }} style={{background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",borderRadius:8,padding:"12px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}} title="Delete save">🗑</button>}
                  </div>
                ))}
                <button type="button" onClick={()=>setShowLoadModal(false)} style={{marginTop:8,width:"100%",background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Cancel</button>
              </div>
            </div>
          )}
          {showHelp&&<div style={{background:"linear-gradient(180deg,#0f172a 0%,#0c1222 100%)",borderRadius:12,padding: isMobile ? 14 : 12,border:"1px solid #334155",boxShadow:"0 8px 24px rgba(0,0,0,0.3)",marginBottom:12,overflow:"hidden"}}>
            <div style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",padding:"8px 12px",margin:"-1px -1px 0 -1px",borderRadius:"11px 11px 0 0",fontWeight:800,fontSize:10,color:"white",letterSpacing:1}}>HOW TO PLAY</div>
            <div style={{fontSize: isMobile ? 11 : 10,color:"#94a3b8",lineHeight:1.55,paddingTop:10}}>
              <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#60a5fa"}}>📍</span><span><strong style={{color:"#e2e8f0"}}>Positions</strong>: One per slot (PG–C). OOP: Adjacent ×0.82 · Wrong ×0.65</span></div>
              <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#fbbf24"}}>💰</span><span><strong style={{color:"#e2e8f0"}}>Budget</strong>: ${BUDGET} for 5 players</span></div>
              <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span>⚡</span><span><strong style={{color:"#e2e8f0"}}>Chemistry</strong>: 2+ same team+season (bigger for 3–5)</span></div>
              <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span>🧩</span><span><strong style={{color:"#e2e8f0"}}>Archetypes</strong>: Balance roles for bonuses</span></div>
              <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#22c55e"}}>⚖️</span><span><strong style={{color:"#e2e8f0"}}>Team balance</strong>: Need Big, Playmaker, Defense, Scoring. 3+ scorers hurt</span></div>
              <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#a78bfa"}}>🏀</span><span>30 teams · 82 games · Top 6 direct · 7–10 play-in</span></div>
              <div style={{display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#f472b6"}}>🎚</span><span><strong style={{color:"#e2e8f0"}}>Difficulty</strong>: Casual / Standard / Hardcore</span></div>
            </div>
          </div>}
          {champion&&(
            <>
              <div style={{textAlign:"center",padding: isMobile ? 14 : 16,background:playerWon?"linear-gradient(135deg,#78350f,#92400e)":"#0f172a",borderRadius:16,border:`2px solid ${playerWon?"#fbbf24":"#475569"}`,marginBottom:12}}>
                <div style={{fontSize: isMobile ? 32 : 36}}>{playerWon?"🏆":"👑"}</div>
                <div style={{fontSize: isMobile ? 18 : 22,fontWeight:900,color:playerWon?"#fbbf24":"#e2e8f0",letterSpacing:2,lineHeight:1.3}}>{playerWon?"YOU ARE CHAMPIONS!":champion.name+" WIN THE CHAMPIONSHIP!"}</div>
              </div>
              {(() => {
                const champLineup = champion?.lineup || [];
                const champPlayerNames = new Set();
                champLineup.forEach(({ player }) => {
                  if (player?.fullName) champPlayerNames.add(player.fullName);
                  if (player?.name) champPlayerNames.add(player.name);
                });
                let fmvp = null;
                const arr = Object.values(finalsLeaders || {}).filter((p) => p.team === champion?.name && champPlayerNames.has(p.name));
                if (arr.length > 0) {
                  const withScore = arr.map((p) => {
                    const gp = p.gp || 1;
                    return { ...p, gp, fmvpScore: (p.pts / gp) * 2 + (p.reb / gp) * 0.8 + (p.ast / gp) * 1.5 };
                  });
                  const best = withScore.reduce((a, b) => (a.fmvpScore > b.fmvpScore ? a : b));
                  fmvp = best;
                }
                if (!fmvp && champLineup.length) {
                  const best = champLineup.reduce((a, b) => ((a?.player?.rating ?? 0) >= (b?.player?.rating ?? 0) ? a : b));
                  const p = best?.player;
                  if (p) fmvp = { name: p.fullName || p.name, pts: p.pts ?? 0, reb: p.reb ?? 0, ast: p.ast ?? 0, gp: 1 };
                }
                if (!fmvp) return null;
                const gp = fmvp.gp || 1;
                return (
                  <div style={{textAlign:"center",padding: isMobile ? 12 : 10,background:"#0f172a",borderRadius:12,border:"1px solid #eab308",marginBottom:12}}>
                    <div style={{fontSize:10,color:"#eab308",fontWeight:800,letterSpacing:2,marginBottom:4}}>🏆 FINALS MVP</div>
                    <div style={{fontSize: isMobile ? 15 : 14,fontWeight:900,color:"#e2e8f0"}}>{fmvp.name}</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{rf(fmvp.pts / gp, 1)} PPG · {rf(fmvp.reb / gp, 1)} RPG · {rf(fmvp.ast / gp, 1)} APG</div>
                  </div>
                );
              })()}
              {(careerStats.seasonsPlayed > 0 || careerStats.championships > 0) && (
              <div style={{ fontSize: 11, color: "#a78bfa", marginBottom: 10, fontWeight: 700, textAlign: "center" }}>
                Career: {careerStats.totalWins}–{careerStats.totalLosses} · {careerStats.championships} 🏆 · {careerStats.finalsAppearances} Finals · {careerStats.playoffAppearances} playoffs
              </div>
            )}
              {(() => {
                const myTeamAwards = getMyTeamAwardsByPlayer(roster, playerAwards);
                if (myTeamAwards.length === 0) return null;
                return (
                  <div style={{background:"#0f172a",borderRadius:12,padding:12,marginBottom:12,border:"1px solid #475569",textAlign:"left"}}>
                    <div style={{fontSize:10,color:"#eab308",fontWeight:800,letterSpacing:2,marginBottom:8}}>🏅 YOUR TEAM'S AWARDS</div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {myTeamAwards.map(({ displayName, list }) => {
                        const grouped = groupAwardsByType(list || []); // include TMVP (Team MVP) in playoffs
                        return (
                          <div key={displayName} style={{fontSize:11}}>
                            <div style={{fontWeight:700,color:"#e2e8f0",marginBottom:4}}>{displayName}</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
                              {grouped.map(({ award, label, seasons }) => (
                                <span key={label} style={{background:"#1e293b",color:"#94a3b8",borderRadius:6,padding:"3px 8px",fontSize:10,border:"1px solid #334155"}}>
                                  {label} ({seasons.map((s) => `S${s}`).join(", ")})
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <button onClick={runItBack} style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "white", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 800, cursor: "pointer" }} title="Same roster, new AI opponents">🔄 Next Season</button>
                <button onClick={() => document.getElementById("playoff-bracket")?.scrollIntoView({ behavior: "smooth" })} style={{ background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>View Bracket</button>
              </div>
            </>
          )}
          {elimInPlayoffs&&!champion&&(
            <div style={{textAlign:"center",padding: isMobile ? 14 : 12,background:"#1a0a0a",borderRadius:12,border:"2px solid #ef4444",marginBottom:12}}>
              <div style={{fontSize:24}}>💀</div><div style={{fontSize: isMobile ? 15 : 16,fontWeight:900,color:"#ef4444"}}>YOUR SEASON IS OVER</div>
            </div>
          )}
          <Suspense fallback={<div style={{fontSize:11,color:"#64748b",padding:"8px 0"}}>Loading bracket…</div>}>
            <div id="playoff-bracket">
            <BracketDisplayLazy bracket={bracket} activeMatchId={activeMatchId} nextPlayerMatchId={nextPlayerMatchId || undefined} onSelectMatch={id=>{setActiveMatchId(id);setPlayoffResult(null);}} onPlayMatch={id=>{setActiveMatchId(id);setPlayoffResult(null);const parsed=getPlayoffMatchup(bracket,id);const pInv=parsed?.matchup?.top?.isPlayer||parsed?.matchup?.bot?.isPlayer;if(pInv)playPlayoffGame(id);else runSimAllAIGames();}} onSimSeries={simMySeries} isMobile={isMobile} density={bracketDensity}/>
            </div>
          </Suspense>
          {activeMatchId&&(()=>{
            const parsed=getPlayoffMatchup(bracket,activeMatchId);
            const matchup=parsed?.matchup;
            if(!matchup)return null;
            const wT=matchup.games.filter(g=>g.winnerIdx===0).length,wB=matchup.games.filter(g=>g.winnerIdx===1).length;
            const done=!!matchup.winner,pInv=matchup.top?.isPlayer||matchup.bot?.isPlayer;
            const rLabel=activeMatchId?getRoundLabel(getStageKey(activeMatchId)):"";
            const opponentName = pInv ? (matchup.top?.isPlayer ? matchup.bot?.name : matchup.top?.name) ?? "TBD" : null;
            return(
              <div style={{marginTop: isMobile ? 16 : 20}}>
                <div style={{background:"linear-gradient(180deg,#1e293b 0%,#0f172a 100%)",borderRadius:14,padding: isMobile ? 14 : 16,border:"2px solid #334155",marginBottom:12,boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>
                  {pInv && (
                    <div style={{fontSize:12,color:"#fbbf24",fontWeight:800,marginBottom:10,padding:"8px 10px",background:"rgba(251,191,36,0.15)",borderRadius:8,border:"1px solid #f59e0b"}}>
                      🏀 Your opponent: {opponentName}
                    </div>
                  )}
                  <div style={{fontSize:10,color:"#64748b",letterSpacing:1,marginBottom:6,textTransform:"uppercase",fontWeight:700}}>Selected matchup</div>
                  <div style={{fontWeight:800,fontSize: isMobile ? 15 : 14,color:"#e2e8f0",marginBottom:8,lineHeight:1.3}}>{matchup.label}</div>
                  <div style={{display:"flex",alignItems:"center",gap: isMobile ? 8 : 12,flexWrap:"wrap",marginBottom:12}}>
                    <span style={{fontSize: isMobile ? 13 : 12,color:"#94a3b8",flex: isMobile ? "1 1 100%" : undefined}}>{matchup.top?.name ?? "TBD"}</span>
                    <span style={{fontSize: isMobile ? 16 : 14,fontWeight:900,color:"#64748b",flexShrink:0}}>{wT} – {wB}</span>
                    <span style={{fontSize: isMobile ? 13 : 12,color:"#94a3b8",flex: isMobile ? "1 1 100%" : undefined}}>{matchup.bot?.name ?? "TBD"}</span>
                  </div>
                  {!done&&matchup.top&&matchup.bot&&(
                    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                      {pInv ? (
                        <>
                          <button onClick={()=>playPlayoffGame(activeMatchId)} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding: isMobile ? "14px 24px" : "12px 28px",fontSize: isMobile ? 14 : 13,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 14px rgba(34,197,94,0.35)", minHeight: isMobile ? 48 : undefined}}>▶ Play Game {matchup.games.length+1}</button>
                          <button onClick={()=>simMySeries(activeMatchId)} style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #475569",borderRadius:10,padding: isMobile ? "14px 18px" : "12px 20px",fontSize: isMobile ? 13 : 12,fontWeight:700,cursor:"pointer", minHeight: isMobile ? 48 : undefined}} title="Sim remaining games in this series">⚡ Sim series</button>
                        </>
                      ) : (
                        <button onClick={runSimAllAIGames} disabled={isSimulating} style={{background:isSimulating?"#374151":"linear-gradient(135deg,#475569,#64748b)",color:"white",border:"none",borderRadius:10,padding: isMobile ? "14px 24px" : "12px 28px",fontSize: isMobile ? 14 : 13,fontWeight:800,cursor:isSimulating?"wait":"pointer", minHeight: isMobile ? 48 : undefined,opacity:isSimulating?0.8:1}}>⚡ Sim round{rLabel?" ("+rLabel+")":""}</button>
                      )}
                    </div>
                  )}
                  {done&&<div style={{fontSize: isMobile ? 13 : 12,color:"#22c55e",fontWeight:700}}>✓ {matchup.winner?.name} advance</div>}
                </div>
                {playoffResult&&!playoffResult.aiOnly&&playoffResult.matchId===activeMatchId&&(()=>{
                  const pr=playoffResult,pTop=pr.playerIsTop;
                  const myS=pr.myStats,oppS=pr.oppStats;
                  const myScore=pr.myScore,oppScore=pr.oppScore,won=myScore>oppScore;
                  return(<>
                    <div style={{textAlign:"center",padding: isMobile ? 14 : 16,background:won?"linear-gradient(135deg,#0f3320,#14532d)":"linear-gradient(135deg,#331a1a,#1a0a0a)",borderRadius:14,border:`2px solid ${won?"#22c55e":"#ef4444"}`,marginBottom:12,boxShadow:won?"0 4px 20px rgba(34,197,94,0.2)":"0 4px 20px rgba(239,68,68,0.15)"}}>
                      <div style={{fontSize: isMobile ? 16 : 18,fontWeight:900,color:won?"#4ade80":"#f87171"}}>{won?"✓ WIN":"✗ LOSS"}{pr.ot>0?` (${pr.ot} OT)`:""}</div>
                      <div style={{display:"flex",justifyContent:"center",alignItems:"baseline",gap: isMobile ? 20 : 28,marginTop:10,flexWrap:"wrap"}}>
                        <div style={{textAlign:"center"}}><div style={{fontSize: isMobile ? 12 : 11,color:"#60a5fa",fontWeight:700}}>{myTeamName}</div><div style={{fontSize: isMobile ? 32 : 36,fontWeight:900,color:"#60a5fa"}}>{myScore}</div></div>
                        <div style={{fontSize: isMobile ? 16 : 18,color:"#475569",fontWeight:700}}>–</div>
                        <div style={{textAlign:"center"}}><div style={{fontSize: isMobile ? 12 : 11,color:"#f87171",fontWeight:700}}>{pTop?pr.botName:pr.topName}</div><div style={{fontSize: isMobile ? 32 : 36,fontWeight:900,color:"#f87171"}}>{oppScore}</div></div>
                      </div>
                      {pr.seriesOver&&<div style={{marginTop:10,fontSize: isMobile ? 13 : 12,color:"#fbbf24",fontWeight:700}}>Series: {pr.winner?.name} win!</div>}
                    </div>
                    <BoxScore stats={myS} acc="#60a5fa" label={myTeamName}/>
                    <BoxScore stats={oppS} acc="#f87171" label={pTop?pr.botName:pr.topName}/>
                  </>);
                })()}
                {playoffResult?.aiOnly&&playoffResult.matchId===activeMatchId&&(
                  <div style={{textAlign:"center",padding: isMobile ? 14 : 16,background:"#0f172a",borderRadius:14,border:"1px solid #334155",marginBottom:12}}>
                    <div style={{fontSize: isMobile ? 12 : 11,color:"#64748b",marginBottom:8}}>Simulated game (not your team)</div>
                    <div style={{display:"flex",justifyContent:"center",alignItems:"baseline",gap: isMobile ? 16 : 24,flexWrap:"wrap"}}>
                      <div style={{textAlign:"center"}}><div style={{fontSize: isMobile ? 12 : 11,color:"#94a3b8",fontWeight:700}}>{playoffResult.topName}</div><div style={{fontSize: isMobile ? 26 : 30,fontWeight:900,color:"#94a3b8"}}>{playoffResult.myScore ?? 0}</div></div>
                      <div style={{fontSize: isMobile ? 14 : 16,color:"#475569"}}>–</div>
                      <div style={{textAlign:"center"}}><div style={{fontSize: isMobile ? 12 : 11,color:"#94a3b8",fontWeight:700}}>{playoffResult.botName}</div><div style={{fontSize: isMobile ? 26 : 30,fontWeight:900,color:"#94a3b8"}}>{playoffResult.oppScore ?? 0}</div></div>
                    </div>
                    <div style={{fontSize: isMobile ? 13 : 12,color:"#22c55e",fontWeight:700,marginTop:10}}>✓ {playoffResult.winner?.name} advance{playoffResult.seriesOver ? " — series over" : ""}</div>
                  </div>
                )}
              </div>
            );
          })()}
          {isMobile && activeMatchId && (() => {
            const parsed = getPlayoffMatchup(bracket, activeMatchId);
            const matchup = parsed?.matchup;
            if (!matchup || matchup.winner || !matchup.top || !matchup.bot) return null;
            const pInv = matchup.top?.isPlayer || matchup.bot?.isPlayer;
            const oppName = pInv ? (matchup.top?.isPlayer ? matchup.bot?.name : matchup.top?.name) ?? null : null;
            const btnLabel = pInv ? `▶ Play Game ${matchup.games.length + 1}` : "⚡ Sim round";
            return (
              <div style={{ position:"fixed", left:12, right:12, bottom:12, background:"linear-gradient(180deg,#0f172a 0%,#0b1220 100%)", border:"1px solid #334155", borderRadius:14, padding:12, boxShadow:"0 10px 30px rgba(0,0,0,0.45)", zIndex:50 }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <div style={{ minWidth:0, flex:"1 1 120px" }}>
                    <div style={{ fontSize:10, color:"#64748b", fontWeight:900, letterSpacing:1, textTransform:"uppercase" }}>Selected</div>
                    <div style={{ fontSize:12, color:"#e2e8f0", fontWeight:900, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{matchup.label}</div>
                    {oppName && <div style={{ fontSize:11, color:"#fbbf24", fontWeight:700, marginTop:2 }}>vs {oppName}</div>}
                  </div>
                  <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                    <button onClick={pInv?()=>playPlayoffGame(activeMatchId):runSimAllAIGames} disabled={!pInv&&isSimulating} style={{ background: pInv ? "linear-gradient(135deg,#22c55e,#16a34a)" : isSimulating?"#374151":"linear-gradient(135deg,#475569,#64748b)", color:"white", border:"none", borderRadius:12, padding:"12px 14px", fontSize:13, fontWeight:900, minHeight:44, cursor:pInv||!isSimulating?"pointer":"wait", opacity:!pInv&&isSimulating?0.8:1 }}>
                      {btnLabel}
                    </button>
                    {pInv && (
                      <button onClick={()=>simMySeries(activeMatchId)} style={{ background:"#1e293b", color:"#94a3b8", border:"1px solid #475569", borderRadius:12, padding:"12px 12px", fontSize:12, fontWeight:700, minHeight:44, cursor:"pointer" }} title="Sim series">⚡ Series</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          {showStandings&&<div style={{marginTop:16,marginBottom:12}}><StandingsTable aiTeams={finalAiRec} myRecord={myRecord} myName={myTeamName} highlight/></div>}
          {(() => {
            const mvpName = getSeasonAwardWinner(playerAwards, roster, "MVP", seasonNumber);
            const dpoyName = getSeasonAwardWinner(playerAwards, roster, "DPOY", seasonNumber);
            const tmvpName = getSeasonAwardWinner(playerAwards, roster, "TMVP", seasonNumber);
            if (!mvpName && !dpoyName && !tmvpName) return null;
            return (
              <div style={{marginTop:12,marginBottom:12,background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #475569"}}>
                <div style={{fontSize:10,color:"#eab308",fontWeight:800,letterSpacing:2,marginBottom:6}}>🏅 SEASON AWARDS (S{seasonNumber})</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"center"}}>
                  {mvpName && <span style={{fontSize:11,color:"#e2e8f0"}}><span style={{color:"#fbbf24",fontWeight:700}}>MVP:</span> {mvpName}</span>}
                  {dpoyName && <span style={{fontSize:11,color:"#e2e8f0"}}><span style={{color:"#22c55e",fontWeight:700}}>DPOY:</span> {dpoyName}</span>}
                  {tmvpName && <span style={{fontSize:11,color:"#e2e8f0"}}><span style={{color:"#eab308",fontWeight:700}}>Team MVP:</span> {tmvpName}</span>}
                </div>
              </div>
            );
          })()}
          {(() => {
            const myTeamAwards = getMyTeamAwardsByPlayer(roster, playerAwards);
            if (myTeamAwards.length === 0) return null;
            return (
              <div style={{marginTop:12,marginBottom:12,background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #475569"}}>
                <div style={{fontSize:10,color:"#eab308",fontWeight:800,letterSpacing:2,marginBottom:8}}>🏅 YOUR TEAM'S AWARDS</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {myTeamAwards.map(({ displayName, list }) => {
                    const grouped = groupAwardsByType(list || []);
                    return (
                      <div key={displayName} style={{fontSize:11}}>
                        <div style={{fontWeight:700,color:"#e2e8f0",marginBottom:4}}>{displayName}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
                          {grouped.map(({ award, label, seasons }) => (
                            <span key={label} style={{background:"#1e293b",color:"#94a3b8",borderRadius:6,padding:"3px 8px",fontSize:10,border:"1px solid #334155"}}>
                              {label} ({seasons.map((s) => `S${s}`).join(", ")})
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {showPlayoffLeaders&&(
            <div style={{marginTop: isMobile ? 14 : 16,marginBottom:12}}>
              <div style={{display:"flex",gap: isMobile ? 8 : 6,marginBottom: isMobile ? 10 : 8,flexWrap:"wrap"}}>
                <button onClick={()=>setPlayoffLeadersView("playoff")} style={{background:playoffLeadersView==="playoff"?"#f97316":"#1e293b",color:playoffLeadersView==="playoff"?"#fff":"#94a3b8",border:"1px solid #334155",borderRadius:8,padding: isMobile ? "10px 14px" : "4px 10px",fontSize: isMobile ? 12 : 10,fontWeight:700,cursor:"pointer", minHeight: isMobile ? 44 : undefined}}>Playoff leaders</button>
                <button onClick={()=>setPlayoffLeadersView("season")} style={{background:playoffLeadersView==="season"?"#f97316":"#1e293b",color:playoffLeadersView==="season"?"#fff":"#94a3b8",border:"1px solid #334155",borderRadius:8,padding: isMobile ? "10px 14px" : "4px 10px",fontSize: isMobile ? 12 : 10,fontWeight:700,cursor:"pointer", minHeight: isMobile ? 44 : undefined}}>Season leaders</button>
              </div>
              <Suspense fallback={<div style={{fontSize:11,color:"#64748b",padding:"4px 0"}}>Loading leaders…</div>}>
                <LeagueLeadersLazy leaders={playoffLeadersView==="playoff"?playoffLeaders:leagueLeaders} myTeamName={myTeamName}/>
              </Suspense>
              <div style={{marginTop:8}}>
                <SeasonHighs highs={playoffLeadersView==="playoff"?playoffHighs:seasonHighs} careerHighs={playoffLeadersView==="season"?careerLeagueHighs:undefined} myTeamName={myTeamName} title={playoffLeadersView==="playoff"?"📈 PLAYOFF HIGHS (SINGLE GAME)":"📈 SEASON HIGHS (SINGLE GAME)"} seasonNumber={seasonNumber}/>
              </div>
            </div>
          )}
          <div style={{marginTop: isMobile ? 14 : 16,marginBottom:12}}>
            <TeamStatsPanel teamName={myTeamName} playerSeasonRows={playerSeasonRows} playerPlayoffRows={playerPlayoffRows} perMode={teamStatsPerMode} onPerModeChange={setTeamStatsPerMode} showPlayoff={true} isMobile={isMobile} seasonNumber={seasonNumber}/>
            <div style={{marginTop:8}}>
              <TeamHighs teamSeasonHighs={teamSeasonHighs} careerTeamHighs={careerTeamHighs} teamPlayoffHighs={teamPlayoffHighs} roster={roster} title="📈 TEAM HIGHS" showPlayoff={true}/>
            </div>
          </div>
          <div style={{marginTop: isMobile ? 14 : 16,marginBottom:12}}>
            <div style={{display:"flex",gap: isMobile ? 8 : 6,marginBottom: isMobile ? 10 : 8,flexWrap:"wrap"}}>
              <button onClick={()=>setPlayoffHighsPanelView("playoff")} style={{background:playoffHighsPanelView==="playoff"?"#f97316":"#1e293b",color:playoffHighsPanelView==="playoff"?"#fff":"#94a3b8",border:"1px solid #334155",borderRadius:8,padding: isMobile ? "10px 14px" : "4px 10px",fontSize: isMobile ? 12 : 10,fontWeight:700,cursor:"pointer"}}>Playoff highs</button>
              <button onClick={()=>setPlayoffHighsPanelView("season")} style={{background:playoffHighsPanelView==="season"?"#f97316":"#1e293b",color:playoffHighsPanelView==="season"?"#fff":"#94a3b8",border:"1px solid #334155",borderRadius:8,padding: isMobile ? "10px 14px" : "4px 10px",fontSize: isMobile ? 12 : 10,fontWeight:700,cursor:"pointer"}}>Season + All-time highs</button>
            </div>
            <SeasonHighs highs={playoffHighsPanelView==="playoff"?playoffHighs:seasonHighs} careerHighs={playoffHighsPanelView==="season"?careerLeagueHighs:undefined} myTeamName={myTeamName} title={playoffHighsPanelView==="playoff"?"📈 PLAYOFF HIGHS (SINGLE GAME)":"📈 SEASON + ALL-TIME HIGHS"} seasonNumber={seasonNumber}/>
          </div>
        </div>
        </div>
        <div style={{position:"fixed",bottom:16,right:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
          <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
          <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
        </div>
      </div>
      </>
    );
  }

  if(phase==="seasonEnd"){
    const finalAi = aiTeams;
    const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
    const userW = season.w ?? 0;
    const userL = Math.min(season.l ?? 0, SEASON_LENGTH - userW);
    const userRecord = { name: myTeamName, w: userW, l: userL, eff: myEffVal || 0, isPlayer: true, division: userMeta.division, conference: userMeta.conference };
    const all = [userRecord, ...finalAi.map((t) => ({ ...t, isPlayer: false }))];
    const confTeams = all.filter((t) => t.conference === userMeta.conference).sort(standingsSort);
    const myRankInConf = confTeams.findIndex((t) => t.isPlayer) + 1;
    const playoff = myRankInConf <= 10;
    const playIn = myRankInConf >= 7 && myRankInConf <= 10;
    const mySeed = myRankInConf;
    const ppg=season.gp>0?rf(season.ptsFor/season.gp):0,papg=season.gp>0?rf(season.ptsAgainst/season.gp):0;
    const gpSafe = (s) => (s.gp > 0 ? s.gp : 1);
    let playerRows = Object.entries(season.players || {}).map(([name, s]) => {
      const gp = gpSafe(s);
      const ppg = s.pts / gp;
      const rpg = s.reb / gp;
      const apg = s.ast / gp;
      const spg = s.stl / gp;
      const bpg = s.blk / gp;
      const tpg = s.tov / gp;
      const fgmPerG = s.fgm / gp;
      const fgaPerG = s.fga / gp;
      const tpmPerG = s.tpm / gp;
      const tpaPerG = s.tpa / gp;
      const ftmPerG = s.ftm / gp;
      const ftaPerG = s.fta / gp;
      return {
        name,
        gp: s.gp,
        pos: s.pos || null,
        ppg,
        apg,
        rpg,
        spg,
        bpg,
        tpg,
        fgmPerG,
        fgaPerG,
        tpmPerG,
        tpaPerG,
        ftmPerG,
        ftaPerG,
        fgm: s.fgm,
        fga: s.fga,
        tpm: s.tpm,
        tpa: s.tpa,
        ftm: s.ftm,
        fta: s.fta,
        fgPct: s.fga > 0 ? (s.fgm / s.fga) * 100 : 0,
        tpPct: s.tpa > 0 ? (s.tpm / s.tpa) * 100 : 0,
        ftPct: s.fta > 0 ? (s.ftm / s.fta) * 100 : 0,
      };
    }).sort((a, b) => b.ppg - a.ppg);
    if (playerRows.length === 0 && myLineup && season.gp > 0) {
      playerRows = myLineup.map(({ player }) => ({
        name: player.name,
        gp: season.gp,
        ppg: 0, apg: 0, rpg: 0, spg: 0, bpg: 0, tpg: 0,
        fgmPerG: 0, fgaPerG: 0, tpmPerG: 0, tpaPerG: 0, ftmPerG: 0, ftaPerG: 0,
        fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
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
          (r.spg / maxSPG) * 3 +
          (r.bpg / maxBPG) * 2 +
          (r.rpg / maxRPG) * 1.0;
        const teamDefBonus = (1 - r.teamPct) * 0.0; // skip team defense for now
        r.dpoyScore = defScore + teamDefBonus;
      });

      // Use same ranking as in-game race and award: vote totals. Fallback to score if no votes.
      const voteLeaderRow = (votesMap, rows) => {
        if (!votesMap || Object.keys(votesMap).length === 0) return null;
        const ent = Object.entries(votesMap).reduce((best, [key, v]) => (!best || (Number(v) || 0) > (Number(best[1]) || 0) ? [key, v] : best), null);
        if (!ent) return null;
        const [name, team] = ent[0].split("|");
        return (rows || []).find((r) => r.name === name && r.team === team) || null;
      };
      const mvpByVotes = voteLeaderRow(mvpVotes, leagueRows);
      const dpoyByVotes = voteLeaderRow(dpoyVotes, leagueRows);
      leagueMVP = mvpByVotes || leagueRows.reduce((best, r) => (!best || r.mvpScore > best.mvpScore ? r : best), null);
      leagueDPOY = dpoyByVotes || leagueRows.reduce((best, r) => (!best || r.dpoyScore > best.dpoyScore ? r : best), null);
    }
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex"}}>
        {/* Left sidebar - same as draft screen */}
        <aside style={{position:"fixed",left:0,top:0,bottom:0,width:120,background:"#0f172a",borderRight:"1px solid #1e293b",display:"flex",flexDirection:"column",alignItems:"stretch",paddingTop:12,paddingLeft:8,paddingRight:8,gap:4,zIndex:40,overflow:"hidden"}}>
          <button onClick={goToMainMenu} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>🏠</span> Menu</button>
          <button onClick={()=>setShowSaveModal(true)} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#a78bfa",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>💾</span> Save</button>
          <button onClick={()=>setShowLoadModal(true)} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>📂</span> Load</button>
          <button onClick={()=>setShowTrophyCase(true)} title={`Achievements (${(unlockedAchievements||[]).length}/${ACHIEVEMENTS.length})`} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#fbbf24",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}><span style={{fontSize:14,flexShrink:0}}>🏆</span> <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{(unlockedAchievements||[]).length}/{ACHIEVEMENTS.length}</span></button>
          <button onClick={()=>setShowHelp(h=>!h)} title="Help" style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#60a5fa",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14,fontWeight:900}}>?</span></button>
          <div style={{flex:1}} />
          <button onClick={handleLoadTeamCode} disabled={inSeason} style={{width:"100%",borderRadius:8,background:"#0f172a",border:"1px solid #1e293b",color:"#60a5fa",fontSize:11,fontWeight:700,cursor:inSeason?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>📥</span> Load code</button>
          {!playoff && <button onClick={runItBack} style={{width:"100%",borderRadius:8,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>🔄</span> Next Season</button>}
        </aside>
        <div style={{marginLeft:120,flex:1,padding:16}}>
        {/* Compact top bar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:11,fontWeight:700,color:"#64748b"}}>{difficulty==="casual"?"Casual":difficulty==="hardcore"?"Hardcore":"Standard"} Season {seasonNumber}</span>
            <div style={{display:"flex",gap:4,alignItems:"center",padding:"4px 6px",background:"#0f172a",borderRadius:8,border:"1px solid #334155"}}>
              <button onClick={handleCopyTeamCode} title="Copy team code" style={{background:"#1e293b",color:"#94a3b8",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🔗 Copy code</button>
              <button onClick={handleShareLineup} title="Share link" style={{background:"#1e293b",color:"#94a3b8",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>📤 Share link</button>
              <button onClick={handleCopyLineupImage} title="Copy lineup image" style={{background:"linear-gradient(135deg,#60a5fa,#a78bfa)",color:"#0f172a",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🖼️ Share image</button>
            </div>
          </div>
          {playoff && <span style={{fontSize:11,color:"#f59e0b",fontWeight:700}}>Play through playoffs first</span>}
        </div>
        {showTrophyCase&&(<div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setShowTrophyCase(false)}><div style={{background:"#0f172a",borderRadius:16,border:"2px solid #334155",maxWidth:420,width:"100%",maxHeight:"85vh",overflow:"auto",padding:20}} onClick={(e)=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:20,fontWeight:900,color:"#fbbf24"}}>🏆 Achievements</div><button onClick={()=>setShowTrophyCase(false)} style={{background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Close</button></div><div style={{display:"flex",flexDirection:"column",gap:10}}>{(()=>{const _groups=[];let _cur=null;sortAchievementsForDisplay(ACHIEVEMENTS).forEach(a=>{const cat=(ACHIEVEMENT_META[a.id]||{}).category||"Other";if(cat!==_cur){_groups.push({cat,items:[]});_cur=cat;}_groups[_groups.length-1].items.push(a);});return _groups.map(({cat,items})=>(<React.Fragment key={cat}><div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginTop:12,marginBottom:6,paddingBottom:4,borderBottom:"1px solid #1e293b"}}>{cat}</div>{items.map(a=>{const unlocked=(unlockedAchievements||[]).includes(a.id);return(<div key={a.id} style={{background:unlocked?"#1e293b":"#0f172a",border:"1px solid #334155",borderRadius:10,padding:12,opacity:unlocked?1:0.65}}><div style={{fontSize:14,fontWeight:700,color:unlocked?"#e2e8f0":"#64748b"}}>{a.icon} {a.label}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{a.desc}</div>{unlocked&&<div style={{fontSize:9,color:"#22c55e",marginTop:6,fontWeight:700}}>✓ Unlocked</div>}{unlocked&&<button onClick={(e)=>{e.stopPropagation();handleShareAchievement(a);}} style={{marginTop:8,background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📤 Share</button>}</div>);})}</React.Fragment>));})()}</div></div></div>)}
        {newlyUnlockedAchievements.map((id,idx)=>{const a=ACHIEVEMENTS.find((x)=>x.id===id);if(!a)return null;return(<div key={id} style={{position:"fixed",top:12+idx*44,left:"50%",transform:"translateX(-50%)",zIndex:9997,background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",padding:"10px 16px",borderRadius:12,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:8,maxWidth:"95vw"}}><span style={{fontWeight:800,fontSize:12}}>🏆 Achievement unlocked!</span><span style={{fontSize:11}}>{a.icon} {a.label}</span><button onClick={()=>handleShareAchievement(a)} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>📤 Share</button><button onClick={()=>setNewlyUnlockedAchievements((prev)=>prev.filter((x)=>x!==id))} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss</button><button onClick={()=>setNewlyUnlockedAchievements([])} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss all</button></div>);})}
        {shareStatus&&(<div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:10001,fontSize:10,fontWeight:600,color:(typeof shareStatus==="object"&&shareStatus.type==="error")?"#f87171":(typeof shareStatus==="object"&&shareStatus.type==="success")?"#22c55e":"#60a5fa",padding:"4px 12px",background:(typeof shareStatus==="object"&&shareStatus.type==="error")?"rgba(248,113,113,0.2)":(typeof shareStatus==="object"&&shareStatus.type==="success")?"rgba(34,197,94,0.2)":"rgba(96,165,250,0.2)",borderRadius:8}}>{typeof shareStatus==="object"?shareStatus.msg:shareStatus}</div>)}
        {saveToast&&(<div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:9996,fontSize:12,fontWeight:700,color:"#22c55e",padding:"10px 20px",background:"rgba(34,197,94,0.2)",borderRadius:8,border:"1px solid #22c55e"}}>✓ Saved</div>)}
        {showSaveModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{ setShowSaveModal(false); setSaveOverwriteSlot(null); }}>
            <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:20,maxWidth:360,width:"100%",maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:"#e2e8f0"}}>💾 Save</div>
              {saveOverwriteSlot != null ? (
                <>
                  <p style={{fontSize:11,color:"#94a3b8",marginBottom:14}}>Are you sure you want to overwrite Slot {saveOverwriteSlot}? This will replace the existing save.</p>
                  <div style={{display:"flex",gap:8}}>
                    <button type="button" onClick={()=>saveToSlot(saveOverwriteSlot)} style={{flex:1,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:8,padding:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>Yes, overwrite</button>
                    <button type="button" onClick={()=>setSaveOverwriteSlot(null)} style={{flex:1,background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:10,fontSize:12,cursor:"pointer"}}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{fontSize:11,color:"#64748b",marginBottom:12}}>Pick a slot. Empty slots save directly. Existing saves will ask for confirmation.</p>
                  {getSlotSummaries().map(({ slot, empty, seasonNumber: sn, gameNum: gn, phase: p, teamName: tn, record, championships, difficultyLabel }) => (
                    <button key={slot} type="button" onClick={()=>handleSaveSlotClick(slot, empty)} style={{width:"100%",textAlign:"left",background:empty?"#1e293b":"#111827",border:"1px solid #334155",borderRadius:8,padding:12,marginBottom:8,color:empty?"#64748b":"#e2e8f0",fontSize:12,cursor:"pointer"}}>
                      {empty ? `Slot ${slot} — Empty` : `Slot ${slot}: Season ${sn} · ${p==="game"?"Game "+gn:p==="seasonEnd"?"Complete":p==="playoffs"?"Playoffs":"Draft"} · ${tn} ${record!=="—"?"· "+record:""} ${championships>0?"· "+championships+" 🏆":""} ${difficultyLabel?"· "+difficultyLabel:""}`}
                    </button>
                  ))}
                  <button type="button" onClick={()=>setShowSaveModal(false)} style={{marginTop:8,width:"100%",background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Cancel</button>
                </>
              )}
            </div>
          </div>
        )}
        {showLoadModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowLoadModal(false)}>
            <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:20,maxWidth:360,width:"100%",maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:"#e2e8f0"}}>📂 Load save</div>
              {getSlotSummaries().map(({ slot, empty, seasonNumber: sn, gameNum: gn, phase: p, teamName: tn, record, championships, difficultyLabel }) => (
                <div key={slot} style={{display:"flex",gap:6,marginBottom:8,alignItems:"stretch"}}>
                  <button type="button" onClick={()=>loadFromSlot(slot)} style={{flex:1,textAlign:"left",background:empty?"#1e293b":"#111827",border:"1px solid #334155",borderRadius:8,padding:12,color:empty?"#64748b":"#e2e8f0",fontSize:12,cursor:"pointer"}}>
                    {empty ? `Slot ${slot} — Empty` : `Slot ${slot}: Season ${sn} · ${p==="game"?"Game "+gn:p==="seasonEnd"?"Complete":p==="playoffs"?"Playoffs":"Draft"} · ${tn} ${record!=="—"?"· "+record:""} ${championships>0?"· "+championships+" 🏆":""} ${difficultyLabel?"· "+difficultyLabel:""}`}
                  </button>
                  {!empty && <button type="button" onClick={(e)=>{ e.stopPropagation(); deleteSave(slot); }} style={{background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",borderRadius:8,padding:"12px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}} title="Delete save">🗑</button>}
                </div>
              ))}
              <button type="button" onClick={()=>setShowLoadModal(false)} style={{marginTop:8,width:"100%",background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{position:"fixed",bottom:16,right:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
          <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
          <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
        </div>
        {showHelp&&<div style={{background:"linear-gradient(180deg,#0f172a 0%,#0c1222 100%)",borderRadius:12,padding:0,border:"1px solid #334155",boxShadow:"0 8px 24px rgba(0,0,0,0.3)",marginBottom:14,maxWidth:800,marginLeft:"auto",marginRight:"auto",overflow:"hidden"}}>
          <div style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",padding:"10px 14px",fontWeight:800,fontSize:10,color:"white",letterSpacing:1}}>HOW TO PLAY</div>
          <div style={{padding:12,fontSize:10,color:"#94a3b8",lineHeight:1.55}}>
            <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#60a5fa"}}>📍</span><span><strong style={{color:"#e2e8f0"}}>Positions</strong>: One per slot (PG–C). OOP: Adjacent ×0.82 · Wrong ×0.65</span></div>
            <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#fbbf24"}}>💰</span><span><strong style={{color:"#e2e8f0"}}>Budget</strong>: ${BUDGET} for 5 players</span></div>
            <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span>⚡</span><span><strong style={{color:"#e2e8f0"}}>Chemistry</strong>: 2+ same team+season (bigger for 3–5)</span></div>
            <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span>🧩</span><span><strong style={{color:"#e2e8f0"}}>Archetypes</strong>: Balance roles for bonuses</span></div>
            <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#22c55e"}}>⚖️</span><span><strong style={{color:"#e2e8f0"}}>Team balance</strong>: Need Big, Playmaker, Defense, Scoring. 3+ scorers hurt</span></div>
            <div style={{marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#a78bfa"}}>🏀</span><span>30 teams · 82 games · Top 6 direct · 7–10 play-in</span></div>
            <div style={{display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#f472b6"}}>🎚</span><span><strong style={{color:"#e2e8f0"}}>Difficulty</strong>: Casual / Standard / Hardcore</span></div>
          </div>
        </div>}
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <div style={{textAlign:"center",padding:"16px",background:"#0f172a",borderRadius:16,border:`2px solid ${mySeed<=6?"#22c55e":playoff?"#f59e0b":"#ef4444"}`,marginBottom:14}}>
            <div style={{fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:1,marginBottom:4}}>Season {seasonNumber} · Complete</div>
            <div style={{fontSize:36}}>{mySeed<=6?"🏆":playoff?"🎟":"💀"}</div>
            <div style={{fontSize:22,fontWeight:900,color:mySeed<=6?"#22c55e":playoff?"#f59e0b":"#ef4444",letterSpacing:2}}>
              {mySeed<=6?`PLAYOFFS BOUND — SEED #${mySeed}`:playoff?`PLAY-IN TOURNAMENT — SEED #${mySeed}`:"MISSED THE PLAYOFFS"}
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Final Record: {userW}–{userL} · PPG {ppg} · OPP {papg}</div>
            {(careerStats.seasonsPlayed > 0 || careerStats.championships > 0) && (
              <div style={{fontSize:10,color:"#a78bfa",marginTop:6,fontWeight:700}}>
                Career: {careerStats.totalWins}–{careerStats.totalLosses} · {careerStats.championships} 🏆 · {careerStats.finalsAppearances} Finals · {careerStats.playoffAppearances} playoffs
              </div>
            )}
          </div>
          {(() => {
            const allStarCount = allStarSelections ? (() => {
              const east = [...(allStarSelections.east?.starters || []), ...(allStarSelections.east?.reserves || [])];
              const west = [...(allStarSelections.west?.starters || []), ...(allStarSelections.west?.reserves || [])];
              return east.concat(west).filter((p) => p?.team === myTeamName).length;
            })() : 0;
            const bestStreak = (() => { let max = 0, cur = 0; (seasonGameResults || []).forEach((r) => { const won = r && r.won; if (won) { cur++; max = Math.max(max, cur); } else cur = 0; }); return max; })();
            const leaderPts = playerRows.length ? playerRows.reduce((best, p) => (!best || (p.ppg || 0) > (best.ppg || 0) ? p : best), null) : null;
            const leaderReb = playerRows.length ? playerRows.reduce((best, p) => (!best || (p.rpg || 0) > (best.rpg || 0) ? p : best), null) : null;
            const leaderAst = playerRows.length ? playerRows.reduce((best, p) => (!best || (p.apg || 0) > (best.apg || 0) ? p : best), null) : null;
            const leaderStl = playerRows.length ? playerRows.reduce((best, p) => (!best || (p.spg || 0) > (best.spg || 0) ? p : best), null) : null;
            const leaderBlk = playerRows.length ? playerRows.reduce((best, p) => (!best || (p.bpg || 0) > (best.bpg || 0) ? p : best), null) : null;
            const leaderTpm = playerRows.length ? playerRows.reduce((best, p) => (!best || (p.tpm || 0) > (best.tpm || 0) ? p : best), null) : null;
            const leagueChampSuffix = (() => {
              const MIN_GP = 41;
              const entries = Object.values(leagueLeaders || {}).filter((r) => r && (r.gp || 0) >= MIN_GP);
              if (!entries.length) return { pts: "", reb: "", ast: "", stl: "", blk: "", tpm: "" };
              const withPG = entries.map((p) => ({ ...p, gp: p.gp || 1, ppg: (p.pts || 0) / (p.gp || 1), rpg: (p.reb || 0) / (p.gp || 1), apg: (p.ast || 0) / (p.gp || 1), spg: (p.stl || 0) / (p.gp || 1), bpg: (p.blk || 0) / (p.gp || 1) }));
              const best = (key) => withPG.reduce((b, r) => (!b || (r[key] || 0) > (b[key] || 0) ? r : b), null);
              const ptsL = best("ppg"), rebL = best("rpg"), astL = best("apg"), stlL = best("spg"), blkL = best("bpg");
              const tpmL = entries.reduce((b, r) => (!b || (r.tpm || 0) > (b.tpm || 0) ? r : b), null);
              return {
                pts: leaderPts && ptsL && leaderPts.name === ptsL.name ? " (scoring champion)" : "",
                reb: leaderReb && rebL && leaderReb.name === rebL.name ? " (rebounding champion)" : "",
                ast: leaderAst && astL && leaderAst.name === astL.name ? " (assists leader)" : "",
                stl: leaderStl && stlL && leaderStl.name === stlL.name ? " (steals leader)" : "",
                blk: leaderBlk && blkL && leaderBlk.name === blkL.name ? " (blocks leader)" : "",
                tpm: leaderTpm && tpmL && leaderTpm.name === tpmL.name ? " (3-point leader)" : "",
              };
            })();
            const careerAllStarCount = (name) => (playerAwards[name] || []).filter((e) => e.award && String(e.award).startsWith("AS-")).length;
            const myAllStarsThisSeason = allStarSelections ? (() => {
              const east = [...(allStarSelections.east?.starters || []), ...(allStarSelections.east?.reserves || [])];
              const west = [...(allStarSelections.west?.starters || []), ...(allStarSelections.west?.reserves || [])];
              return east.concat(west).filter((p) => p?.team === myTeamName);
            })() : [];
            const careerDefCount = (name, award) => (playerAwards[name] || []).filter((e) => e.award === award).length;
            const careerNBACount = (name, award) => (playerAwards[name] || []).filter((e) => e.award === award).length;
            const myMVPThisSeason = (() => {
              let out = null;
              POSITIONS.forEach((pos) => {
                const p = roster[pos];
                if (!p) return;
                const awards = [...(playerAwards[p.name] || []), ...(playerAwards[p.fullName] || []).filter((e) => e && p.name !== p.fullName)];
                if (awards.some((e) => e.season === seasonNumber && e.award === "MVP")) out = p;
              });
              return out;
            })();
            const myDPOYThisSeason = (() => {
              let out = null;
              POSITIONS.forEach((pos) => {
                const p = roster[pos];
                if (!p) return;
                const awards = [...(playerAwards[p.name] || []), ...(playerAwards[p.fullName] || []).filter((e) => e && p.name !== p.fullName)];
                if (awards.some((e) => e.season === seasonNumber && e.award === "DPOY")) out = p;
              });
              return out;
            })();
            const careerAwardCount = (p, award) => { const fromName = (playerAwards[p?.name] || []).filter((e) => e.award === award); const fromFull = (p?.fullName && p.name !== p.fullName ? (playerAwards[p.fullName] || []) : []).filter((e) => e.award === award); const seen = new Set(); [...fromName, ...fromFull].forEach((e) => { if (e.season != null) seen.add(e.season); }); return seen.size; };
            const myAllDefensiveThisSeason = (() => {
              const list = [];
              const seen = new Set();
              POSITIONS.forEach((pos) => {
                const p = roster[pos];
                if (!p) return;
                const awards = [...(playerAwards[p.name] || []), ...(playerAwards[p.fullName] || []).filter((e) => e && p.name !== p.fullName)];
                awards.forEach((e) => {
                  if (e.season !== seasonNumber || (e.award !== "DEF1" && e.award !== "DEF2")) return;
                  const key = `${p.name}|${e.award}`;
                  if (seen.has(key)) return;
                  seen.add(key);
                  list.push({ name: p.name, award: e.award });
                });
              });
              list.sort((a, b) => (a.award === "DEF1" ? 0 : 1) - (b.award === "DEF1" ? 0 : 1));
              return list;
            })();
            const myAllNBAThisSeason = (() => {
              const list = [];
              const seen = new Set();
              POSITIONS.forEach((pos) => {
                const p = roster[pos];
                if (!p) return;
                const awards = [...(playerAwards[p.name] || []), ...(playerAwards[p.fullName] || []).filter((e) => e && p.name !== p.fullName)];
                awards.forEach((e) => {
                  if (e.season !== seasonNumber || (e.award !== "NBA1" && e.award !== "NBA2" && e.award !== "NBA3")) return;
                  const key = `${p.name}|${e.award}`;
                  if (seen.has(key)) return;
                  seen.add(key);
                  list.push({ name: p.name, award: e.award });
                });
              });
              const nbaOrder = { NBA1: 0, NBA2: 1, NBA3: 2 };
              list.sort((a, b) => (nbaOrder[a.award] ?? 3) - (nbaOrder[b.award] ?? 3));
              return list;
            })();
            const bestWin = (seasonGameResults || []).filter((r) => r && r.won && r.myScore != null && r.oppScore != null).reduce((best, r) => {
              const diff = (r.myScore || 0) - (r.oppScore || 0);
              return !best || diff > ((best.myScore || 0) - (best.oppScore || 0)) ? r : best;
            }, null);
            return (
              <div style={{background:"linear-gradient(180deg,#0f172a 0%,#0b1220 100%)",borderRadius:14,padding:0,marginBottom:14,border:"1px solid #334155",boxShadow:"0 4px 20px rgba(0,0,0,0.35)",overflow:"hidden"}}>
                <div style={{background:"linear-gradient(90deg,#f59e0b,#eab308)",height:4}}/>
                <div style={{padding:"14px 16px"}}>
                  <div style={{fontSize:12,fontWeight:900,letterSpacing:2,marginBottom:4,color:"#fef3c7"}}>📊 SEASON SUMMARY — {leagueName || "NBA"}</div>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:1.5,marginBottom:10,textTransform:"uppercase"}}>Key moments</div>
                  <div style={{display:"flex",flexDirection:"column",gap:2,fontSize:12,color:"#f1f5f9",lineHeight:1.5}}>
                  {myMVPThisSeason && (() => { const n = careerAwardCount(myMVPThisSeason, "MVP"); const ord = n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n + "th"; return <div key="mvp" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #fbbf24"}}><span style={{color:"#fbbf24",fontSize:14}}>🏆</span><span>{myMVPThisSeason.name} won MVP for the {ord} time</span></div>; })()}
                  {myDPOYThisSeason && (() => { const n = careerAwardCount(myDPOYThisSeason, "DPOY"); const ord = n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n + "th"; return <div key="dpoy" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #60a5fa"}}><span style={{color:"#60a5fa",fontSize:14}}>🛡️</span><span>{myDPOYThisSeason.name} won DPOY for the {ord} time</span></div>; })()}
                  {myAllNBAThisSeason.map(({ name, award }) => { const n = careerNBACount(name, award); const ord = n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n + "th"; return <div key={`${name}-${award}`} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #a78bfa"}}><span style={{color:"#a78bfa",fontSize:14}}>📋</span><span>{name} made {AWARD_LABELS[award] || award} for the {ord} time</span></div>; })}
                  {myAllDefensiveThisSeason.map(({ name, award }) => { const n = careerDefCount(name, award); const ord = n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n + "th"; return <div key={`${name}-${award}`} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #4ade80"}}><span style={{color:"#4ade80",fontSize:14}}>🔒</span><span>{name} made {AWARD_LABELS[award] || award} for the {ord} time</span></div>; })}
                  {myAllStarsThisSeason.map((p) => { const n = careerAllStarCount(p.name); return n >= 1 ? <div key={p.name} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #f59e0b"}}><span style={{color:"#f59e0b",fontSize:14}}>⭐</span><span>{p.name} made his {n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n + "th"} All-Star team</span></div> : null; })}
                  {leaderPts && <div key="pts" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #f87171"}}><span style={{color:"#f87171",fontSize:14}}>🔥</span><span>{leaderPts.name} led the team in points ({rf(leaderPts.ppg, 1)} PPG){leagueChampSuffix.pts}</span></div>}
                  {leaderReb && <div key="reb" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #22c55e"}}><span style={{color:"#22c55e",fontSize:14}}>📦</span><span>{leaderReb.name} led the team in rebounds ({rf(leaderReb.rpg, 1)} RPG){leagueChampSuffix.reb}</span></div>}
                  {leaderAst && <div key="ast" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #38bdf8"}}><span style={{color:"#38bdf8",fontSize:14}}>🎯</span><span>{leaderAst.name} led the team in assists ({rf(leaderAst.apg, 1)} APG){leagueChampSuffix.ast}</span></div>}
                  {leaderStl && <div key="stl" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #a78bfa"}}><span style={{color:"#a78bfa",fontSize:14}}>✋</span><span>{leaderStl.name} led the team in steals ({rf(leaderStl.spg, 1)} SPG){leagueChampSuffix.stl}</span></div>}
                  {leaderBlk && <div key="blk" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #64748b"}}><span style={{color:"#64748b",fontSize:14}}>🚫</span><span>{leaderBlk.name} led the team in blocks ({rf(leaderBlk.bpg, 1)} BPG){leagueChampSuffix.blk}</span></div>}
                  {leaderTpm && <div key="tpm" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #eab308"}}><span style={{color:"#eab308",fontSize:14}}>🎯</span><span>{leaderTpm.name} led the team in 3PM ({leaderTpm.tpm ?? 0} 3PM){leagueChampSuffix.tpm}</span></div>}
                  {bestStreak > 0 && <div key="streak" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #fbbf24"}}><span style={{color:"#fbbf24",fontSize:14}}>🔥</span><span>Best win streak: {bestStreak} games</span></div>}
                  {allStarCount > 0 && <div key="allstar" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #f59e0b"}}><span style={{color:"#f59e0b",fontSize:14}}>⭐</span><span>All-Stars: {allStarCount}</span></div>}
                  {bestWin && (() => {
              const oppLabel = bestWin.oppName || "Opponent";
              const p = bestWin.pog;
              if (!p?.name) return <div key="bestWin" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #22c55e"}}><span style={{color:"#22c55e",fontSize:14}}>🏅</span><span>Best win: {bestWin.myScore}–{bestWin.oppScore} over the {oppLabel}.</span></div>;
              const pts = p.pts != null ? Number(p.pts) : null;
              const reb = p.reb != null ? Number(p.reb) : null;
              const ast = p.ast != null ? Number(p.ast) : null;
              const statParts = [pts != null && `${pts} PTS`, reb != null && `${reb} REB`, ast != null && `${ast} AST`].filter(Boolean);
              const statLine = statParts.length > 0 ? statParts.join(", ") : null;
              const threeNote = (p.tpa != null && p.tpa > 0 && p.tpm != null) ? ` · ${p.tpm}/${p.tpa} 3PM` : "";
              return (
                <div key="bestWin" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:"rgba(15,23,42,0.5)",borderLeft:"3px solid #22c55e"}}>
                  <span style={{color:"#22c55e",fontSize:14}}>🏅</span>
                  <span>Best win: {bestWin.myScore}–{bestWin.oppScore} over the {oppLabel}. POG: {p.name} · {statLine || "—"}{threeNote}</span>
                </div>
              );
            })()}
                </div>
                </div>
              </div>
            );
          })()}
          {mvp && (
            <div style={{background:"linear-gradient(180deg,#0f172a 0%,#0b1220 100%)",borderRadius:14,padding:0,marginBottom:14,border:"1px solid rgba(251,191,36,0.4)",boxShadow:"0 4px 20px rgba(0,0,0,0.3)",overflow:"hidden"}}>
              <div style={{background:"linear-gradient(90deg,#f59e0b,#eab308)",height:4}}/>
              <div style={{padding:"16px",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#fbbf24",fontWeight:800,letterSpacing:2,marginBottom:6}}>🏅 TEAM MVP — {myTeamName}</div>
                <div style={{fontSize:20,fontWeight:900,color:"#fef3c7"}}>{mvp.name}</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{mvp.pos || "—"} · {fmt0(mvp.gp)} GP</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:4,display:"flex",justifyContent:"center",gap:12,flexWrap:"wrap"}}><span>{fmt1(mvp.ppg)} PPG</span><span>{fmt1(mvp.apg)} APG</span><span>{fmt1(mvp.rpg)} RPG</span></div>
              </div>
            </div>
          )}
          <div style={{marginBottom:14}}>
            <StandingsTable aiTeams={finalAi} myRecord={{ w: userRecord.w, l: userRecord.l, eff: userRecord.eff }} myName={myTeamName} highlight/>
          </div>
          {allStarSelections && (allStarSelections.east?.starters?.length > 0 || allStarSelections.west?.starters?.length > 0 || (allStarSelections.east?.reserves?.length || 0) + (allStarSelections.west?.reserves?.length || 0) > 0) && (() => {
            const isMyPlayer = (p) => p?.team === myTeamName;
            const rowStyle = (p) => ({ fontSize: 11, color: isMyPlayer(p) ? "#22c55e" : "#e2e8f0", fontWeight: isMyPlayer(p) ? 700 : 400, background: isMyPlayer(p) ? "rgba(34,197,94,0.2)" : "transparent", padding: isMyPlayer(p) ? "2px 6px" : 0, borderRadius: 4 });
            const reserveRowStyle = (p) => ({ fontSize: 11, color: isMyPlayer(p) ? "#22c55e" : "#94a3b8", fontWeight: isMyPlayer(p) ? 700 : 400, background: isMyPlayer(p) ? "rgba(34,197,94,0.2)" : "transparent", padding: isMyPlayer(p) ? "2px 6px" : 0, borderRadius: 4 });
            return (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"#fbbf24",fontWeight:800,letterSpacing:2,marginBottom:8}}>⭐ ALL-STAR (First 50 games)</div>
              <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
                <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"2px solid #3b82f6"}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#60a5fa",marginBottom:8}}>EAST</div>
                  {allStarSelections.east?.starters?.length > 0 && <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Starters</div>}
                  {(allStarSelections.east?.starters || []).map((p,i)=>(<div key={i} style={rowStyle(p)}>{p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team} {p.allStarRole==="Starter"?"★":""}</div>))}
                  {allStarSelections.east?.reserves?.length > 0 && <div style={{fontSize:10,color:"#64748b",marginTop:8,marginBottom:4}}>Reserves</div>}
                  {(allStarSelections.east?.reserves || []).map((p,i)=>(<div key={i} style={reserveRowStyle(p)}>{p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team}</div>))}
                </div>
                <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"2px solid #ef4444"}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#f87171",marginBottom:8}}>WEST</div>
                  {allStarSelections.west?.starters?.length > 0 && <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Starters</div>}
                  {(allStarSelections.west?.starters || []).map((p,i)=>(<div key={i} style={rowStyle(p)}>{p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team} {p.allStarRole==="Starter"?"★":""}</div>))}
                  {allStarSelections.west?.reserves?.length > 0 && <div style={{fontSize:10,color:"#64748b",marginTop:8,marginBottom:4}}>Reserves</div>}
                  {(allStarSelections.west?.reserves || []).map((p,i)=>(<div key={i} style={reserveRowStyle(p)}>{p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team}</div>))}
                </div>
              </div>
            </div>
            );
          })()}
          {(() => {
            const teamRecords = {};
            finalAi.forEach((t) => { teamRecords[t.name] = { w: t.w, l: t.l }; });
            teamRecords[myTeamName] = { w: userRecord.w, l: userRecord.l };
            return (
              <div style={{marginBottom:14}}>
                <Suspense fallback={<div style={{fontSize:11,color:"#64748b",padding:"4px 0"}}>Loading awards…</div>}>
                  <AllNBAAllDefensiveLazy leaders={leagueLeaders} teamRecords={teamRecords} myTeamName={myTeamName} dpoyVotes={dpoyVotes} mvpVotes={mvpVotes}/>
                </Suspense>
              </div>
            );
          })()}
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
          {(() => {
            const myTeamAwards = getMyTeamAwardsByPlayer(roster, playerAwards);
            if (myTeamAwards.length === 0) return null;
            return (
              <div style={{background:"#0f172a",borderRadius:12,padding:12,marginBottom:14,border:"1px solid #475569"}}>
                <div style={{fontSize:10,color:"#eab308",fontWeight:800,letterSpacing:2,marginBottom:8}}>🏅 YOUR TEAM'S AWARDS</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {myTeamAwards.map(({ displayName, list }) => {
                    const grouped = groupAwardsByType(list || []);
                    if (grouped.length === 0) return null;
                    return (
                      <div key={displayName} style={{fontSize:11}}>
                        <div style={{fontWeight:700,color:"#e2e8f0",marginBottom:4}}>{displayName}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
                          {grouped.map(({ award, label, seasons }) => (
                            <span key={label} style={{background:"#1e293b",color:"#94a3b8",borderRadius:6,padding:"3px 8px",fontSize:10,border:"1px solid #334155"}}>
                              {label} ({seasons.map((s) => `S${s}`).join(", ")})
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            <button
              onClick={()=>setShowLeaders(s=>!s)}
              style={{background:"#1e293b",color:"#f97316",border:"1px solid #334155",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}
            >
              {showLeaders ? "Hide Leaders" : "Show Leaders"}
            </button>
          </div>
          {showLeaders&&(
            <div style={{marginBottom:14}}>
              <Suspense fallback={<div style={{fontSize:11,color:"#64748b",padding:"4px 0"}}>Loading leaders…</div>}>
                <LeagueLeadersLazy leaders={leagueLeaders} myTeamName={myTeamName}/>
              </Suspense>
            </div>
          )}
          <div style={{marginBottom:14}}>
            <TeamStatsPanel teamName={myTeamName} playerSeasonRows={playerSeasonRows} playerPlayoffRows={playerPlayoffRows} perMode={teamStatsPerMode} onPerModeChange={setTeamStatsPerMode} showPlayoff={false} isMobile={isMobile} seasonNumber={seasonNumber}/>
            <div style={{marginTop:8}}>
              <TeamHighs teamSeasonHighs={teamSeasonHighs} careerTeamHighs={careerTeamHighs} teamPlayoffHighs={teamPlayoffHighs} roster={roster} title="📈 TEAM HIGHS" showPlayoff={false}/>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <SeasonHighs highs={seasonHighs} careerHighs={careerLeagueHighs} myTeamName={myTeamName} title="📈 SEASON HIGHS (SINGLE GAME)" seasonNumber={seasonNumber}/>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            {playoff&&<button onClick={()=>{buildPlayoffBracket(season,finalAi);setTimeout(()=>{const el=document.getElementById("playoff-bracket");if(el)el.scrollIntoView({behavior:"smooth",block:"start"});else window.scrollTo({top:0,behavior:"smooth"});},100);}} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 18px rgba(245,158,11,0.3)"}}>
              {playIn?"🎟 START PLAY-IN":"🏆 START PLAYOFFS"}
            </button>}
            {!playoff&&<button onClick={runItBack} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:800,cursor:"pointer"}} title="Same roster, new AI opponents">🔄 Next Season</button>}
          </div>
        </div>
        </div>
      </div>
    );
  }

  if (phase === "allStarBreak" && inSeason) {
    const resumeSeason = () => { setPhase("game"); setGameNum(ALL_STAR_GAME_AT + 1); setResult(null); };
    const east = allStarSelections?.east;
    const west = allStarSelections?.west;
    const hasSelections = east?.starters?.length > 0 || west?.starters?.length > 0 || (east?.reserves?.length || 0) + (west?.reserves?.length || 0) > 0;
    const isMyPlayer = (p) => p?.team === myTeamName;
    const rowStyle = (p) => ({ fontSize: 11, color: isMyPlayer(p) ? "#22c55e" : "#e2e8f0", fontWeight: isMyPlayer(p) ? 700 : 400, background: isMyPlayer(p) ? "rgba(34,197,94,0.2)" : "transparent", padding: isMyPlayer(p) ? "2px 6px" : 0, borderRadius: 4 });
    const reserveRowStyle = (p) => ({ fontSize: 11, color: isMyPlayer(p) ? "#22c55e" : "#94a3b8", fontWeight: isMyPlayer(p) ? 700 : 400, background: isMyPlayer(p) ? "rgba(34,197,94,0.2)" : "transparent", padding: isMyPlayer(p) ? "2px 6px" : 0, borderRadius: 4 });
    const simThroughActive = simThroughBreakRequestedRef.current;
    return (
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex"}}>
        <aside style={{position:"fixed",left:0,top:0,bottom:0,width:120,background:"#0f172a",borderRight:"1px solid #1e293b",display:"flex",flexDirection:"column",alignItems:"stretch",paddingTop:12,paddingLeft:8,paddingRight:8,gap:4,zIndex:40,overflow:"hidden"}}>
          <button onClick={goToMainMenu} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>🏠</span> Menu</button>
          <button onClick={()=>setShowSaveModal(true)} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#a78bfa",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>💾</span> Save</button>
          <button onClick={()=>setShowLoadModal(true)} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>📂</span> Load</button>
          <button onClick={()=>setShowTrophyCase(true)} title={`Achievements (${(unlockedAchievements||[]).length}/${ACHIEVEMENTS.length})`} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#fbbf24",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}><span style={{fontSize:14,flexShrink:0}}>🏆</span> <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{(unlockedAchievements||[]).length}/{ACHIEVEMENTS.length}</span></button>
          <button onClick={()=>setShowHelp(h=>!h)} title="Help" style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#60a5fa",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14,fontWeight:900}}>?</span></button>
          <div style={{flex:1}} />
          <button onClick={handleLoadTeamCode} disabled={inSeason} style={{width:"100%",borderRadius:8,background:"#0f172a",border:"1px solid #1e293b",color:"#60a5fa",fontSize:11,fontWeight:700,cursor:inSeason?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>📥</span> Load code</button>
        </aside>
        <div style={{marginLeft:120,flex:1,padding:16}}>
        <div style={{position:"fixed",top:12,right:12,zIndex:50,display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",gap:4,alignItems:"center",padding:"4px 6px",background:"#0f172a",borderRadius:8,border:"1px solid #334155"}}>
            <button onClick={handleCopyTeamCode} title="Copy team code" style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"6px 10px",fontSize:12,fontWeight:700,color:"#94a3b8",cursor:"pointer"}}>🔗 Copy code</button>
            <button onClick={handleShareLineup} title="Share link" style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"6px 10px",fontSize:12,fontWeight:700,color:"#94a3b8",cursor:"pointer"}}>📤 Share link</button>
            <button onClick={handleCopyLineupImage} title="Copy lineup image" style={{background:"linear-gradient(135deg,#60a5fa,#a78bfa)",color:"#0f172a",border:"none",borderRadius:6,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>🖼️ Share image</button>
          </div>
        </div>
        {showTrophyCase&&(<div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setShowTrophyCase(false)}><div style={{background:"#0f172a",borderRadius:16,border:"2px solid #334155",maxWidth:420,width:"100%",maxHeight:"85vh",overflow:"auto",padding:20}} onClick={(e)=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:20,fontWeight:900,color:"#fbbf24"}}>🏆 Achievements</div><button onClick={()=>setShowTrophyCase(false)} style={{background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Close</button></div><div style={{display:"flex",flexDirection:"column",gap:10}}>{(()=>{const _groups=[];let _cur=null;sortAchievementsForDisplay(ACHIEVEMENTS).forEach(a=>{const cat=(ACHIEVEMENT_META[a.id]||{}).category||"Other";if(cat!==_cur){_groups.push({cat,items:[]});_cur=cat;}_groups[_groups.length-1].items.push(a);});return _groups.map(({cat,items})=>(<React.Fragment key={cat}><div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginTop:12,marginBottom:6,paddingBottom:4,borderBottom:"1px solid #1e293b"}}>{cat}</div>{items.map(a=>{const unlocked=(unlockedAchievements||[]).includes(a.id);return(<div key={a.id} style={{background:unlocked?"#1e293b":"#0f172a",border:"1px solid #334155",borderRadius:10,padding:12,opacity:unlocked?1:0.65}}><div style={{fontSize:14,fontWeight:700,color:unlocked?"#e2e8f0":"#64748b"}}>{a.icon} {a.label}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{a.desc}</div>{unlocked&&<div style={{fontSize:9,color:"#22c55e",marginTop:6,fontWeight:700}}>✓ Unlocked</div>}{unlocked&&<button onClick={(e)=>{e.stopPropagation();handleShareAchievement(a);}} style={{marginTop:8,background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📤 Share</button>}</div>);})}</React.Fragment>));})()}</div></div></div>)}
        {newlyUnlockedAchievements.map((id,idx)=>{const a=ACHIEVEMENTS.find((x)=>x.id===id);if(!a)return null;return(<div key={id} style={{position:"fixed",top:12+idx*44,left:"50%",transform:"translateX(-50%)",zIndex:9997,background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",padding:"10px 16px",borderRadius:12,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:8,maxWidth:"95vw"}}><span style={{fontWeight:800,fontSize:12}}>🏆 Achievement unlocked!</span><span style={{fontSize:11}}>{a.icon} {a.label}</span><button onClick={()=>handleShareAchievement(a)} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>📤 Share</button><button onClick={()=>setNewlyUnlockedAchievements((prev)=>prev.filter((x)=>x!==id))} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss</button><button onClick={()=>setNewlyUnlockedAchievements([])} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss all</button></div>);})}
        {shareStatus&&(<div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:10001,fontSize:10,fontWeight:600,color:(typeof shareStatus==="object"&&shareStatus.type==="error")?"#f87171":(typeof shareStatus==="object"&&shareStatus.type==="success")?"#22c55e":"#60a5fa",padding:"4px 12px",background:(typeof shareStatus==="object"&&shareStatus.type==="error")?"rgba(248,113,113,0.2)":(typeof shareStatus==="object"&&shareStatus.type==="success")?"rgba(34,197,94,0.2)":"rgba(96,165,250,0.2)",borderRadius:8}}>{typeof shareStatus==="object"?shareStatus.msg:shareStatus}</div>)}
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:28,fontWeight:900,color:"#fbbf24",letterSpacing:2}}>⭐ ALL-STAR BREAK (Game {ALL_STAR_GAME_AT})</div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Season {seasonNumber} · Selections from first {ALL_STAR_GAME_AT} games</div>
            {simThroughActive && <div style={{fontSize:12,color:"#fbbf24",marginTop:8,fontWeight:700}}>Resuming season in 2 seconds…</div>}
          </div>
          <div style={{background:"#0f172a",borderRadius:16,border:"2px solid #334155",padding:20,marginBottom:24,boxShadow:"0 8px 24px rgba(0,0,0,0.3)"}}>
            <div style={{fontSize:12,color:"#fbbf24",fontWeight:800,letterSpacing:2,marginBottom:16}}>⭐ ALL-STAR SELECTIONS</div>
            {!hasSelections ? (
              <div style={{textAlign:"center",padding:24}}>
                <div style={{fontSize:14,color:"#94a3b8"}}>Calculating All-Star selections…</div>
                <div style={{marginTop:8,fontSize:11,color:"#64748b"}}>If this doesn’t update, click Resume season to continue.</div>
              </div>
            ) : (
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:16}}>
              <div style={{background:"#1e293b",borderRadius:12,padding:14,border:"2px solid #3b82f6"}}>
                <div style={{fontSize:14,fontWeight:800,color:"#60a5fa",marginBottom:10}}>EAST</div>
                {east?.starters?.length > 0 && <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Starters</div>}
                {(east?.starters || []).map((p,i)=>(<div key={i} style={rowStyle(p)}>{p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team} {p.allStarRole==="Starter"?"★":""}</div>))}
                {east?.reserves?.length > 0 && <div style={{fontSize:10,color:"#64748b",marginTop:8,marginBottom:4}}>Reserves</div>}
                {(east?.reserves || []).map((p,i)=>(<div key={i} style={reserveRowStyle(p)}>{p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team}</div>))}
              </div>
              <div style={{background:"#1e293b",borderRadius:12,padding:14,border:"2px solid #ef4444"}}>
                <div style={{fontSize:14,fontWeight:800,color:"#f87171",marginBottom:10}}>WEST</div>
                {west?.starters?.length > 0 && <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Starters</div>}
                {(west?.starters || []).map((p,i)=>(<div key={i} style={rowStyle(p)}>{p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team} {p.allStarRole==="Starter"?"★":""}</div>))}
                {west?.reserves?.length > 0 && <div style={{fontSize:10,color:"#64748b",marginTop:8,marginBottom:4}}>Reserves</div>}
                {(west?.reserves || []).map((p,i)=>(<div key={i} style={reserveRowStyle(p)}>{p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team}</div>))}
              </div>
            </div>
            )}
          </div>
          <div style={{textAlign:"center"}}>
            <button onClick={resumeSeason} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:800,cursor:"pointer"}}>▶ Resume season (Game {ALL_STAR_GAME_AT + 1})</button>
          </div>
        </div>
        </div>
        <div style={{position:"fixed",bottom:16,right:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
          <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
          <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
        </div>
      </div>
    );
  }

  if(phase==="game"&&inSeason){
    const oppIndex = schedule && gameNum <= SEASON_LENGTH ? schedule[29][gameNum - 1] : null;
    const opp = oppIndex != null ? aiTeams[oppIndex] : null;
    const oppRecordLabel = opp ? `${opp.w ?? 0}W–${opp.l ?? 0}L` : null;
    const oppTopPlayer = opp && Array.isArray(opp.lineup)
      ? opp.lineup.reduce((best, { player }) => {
          if (!player) return best;
          if (!best) return player;
          return (player.pts || 0) > (best.pts || 0) ? player : best;
        }, null)
      : null;
    const oppWinPct = opp ? (opp.w ?? 0) / Math.max((opp.w ?? 0) + (opp.l ?? 0), 1) : 0;
    const oppScoutingLabel = opp
      ? oppWinPct >= 0.65
        ? "Top-tier opponent"
        : oppWinPct >= 0.5
        ? "Solid playoff team"
        : oppWinPct >= 0.35
        ? "Fringe playoff team"
        : "Lottery-level opponent"
      : null;
    const won = result ? result.myScore > result.oppScore : false;
    const simulatingOverlay = isSimulating && (
      <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(8,15,30,0.85)",flexDirection:"column",gap:16}}>
        <style>{`@keyframes simSpin{to{transform:rotate(360deg);}}`}</style>
        <div style={{width:48,height:48,border:"4px solid #334155",borderTopColor:"#60a5fa",borderRadius:"50%",animation:"simSpin 0.8s linear infinite"}}/>
        <div style={{fontSize:14,fontWeight:700,color:"#94a3b8"}}>Simulating…</div>
      </div>
    );
    return(
      <>
        {simulatingOverlay}
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex"}}>
        <aside style={{position:"fixed",left:0,top:0,bottom:0,width:120,background:"#0f172a",borderRight:"1px solid #1e293b",display:"flex",flexDirection:"column",alignItems:"stretch",paddingTop:12,paddingLeft:8,paddingRight:8,gap:4,zIndex:40,overflow:"hidden"}}>
          <button onClick={goToMainMenu} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>🏠</span> Menu</button>
          <button onClick={()=>setShowSaveModal(true)} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#a78bfa",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>💾</span> Save</button>
          <button onClick={()=>setShowLoadModal(true)} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>📂</span> Load</button>
          <button onClick={()=>setShowTrophyCase(true)} title={`Achievements (${(unlockedAchievements||[]).length}/${ACHIEVEMENTS.length})`} style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#fbbf24",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}><span style={{fontSize:14,flexShrink:0}}>🏆</span> <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{(unlockedAchievements||[]).length}/{ACHIEVEMENTS.length}</span></button>
          <button onClick={()=>setShowHelp(h=>!h)} title="Help" style={{width:"100%",borderRadius:8,background:"#1e293b",border:"1px solid #334155",color:"#60a5fa",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14,fontWeight:900}}>?</span></button>
          <div style={{flex:1}} />
          <button onClick={handleLoadTeamCode} disabled={inSeason} style={{width:"100%",borderRadius:8,background:"#0f172a",border:"1px solid #1e293b",color:"#60a5fa",fontSize:11,fontWeight:700,cursor:inSeason?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}><span style={{fontSize:14}}>📥</span> Load code</button>
        </aside>
        <div style={{marginLeft:120,flex:1,padding:16}}>
        <div style={{maxWidth:1040,margin:"0 auto"}}>
          <div style={{background:"#0f172a",borderRadius:10,padding:"10px 14px",marginBottom:10,border:"1px solid #1e293b",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{fontSize:11,fontWeight:800,color:"#64748b"}}>Season {seasonNumber} · Game {gameNum} / {SEASON_LENGTH}</div>
            <div style={{flex:1,background:"#1e293b",borderRadius:4,height:5,minWidth:80}}>
              <div style={{height:"100%",width:`${((result?gameNum:gameNum-1)/SEASON_LENGTH)*100}%`,background:"linear-gradient(90deg,#3b82f6,#8b5cf6)",borderRadius:4,transition:"width 0.3s"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{fontSize:11,fontWeight:800,color:season.w>=season.l?"#22c55e":"#f87171"}}>{season.w}W–{season.l}L</div>
              {opp && (
                <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",padding:"2px 6px",borderRadius:9999,background:"#020617",border:"1px solid #1e293b"}}>
                  vs {opp.name} {oppRecordLabel}
                </div>
              )}
            </div>
{(()=>{
  const log=season.gameLog||[];
  if(log.length===0)return null;
  let streak=1;
  const last=log[log.length-1].won;
  for(let i=log.length-2;i>=0;i--){if(log[i].won===last)streak++;else break;}
  const emoji=last?"🔥":"❄️";
  return <div style={{fontSize:10,fontWeight:800,color:last?"#f59e0b":"#60a5fa"}}>{emoji}{streak}</div>;
})()}
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{fontSize:9,fontWeight:700,color:"#64748b",padding:"3px 8px",borderRadius:999,background:"#1e293b",border:"1px solid #334155",textTransform:"uppercase",letterSpacing:0.5}} title="Difficulty: Casual = you're favored · Standard = even · Hardcore = CPU favored">{difficulty === "casual" ? "Casual" : difficulty === "hardcore" ? "Hardcore" : "Standard"}</div>
              {!hintsDismissed.difficulty && (
                <span style={{fontSize:9,color:"#94a3b8",display:"inline-flex",alignItems:"center",gap:4}}>
                  Tip: Casual = you favored · Hardcore = CPU favored
                  <button type="button" onClick={()=>dismissHint("difficulty")} style={{background:"#334155",color:"#e2e8f0",border:"none",borderRadius:4,padding:"2px 6px",fontSize:8,fontWeight:700,cursor:"pointer"}}>Got it</button>
                </span>
              )}
            </div>
            <div style={{display:"flex",gap:4,alignItems:"center",padding:"3px 6px",background:"#0f172a",borderRadius:8,border:"1px solid #334155"}}>
              <button onClick={handleCopyTeamCode} title="Copy team code" style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🔗 Copy code</button>
              <button onClick={handleShareLineup} title="Share link" style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>📤 Share link</button>
              <button onClick={handleCopyLineupImage} title="Copy lineup image" style={{background:"linear-gradient(135deg,#60a5fa,#a78bfa)",color:"#0f172a",border:"none",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🖼️ Share image</button>
            </div>
            <button onClick={()=>setShowStandings(s=>!s)} style={{background:"#1e293b",color:"#60a5fa",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{showStandings?"Hide":"Show"} Standings</button>
            <button onClick={()=>setShowLeaders(s=>!s)} style={{background:"#1e293b",color:"#f97316",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{showLeaders?"Hide":"Show"} Leaders</button>
            {gameNum <= ALL_STAR_GAME_AT && <button onClick={()=>setShowAllStarTab(a=>!a)} style={{background:showAllStarTab?"#78350f":"#1e293b",color:"#fbbf24",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{showAllStarTab?"Hide":"Show"} All-Star</button>}
            <button onClick={()=>setShowMvpDpoyTab(a=>!a)} style={{background:showMvpDpoyTab?"#431407":"#1e293b",color:"#fbbf24",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{showMvpDpoyTab?"Hide":"Show"} MVP/DPOY</button>
            <button onClick={()=>setShowHistoryModal(true)} style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}} title="Last games">📋 Last {gameHistory.length || 0}</button>
            <button onClick={()=>setShowScheduleModal(true)} style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}} title="Full schedule">📅 Schedule</button>
          </div>
          {showTrophyCase&&(<div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setShowTrophyCase(false)}><div style={{background:"#0f172a",borderRadius:16,border:"2px solid #334155",maxWidth:420,width:"100%",maxHeight:"85vh",overflow:"auto",padding:20}} onClick={(e)=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:20,fontWeight:900,color:"#fbbf24"}}>🏆 Achievements</div><button onClick={()=>setShowTrophyCase(false)} style={{background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Close</button></div><div style={{display:"flex",flexDirection:"column",gap:10}}>{(()=>{const _groups=[];let _cur=null;sortAchievementsForDisplay(ACHIEVEMENTS).forEach(a=>{const cat=(ACHIEVEMENT_META[a.id]||{}).category||"Other";if(cat!==_cur){_groups.push({cat,items:[]});_cur=cat;}_groups[_groups.length-1].items.push(a);});return _groups.map(({cat,items})=>(<React.Fragment key={cat}><div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginTop:12,marginBottom:6,paddingBottom:4,borderBottom:"1px solid #1e293b"}}>{cat}</div>{items.map(a=>{const unlocked=(unlockedAchievements||[]).includes(a.id);return(<div key={a.id} style={{background:unlocked?"#1e293b":"#0f172a",border:"1px solid #334155",borderRadius:10,padding:12,opacity:unlocked?1:0.65}}><div style={{fontSize:14,fontWeight:700,color:unlocked?"#e2e8f0":"#64748b"}}>{a.icon} {a.label}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{a.desc}</div>{unlocked&&<div style={{fontSize:9,color:"#22c55e",marginTop:6,fontWeight:700}}>✓ Unlocked</div>}{unlocked&&<button onClick={(e)=>{e.stopPropagation();handleShareAchievement(a);}} style={{marginTop:8,background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📤 Share</button>}</div>);})}</React.Fragment>));})()}</div></div></div>)}
          {newlyUnlockedAchievements.map((id,idx)=>{const a=ACHIEVEMENTS.find((x)=>x.id===id);if(!a)return null;return(<div key={id} style={{position:"fixed",top:12+idx*44,left:"50%",transform:"translateX(-50%)",zIndex:9997,background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",padding:"10px 16px",borderRadius:12,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:8,maxWidth:"95vw"}}><span style={{fontWeight:800,fontSize:12}}>🏆 Achievement unlocked!</span><span style={{fontSize:11}}>{a.icon} {a.label}</span><button onClick={()=>handleShareAchievement(a)} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>📤 Share</button><button onClick={()=>setNewlyUnlockedAchievements((prev)=>prev.filter((x)=>x!==id))} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss</button><button onClick={()=>setNewlyUnlockedAchievements([])} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",color:"#fff"}}>Dismiss all</button></div>);})}
          {shareStatus&&(<div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:10001,fontSize:10,fontWeight:600,color:(typeof shareStatus==="object"&&shareStatus.type==="error")?"#f87171":(typeof shareStatus==="object"&&shareStatus.type==="success")?"#22c55e":"#60a5fa",padding:"4px 12px",background:(typeof shareStatus==="object"&&shareStatus.type==="error")?"rgba(248,113,113,0.2)":(typeof shareStatus==="object"&&shareStatus.type==="success")?"rgba(34,197,94,0.2)":"rgba(96,165,250,0.2)",borderRadius:8}}>{typeof shareStatus==="object"?shareStatus.msg:shareStatus}</div>)}
          {saveToast&&(<div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:9996,fontSize:12,fontWeight:700,color:"#22c55e",padding:"10px 20px",background:"rgba(34,197,94,0.2)",borderRadius:8,border:"1px solid #22c55e"}}>✓ Saved</div>)}
          {showHistoryModal && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowHistoryModal(false)}>
              <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:16,maxWidth:440,width:"100%",maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:"#e2e8f0"}}>📋 Last games</div>
                {gameHistory.length === 0 ? (
                  <p style={{fontSize:11,color:"#64748b"}}>Play games to see results here.</p>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {gameHistory.map((g,i)=>(
                      <div key={i} style={{background:"#1e293b",borderRadius:8,padding:10,border:"1px solid #334155"}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#94a3b8"}}>Game {g.gameNum} · vs {g.oppName}</div>
                        <div style={{fontSize:14,fontWeight:800,marginTop:4,color:g.won?"#22c55e":"#f87171"}}>{myTeamName} {g.myScore} – {g.oppScore} {g.oppName} {g.won?"W":"L"}</div>
                        {g.myStats && g.myStats.length > 0 && (
                          <div style={{marginTop:6,fontSize:9,color:"#64748b"}}>
                            {g.myStats.slice(0,5).map((s,j)=>(<div key={j}>{s.name}: {s.pts} PTS, {s.reb} REB, {s.ast} AST</div>))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={()=>setShowHistoryModal(false)} style={{marginTop:12,width:"100%",background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Close</button>
              </div>
            </div>
          )}
          {showScheduleModal && schedule && aiTeams && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowScheduleModal(false)}>
              <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:16,maxWidth:520,width:"100%",maxHeight:"85vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:"#e2e8f0"}}>📅 Full schedule</div>
                <div style={{fontSize:10,color:"#64748b",marginBottom:8}}>H = Home · A = Away</div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {Array.from({ length: SEASON_LENGTH }, (_, i) => {
                    const g = i + 1;
                    const oppIdx = schedule[NUM_TEAMS - 1]?.[i];
                    const opp = oppIdx != null ? aiTeams[oppIdx] : null;
                    const oppName = opp?.name ?? "—";
                    const home = scheduleHome?.[NUM_TEAMS - 1]?.[i];
                    const ha = home === true ? "H" : home === false ? "A" : "—";
                    const r = seasonGameResults[i];
                    const played = r && (r.won != null || r.myScore != null);
                    const isHome = home === true;
                    const rowBg = isHome ? "rgba(34,197,94,0.12)" : home === false ? "rgba(251,191,36,0.1)" : "#1e293b";
                    const haColor = isHome ? "#22c55e" : home === false ? "#f59e0b" : "#64748b";
                    return (
                      <div key={g} style={{display:"flex",alignItems:"center",gap:8,background:rowBg,borderRadius:6,padding:"6px 10px",border:"1px solid #334155",fontSize:11}}>
                        <span style={{width:28,fontWeight:700,color:"#94a3b8"}}>G{g}</span>
                        <span style={{width:24,fontWeight:700,color:haColor}}>{ha}</span>
                        <span style={{flex:1,color:"#e2e8f0"}}>vs {oppName}</span>
                        {played ? (
                          <span style={{fontWeight:800,color:r.won?"#22c55e":"#f87171"}}>{r.won?"W":"L"}{r.myScore != null && r.oppScore != null ? ` ${r.myScore}–${r.oppScore}` : ""}</span>
                        ) : (
                          <span style={{color:"#64748b"}}>—</span>
                        )}
                        {played && r?.pog?.name && <span style={{fontSize:9,color:"#94a3b8"}}>POG: {r.pog.name}</span>}
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={()=>setShowScheduleModal(false)} style={{marginTop:12,width:"100%",background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Close</button>
              </div>
            </div>
          )}
          {showSaveModal && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{ setShowSaveModal(false); setSaveOverwriteSlot(null); }}>
              <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:20,maxWidth:360,width:"100%",maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:"#e2e8f0"}}>💾 Save</div>
                {saveOverwriteSlot != null ? (
                  <>
                    <p style={{fontSize:11,color:"#94a3b8",marginBottom:14}}>Are you sure you want to overwrite Slot {saveOverwriteSlot}? This will replace the existing save.</p>
                    <div style={{display:"flex",gap:8}}>
                      <button type="button" onClick={()=>saveToSlot(saveOverwriteSlot)} style={{flex:1,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:8,padding:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>Yes, overwrite</button>
                      <button type="button" onClick={()=>setSaveOverwriteSlot(null)} style={{flex:1,background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:10,fontSize:12,cursor:"pointer"}}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{fontSize:11,color:"#64748b",marginBottom:12}}>Pick a slot. Empty slots save directly. Existing saves will ask for confirmation.</p>
                    {getSlotSummaries().map(({ slot, empty, seasonNumber: sn, gameNum: gn, phase: p, teamName: tn, record, championships, difficultyLabel }) => (
                      <button key={slot} type="button" onClick={()=>handleSaveSlotClick(slot, empty)} style={{width:"100%",textAlign:"left",background:empty?"#1e293b":"#111827",border:"1px solid #334155",borderRadius:8,padding:12,marginBottom:8,color:empty?"#64748b":"#e2e8f0",fontSize:12,cursor:"pointer"}}>
                        {empty ? `Slot ${slot} — Empty` : `Slot ${slot}: Season ${sn} · ${p==="game"?"Game "+gn:p==="seasonEnd"?"Complete":p==="playoffs"?"Playoffs":"Draft"} · ${tn} ${record!=="—"?"· "+record:""} ${championships>0?"· "+championships+" 🏆":""} ${difficultyLabel?"· "+difficultyLabel:""}`}
                      </button>
                    ))}
                    <button type="button" onClick={()=>setShowSaveModal(false)} style={{marginTop:8,width:"100%",background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          )}
          {showLoadModal && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowLoadModal(false)}>
              <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:20,maxWidth:360,width:"100%",maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:"#e2e8f0"}}>📂 Load save</div>
                <p style={{fontSize:11,color:"#64748b",marginBottom:12}}>Pick a slot. Current progress will be replaced.</p>
                {getSlotSummaries().map(({ slot, empty, seasonNumber: sn, gameNum: gn, phase: p, teamName: tn, record, championships, difficultyLabel }) => (
                  <div key={slot} style={{display:"flex",gap:6,marginBottom:8,alignItems:"stretch"}}>
                    <button type="button" onClick={()=>loadFromSlot(slot)} style={{flex:1,textAlign:"left",background:empty?"#1e293b":"#111827",border:"1px solid #334155",borderRadius:8,padding:12,color:empty?"#64748b":"#e2e8f0",fontSize:12,cursor:"pointer"}}>
                      {empty ? `Slot ${slot} — Empty` : `Slot ${slot}: Season ${sn} · ${p==="game"?"Game "+gn:p==="seasonEnd"?"Complete":p==="playoffs"?"Playoffs":"Draft"} · ${tn} ${record!=="—"?"· "+record:""} ${championships>0?"· "+championships+" 🏆":""} ${difficultyLabel?"· "+difficultyLabel:""}`}
                    </button>
                    {!empty && <button type="button" onClick={(e)=>{ e.stopPropagation(); deleteSave(slot); }} style={{background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",borderRadius:8,padding:"12px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}} title="Delete save">🗑</button>}
                  </div>
                ))}
                <button type="button" onClick={()=>setShowLoadModal(false)} style={{marginTop:8,width:"100%",background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Cancel</button>
              </div>
            </div>
          )}
          {showHelp&&<div style={{background:"linear-gradient(180deg,#0f172a 0%,#0c1222 100%)",borderRadius:12,padding:0,border:"1px solid #334155",boxShadow:"0 8px 24px rgba(0,0,0,0.3)",marginBottom:10,overflow:"hidden"}}>
            <div style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",padding:"8px 12px",fontWeight:800,fontSize:10,color:"white",letterSpacing:1}}>HOW TO PLAY</div>
            <div style={{padding:10,fontSize:10,color:"#94a3b8",lineHeight:1.55}}>
              <div style={{marginBottom:5,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#60a5fa"}}>📍</span><span><strong style={{color:"#e2e8f0"}}>Positions</strong>: One per slot (PG–C). OOP: Adjacent ×0.82 · Wrong ×0.65</span></div>
              <div style={{marginBottom:5,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#fbbf24"}}>💰</span><span><strong style={{color:"#e2e8f0"}}>Budget</strong>: ${BUDGET} for 5 players</span></div>
              <div style={{marginBottom:5,display:"flex",gap:8,alignItems:"flex-start"}}><span>⚡</span><span><strong style={{color:"#e2e8f0"}}>Chemistry</strong>: 2+ same team+season (bigger for 3–5)</span></div>
              <div style={{marginBottom:5,display:"flex",gap:8,alignItems:"flex-start"}}><span>🧩</span><span><strong style={{color:"#e2e8f0"}}>Archetypes</strong>: Balance roles for bonuses</span></div>
              <div style={{marginBottom:5,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#22c55e"}}>⚖️</span><span><strong style={{color:"#e2e8f0"}}>Team balance</strong>: Need Big, Playmaker, Defense, Scoring. 3+ scorers hurt</span></div>
              <div style={{marginBottom:5,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#a78bfa"}}>🏀</span><span>30 teams · 82 games · Top 6 direct · 7–10 play-in</span></div>
              <div style={{display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:"#f472b6"}}>🎚</span><span><strong style={{color:"#e2e8f0"}}>Difficulty</strong>: Casual / Standard / Hardcore</span></div>
            </div>
          </div>}
          {showAllStarSimThroughConfirm && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowAllStarSimThroughConfirm(false)}>
              <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #334155",padding:20,maxWidth:360,width:"100%"}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:8,color:"#fbbf24"}}>Sim through All-Star break?</div>
                <p style={{fontSize:11,color:"#94a3b8",marginBottom:14}}>All-Star selections will be calculated from the first {ALL_STAR_GAME_AT} games and shown in season awards. The rest of the season will sim automatically.</p>
                <div style={{display:"flex",gap:8,flexDirection:"column"}}>
                  <button type="button" onClick={()=>{ setShowAllStarSimThroughConfirm(false); simThroughBreakRequestedRef.current = true; runSimGames(ALL_STAR_GAME_AT - gameNum + 1); }} style={{width:"100%",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:8,padding:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>Yes — sim through break</button>
                  <button type="button" onClick={()=>{ setShowAllStarSimThroughConfirm(false); runSimGames(ALL_STAR_GAME_AT - gameNum + 1); }} style={{width:"100%",background:"#1e293b",color:"#e2e8f0",border:"1px solid #334155",borderRadius:8,padding:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>No — sim to All-Star only</button>
                  <button type="button" onClick={()=>setShowAllStarSimThroughConfirm(false)} style={{width:"100%",background:"#334155",color:"#94a3b8",border:"none",borderRadius:8,padding:8,fontSize:12,cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {/* Game card at top: play/sim or result */}
          {!result?(
            <div style={{background:"#0f172a",borderRadius:16,padding:24,border:"1px solid #1e293b",textAlign:"center",marginBottom:16,boxShadow:"0 4px 20px rgba(0,0,0,0.25)"}}>
              {(() => {
                const results = seasonGameResults || [];
                let curStreak = 0;
                const curWon = results.length ? results[results.length - 1]?.won : null;
                if (results.length && curWon != null) {
                  for (let i = results.length - 1; i >= 0; i--) { if (results[i]?.won === curWon) curStreak++; else break; }
                }
                if (curStreak >= 3) return <div style={{fontSize:11,fontWeight:800,color:curWon?"#f59e0b":"#60a5fa",marginBottom:8}}>{curWon ? `🔥 Riding a ${curStreak}-game win streak` : `❄️ Looking to snap a ${curStreak}-game skid`}</div>;
                return null;
              })()}
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
                  <div style={{fontSize:10,fontWeight:700,color:"#e2e8f0"}}>{typeof v === "number" ? v.toFixed(1) : (v ?? 0).toFixed(1)}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
              {!hintsDismissed.simBreak && gameNum <= ALL_STAR_GAME_AT && (
                <div style={{fontSize:9,color:"#64748b",marginBottom:6,display:"flex",alignItems:"center",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                  Tip: Sim to All-Star runs to game 50 and shows All-Star picks.
                  <button type="button" onClick={()=>dismissHint("simBreak")} style={{background:"#334155",color:"#e2e8f0",border:"none",borderRadius:4,padding:"2px 8px",fontSize:9,fontWeight:700,cursor:"pointer"}}>Got it</button>
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
                      onClick={()=>runSimGames(10)}
                      disabled={isSimulating}
                      style={{background:isSimulating?"#374151":"#4b5563",color:"white",border:"none",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:800,cursor:isSimulating?"wait":"pointer",opacity:isSimulating?0.8:1}}
                    >
                      ⏩ SIM 10 GAMES
                    </button>
                    {gameNum <= ALL_STAR_GAME_AT && (
                      <button
                        onClick={()=>runSimGames(ALL_STAR_GAME_AT - gameNum + 1)}
                        disabled={isSimulating}
                        style={{background:isSimulating?"#374151":"#475569",color:"white",border:"none",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:800,cursor:isSimulating?"wait":"pointer",opacity:isSimulating?0.8:1}}
                      >
                        ⭐ SIM TO ALL-STAR (G{ALL_STAR_GAME_AT})
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (gameNum <= ALL_STAR_GAME_AT) setShowAllStarSimThroughConfirm(true);
                        else runSimGames(SEASON_LENGTH - gameNum + 1);
                      }}
                      disabled={isSimulating}
                      style={{background:isSimulating?"#374151":"#334155",color:"#94a3b8",border:"none",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:800,cursor:isSimulating?"wait":"pointer",opacity:isSimulating?0.8:1}}
                    >
                      ⏭ SIM REST
                    </button>
                  </>
                )}
              </div>
            </div>
          ):(
            <>
              <div style={{textAlign:"center",padding:"12px",background:"#0f172a",borderRadius:14,border:`2px solid ${won?"#22c55e":"#ef4444"}`,marginBottom:16,boxShadow:"0 4px 20px rgba(0,0,0,0.25)"}}>
                <div style={{fontSize:24}}>{won?"🏆":"💀"}</div>
                <div style={{fontSize:20,fontWeight:900,color:won?"#22c55e":"#ef4444",letterSpacing:2}}>{won?"VICTORY":"DEFEAT"}{result.ot>0?` (${result.ot}OT)`:""}</div>
                <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:6}}>
                  {[[myTeamName,result.myScore,"#60a5fa",result.myEff],[opp?.name||"Opponent",result.oppScore,"#f87171",result.oppEff]].map(([l,sc,col,eff],i)=>(
                    <div key={i} style={{textAlign:"center"}}><div style={{fontSize:10,color:col,fontWeight:700}}>{l}</div><div style={{fontSize:38,fontWeight:900,color:col,lineHeight:1}}>{sc}</div><div style={{fontSize:9,color:"#475569"}}>RTG {eff}</div></div>
                  ))}
                </div>
                {result.possessionsPerTeam != null && (
                  <div style={{fontSize:9,color:"#64748b",marginTop:4}}>Possessions: {result.possessionsPerTeam} per team</div>
                )}
                {(() => {
                  const allStats = [...(result.myStats || []).map(s => ({ ...s, team: myTeamName })), ...(result.oppStats || []).map(s => ({ ...s, team: opp?.name || "Opponent" }))];
                  const pog = allStats.length ? allStats.reduce((best, s) => (!best || gameScore(s) > gameScore(best) ? s : best), null) : null;
                  if (!pog) return null;
                  return (
                    <div style={{marginTop:8,fontSize:11,color:"#fbbf24",fontWeight:800}}>
                      🏅 Player of the game: {pog.name} — {rf(pog.pts,0)} pts, {rf(pog.reb,0)} reb, {rf(pog.ast,0)} ast
                    </div>
                  );
                })()}
                {(() => {
                  const margin = (result.myScore || 0) - (result.oppScore || 0);
                  const winLines = margin >= 30 ? ["Statement win. They never had a chance.", "Obliterated. No mercy.", "That one’s going in the highlight reel.", "Demolition job.", "Ran them out of the building.", "No contest from the jump.", "Total domination.", "That’s a statement.", "Ouch. For them."] : margin >= 20 ? ["Dominant. Total control.", "Blowout city.", "Ran away with it.", "Comfortable from start to finish.", "Never in doubt.", "Took care of business.", "Big win.", "Handled it.", "Smooth sailing."] : margin >= 10 ? ["Solid W. Kept the foot on the gas.", "Comfortable win.", "Another one in the books.", "Good team win.", "Took care of business.", "Got the job done.", "Clean win.", "That'll work.", "Nothing to see here — just a W."] : margin >= 5 ? ["Got it done. Too close for comfort.", "Nervy finish, but a W.", "Survived a scare.", "Close one. We'll take it.", "Dodged a bullet.", "Pulled it out.", "Barely, but it counts.", "Survived and advanced.", "Too close. But a W."] : ["Too close for comfort!", "Survived by the skin of your teeth.", "Heart-stopper. But a W.", "One possession. One W.", "Clutch when it mattered.", "Escaped with a W.", "That was a nail-biter.", "Survived.", "Could've gone either way."];
                  const lossLines = margin >= -5 ? ["Heartbreaker. Get the next one.", "So close. Bounce back.", "Brutal. One possession away.", "One stop away.", "Tough way to lose.", "Could've gone either way.", "So close.", "Next time.", "Bitter pill."] : margin >= -15 ? ["Rough one. Back to the drawing board.", "Couldn’t get it going.", "Off night. Shake it off.", "Never found a rhythm.", "Just one of those games.", "Regroup and go.", "Forget it and move on.", "Cold night.", "Didn’t have it tonight."] : ["Rough night. Bounce back next game.", "That one got away.", "No sugarcoating it — rough loss.", "Forgot to show up.", "That's one to forget.", "Bury the tape.", "On to the next.", "Nothing went right.", "Back to the lab."];
                  const lines = won ? winLines : lossLines;
                  const seed = (gameNum || 0) + (result.myScore || 0) + (result.oppScore || 0);
                  const oneLiner = lines[seed % lines.length];
                  return <div style={{marginTop:8,fontSize:11,color:won?"#86efac":"#fca5a5",fontStyle:"italic"}}>"{oneLiner}"</div>;
                })()}
              </div>
              <BoxScore stats={result.myStats} acc="#60a5fa" label={myTeamName}/>
              <BoxScore stats={result.oppStats} acc="#f87171" label={opp?.name||"Opponent"}/>
              <div style={{display:"flex",gap:8,justifyContent:"center",paddingBottom:16,marginBottom:16}}>
                {gameNum<SEASON_LENGTH
                  ?<button onClick={nextGame} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"11px 28px",fontSize:13,fontWeight:800,cursor:"pointer"}}>▶ NEXT GAME ({gameNum+1}/{SEASON_LENGTH})</button>
                  :<button onClick={()=>setPhase("seasonEnd")} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:10,padding:"11px 28px",fontSize:13,fontWeight:800,cursor:"pointer"}}>🏆 VIEW SEASON RESULTS</button>
                }
              </div>
            </>
          )}
          <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid #1e293b"}}>
            <div style={{fontSize:10,color:"#64748b",fontWeight:800,letterSpacing:1,marginBottom:10}}>TEAM & LEAGUE</div>
          {opp && oppTopPlayer && (
            <div style={{background:"#020617",borderRadius:10,padding:10,border:"1px solid #1e293b",fontSize:11,color:"#9ca3af",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:1,marginBottom:2}}>SCOUTING REPORT</div>
                  <div style={{fontSize:11,color:"#e5e7eb",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {oppTopPlayer.name} · {rf(oppTopPlayer.ppg ?? oppTopPlayer.pts ?? 0, 1)} PTS · {rf(oppTopPlayer.rpg ?? oppTopPlayer.reb ?? 0, 1)} REB · {rf(oppTopPlayer.apg ?? oppTopPlayer.ast ?? 0, 1)} AST
                  </div>
                </div>
                {oppScoutingLabel && (
                  <div style={{fontSize:10,color:"#facc15",fontWeight:700,whiteSpace:"nowrap"}}>
                    {oppScoutingLabel}
                  </div>
                )}
              </div>
            </div>
          )}
          {showAllStarTab && gameNum <= ALL_STAR_GAME_AT && (() => {
            const leaderEntries = Object.values(leagueLeaders || {}).filter((r) => r && (r.gp || 0) > 0);
            if (leaderEntries.length === 0) return <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Play games to see All-Star race.</div>;
            const teamWinPct = {};
            const gp = result ? gameNum : gameNum - 1;
            if (gp > 0 && season?.gp) teamWinPct[myTeamName] = (season.w || 0) / gp;
            (aiTeams || []).forEach((t) => {
              const gl = (t.gameLog || []).slice(0, gp);
              const w = gl.filter((x) => x === 1).length;
              const l = gl.filter((x) => x === 0).length;
              const g = w + l || 1;
              teamWinPct[t.name] = w / g;
            });
            const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
            const conferenceTeams = { East: [], West: [] };
            conferenceTeams[userMeta.conference].push(myTeamName);
            (aiTeams || []).forEach((t) => { if (t.conference && conferenceTeams[t.conference]) conferenceTeams[t.conference].push(t.name); });
            buildAllStarSelections(leaderEntries, gamePogs.slice(0, gp), teamWinPct, conferenceTeams, allStarVotes);
            const getVotes = (p) => (p._allStarVotes ?? allStarVotes[playerVoteKey(p.name, p.team)]) ?? 0;
            const isGuard = (pos) => { const p = (pos || "").toUpperCase(); return p === "PG" || p === "SG" || p === "G"; };
            const isFC = (pos) => !isGuard(pos);
            const topByConf = (confKey) => {
              const conf = leaderEntries.filter((r) => (conferenceTeams[confKey] || []).includes(r.team));
              const guards = conf.filter((r) => isGuard(r.pos)).sort((a, b) => (b._allStarVotes ?? 0) - (a._allStarVotes ?? 0)).slice(0, 10);
              const fc = conf.filter((r) => isFC(r.pos)).sort((a, b) => (b._allStarVotes ?? 0) - (a._allStarVotes ?? 0)).slice(0, 10);
              return { guards, fc };
            };
            const eastRace = topByConf("East");
            const westRace = topByConf("West");
            const isMyPlayer = (p) => p?.team === myTeamName;
            const raceRowStyle = (p) => ({ color: isMyPlayer(p) ? "#22c55e" : "#e2e8f0", fontWeight: isMyPlayer(p) ? 700 : 400, background: isMyPlayer(p) ? "rgba(34,197,94,0.2)" : "transparent", padding: isMyPlayer(p) ? "2px 4px" : 0, borderRadius: 4 });
            const ConfColumns = ({ confLabel, color, guards, fc }) => (
              <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12,fontSize:10}}>
                <div>
                  <div style={{color,fontWeight:700,marginBottom:4}}>{confLabel} Guards</div>
                  {guards.map((p,i)=>(<div key={`g-${i}`} style={raceRowStyle(p)}>{i+1}. {p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team} <span style={{color:"#94a3b8",fontWeight:500}}>({Math.round(getVotes(p))})</span></div>))}
                </div>
                <div>
                  <div style={{color,fontWeight:700,marginBottom:4}}>{confLabel} F/C</div>
                  {fc.map((p,i)=>(<div key={`fc-${i}`} style={raceRowStyle(p)}>{i+1}. {p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos||"—"})</span> · {p.team} <span style={{color:"#94a3b8",fontWeight:500}}>({Math.round(getVotes(p))})</span></div>))}
                </div>
              </div>
            );
            return (
              <div style={{marginBottom:10,background:"#0f172a",borderRadius:10,padding:12,border:"1px solid #334155"}}>
                <div style={{fontSize:10,color:"#fbbf24",fontWeight:800,letterSpacing:1,marginBottom:4}}>⭐ ALL-STAR RACE (through Game {gp})</div>
                <div style={{fontSize:9,color:"#64748b",marginBottom:8}}>Top 10 Guards · Top 10 F/C by votes. Votes = pts + 0.4·reb + 0.8·ast + 1.5·stl + 1·blk − 1·tov, +5 POG, +4 win.</div>
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:16}}>
                  <div style={{background:"#1e293b",borderRadius:8,padding:10,border:"1px solid #3b82f6"}}>
                    <div style={{color:"#60a5fa",fontWeight:700,marginBottom:4}}>EAST</div>
                    <ConfColumns confLabel="East" color="#60a5fa" guards={eastRace.guards} fc={eastRace.fc} />
                  </div>
                  <div style={{background:"#1e293b",borderRadius:8,padding:10,border:"1px solid #ef4444"}}>
                    <div style={{color:"#f87171",fontWeight:700,marginBottom:4}}>WEST</div>
                    <ConfColumns confLabel="West" color="#f87171" guards={westRace.guards} fc={westRace.fc} />
                  </div>
                </div>
              </div>
            );
          })()}
          {showMvpDpoyTab && inSeason && (() => {
            const leaderEntries = Object.values(leagueLeaders || {}).filter((r) => r && (r.gp || 0) > 0);
            if (leaderEntries.length === 0) return <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Play games to see MVP/DPOY race.</div>;
            const gp = result ? gameNum : gameNum - 1;
            const getMvpV = (p) => (mvpVotes || {})[playerVoteKey(p.name, p.team)] ?? 0;
            const getDpoyV = (p) => (dpoyVotes || {})[playerVoteKey(p.name, p.team)] ?? 0;
            const topMvp = [...leaderEntries].sort((a, b) => getMvpV(b) - getMvpV(a)).slice(0, 5);
            const topDpoy = [...leaderEntries].sort((a, b) => getDpoyV(b) - getDpoyV(a)).slice(0, 5);
            const isMyPlayer = (p) => p?.team === myTeamName;
            const rowStyle = (p) => ({ color: isMyPlayer(p) ? "#22c55e" : "#e2e8f0", fontWeight: isMyPlayer(p) ? 700 : 400, background: isMyPlayer(p) ? "rgba(34,197,94,0.2)" : "transparent", padding: isMyPlayer(p) ? "2px 4px" : 0, borderRadius: 4 });
            return (
              <div style={{marginBottom:10,background:"#0f172a",borderRadius:10,padding:12,border:"1px solid #334155"}}>
                <div style={{fontSize:10,color:"#fbbf24",fontWeight:800,letterSpacing:1,marginBottom:6}}>🏅 MVP & DPOY RACE (through Game {gp})</div>
                <div style={{fontSize:9,color:"#64748b",marginBottom:8}}>MVP: 0.5·pts + 0.2·reb + 0.25·ast + 0.15·stl + 0.1·blk − 0.1·tov, +6 POG, +35 per win. DPOY: 3·stl + 2·blk + 0.05·reb, +1 POG, +6 per win.</div>
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12,fontSize:10}}>
                  <div>
                    <div style={{color:"#fbbf24",fontWeight:700,marginBottom:4}}>MVP</div>
                    {topMvp.map((p,i)=>(<div key={`mvp-${i}`} style={rowStyle(p)}>{i+1}. {p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos || "—"})</span> · {p.team} <span style={{color:"#94a3b8",fontWeight:500}}>({Math.round(getMvpV(p))} votes)</span></div>))}
                  </div>
                  <div>
                    <div style={{color:"#22c55e",fontWeight:700,marginBottom:4}}>DPOY</div>
                    {topDpoy.map((p,i)=>(<div key={`dpoy-${i}`} style={rowStyle(p)}>{i+1}. {p.name} <span style={{color:"#64748b",fontSize:9}}>({p.pos || "—"})</span> · {p.team} <span style={{color:"#94a3b8",fontWeight:500}}>({Math.round(getDpoyV(p))} votes)</span></div>))}
                  </div>
                </div>
              </div>
            );
          })()}
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
              <Suspense fallback={<div style={{fontSize:11,color:"#64748b",padding:"4px 0"}}>Loading leaders…</div>}>
                <LeagueLeadersLazy leaders={leagueLeaders} myTeamName={myTeamName}/>
              </Suspense>
            </div>
          )}
          <div style={{marginBottom:10}}>
            <TeamStatsPanel teamName={myTeamName} playerSeasonRows={playerSeasonRows} playerPlayoffRows={playerPlayoffRows} perMode={teamStatsPerMode} onPerModeChange={setTeamStatsPerMode} showPlayoff={false} isMobile={isMobile} seasonNumber={seasonNumber}/>
            <div style={{marginTop:8}}>
              <TeamHighs teamSeasonHighs={teamSeasonHighs} careerTeamHighs={careerTeamHighs} teamPlayoffHighs={{}} roster={roster} title="📈 TEAM HIGHS" showPlayoff={false}/>
            </div>
            {(() => {
              const myTeamAwards = getMyTeamAwardsByPlayer(roster, playerAwards);
              if (myTeamAwards.length === 0) return null;
              return (
                <div style={{marginTop:8,background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #475569"}}>
                  <div style={{fontSize:10,color:"#eab308",fontWeight:800,letterSpacing:2,marginBottom:8}}>🏅 YOUR TEAM'S AWARDS</div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {myTeamAwards.map(({ displayName, list }) => {
                      const grouped = groupAwardsByType(list);
                      return (
                        <div key={displayName} style={{fontSize:11}}>
                          <div style={{fontWeight:700,color:"#e2e8f0",marginBottom:4}}>{displayName}</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
                            {grouped.map(({ award, label, seasons }) => (
                              <span key={label} style={{background:"#1e293b",color:"#94a3b8",borderRadius:6,padding:"3px 8px",fontSize:10,border:"1px solid #334155"}}>
                                {label} ({seasons.map((s) => `S${s}`).join(", ")})
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
          <SeasonHighs highs={seasonHighs} careerHighs={careerLeagueHighs} myTeamName={myTeamName} title="📈 SEASON HIGHS (SINGLE GAME)" seasonNumber={seasonNumber}/>
          </div>
        </div>
        </div>
        <div style={{position:"fixed",bottom:16,right:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
          <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
          <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
        </div>
      </div>
      </>
    );
  }

  const allArchetypes = [...new Set(playerPool.map(p => getArchetype(p).label))].sort();
  const allYears = [...new Set(playerPool.map(p => String(p.season)))].sort((a, b) => b - a);
  const allTeams = [...new Set(playerPool.map(p => p.tm))].sort();

  const filteredPool = playerPool.filter((p) => {
    return (
      (posF === "ALL" || p.pos === posF) &&
      (search === "" || p.name.toLowerCase().includes(search.toLowerCase())) &&
      (archF === "ALL" || getArchetype(p).label === archF) &&
      (yearF === "ALL" || String(p.season) === yearF) &&
      (teamF === "ALL" || p.tm === teamF)
    );
  });

  // One row per player when not deliberately "expanding": no search, year All, team All.
  // That way role/position filters never show duplicate players. When you search (e.g. last name)
  // or pick a year/team, we show all matching rows so every version pops up.
  const showOnePerPlayer = yearF === "ALL" && teamF === "ALL" && search === "";
  const collapsedByName = showOnePerPlayer
    ? (() => {
        const byName = new Map();
        for (const p of filteredPool) {
          const key = ((p.fullName || p.name) || "").toLowerCase().trim();
          if (!key) continue;
          const existing = byName.get(key);
          if (!existing || (p.rating || 0) > (existing.rating || 0)) {
            byName.set(key, p);
          }
        }
        return Array.from(byName.values());
      })()
    : filteredPool;

  const display = collapsedByName.slice().sort((a, b) => {
    if (sortBy === "cost") {
      return sortDir === "desc" ? b.cost - a.cost : a.cost - b.cost;
    }
    // name sort
    return sortDir === "desc"
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name);
  });

  return (
    <div
      style={{
        background: "#080f1e",
        minHeight: "100vh",
        color: "#e2e8f0",
        fontFamily: "'Segoe UI',system-ui",
        padding: isMobile ? "14px 10px" : 14,
      }}
    >
      {showTutorial && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backdropFilter: "blur(4px)" }}>
          <div style={{ background: "linear-gradient(180deg,#0f172a 0%,#0c1222 100%)", borderRadius: 20, border: "1px solid #334155", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(251,191,36,0.15)", maxWidth: 420, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", padding: "20px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "white", letterSpacing: 1, textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>How to play</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 4, fontWeight: 600 }}>Build your team · Win the season</div>
            </div>
            <div style={{ padding: 24, fontSize: 13, color: "#94a3b8", lineHeight: 1.65 }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 14, background: "#1e293b", borderRadius: 10, padding: 14, border: "1px solid #334155" }}>
                <span style={{ fontSize: 20 }}>🏀</span>
                <div><strong style={{ color: "#e2e8f0" }}>Draft 5 players</strong> (PG, SG, SF, PF, C) within <strong style={{ color: "#fbbf24" }}>${BUDGET}</strong>. OOP: Adjacent ×0.82 · Wrong ×0.65</div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 14, background: "#1e293b", borderRadius: 10, padding: 14, border: "1px solid #334155" }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <div><strong style={{ color: "#e2e8f0" }}>Lineup building</strong>: Chemistry (2+ same team+season), Archetypes (balance roles), Team balance (Big, Playmaker, Defense, Scoring)</div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 14, background: "#1e293b", borderRadius: 10, padding: 14, border: "1px solid #334155" }}>
                <span style={{ fontSize: 20 }}>📅</span>
                <div><strong style={{ color: "#e2e8f0" }}>Season</strong>: Play or Sim. 30 teams, 2 conferences, 6 divisions. Track Leaders, All-Star, MVP/DPOY</div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 18, background: "#1e293b", borderRadius: 10, padding: 14, border: "1px solid #334155" }}>
                <span style={{ fontSize: 20 }}>🏆</span>
                <div><strong style={{ color: "#e2e8f0" }}>Playoffs</strong>: Top 6 direct; 7–10 play-in. Win the bracket!</div>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", textAlign: "center" }}>Click <strong style={{ color: "#94a3b8" }}>?</strong> anytime for help</div>
            </div>
            <div style={{ padding: "0 24px 24px" }}>
              <button onClick={dismissTutorial} style={{ width: "100%", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", border: "none", borderRadius: 10, padding: 14, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(245,158,11,0.4)" }}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {showTrophyCase && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowTrophyCase(false)}>
          <div style={{ background: "#0f172a", borderRadius: 16, border: "2px solid #334155", maxWidth: 420, width: "100%", maxHeight: "85vh", overflow: "auto", padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fbbf24" }}>🏆 Achievements</div>
              <button onClick={() => setShowTrophyCase(false)} style={{ background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Close</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(() => {
                const groups = [];
                let cur = null;
                sortAchievementsForDisplay(ACHIEVEMENTS).forEach(a => {
                  const cat = (ACHIEVEMENT_META[a.id] || {}).category || "Other";
                  if (cat !== cur) { groups.push({ cat, items: [] }); cur = cat; }
                  groups[groups.length - 1].items.push(a);
                });
                return groups.map(({ cat, items }) => (
                  <Fragment key={cat}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginTop: 12, marginBottom: 4, paddingBottom: 4, borderBottom: "1px solid #1e293b" }}>{cat}</div>
                    {items.map(a => {
                      const unlocked = (unlockedAchievements || []).includes(a.id);
                      return (
                        <div key={a.id} style={{ background: unlocked ? "#1e293b" : "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 12, opacity: unlocked ? 1 : 0.65 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: unlocked ? "#e2e8f0" : "#64748b" }}>{a.icon} {a.label}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{a.desc}</div>
                          {unlocked && <div style={{ fontSize: 9, color: "#22c55e", marginTop: 6, fontWeight: 700 }}>✓ Unlocked</div>}
                          {unlocked && <button onClick={(e) => { e.stopPropagation(); handleShareAchievement(a); }} style={{ marginTop: 8, background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📤 Share</button>}
                        </div>
                      );
                    })}
                  </Fragment>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {newlyUnlockedAchievements.length > 0 && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 9997, background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", padding: "10px 16px", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: 12, maxWidth: "95vw" }}>
          <span style={{ fontWeight: 800, fontSize: 12 }}>🏆 Achievement unlocked!</span>
          <span style={{ fontSize: 11 }}>
            {newlyUnlockedAchievements.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.label).filter(Boolean).join(", ")}
          </span>
          <button onClick={() => setNewlyUnlockedAchievements([])} style={{ background: "rgba(255,255,255,0.3)", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#fff" }}>Dismiss all</button>
        </div>
      )}

      {saveToast && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 9996, fontSize: 12, fontWeight: 700, color: "#22c55e", padding: "10px 20px", background: "rgba(34,197,94,0.2)", borderRadius: 8, border: "1px solid #22c55e" }}>✓ Saved</div>
      )}
      {showSaveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { setShowSaveModal(false); setSaveOverwriteSlot(null); }}>
          <div style={{ background: "#0f172a", borderRadius: 14, border: "1px solid #334155", padding: 20, maxWidth: 360, width: "100%", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, color: "#e2e8f0" }}>💾 Save</div>
            {saveOverwriteSlot != null ? (
              <>
                <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>Are you sure you want to overwrite Slot {saveOverwriteSlot}? This will replace the existing save.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => saveToSlot(saveOverwriteSlot)} style={{ flex: 1, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "white", border: "none", borderRadius: 8, padding: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Yes, overwrite</button>
                  <button type="button" onClick={() => setSaveOverwriteSlot(null)} style={{ flex: 1, background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 8, padding: 10, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Pick a slot. Empty slots save directly. Existing saves will ask for confirmation.</p>
                {getSlotSummaries().map(({ slot, empty, seasonNumber: sn, gameNum: gn, phase: p, teamName: tn, record, championships, difficultyLabel }) => (
                  <button key={slot} type="button" onClick={() => handleSaveSlotClick(slot, empty)} style={{ width: "100%", textAlign: "left", background: empty ? "#1e293b" : "#111827", border: "1px solid #334155", borderRadius: 8, padding: 12, marginBottom: 8, color: empty ? "#64748b" : "#e2e8f0", fontSize: 12, cursor: "pointer" }}>
                    {empty ? `Slot ${slot} — Empty` : `Slot ${slot}: Season ${sn} · ${p === "game" ? "Game " + gn : p === "seasonEnd" ? "Complete" : p === "playoffs" ? "Playoffs" : "Draft"} · ${tn} ${record !== "—" ? "· " + record : ""} ${championships > 0 ? "· " + championships + " 🏆" : ""} ${difficultyLabel ? "· " + difficultyLabel : ""}`}
                  </button>
                ))}
                <button type="button" onClick={() => setShowSaveModal(false)} style={{ marginTop: 8, width: "100%", background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 8, padding: 8, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}
      {showLoadModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowLoadModal(false)}>
          <div style={{ background: "#0f172a", borderRadius: 14, border: "1px solid #334155", padding: 20, maxWidth: 360, width: "100%", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, color: "#e2e8f0" }}>📂 Load save</div>
            <p style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Pick a slot. Current progress will be replaced.</p>
            {getSlotSummaries().map(({ slot, empty, seasonNumber: sn, gameNum: gn, phase: p, teamName: tn, record, championships, difficultyLabel }) => (
              <div key={slot} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "stretch" }}>
                <button type="button" onClick={() => loadFromSlot(slot)} style={{ flex: 1, textAlign: "left", background: empty ? "#1e293b" : "#111827", border: "1px solid #334155", borderRadius: 8, padding: 12, color: empty ? "#64748b" : "#e2e8f0", fontSize: 12, cursor: "pointer" }}>
                  {empty ? `Slot ${slot} — Empty` : `Slot ${slot}: Season ${sn} · ${p === "game" ? "Game " + gn : p === "seasonEnd" ? "Complete" : p === "playoffs" ? "Playoffs" : "Draft"} · ${tn} ${record !== "—" ? "· " + record : ""} ${championships > 0 ? "· " + championships + " 🏆" : ""} ${difficultyLabel ? "· " + difficultyLabel : ""}`}
                </button>
                {!empty && <button type="button" onClick={(e) => { e.stopPropagation(); deleteSave(slot); }} style={{ background: "#7f1d1d", color: "#fca5a5", border: "1px solid #991b1b", borderRadius: 8, padding: "12px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }} title="Delete save">🗑</button>}
              </div>
            ))}
            <button type="button" onClick={() => setShowLoadModal(false)} style={{ marginTop: 8, width: "100%", background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 8, padding: 8, fontSize: 12, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 50, display: "flex", alignItems: "center", gap: 6, background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
        <button onClick={() => setSoundOn((s) => !s)} style={{ background: soundOn ? "#14532d" : "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 700, color: soundOn ? "#22c55e" : "#9ca3af", cursor: "pointer" }}>{soundOn ? "🔊" : "🔈"}</button>
        <button onClick={skipSong} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "#e2e8f0", cursor: "pointer" }} title="Skip song">⏭ Skip</button>
      </div>

      <Analytics />
      <SpeedInsights />

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Left sidebar - menu off to the side */}
        <aside
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            width: 120,
            background: "#0f172a",
            borderRight: "1px solid #1e293b",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            paddingTop: 12,
            paddingLeft: 8,
            paddingRight: 8,
            gap: 4,
            zIndex: 40,
            overflow: "hidden",
          }}
        >
          {phase !== "teamSetup" && (
            <button
              onClick={goToMainMenu}
              style={{
                width: "100%",
                borderRadius: 8,
                background: "#1e293b",
                border: "1px solid #334155",
                color: "#94a3b8",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 10px",
              }}
            >
              <span style={{ fontSize: 14 }}>🏠</span> Menu
            </button>
          )}
          <button
            onClick={() => setShowSaveModal(true)}
            style={{
              width: "100%",
              borderRadius: 8,
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#a78bfa",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
            }}
          >
            <span style={{ fontSize: 14 }}>💾</span> Save
          </button>
          <button
            onClick={() => setShowLoadModal(true)}
            style={{
              width: "100%",
              borderRadius: 8,
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#94a3b8",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
            }}
          >
            <span style={{ fontSize: 14 }}>📂</span> Load
          </button>
          <button
            onClick={() => setShowTrophyCase(true)}
            title={`Achievements (${(unlockedAchievements||[]).length}/${ACHIEVEMENTS.length})`}
            style={{
              width: "100%",
              borderRadius: 8,
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#fbbf24",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>🏆</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{(unlockedAchievements||[]).length}/{ACHIEVEMENTS.length}</span>
          </button>
          <button
            onClick={() => setShowHelp((h) => !h)}
            title="Help"
            style={{
              width: "100%",
              borderRadius: 8,
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#60a5fa",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 10px",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 900 }}>?</span>
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleLoadTeamCode}
            disabled={inSeason}
            style={{
              width: "100%",
              borderRadius: 8,
              background: "#0f172a",
              border: "1px solid #1e293b",
              color: "#60a5fa",
              fontSize: 11,
              fontWeight: 700,
              cursor: inSeason ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
            }}
          >
            <span style={{ fontSize: 14 }}>📥</span> Load code
          </button>
        </aside>

        <div style={{ marginLeft: 120, flex: 1, maxWidth: 1200, marginRight: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 80 }}>
        {/* Compact top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 10,
            paddingTop: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 900,
                background: "linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              💰 NBA BUDGET BALL
            </h1>
            <span style={{ fontSize: 10, color: "#475569", fontWeight: 600 }}>v1.0</span>
            {phase !== "teamSetup" && (
              <button
                type="button"
                onClick={() => {
                  const v = window.prompt("League name:", leagueName || "NBA");
                  if (v != null) setLeagueName(v.trim() || "NBA");
                }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: "#64748b", fontWeight: 600 }}
                title="Click to rename league"
              >
                {(leagueName && leagueName.trim()) ? leagueName.trim() : "NBA"}
              </button>
            )}
            <span style={{ fontSize: 10, color: "#475569" }}>
              {playerPool.length} players · ${BUDGET} · {SEASON_LENGTH} games
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {[
                ["casual", "Casual"],
                ["standard", "Standard"],
                ["hardcore", "Hardcore"],
              ].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => !inSeason && setDifficulty(val)}
                  style={{
                    background: difficulty === val ? "#4b5563" : "#111827",
                    color: difficulty === val ? "#fef3c7" : "#9ca3af",
                    border: "1px solid #374151",
                    borderRadius: 999,
                    padding: "4px 8px",
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: inSeason ? "not-allowed" : "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "4px 6px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <button onClick={handleCopyTeamCode} title="Copy team code" style={{ background: "#1e293b", color: "#94a3b8", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>🔗 Copy code</button>
              <button onClick={handleShareLineup} title="Share link" style={{ background: "#1e293b", color: "#94a3b8", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>📤 Share link</button>
              <button onClick={handleCopyLineupImage} title="Copy lineup image" style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", color: "#0f172a", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>🖼️ Share image</button>
            </div>
            {shareStatus && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: (typeof shareStatus === "object" && shareStatus.type === "error") ? "#f87171" : (typeof shareStatus === "object" && shareStatus.type === "success") ? "#22c55e" : (typeof shareStatus === "object" && shareStatus.type === "loading") ? "#94a3b8" : "#60a5fa",
                  padding: "2px 8px",
                  background: (typeof shareStatus === "object" && shareStatus.type === "error") ? "rgba(248,113,113,0.15)" : (typeof shareStatus === "object" && shareStatus.type === "success") ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.1)",
                  borderRadius: 6,
                }}
              >
                {(typeof shareStatus === "object" && shareStatus.type === "loading") ? "⏳" : (typeof shareStatus === "object" && shareStatus.type === "success") ? "✓" : (typeof shareStatus === "object" && shareStatus.type === "error") ? "✕" : ""} {typeof shareStatus === "object" ? shareStatus.msg : shareStatus}
              </span>
            )}
          </div>
        </div>

        {/* Budget row */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          {[
            ["BUDGET", `$${rem}`, rem < 15 ? "#ef4444" : rem < 30 ? "#f59e0b" : "#22c55e"],
            ["SPENT", `$${spent}`, "#94a3b8"],
            ["CHEM", myCh > 0 ? `+${myCh}` : "-", "#f472b6"],
            (() => {
              const bal = myLineup ? getTeamBalance(myLineup) : null;
              const arch = bal?.archetypeBonus ?? 0;
              const archVal = arch > 0 ? `+${arch}` : arch < 0 ? String(arch) : "-";
              return ["ARCH", archVal, "#a78bfa"];
            })(),
            (() => {
              const bal = myLineup ? getTeamBalance(myLineup) : null;
              const b = bal?.balanceMod ?? 0;
              const balanceVal = b > 0 ? `+${b}` : b < 0 ? String(b) : "-";
              const balanceColor = b > 0 ? "#22c55e" : b < 0 ? "#f87171" : "#94a3b8";
              return ["TEAM BALANCE", balanceVal, balanceColor];
            })(),
          ].map(([label, val, color]) => (
            <div
              key={label}
              style={{
                textAlign: "center",
                background: "#0f172a",
                borderRadius: 7,
                padding: "4px 10px",
                border: "1px solid #1e293b",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "#475569",
                  letterSpacing: 1,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 900,
                  color,
                }}
              >
                {val}
              </div>
            </div>
          ))}
          {(!hintsDismissed.chemistry || !hintsDismissed.archetypes) && (
            <div style={{ width: "100%", fontSize: 9, color: "#64748b", marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              {!hintsDismissed.chemistry && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Tip: CHEM = teammates from same real team+season <button type="button" onClick={() => dismissHint("chemistry")} style={{ background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 8, fontWeight: 700, cursor: "pointer" }}>Got it</button></span>}
              {!hintsDismissed.archetypes && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Tip: ARCH = roster balance bonus <button type="button" onClick={() => dismissHint("archetypes")} style={{ background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 8, fontWeight: 700, cursor: "pointer" }}>Got it</button></span>}
            </div>
          )}
          <div
            style={{
              background: "#0f172a",
              borderRadius: 7,
              padding: "4px 10px",
              border: "1px solid #1e293b",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#475569",
                letterSpacing: 1,
                marginBottom: 1,
              }}
            >
              TEAM CODE
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#a78bfa",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              {filled === 5
                ? POSITIONS.map((pos) => roster[pos]?.id ?? "").join("-")
                : "—"}
            </div>
          </div>
        </div>

        {/* Budget bar */}
        <div
          style={{
            background: "#1e293b",
            borderRadius: 4,
            height: 5,
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min((spent / BUDGET) * 100, 100)}%`,
              background: "linear-gradient(90deg,#3b82f6,#8b5cf6,#ec4899)",
              transition: "width 0.3s",
              borderRadius: 4,
            }}
          />
        </div>

        {/* Main grid: lineup + player pool */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "270px minmax(0,1fr)",
            gap: 12,
          }}
        >
          {/* Left: lineup */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                background: "#0f172a",
                borderRadius: 12,
                padding: 12,
                border: "1px solid #1e293b",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 10,
                  letterSpacing: 2,
                  color: "#60a5fa",
                  marginBottom: 6,
                }}
              >
                YOUR STARTING 5
              </div>

              {/* Needs strip */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {POSITIONS.map((pos) => {
                    const filledSlot = !!roster[pos];
                    return (
                      <div
                        key={pos}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                          padding: "2px 6px",
                          borderRadius: 9999,
                          background: filledSlot ? "#022c22" : "#020617",
                          border: `1px solid ${
                            filledSlot ? "#16a34a" : "#1f2937"
                          }`,
                          fontSize: 9,
                          fontWeight: 700,
                          color: filledSlot ? "#bbf7d0" : "#64748b",
                        }}
                      >
                        <span>{pos}</span>
                        <span>{filledSlot ? "✓" : "•"}</span>
                      </div>
                    );
                  })}
                </div>
                {openPositions.length > 0 && (
                  <div
                    style={{
                      fontSize: 9,
                      color: "#e5e7eb",
                      background: "#020617",
                      borderRadius: 9999,
                      padding: "2px 8px",
                      border: "1px solid #1e293b",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Remaining/slot: ${remainingPerOpenSlot}
                  </div>
                )}
              </div>

              {/* Slots */}
              {POSITIONS.map((pos) => {
                const p = roster[pos];
                const m = p ? posMult(p, pos) : 1;
                const tier = p ? getTier(p.cost) : null;
                const arch = p ? getArchetype(p) : null;
                const isActive = slotSel === pos;
                return (
                  <div
                    key={pos}
                    onClick={() =>
                      !inSeason && setSlotSel(slotSel === pos ? null : pos)
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 5,
                      background: isActive
                        ? "#1a2a0a"
                        : p
                        ? "#0d2137"
                        : "#080f1e",
                      borderRadius: 8,
                      padding: "7px 8px",
                      border: `1px solid ${
                        isActive
                          ? "#84cc16"
                          : p
                          ? "#1d4ed8"
                          : "#1e293b"
                      }`,
                      cursor: inSeason ? "default" : "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 5,
                        background: isActive
                          ? "#365314"
                          : p
                          ? "#1e3a5f"
                          : "#1e293b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 9,
                        fontWeight: 800,
                        color: isActive ? "#84cc16" : "#60a5fa",
                        flexShrink: 0,
                      }}
                    >
                      {pos}
                    </div>
                    {p ? (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.name}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 3,
                              marginTop: 1,
                              flexWrap: "wrap",
                            }}
                          >
                            <Tag
                              label={tier.label}
                              color={tier.color}
                              bg={tier.bg}
                            />
                            {arch && (
                              <Tag
                                label={arch.label}
                                color={arch.color}
                                bg="#1e293b"
                              />
                            )}
                            {m < 1 && (
                              <Tag
                                label={`OOP ×${m}`}
                                color="#fbbf24"
                                bg="#78350f"
                              />
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "#fbbf24",
                              fontWeight: 900,
                            }}
                          >
                            ${p.cost}
                          </div>
                        </div>
                        {!inSeason && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              drop(pos);
                            }}
                            style={{
                              background: "#7f1d1d",
                              border: "none",
                              borderRadius: 4,
                              color: "#fca5a5",
                              fontSize: 11,
                              width: 18,
                              height: 18,
                              cursor: "pointer",
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </>
                    ) : (
                      <div
                        style={{
                          fontSize: 10,
                          color: isActive ? "#84cc16" : "#334155",
                          fontStyle: "italic",
                        }}
                      >
                        {isActive
                          ? `Picking for ${pos} →`
                          : `Click to set ${pos} →`}
                      </div>
                    )}
                  </div>
                );
              })}

              {myLineup && (() => {
                const bal = getTeamBalance(myLineup);
                if (!bal) return null;
                const suggested = bal.missing?.length > 0 ? (bal.missing[0] === "Big" ? "Add a big" : bal.missing[0] === "Playmaker" ? "Add a playmaker" : bal.missing[0] === "Defense" ? "Add defense" : bal.missing[0] === "Scoring" ? "Add scoring" : "Add " + (bal.missing[0] || "").toLowerCase()) : null;
                return (
                  <>
                    {openPositions.length > 0 && suggested && (
                      <div style={{ marginTop: 6, fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>
                        Suggested: {suggested}
                      </div>
                    )}
                    <div style={{ marginTop: 6, background: "#080f1e", borderRadius: 8, padding: "6px 8px", border: "1px solid #1e293b" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1 }}>TEAM BALANCE</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: bal.color }}>{bal.grade}</div>
                      </div>
                      {bal.archetypeBonus !== 0 && (
                        <div style={{ fontSize: 10, color: bal.archetypeBonus > 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                          🧩 Archetype bonus: {bal.archetypeBonus > 0 ? "+" : ""}{bal.archetypeBonus}
                        </div>
                      )}
                      {bal.activeSynergies?.length > 0 && (
                        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 4 }}>
                          Active: {bal.activeSynergies.map((s) => s.label + " (" + (s.bonus >= 0 ? "+" : "") + s.bonus + ")").join(", ")}
                        </div>
                      )}
                      {bal.missing?.length > 0 && (
                        <div style={{ fontSize: 9, color: "#f87171", marginTop: 2 }}>Missing: {bal.missing.join(", ")}</div>
                      )}
                    </div>
                  </>
                );
              })()}

              <button
                onClick={startSeason}
                disabled={!full || inSeason}
                style={{
                  width: "100%",
                  marginTop: 6,
                  background:
                    full && !inSeason
                      ? "linear-gradient(135deg,#f59e0b,#d97706)"
                      : "#1e293b",
                  color: full && !inSeason ? "white" : "#374151",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor:
                    full && !inSeason ? "pointer" : "not-allowed",
                }}
              >
                {full
                  ? "🏀 START SEASON"
                  : `${5 - filled} SLOT${5 - filled !== 1 ? "S" : ""} REMAINING`}
              </button>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <button
                  onClick={() => {
                    if (inSeason) return;
                    setRoster({
                      PG: null,
                      SG: null,
                      SF: null,
                      PF: null,
                      C: null,
                    });
                    setSlotSel(null);
                  }}
                  disabled={inSeason || filled === 0}
                  style={{
                    background:
                      filled === 0 || inSeason ? "#111827" : "#1f2937",
                    color:
                      filled === 0 || inSeason ? "#4b5563" : "#fca5a5",
                    border: "1px solid #4b5563",
                    borderRadius: 6,
                    padding: "5px 10px",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor:
                      filled === 0 || inSeason
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  ✕ Clear lineup
                </button>
              </div>
              {showHelp && (
                <div
                  style={{
                    background: "linear-gradient(180deg,#0f172a 0%,#0c1222 100%)",
                    borderRadius: 12,
                    padding: 0,
                    border: "1px solid #334155",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                    marginTop: 8,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: "linear-gradient(135deg,#f59e0b,#d97706)",
                      padding: "8px 12px",
                      fontWeight: 800,
                      fontSize: 10,
                      color: "white",
                      letterSpacing: 1,
                    }}
                  >
                    HOW TO PLAY
                  </div>
                  <div style={{ padding: 12, fontSize: 10, color: "#94a3b8", lineHeight: 1.55 }}>
                    <div style={{ marginBottom: 6, display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "#60a5fa" }}>📍</span><span><strong style={{ color: "#e2e8f0" }}>Positions</strong>: One per slot (PG–C). OOP: Adjacent ×0.82 · Wrong ×0.65</span></div>
                    <div style={{ marginBottom: 6, display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "#fbbf24" }}>💰</span><span><strong style={{ color: "#e2e8f0" }}>Budget</strong>: ${BUDGET} for 5 players</span></div>
                    <div style={{ marginBottom: 6, display: "flex", gap: 8, alignItems: "flex-start" }}><span>⚡</span><span><strong style={{ color: "#e2e8f0" }}>Chemistry</strong>: 2+ same team+season (bigger for 3–5)</span></div>
                    <div style={{ marginBottom: 6, display: "flex", gap: 8, alignItems: "flex-start" }}><span>🧩</span><span><strong style={{ color: "#e2e8f0" }}>Archetypes</strong>: Balance roles for bonuses</span></div>
                    <div style={{ marginBottom: 6, display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "#22c55e" }}>⚖️</span><span><strong style={{ color: "#e2e8f0" }}>Team balance</strong>: Need Big, Playmaker, Defense, Scoring. 3+ scorers hurt</span></div>
                    <div style={{ marginBottom: 6, display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "#a78bfa" }}>🏀</span><span>30 teams · 82 games · Top 6 direct · 7–10 play-in</span></div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "#f472b6" }}>🎚</span><span><strong style={{ color: "#e2e8f0" }}>Difficulty</strong>: Casual / Standard / Hardcore</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: player pool */}
          <div>
            {/* Filters */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 5,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 3,
                    flexWrap: "wrap",
                  }}
                >
                  {["ALL", ...POSITIONS].map((f) => (
                    <button
                      key={f}
                      onClick={() => setPosF(f)}
                      style={{
                        background:
                          posF === f ? "#3b82f6" : "#1e293b",
                        color: posF === f ? "white" : "#94a3b8",
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="🔍 Search..."
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    padding: "5px 10px",
                    fontSize: 11,
                    color: "#e2e8f0",
                    outline: "none",
                    width: 140,
                  }}
                />
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    gap: 3,
                  }}
                >
                  {[
                    ["cost", "$"],
                    ["name", "A–Z"],
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => {
                        if (sortBy === k) {
                          setSortDir((d) =>
                            d === "desc" ? "asc" : "desc"
                          );
                        } else {
                          setSortBy(k);
                          setSortDir("desc");
                        }
                      }}
                      style={{
                        background:
                          sortBy === k ? "#4c1d95" : "#1e293b",
                        color:
                          sortBy === k ? "#c4b5fd" : "#64748b",
                        border: "none",
                        borderRadius: 5,
                        padding: "4px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                      {sortBy === k
                        ? sortDir === "desc"
                          ? " ↓"
                          : " ↑"
                        : ""}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 3,
                  flexWrap: "wrap",
                  paddingBottom: 4,
                }}
              >
                {["ALL", ...allArchetypes].map((f) => {
                  const arch =
                    f === "ALL"
                      ? null
                      : playerPool.find(
                          (p) => getArchetype(p).label === f
                        );
                  const col = arch
                    ? getArchetype(arch).color
                    : "#94a3b8";
                  return (
                    <button
                      key={f}
                      onClick={() => setArchF(f)}
                      style={{
                        background:
                          archF === f ? "#1e293b" : "#0f172a",
                        color: archF === f ? col : "#475569",
                        border: `1px solid ${
                          archF === f ? col : "#1e293b"
                        }`,
                        borderRadius: 6,
                        padding: "3px 8px",
                        fontSize: 9,
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={yearF}
                  onChange={(e) => setYearF(e.target.value)}
                  title={showOnePerPlayer ? "All Years = one row per player. Pick a year to see all seasons." : ""}
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    padding: "5px 8px",
                    fontSize: 11,
                    color: "#e2e8f0",
                    outline: "none",
                  }}
                >
                  <option value="ALL">All Years</option>
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select
                  value={teamF}
                  onChange={(e) => setTeamF(e.target.value)}
                  title={showOnePerPlayer ? "All Teams = one row per player. Pick a team to see all seasons." : ""}
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    padding: "5px 8px",
                    fontSize: 11,
                    color: "#e2e8f0",
                    outline: "none",
                  }}
                >
                  <option value="ALL">All Teams</option>
                  {allTeams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {(archF !== "ALL" ||
                  yearF !== "ALL" ||
                  teamF !== "ALL" ||
                  search !== "") && (
                  <button
                    onClick={() => {
                      setArchF("ALL");
                      setYearF("ALL");
                      setTeamF("ALL");
                      setSearch("");
                    }}
                    style={{
                      background: "#7f1d1d",
                      color: "#fca5a5",
                      border: "none",
                      borderRadius: 6,
                      padding: "5px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Clear filters
                  </button>
                )}
                <div
                  style={{
                    fontSize: 10,
                    color: "#475569",
                    marginLeft: "auto",
                  }}
                >
                  {display.length} players
                </div>
              </div>
            </div>

            {topPicks.length > 0 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 800, letterSpacing: 1 }}>🔥 MOST DRAFTED</span>
                {topPicks.map((p, i) => (
                  <span
                    key={p.player_name || p.name || i}
                    onClick={() => setSearch((p.player_name || p.name || "").trim())}
                    style={{ fontSize: 9, background: "#1e293b", border: "1px solid rgba(245,158,11,0.27)", borderRadius: 6, padding: "3px 8px", color: "#e2e8f0", whiteSpace: "nowrap", cursor: "pointer" }}
                  >
                    <span style={{ color: "#475569", marginRight: 3 }}>#{i + 1}</span>
                    {p.player_name || p.name}
                    <span style={{ color: "#f59e0b", fontWeight: 700, marginLeft: 4 }}>{p.picks}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Player cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "repeat(2,1fr)"
                  : "repeat(auto-fill,minmax(180px,1fr))",
                gap: 6,
                minWidth: 0,
              }}
            >
              {display.map((p) => {
                const inR = myIds.has(p.id);
                const targetSlot = slotSel || p.pos;
                const prev = roster[targetSlot];
                const delta = p.cost - (prev?.cost || 0);
                const afford = delta <= rem;
                const tier = getTier(p.cost);
                const wouldOop = slotSel && slotSel !== p.pos;
                const mult = slotSel ? posMult(p, slotSel) : 1;
                const chemKey =
                  p.tm && p.season ? `${p.tm}|${p.season}` : null;
                const nameKey = p.fullName || p.name;
                const duplicateOfRoster = Object.values(roster).some(
                  (rp) =>
                    rp &&
                    (rp.fullName || rp.name) === nameKey &&
                    rp.id !== p.id
                );
                const disabled =
                  inSeason || (!inR && (!afford || duplicateOfRoster));
                const isRosterHovered = inR && rosterHoverId === p.id;
                const bgBase = inR
                  ? (isRosterHovered ? "#2a0d0d" : "#0d2a0d")
                  : slotSel && afford
                  ? "#131a2e"
                  : "#0f172a";
                const bg = duplicateOfRoster ? "#020617" : bgBase;
                const border = duplicateOfRoster
                  ? "#111827"
                  : inR
                  ? (isRosterHovered ? "#ef4444" : "#22c55e")
                  : slotSel && afford
                  ? "#6366f1"
                  : "#1e293b";

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (disabled) return;
                      if (!inSeason) {
                        if (inR) {
                          const posKey = Object.keys(roster).find(
                            (pos) => roster[pos]?.id === p.id
                          );
                          if (posKey) drop(posKey);
                        } else if (afford && !duplicateOfRoster) {
                          pickPlayer(p);
                        }
                      }
                    }}
                    onMouseEnter={() => {
                      if (chemKey) setChemHoverKey(chemKey);
                      if (inR) setRosterHoverId(p.id);
                    }}
                    onMouseLeave={() => {
                      setChemHoverKey(null);
                      setRosterHoverId(null);
                    }}
                    onTouchStart={() => {
                      if (chemKey) setChemHoverKey(chemKey);
                      if (inR) setRosterHoverId((prev) => (prev === p.id ? null : p.id));
                    }}
                    onTouchEnd={() => { setChemHoverKey(null); setRosterHoverId(null); }}
                    style={{
                      background: bg,
                      border: `1px solid ${border}`,
                      borderRadius: 9,
                      padding: 9,
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.4 : 1,
                      transition: "all 0.12s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 2,
                            marginTop: 2,
                            flexWrap: "wrap",
                          }}
                        >
                          <Tag
                            label={p.pos}
                            color="#93c5fd"
                            bg="#1e3a5f"
                          />
                          <Tag
                            label={tier.label}
                            color={tier.color}
                            bg={tier.bg}
                          />
                          {wouldOop && afford && (
                            <Tag
                              label={`×${mult}`}
                              color="#fbbf24"
                              bg="#78350f"
                            />
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          flexShrink: 0,
                          marginLeft: 5,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            color: duplicateOfRoster
                              ? "#4b5563"
                              : "#fbbf24",
                            fontWeight: 900,
                          }}
                        >
                          ${p.cost}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        textAlign: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          background: "#1e293b",
                          color: getArchetype(p).color,
                          borderRadius: 5,
                          padding: "2px 8px",
                          letterSpacing: 1,
                        }}
                      >
                        {getArchetype(p).label}
                      </span>
                    </div>
                    {p.tm && p.season && (
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 8,
                          color: "#334155",
                          textAlign: "center",
                        }}
                      >
                        {p.tm} · {p.season}
                      </div>
                    )}
                    {((playerAwards[p.name] || playerAwards[p.fullName] || []).length > 0) && (
                      <div style={{ marginTop: 3, fontSize: 8, color: "#eab308", textAlign: "center", fontWeight: 700 }}>
                        {(playerAwards[p.name] || playerAwards[p.fullName] || []).map(({ season, award }) => `${AWARD_LABELS[award] || award} (S${season})`).join(", ")}
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 8,
                        marginTop: 4,
                      }}
                    >
                      {[
                        ["PTS", p.pts],
                        ["REB", p.reb],
                        ["AST", p.ast],
                      ].map(([label, v]) => (
                        <div key={label} style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontSize: 9,
                              color: "#475569",
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#e2e8f0",
                            }}
                          >
                            {rf(v, 1)}
                          </div>
                        </div>
                      ))}
                    </div>
                    {inR && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 9,
                          color: "#f87171",
                          fontWeight: 700,
                          textAlign: "center",
                        }}
                      >
                        Click to remove
                      </div>
                    )}
                    {!afford && !inR && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 9,
                          color: "#ef4444",
                          textAlign: "center",
                        }}
                      >
                        {"+$" + (delta - rem) + " over"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}