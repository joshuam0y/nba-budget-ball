/**
 * Achievements / milestones. id is used for localStorage; label and desc for UI.
 */
export const ACHIEVEMENTS = [
  { id: "first_playoff", label: "First playoff berth", desc: "Make the playoffs for the first time", icon: "🎟" },
  { id: "first_championship", label: "First championship", desc: "Win the title for the first time", icon: "🏆" },
  { id: "perfect_82", label: "Perfect season", desc: "Go 82–0 in the regular season", icon: "💯" },
  { id: "all_five_all_star", label: "All 5 All-Stars", desc: "Have all 5 starters selected as All-Stars", icon: "⭐" },
  { id: "three_peat", label: "Three-peat", desc: "Win 3 championships in a row", icon: "3️⃣" },
  { id: "mvp_winner", label: "MVP on your team", desc: "Your player wins League MVP", icon: "🏅" },
  { id: "dpoy_winner", label: "DPOY on your team", desc: "Your player wins Defensive Player of the Year", icon: "🛡️" },
  { id: "win_streak_10", label: "Double-digit streak", desc: "Win 10+ games in a row", icon: "🔥" },
  { id: "fifty_wins", label: "50-win season", desc: "Win 50+ games in the regular season", icon: "📈" },
  { id: "one_seed", label: "Top seed", desc: "Finish #1 in your conference", icon: "👑" },
  { id: "all_nba_winner", label: "All-NBA on your team", desc: "Your player makes All-NBA (1st, 2nd, or 3rd team)", icon: "📋" },
  { id: "first_finals", label: "Finals debut", desc: "Reach the Finals for the first time", icon: "🎯" },
  { id: "dynasty", label: "Dynasty", desc: "Win 5 championships", icon: "👑" },
  { id: "winning_season", label: "Winning season", desc: "Finish above .500 for the first time", icon: "📊" },
  { id: "play_in_survivor", label: "Play-in survivor", desc: "Reach the first round after starting in the play-in (7–10 seed)", icon: "🔓" },
  { id: "all_defensive_winner", label: "All-Defensive on your team", desc: "Your player makes All-Defensive 1st or 2nd team", icon: "🛡️" },
  { id: "triple_crown", label: "Triple crown", desc: "Your player wins MVP and DPOY and you win the title in the same season", icon: "🌟" },
  { id: "cinderella", label: "Cinderella", desc: "Win the title as a 6, 7, or 8 seed", icon: "🎃" },
  { id: "no_sweep", label: "No sweep", desc: "Get eliminated but win at least one game in the series you lost", icon: "💪" },
  { id: "home_court", label: "Home court", desc: "Go undefeated at home in the regular season (41–0)", icon: "🏠" },
  { id: "road_warrior", label: "Road warrior", desc: "Win 25+ road games in a season", icon: "🛤️" },
  { id: "revenge", label: "Revenge", desc: "Beat the team that eliminated you last season", icon: "⚔️" },
  { id: "seasons_10", label: "Veteran", desc: "Complete 10 seasons", icon: "🔟" },
  { id: "seasons_20", label: "Franchise player", desc: "Complete 20 seasons", icon: "2️⃣0️⃣" },
  { id: "seasons_50", label: "Half century", desc: "Complete 50 seasons", icon: "5️⃣0️⃣" },
  { id: "seasons_100", label: "Century", desc: "Complete 100 seasons", icon: "💯" },
];

const STORAGE_KEY = "nba_budget_ball_achievements";

export function getUnlockedAchievements() {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function unlockAchievement(id) {
  const unlocked = getUnlockedAchievements();
  if (unlocked.includes(id)) return false;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked, id]));
    }
    return true;
  } catch {
    return false;
  }
}
