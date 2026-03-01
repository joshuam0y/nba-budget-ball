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
  { id: "finals_mvp", label: "Finals MVP", desc: "Your player wins Finals MVP", icon: "🌟" },
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
