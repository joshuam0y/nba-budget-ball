/**
 * Achievements / milestones. id is used for localStorage; label and desc for UI.
 */
export const ACHIEVEMENTS = [
  { id: "first_playoff", label: "First playoff berth", desc: "Make the playoffs for the first time", icon: "🎟" },
  { id: "first_championship", label: "First championship", desc: "Win the title for the first time", icon: "🏆" },
  { id: "perfect_82", label: "Perfect season", desc: "Go 82–0 in the regular season", icon: "💯" },
  { id: "all_star_1", label: "1 All-Star", desc: "Have 1 player selected as an All-Star", icon: "⭐" },
  { id: "all_star_2", label: "2 All-Stars", desc: "Have 2 players selected as All-Stars", icon: "⭐" },
  { id: "all_star_3", label: "3 All-Stars", desc: "Have 3 players selected as All-Stars", icon: "⭐" },
  { id: "all_star_4", label: "4 All-Stars", desc: "Have 4 players selected as All-Stars", icon: "⭐" },
  { id: "all_five_all_star", label: "All 5 All-Stars", desc: "Have all 5 starters selected as All-Stars", icon: "⭐" },
  { id: "three_peat", label: "Three-peat", desc: "Win 3 championships in a row", icon: "3️⃣" },
  { id: "mvp_winner", label: "MVP on your team", desc: "Your player wins League MVP", icon: "🏅" },
  { id: "dpoy_winner", label: "DPOY on your team", desc: "Your player wins Defensive Player of the Year", icon: "🛡️" },
  { id: "scoring_title", label: "Scoring champion", desc: "Your player leads the league in points per game", icon: "🏀" },
  { id: "rebounding_champion", label: "Rebounding champion", desc: "Your player leads the league in rebounds per game", icon: "📦" },
  { id: "assists_leader", label: "Assists leader", desc: "Your player leads the league in assists per game", icon: "🎯" },
  { id: "steals_leader", label: "Steals leader", desc: "Your player leads the league in steals per game", icon: "✋" },
  { id: "blocks_leader", label: "Blocks leader", desc: "Your player leads the league in blocks per game", icon: "🚫" },
  { id: "win_streak_10", label: "Double-digit streak", desc: "Win 10+ games in a row", icon: "🔥" },
  { id: "fifty_wins", label: "50-win season", desc: "Win 50+ games in the regular season", icon: "📈" },
  { id: "one_seed", label: "Top seed", desc: "Finish #1 in your conference", icon: "👑" },
  { id: "all_nba_winner", label: "All-NBA on your team", desc: "Your player makes All-NBA (1st, 2nd, or 3rd team)", icon: "📋" },
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
  { id: "triple_double", label: "Triple-double", desc: "A player records a triple-double in a game", icon: "📊" },
  { id: "fifty_point_game", label: "50-point game", desc: "A player scores 50+ points in a game", icon: "🔥" },
  { id: "sixty_point_game", label: "60-point game", desc: "A player scores 60+ points in a game", icon: "🔥" },
  { id: "seventy_point_game", label: "70-point game", desc: "A player scores 70+ points in a game", icon: "🔥" },
  { id: "eighty_point_game", label: "80-point game", desc: "A player scores 80+ points in a game", icon: "🔥" },
  { id: "ninety_point_game", label: "90-point game", desc: "A player scores 90+ points in a game", icon: "🔥" },
  { id: "hundred_point_game", label: "100-point game", desc: "A player scores 100+ points in a game", icon: "💯" },
  { id: "quadruple_double", label: "Quadruple-double", desc: "A player records a quadruple-double in a game", icon: "🌟" },
  { id: "sixty_wins", label: "60-win season", desc: "Win 60+ games in the regular season", icon: "📈" },
  { id: "seventy_wins", label: "70-win season", desc: "Win 70+ games in the regular season", icon: "📈" },
  { id: "curry_who", label: "Curry Who?", desc: "Win 74+ games (beat the 73–9 Warriors)", icon: "🏀" },
  { id: "blowout", label: "Blowout", desc: "Win a game by 40+ points", icon: "💥" },
  { id: "overtime_win", label: "Overtime", desc: "Win an overtime game", icon: "⏱️" },
  { id: "sweep", label: "Sweep", desc: "Sweep a playoff series 4–0", icon: "🧹" },
  { id: "undefeated_playoffs", label: "Undefeated playoffs", desc: "Win the title without losing a playoff game", icon: "💎" },
  { id: "reverse_sweep", label: "Reverse sweep", desc: "Win a series after going down 0–3", icon: "↩️" },
  { id: "game_seven", label: "Game 7", desc: "Win a Game 7", icon: "7️⃣" },
  { id: "upset", label: "Upset", desc: "Beat a higher seed in a playoff series", icon: "🎲" },
  { id: "first_win", label: "First win", desc: "Win your first game", icon: "✅" },
  { id: "first_playoff_win", label: "First playoff win", desc: "Win your first playoff game", icon: "🎟" },
  { id: "all_star_starter", label: "All-Star starter", desc: "Have a player named an All-Star starter", icon: "⭐" },
  { id: "all_star_starter_2", label: "2 All-Star starters", desc: "Have 2 players named All-Star starters", icon: "⭐" },
  { id: "bounce_back", label: "Bounce back", desc: "Win the title the season after missing the playoffs", icon: "🔄" },
  { id: "rivalry", label: "Rivalry", desc: "Beat the same team 4 times in the regular season and again in the playoffs", icon: "⚔️" },
  { id: "clutch", label: "Clutch", desc: "Win a game by 1–3 points", icon: "🎯" },
  { id: "five_double_figures", label: "Five in double figures", desc: "Have 5 players score 10+ points in a game", icon: "✋" },
  { id: "five_by_five", label: "Five-by-five", desc: "A player has 5+ points, rebounds, assists, steals, and blocks in a game", icon: "📋" },
  { id: "conference_finals", label: "Conference finals", desc: "Reach the conference finals (final four)", icon: "🏅" },
  { id: "beat_every_team", label: "Beat every team", desc: "Beat all 29 other teams in one regular season", icon: "🌐" },
  { id: "elimination_win", label: "Elimination win", desc: "Win a playoff game when facing elimination", icon: "💪" },
  { id: "second_round", label: "Second round", desc: "Reach the second round of the playoffs", icon: "📈" },
  { id: "double_double", label: "Double-double", desc: "A player has 10+ in two of points, rebounds, and assists in a game", icon: "📊" },
  { id: "all_league_leaders", label: "Led team in all 5", desc: "One player leads your team in points, rebounds, assists, steals, and blocks in a season", icon: "👑" },
  { id: "make_finals", label: "Make the Finals", desc: "Win the conference finals and reach the NBA Finals", icon: "🏆" },
  { id: "three_point_leader", label: "3-point leader", desc: "Your player leads the league in 3PM (three-pointers made)", icon: "🎯" },
  { id: "clinched_division", label: "Clinched division", desc: "Clinch your division title during the season", icon: "📋" },
  { id: "finals_mvp_winner", label: "Finals MVP on your team", desc: "Your player wins Finals MVP", icon: "🏆" },
  { id: "mega_blowout", label: "Mega blowout", desc: "Win a game by 50+ points", icon: "💥" },
  { id: "twenty_twenty", label: "20–20 game", desc: "A player has 20+ in two of points, rebounds, and assists in a game", icon: "📊" },
  { id: "thirty_thirty", label: "30–30 game", desc: "A player has 30+ in two of points, rebounds, and assists in a game", icon: "📊" },
  { id: "forty_forty", label: "40–40 game", desc: "A player has 40+ in two of points, rebounds, and assists in a game", icon: "📊" },
  { id: "twenty_twenty_twenty", label: "20–20–20 game", desc: "A player has 20+ points, rebounds, and assists in a game", icon: "🌟" },
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
