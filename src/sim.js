// Pure simulation and stats logic for NBA Budget Ball.
// No React imports here – this is all reusable game logic.

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
export const BUDGET = 140;
export const SEASON_LENGTH = 82;
export const ALL_STAR_GAME_AT = 50;
export const POOL_SIZE = 150;
export const NUM_TEAMS = 30;

// Team scoring; slight bump up for PTS
const TARGET_POSS_PER_TEAM_MIN = 98;
const TARGET_POSS_PER_TEAM_MAX = 104;
const TARGET_TEAM_PTS_MEAN = 114;
const TARGET_TEAM_PTS_SD = 6;
const TARGET_TEAM_PTS_MIN = 99;
const TARGET_TEAM_PTS_MAX = 135;
// Not every miss = player rebound; slight bump so REB a little higher
const REB_CREDIT_RATE = 0.98;
// Offensive rebounds: we split ORB vs DRB. Real NBA ~22–26% of rebounds are ORB.
const ORB_PROB = 0.26; // on a missed shot, prob that offense gets the board
const DEF_REB_AFTER_BLOCK = 0.80; // after a block, prob that defense gets the board (20% ORB)

export const NBA_DIVISIONS = {
  Atlantic: ["Boston Celtics", "Toronto Raptors", "Philadelphia 76ers", "Brooklyn Nets", "New York Knicks"],
  Central: ["Milwaukee Bucks", "Cleveland Cavaliers", "Indiana Pacers", "Chicago Bulls", "Detroit Pistons"],
  Southeast: ["Miami Heat", "Atlanta Hawks", "Washington Wizards", "Orlando Magic", "Charlotte Hornets"],
  Northwest: ["Oklahoma City Thunder", "Denver Nuggets", "Minnesota Timberwolves", "Utah Jazz", "Portland Trail Blazers"],
  Pacific: ["Los Angeles Lakers", "Phoenix Suns", "Sacramento Kings", "Golden State Warriors", "Los Angeles Clippers"],
  Southwest: ["Dallas Mavericks", "Memphis Grizzlies", "New Orleans Pelicans", "San Antonio Spurs", "Houston Rockets"],
};
export const NBA_CONFERENCE_BY_DIVISION = {
  Atlantic: "East", Central: "East", Southeast: "East",
  Northwest: "West", Pacific: "West", Southwest: "West",
};
export function getNBATeamsWithMeta() {
  const teams = [];
  let idx = 0;
  for (const [div, names] of Object.entries(NBA_DIVISIONS)) {
    const conf = NBA_CONFERENCE_BY_DIVISION[div];
    for (const name of names) {
      teams.push({ name, division: div, conference: conf, index: idx++ });
    }
  }
  return teams;
}

export function rf(n, d = 1) {
  return parseFloat((+n).toFixed(d));
}

export function ri(n) {
  return Math.round(n);
}

export function clamp(v, mn, mx) {
  return Math.max(mn, Math.min(mx, v));
}

export function gauss(s = 1) {
  const u = Math.max(1e-10, Math.random());
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * s;
}

export function processCSV(text) {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const idx = (name) => headers.indexOf(name.toLowerCase());
  const get = (row, name) =>
    (row[idx(name)] || "").trim().replace(/^"|"$/g, "");
  const num = (row, name) => parseFloat(get(row, name)) || 0;
  const players = [];
  const seen = new Set();
  const teamRoster = {};

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (row.length < 10) continue;
    const name = get(row, "name");
    const fullName = get(row, "fullname");
    const pos = get(row, "pos");
    const season = get(row, "season");
    const tm = get(row, "tm").toUpperCase();
    if (!name || !season || !pos || tm === "TOT") continue;
    const key = `${name}|${season}|${tm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pts = num(row, "pts");
    const ast = num(row, "ast");
    const reb = num(row, "reb");
    const stl = num(row, "stl");
    const blk = num(row, "blk");
    const tov = num(row, "tov");
    const fg = num(row, "fg");
    const ts = num(row, "ts");
    const tR = num(row, "tr");
    const ftPct = num(row, "ftpct");
    const tpPct = num(row, "tppct");
    const rating = num(row, "rating");
    const cost = Math.min(40, Math.max(5, Math.round(num(row, "cost"))));
    if (pts < 1 || !rating) continue;
    players.push({
      name,
      fullName,
      pos,
      season,
      tm,
      pts,
      ast,
      reb,
      stl,
      blk,
      tov,
      fg,
      ts,
      tR,
      ftPct,
      tpPct,
      rating,
      cost,
    });
    const rk = `${season}|${tm}`;
    if (!teamRoster[rk]) teamRoster[rk] = [];
    teamRoster[rk].push(name);
  }
  if (players.length === 0) {
    console.error("No players parsed. Headers:", headers);
    return null;
  }
  const sorted = [...players].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  // Full pool for drafting; league uses 150 unique (your 5 + 145 AI) at season start
  console.log(`✓ Pool: ${sorted.length} players available for draft. League uses ${POOL_SIZE} unique.`);

  const withIdsAndArch = sorted.map((p, i) => {
    const archetype = getArchetype(p);
    return { ...p, id: i + 1, archetype };
  });

  return { players: withIdsAndArch, teamRoster };
}

// Chemistry: same team + same season. Much bigger boost for full squads (3–5 teammates).
// Tuned for future "full squad" mode where users control teams of one roster.
const CHEM_BY_COUNT = { 2: 4, 3: 14, 4: 28, 5: 48 };
export function chemBoost(lineup, teamRoster) {
  if (!teamRoster) return 0;
  let boost = 0;
  const counted = new Set();
  for (const rk of Object.keys(teamRoster)) {
    if (!Array.isArray(teamRoster[rk])) continue;
    const roster = new Set(teamRoster[rk]);
    const matches = lineup.filter(({ player }) => roster.has(player.name));
    if (matches.length >= 2) {
      const pairKey = `${rk}|${matches
        .map((m) => m.player.name)
        .sort()
        .join(",")}`;
      if (!counted.has(pairKey)) {
        counted.add(pairKey);
        const n = Math.min(matches.length, 5);
        boost += CHEM_BY_COUNT[n] ?? CHEM_BY_COUNT[2];
      }
    }
  }
  return boost;
}

const ADJ = {
  PG: ["SG"],
  SG: ["PG", "SF"],
  SF: ["SG", "PF"],
  PF: ["SF", "C"],
  C: ["PF"],
};

export function posMult(player, slot) {
  if (player.pos === slot) return 1.0;
  const arch = getArchetype(player).id;
  const isBigArch = (player.pos === "PF" || player.pos === "C") && arch === "playmaker";
  if (
    (isBigArch ||
      arch === "stretch" ||
      arch === "rimProt" ||
      arch === "interior") &&
    (slot === "PG" || slot === "SG")
  )
    return 0.45;
  if (ADJ[player.pos]?.includes(slot)) return 0.82;
  return 0.65;
}

export function teamEff(lineup, teamRoster) {
  const base = lineup.reduce(
    (s, { player, slot }) => s + player.rating * posMult(player, slot),
    0
  );
  const archBonus = lineup.length === 5 ? archetypeChemBonus(lineup) : 0;
  const { hasBig, hasPlaymaker, hasDefense, hasScoring } = getBalanceFlags(lineup);
  const missingCount = [hasBig, hasPlaymaker, hasDefense, hasScoring].filter(Boolean).length;
  const missing = 4 - missingCount;
  const balanceMod =
    lineup.length === 5
      ? missing === 0
        ? 6
        : -4 * missing
      : 0;
  return base + chemBoost(lineup, teamRoster) + archBonus + balanceMod;
}

export function genLineup(excludeIds = new Set(), pool = [], excludeNames = new Set()) {
  const used = new Set(excludeIds);
  const usedNames = new Set(excludeNames);
  const team = [];
  let rem = BUDGET;
  for (const pos of POSITIONS) {
    const eligible = pool.filter((p) => {
      const nameKey = p.fullName || p.name;
      return p.pos === pos && !used.has(p.id) && !usedNames.has(nameKey);
    });
    const cands =
      eligible.length > 0
        ? eligible
        : pool.filter((p) => {
            const nameKey = p.fullName || p.name;
            return !used.has(p.id) && !usedNames.has(nameKey);
          });
    if (!cands.length) continue;
    const avg = rem / Math.max(POSITIONS.length - team.length, 1);
    const weights = cands.map((p) =>
      Math.max(
        0.1,
        (1 - Math.abs(p.cost - avg) / Math.max(avg, 1)) *
          p.rating *
          (p.cost <= rem ? 1 : 0.05)
      )
    );
    const tot = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    let pick = cands[cands.length - 1];
    for (let k = 0; k < cands.length; k++) {
      r -= weights[k];
      if (r <= 0) {
        pick = cands[k];
        break;
      }
    }
    team.push({ player: pick, slot: pos });
    used.add(pick.id);
    usedNames.add(pick.fullName || pick.name);
    rem -= pick.cost;
  }
  return team;
}

export function generateRivalLineup(myLineup, pool, excludeIds) {
  const archs = myLineup.map(({ player }) => getArchetype(player).id);
  const hasScorers = archs.some((a) => a === "scorer");
  const hasPassers = archs.some((a) => a === "playmaker");
  const hasBigs = archs.some((a) => ["rimProt", "interior", "stretch"].includes(a));
  const used = new Set(excludeIds);
  const team = [];
  let rem = BUDGET;
  for (const pos of POSITIONS) {
    const eligible = pool.filter((p) => p.pos === pos && !used.has(p.id));
    const cands =
      eligible.length > 0 ? eligible : pool.filter((p) => !used.has(p.id));
    if (!cands.length) continue;
    const weights = cands.map((p) => {
      const arch = getArchetype(p).id;
      let w = p.rating * (p.cost <= rem ? 1 : 0.05);
      if (hasScorers && arch === "lockdown") w *= 2.5;
      if (hasScorers && arch === "threeD") w *= 2.0;
      if (hasPassers && arch === "lockdown") w *= 2.0;
      if (hasBigs && arch === "stretch") w *= 2.0;
      if (hasBigs && arch === "rimProt") w *= 1.5;
      return Math.max(0.1, w);
    });
    const tot = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    let pick = cands[cands.length - 1];
    for (let k = 0; k < cands.length; k++) {
      r -= weights[k];
      if (r <= 0) {
        pick = cands[k];
        break;
      }
    }
    team.push({ player: pick, slot: pos });
    used.add(pick.id);
    rem -= pick.cost;
  }
  return team;
}

const NBA_TEAMS_META = getNBATeamsWithMeta();

function buildNBASchedule() {
  const n = NUM_TEAMS;
  const divTeamsMap = {};
  const confTeamsMap = {};
  for (const t of NBA_TEAMS_META) {
    if (!divTeamsMap[t.division]) divTeamsMap[t.division] = [];
    divTeamsMap[t.division].push(t.index);
    if (!confTeamsMap[t.conference]) confTeamsMap[t.conference] = [];
    confTeamsMap[t.conference].push(t.index);
  }

  // Symmetric game-count matrix: gameCounts[i][j] = games team i plays vs team j
  const gameCounts = Array.from({ length: n }, () => new Array(n).fill(0));

  // Division rivals: 4 games each (symmetric)
  for (const teams of Object.values(divTeamsMap)) {
    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        gameCounts[teams[a]][teams[b]] = 4;
        gameCounts[teams[b]][teams[a]] = 4;
      }
    }
  }

  // Opposite conference: 2 games each (symmetric)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (NBA_TEAMS_META[i].conference !== NBA_TEAMS_META[j].conference) {
        gameCounts[i][j] = 2;
        gameCounts[j][i] = 2;
      }
    }
  }

  // Same conference, different division: 3 or 4 games (symmetric, guaranteed correct)
  // Key insight: each team needs exactly 3 four-game opponents from EACH of the other 2 divisions
  // (3+3=6 total four-game, 2+2=4 total three-game non-div conf opponents)
  // Construct via a 3-regular bipartite assignment using a circular shift mod 5 on randomly
  // permuted division teams — this guarantees exact counts with no greedy failures.
  for (const confIdx of Object.values(confTeamsMap)) {
    const divisions = [...new Set(confIdx.map((i) => NBA_TEAMS_META[i].division))];
    for (let d1 = 0; d1 < divisions.length; d1++) {
      for (let d2 = d1 + 1; d2 < divisions.length; d2++) {
        // Randomly permute each division's team list independently
        const teamsD1 = [...divTeamsMap[divisions[d1]]];
        const teamsD2 = [...divTeamsMap[divisions[d2]]];
        for (let k = teamsD1.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1));
          [teamsD1[k], teamsD1[r]] = [teamsD1[r], teamsD1[k]];
        }
        for (let k = teamsD2.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1));
          [teamsD2[k], teamsD2[r]] = [teamsD2[r], teamsD2[k]];
        }
        // teamsD1[i] plays 4 games vs teamsD2 at offsets 0,1,2 (mod 5) → 3 four-game opponents
        // and 3 games vs teamsD2 at offsets 3,4 (mod 5) → 2 three-game opponents
        const m = teamsD1.length; // always 5
        for (let i = 0; i < m; i++) {
          for (let j = 0; j < m; j++) {
            const a = teamsD1[i], b = teamsD2[j];
            const games = (j - i + m) % m < 3 ? 4 : 3;
            gameCounts[a][b] = games;
            gameCounts[b][a] = games;
          }
        }
      }
    }
  }

  // Build schedule arrays from the symmetric gameCounts matrix
  const schedule = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const opponents = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      for (let k = 0; k < gameCounts[i][j]; k++) opponents.push(j);
    }
    // Shuffle game order
    for (let k = opponents.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      [opponents[k], opponents[r]] = [opponents[r], opponents[k]];
    }
    schedule[i] = opponents;
  }
  return schedule;
}

export function buildSeasonSchedule() {
  return buildNBASchedule();
}

export function generateLeague(myLineup, pool, userTeamName) {
  // Collapse pool to the best-rated season per real player (fullName),
  // so AI teams always draft the strongest version of each player.
  const byName = new Map();
  for (const p of pool) {
    const key = p.fullName || p.name;
    const existing = byName.get(key);
    if (!existing || (p.rating || 0) > (existing.rating || 0)) {
      byName.set(key, p);
    }
  }
  const collapsedPool = Array.from(byName.values());

  const usedIds = new Set(myLineup.map((x) => x.player.id));
  const usedNames = new Set(
    myLineup.map((x) => (x.player.fullName || x.player.name))
  );
  const teams = [];
  for (let i = 0; i < NUM_TEAMS - 1; i++) {
    const meta = NBA_TEAMS_META[i];
    const lineup = genLineup(usedIds, collapsedPool, usedNames);
    lineup.forEach((x) => {
      usedIds.add(x.player.id);
      usedNames.add(x.player.fullName || x.player.name);
    });
    teams.push({
      name: meta.name,
      division: meta.division,
      conference: meta.conference,
      index: meta.index,
      lineup,
      w: 0,
      l: 0,
      eff: rf(teamEff(lineup, null), 1),
      gameLog: [],
      isPlayer: false,
    });
  }
  const userMeta = NBA_TEAMS_META[NUM_TEAMS - 1];
  teams.push({
    name: userTeamName || userMeta.name,
    division: userMeta.division,
    conference: userMeta.conference,
    index: NUM_TEAMS - 1,
    lineup: myLineup,
    w: 0,
    l: 0,
    eff: rf(teamEff(myLineup, null), 1),
    gameLog: [],
    isPlayer: true,
  });
  return teams;
}

export function gameVariance(rating) {
  return clamp(
    1 +
      gauss(
        0.28 - clamp((rating - 20) / Math.max(80, 1), 0, 1) * 0.1
      ),
    0.3,
    1.9
  );
}

export function quickSim(lineupA, lineupB, tr) {
  const eA = teamEff(lineupA, tr);
  const eB = teamEff(lineupB, tr);
  return Math.random() < clamp(eA / (eA + eB), 0.4, 0.6) ? 0 : 1;
}

export function simulate(
  myLineup,
  oppLineup,
  teamRoster,
  options = {}
) {
  const { difficulty = "standard" } = options;
  const isPlayoffGame = !!teamRoster?._playoff;

  // Difficulty: casual = you're favored, hardcore = CPU favored. Standard = even.
  let myE = teamEff(myLineup, teamRoster);
  let oppE = teamEff(oppLineup, teamRoster);
  if (difficulty === "casual") {
    myE *= 1.14;
    oppE *= 0.88;
  } else if (difficulty === "hardcore") {
    myE *= 0.88;
    oppE *= 1.14;
  }
  const isPlayoff = !!teamRoster?._playoff;
  // Win prob per possession: standard = raw (no clamp); casual/hardcore = banded so outcomes stay reasonable.
  const raw = myE / (myE + oppE);
  const myOff =
    difficulty === "standard"
      ? raw
      : clamp(raw, 0.30, 0.70);
  // Possession variance: casual = steadier outcomes, hardcore = swingier games.
  const possVariance = difficulty === "casual" ? 0.01 : difficulty === "hardcore" ? 0.045 : 0.03;
  // Playoffs: fewer possessions per team (slower pace). Season: normal range.
  const possMin = isPlayoff ? 90 : TARGET_POSS_PER_TEAM_MIN;
  const possMax = isPlayoff ? 96 : TARGET_POSS_PER_TEAM_MAX;
  const pace = Math.round(possMin + Math.random() * (possMax - possMin));
  const myVar = myLineup.map(({ player }) => gameVariance(player.rating));
  const oppVar = oppLineup.map(({ player }) => gameVariance(player.rating));

  const mkStats = (lineup) =>
    lineup.map(({ player, slot }) => ({
      name: player.name,
      pos: slot,
      native: player.pos,
      oop: player.pos !== slot,
      cost: player.cost,
      min: 48,
      pts: 0,
      ast: 0,
      reb: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
      rating: rf(player.rating * posMult(player, slot), 1),
      gv: gameVariance(player.rating),
    }));

  const myStats = mkStats(myLineup);
  const oppStats = mkStats(oppLineup);

  function wIdx(arr, wFn) {
    const w = arr.map(wFn);
    const t = w.reduce((a, b) => a + b, 0);
    if (t <= 0) return 0;
    let r = Math.random() * t;
    for (let i = 0; i < arr.length; i++) {
      r -= w[i];
      if (r <= 0) return i;
    }
    return arr.length - 1;
  }

  for (let i = 0; i < pace * 2; i++) {
    const swing = (Math.random() - 0.5) * 2 * possVariance;
    const isMy =
      i % 2 === 0
        ? Math.random() < myOff + 0.03 + swing
        : Math.random() < myOff - 0.03 + swing;
    const offS = isMy ? myStats : oppStats;
    const defS = isMy ? oppStats : myStats;
    const offV = isMy ? myVar : oppVar;
    const offL = isMy ? myLineup : oppLineup;
    const defL = isMy ? oppLineup : myLineup;
    // Weight shot selection by usage (CSV pts): low-usage bigs shoot less, stars shoot more
    const si = wIdx(offS, (_, j) => {
      const p = offL[j].player;
      const usage = clamp((p.pts || 18) / 22, 0.5, 1.35);
      return Math.max(
        0.01,
        p.rating * posMult(p, offL[j].slot) * offV[j] * usage
      );
    });
    const shooter = offS[si];
    const sp = offL[si].player;
    const m = posMult(sp, offL[si].slot);
    const di = defL.findIndex((x) => x.slot === offL[si].slot);
    const defIdx = di >= 0 ? di : 0;
    const defender = defS[defIdx];
    const dp = defL[defIdx].player;
    const dm = posMult(dp, defL[defIdx].slot);
    const is3 = Math.random() < sp.tR * (0.75 + Math.random() * 0.5);
    const baseFg = sp.fg > 0 ? sp.fg : 44;
    const defArch = getArchetype(dp);
    const offArch = getArchetype(sp);
    const scoreDiff = Math.abs(
      myStats.reduce((s, p) => s + p.pts, 0) -
        oppStats.reduce((s, p) => s + p.pts, 0)
    );
    const isClutch = scoreDiff <= 5 && i > pace * 1.5;
    const clutchMult =
      isClutch && (offArch.id === "scorer" || offArch.id === "versatile")
        ? 1.08
        : 1.0;
    const matchupMult = archetypeMatchupFactor(defArch, offArch);
    const defFactor = clamp(
      (1 - (dp.rating * dm - 35) * 0.002) * matchupMult,
      0.84,
      1.04
    );
    const base = is3 ? (sp.tpPct > 0 ? sp.tpPct : baseFg * 0.65) : baseFg * (m * 0.1 + 0.9);
    const archVar = offArch.id === "spotUp" ? 1.8 : 1.2;

    // Shooting: nudge FG% and 3P% up a little (no change to points/pace)
    const raw = base * clutchMult + gauss(archVar);
    const fgPct = clamp(
      raw,
      is3 ? 38 : 50,
      is3 ? 52 : 72
    ) / 100;
    const adjFg = clamp(
      fgPct * defFactor,
      is3 ? 0.40 : 0.56,
      is3 ? 0.50 : 0.76
    );
    // Turnovers: raise so TOV/STL aren't too low
    const tovChance = clamp(
      ((sp.tov / 40) * offV[si] * 1.28) / clutchMult,
      0.045,
      0.21
    );
    // Raise block rate so BLK isn't too low; elite ~2–3.5 per 36
    const blkChance = clamp(dp.blk * dm * 0.058, 0, 0.16);
    if (Math.random() < tovChance) {
      shooter.tov++;
      // Slight bump: more TOV credited as steals
      if (Math.random() < 0.78) {
        defS[
          wIdx(defS, (_, j) =>
            Math.max(
              0.01,
              defL[j].player.stl * posMult(defL[j].player, defL[j].slot)
            )
          )
        ].stl++;
      }
    } else if (!is3 && Math.random() < blkChance) {
      shooter.fga++;
      defender.blk++;
      if (Math.random() < REB_CREDIT_RATE) {
        const isDefReb = Math.random() < DEF_REB_AFTER_BLOCK;
        const rebSide = isDefReb ? defS : offS;
        const rebL = isDefReb ? defL : offL;
        rebSide[
          wIdx(rebSide, (_, j) =>
            Math.max(
              0.01,
              rebL[j].player.reb * posMult(rebL[j].player, rebL[j].slot)
            )
          )
        ].reb++;
      }
    } else if (Math.random() < adjFg) {
      shooter.fga++;
      shooter.fgm++;
      if (is3) {
        shooter.tpa++;
        shooter.tpm++;
      }
      let pts = is3 ? 3 : 2;
      if (Math.random() < (is3 ? 0.08 : 0.32)) {
        const ftPct = clamp(
          (sp.ftPct > 0 ? sp.ftPct / 100 : 0.72) *
            (0.9 + Math.random() * 0.2) +
            gauss(0.04),
          0.4,
          0.98
        );
        const made = Math.random() < ftPct ? 1 : 0;
        pts += made;
        shooter.fta++;
        shooter.ftm += made;
      }
      shooter.pts += pts;
      // Assist credit so AST isn't too low
      if (Math.random() < 0.64)
        offS[
          wIdx(offS, (s, j) =>
            j === si
              ? 0
              : Math.max(0.01, offL[j].player.ast)
          )
        ].ast++;
    } else {
      shooter.fga++;
      if (is3) shooter.tpa++;
      if (!is3 && Math.random() < 0.18) {
        const fp = clamp(
          (sp.ftPct > 0 ? sp.ftPct / 100 : 0.72) *
            (0.9 + Math.random() * 0.2) +
            gauss(0.04),
          0.4,
          0.98
        );
        const f1 = Math.random() < fp ? 1 : 0;
        const f2 = Math.random() < fp ? 1 : 0;
        shooter.fta += 2;
        shooter.ftm += f1 + f2;
        shooter.pts += f1 + f2;
      }
      // Credit rebound (account for ORB: ORB_PROB to offense, rest to defense)
      if (Math.random() < REB_CREDIT_RATE) {
        if (Math.random() < ORB_PROB)
          offS[
            wIdx(offS, (_, j) =>
              Math.max(
                0.01,
                offL[j].player.reb * posMult(offL[j].player, offL[j].slot)
              )
            )
          ].reb++;
        else
          defS[
            wIdx(defS, (_, j) =>
              Math.max(
                0.01,
                defL[j].player.reb * posMult(defL[j].player, defL[j].slot)
              )
            )
          ].reb++;
      }
    }
  }

  const finalize = (stats) =>
    stats.map((s) => ({
      ...s,
      fgPct: s.fga > 0 ? rf((s.fgm / s.fga) * 100) : 0,
      tpPct: s.tpa > 0 ? rf((s.tpm / s.tpa) * 100) : 0,
      ftPct: s.fta > 0 ? rf((s.ftm / s.fta) * 100) : 0,
      hotCold: s.gv >= 1.4 ? "🔥" : s.gv <= 0.6 ? "🥶" : "",
    }));

  let ms = myStats.reduce((s, p) => s + p.pts, 0);
  let os = oppStats.reduce((s, p) => s + p.pts, 0);

  // Scale to NBA-like totals while preserving who won (split one combined total by raw ratio).
  // Same for standard/casual/hardcore; difficulty is already in ms/os via myOff (and clamp for casual/hardcore).
  const totalRaw = ms + os;
  const myShare = totalRaw > 0 ? clamp(ms / totalRaw, 0.05, 0.95) : 0.5;
  const totalTarget = Math.round(
    clamp(2 * (TARGET_TEAM_PTS_MEAN + gauss(TARGET_TEAM_PTS_SD * 0.5)), 2 * TARGET_TEAM_PTS_MIN, 2 * TARGET_TEAM_PTS_MAX)
  );
  const targetMy = ri(totalTarget * myShare);
  const targetOpp = totalTarget - targetMy;

  const scaleStat = (val, scale) => Math.max(0, ri(val * scale));
  const applyScale = (stats, scale) =>
    stats.map((s) => ({
      ...s,
      pts: scaleStat(s.pts, scale),
      fgm: scaleStat(s.fgm, scale),
      fga: scaleStat(s.fga, scale),
      tpm: scaleStat(s.tpm, scale),
      tpa: scaleStat(s.tpa, scale),
      ftm: scaleStat(s.ftm, scale),
      fta: scaleStat(s.fta, scale),
      reb: scaleStat(s.reb, scale),
      ast: scaleStat(s.ast, scale),
      stl: scaleStat(s.stl, scale),
      blk: scaleStat(s.blk, scale),
      tov: scaleStat(s.tov, scale),
    }));

  const myScale = ms > 0 ? targetMy / ms : 1;
  const oppScale = os > 0 ? targetOpp / os : 1;
  const myStatsScaled = applyScale(myStats, myScale);
  const oppStatsScaled = applyScale(oppStats, oppScale);
  ms = myStatsScaled.reduce((s, p) => s + p.pts, 0);
  os = oppStatsScaled.reduce((s, p) => s + p.pts, 0);

  let ot = 0;
  while (ms === os) {
    ot++;
    ms += ri(5 + Math.random() * 15 * myOff);
    os += ri(5 + Math.random() * 15 * (1 - myOff));
  }

  return {
    myScore: ms,
    oppScore: os,
    ot,
    possessionsPerTeam: pace,
    myStats: finalize(myStatsScaled),
    oppStats: finalize(oppStatsScaled),
    myEff: rf(myE, 1),
    oppEff: rf(oppE, 1),
    myChem: chemBoost(myLineup, teamRoster),
    oppChem: chemBoost(oppLineup, teamRoster),
  };
}

function emptyPlayerStat() {
  return {
    pos: null,
    pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, tov: 0,
    fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    gp: 0,
  };
}

export function addToSeason(season, gameStats, won, myScore, oppScore, lineupWhenNoStats = null) {
  if ((season.gp ?? 0) >= SEASON_LENGTH) return season;
  const next = { ...season, players: {}, gameLog: [...(season.gameLog || [])] };
  Object.entries(season.players).forEach(
    ([k, v]) => (next.players[k] = { ...v })
  );
  next.gp++;
  if (won) next.w++;
  else next.l++;
  next.ptsFor += myScore;
  next.ptsAgainst += oppScore;
  next.gameLog.push({ gp: next.gp, won, myScore, oppScore });
  const hasStats = gameStats && gameStats.length > 0;
  if (hasStats) {
    gameStats.slice(0, 5).forEach((s) => {
      if (!next.players[s.name]) next.players[s.name] = emptyPlayerStat();
      const p = next.players[s.name];
      if (!p.pos) p.pos = s.pos;
      p.pts += s.pts;
      p.ast += s.ast;
      p.reb += s.reb;
      p.stl += s.stl;
      p.blk += s.blk;
      p.tov += s.tov;
      p.fgm += s.fgm;
      p.fga += s.fga;
      p.tpm += s.tpm;
      p.tpa += s.tpa;
      p.ftm += s.ftm;
      p.fta += s.fta;
      p.gp++;
    });
  } else if (lineupWhenNoStats && lineupWhenNoStats.length) {
    lineupWhenNoStats.forEach(({ player }) => {
      const name = player?.name;
      if (!name) return;
      if (!next.players[name]) next.players[name] = emptyPlayerStat();
      next.players[name].gp++;
    });
  }
  return next;
}

export function emptySeason() {
  return {
    gp: 0,
    w: 0,
    l: 0,
    ptsFor: 0,
    ptsAgainst: 0,
    players: {},
    gameLog: [],
    highs: {},
  };
}

export function simLeagueGames(teams, schedule, tr) {
  const n = teams.length;
  const records = teams.map((t) => ({ ...t, w: 0, l: 0, gameLog: Array(SEASON_LENGTH).fill(null) }));
  const USER_INDEX = NUM_TEAMS - 1;

  // Pre-build slot lists: for each team, which slots are vs which opponent.
  // slotsByOpp[i][j] = list of slot indices where team i faces team j.
  const slotsByOpp = Array.from({ length: n }, () => ({}));
  for (let i = 0; i < n; i++) {
    for (let g = 0; g < SEASON_LENGTH; g++) {
      const j = schedule[i][g];
      if (!slotsByOpp[i][j]) slotsByOpp[i][j] = [];
      slotsByOpp[i][j].push(g);
    }
  }

  // Simulate every AI vs AI pair once (i < j, neither user).
  // Directly fill both teams' corresponding slots so no game is ever missed.
  for (let i = 0; i < n; i++) {
    if (i === USER_INDEX) continue;
    for (let j = i + 1; j < n; j++) {
      if (j === USER_INDEX) continue;
      const iSlots = slotsByOpp[i][j] || [];
      const jSlots = slotsByOpp[j][i] || [];
      const cnt = Math.min(iSlots.length, jSlots.length);
      for (let k = 0; k < cnt; k++) {
        const result = quickSim(records[i].lineup, records[j].lineup, tr);
        records[i].gameLog[iSlots[k]] = result === 0 ? 1 : 0;
        records[j].gameLog[jSlots[k]] = result === 1 ? 1 : 0;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (i === USER_INDEX) continue;
    records[i].w = records[i].gameLog.filter((x) => x === 1).length;
    records[i].l = records[i].gameLog.filter((x) => x === 0).length;
  }
  return records;
}

/**
 * Build AI team records from the user's season game log (single source of truth).
 * Maps each "vs user" slot to the correct user game so every team ends up with 82 games when season.gp === 82.
 * Returns a new array of teams (does not mutate input).
 */
export function buildAiRecordsFromUserSeason(aiTeams, schedule, season) {
  if (!schedule || !season?.gameLog || aiTeams.length !== NUM_TEAMS - 1) return aiTeams;
  const userLog = season.gameLog;
  const gp = season.gp ?? userLog.length;
  const out = aiTeams.map((t, i) => {
    const gameLog = [...(t.gameLog || Array(SEASON_LENGTH).fill(null))];

    // Fill vs-user slots from the user's game log.
    const oppSlots = [];
    for (let g = 0; g < SEASON_LENGTH; g++) if (schedule[i][g] === NUM_TEAMS - 1) oppSlots.push(g);
    const userGameIndices = [];
    for (let u = 0; u < SEASON_LENGTH; u++) if (schedule[NUM_TEAMS - 1][u] === i) userGameIndices.push(u);
    for (let j = 0; j < oppSlots.length && j < userGameIndices.length; j++) {
      const slotIdx = userGameIndices[j];
      if (slotIdx >= gp) continue;
      const won = userLog[slotIdx]?.won;
      if (won === true) gameLog[oppSlots[j]] = 0;
      else if (won === false) gameLog[oppSlots[j]] = 1;
    }

    // Defensive pass: fill any remaining null slots (AI vs AI games that were missed)
    // with a fair coin-flip so W+L always equals SEASON_LENGTH.
    for (let g = 0; g < SEASON_LENGTH; g++) {
      if (gameLog[g] === null) gameLog[g] = Math.random() < 0.5 ? 1 : 0;
    }

    const w = gameLog.filter((x) => x === 1).length;
    const l = gameLog.filter((x) => x === 0).length;
    return { ...t, gameLog, w, l };
  });
  return out;
}

/**
 * Fill any remaining null "vs user" slots with quickSim when user game log isn't available (fallback).
 */
export function fillMissingVsUserSlots(aiTeams, userLineup, schedule, tr) {
  if (!schedule || !userLineup || aiTeams.length !== NUM_TEAMS - 1) return aiTeams;
  const out = aiTeams.map((t) => ({
    ...t,
    gameLog: [...(t.gameLog || Array(SEASON_LENGTH).fill(null))],
  }));
  for (let i = 0; i < out.length; i++) {
    const team = out[i];
    for (let g = 0; g < SEASON_LENGTH; g++) {
      if (team.gameLog[g] !== null) continue;
      if (schedule[i][g] === NUM_TEAMS - 1) {
        // vs user: quickSim
        const result = quickSim(userLineup, team.lineup, tr);
        team.gameLog[g] = result === 0 ? 0 : 1;
      } else {
        // AI vs AI null (defensive fallback): fair coin-flip
        team.gameLog[g] = Math.random() < 0.5 ? 1 : 0;
      }
    }
    team.w = team.gameLog.filter((x) => x === 1).length;
    team.l = team.gameLog.filter((x) => x === 0).length;
  }
  return out;
}

export function getAiRecordsAtGame(aiTeams, g) {
  return aiTeams.map((t) => {
    const games = t.gameLog.slice(0, g);
    const w = games.filter((x) => x === 1).length;
    return { ...t, w, l: games.length - w };
  });
}

export function getTier(cost) {
  if (cost >= 35)
    return { label: "Elite", color: "#fbbf24", bg: "#78350f" };
  if (cost >= 28)
    return { label: "Star", color: "#c084fc", bg: "#3b0764" };
  if (cost >= 20)
    return { label: "Solid", color: "#60a5fa", bg: "#1e3a5f" };
  if (cost >= 13)
    return { label: "Role", color: "#4ade80", bg: "#14532d" };
  if (cost >= 8)
    return { label: "Bench", color: "#94a3b8", bg: "#1e293b" };
  return { label: "Filler", color: "#64748b", bg: "#0f172a" };
}

const SMAXES = {
  pts: 65,
  ast: 20,
  reb: 30,
  stl: 7,
  blk: 8,
  tov: 10,
  fgPct: 80,
  tpPct: 55,
};

export function cellBg(stat, val) {
  const r = Math.min(val / (SMAXES[stat] || 1), 1);
  if (stat === "tov")
    return `rgba(239,68,68,${0.12 + r * 0.55})`;
  return `rgba(${ri(15 + (1 - r) * 25)},${ri(
    100 + r * 120
  )},${ri(50 + (1 - r) * 20)},${0.15 + r * 0.55})`;
}

// Archetype revamp: level-based (1–3), broader thresholds so more players get a real label.
// Each archetype returns { id, label (with level), color, level }. Logic uses .id only.
function archScore(min, max, val) {
  if (val < min) return 0;
  return Math.min(100, 25 + ((val - min) / Math.max(max - min, 0.001)) * 75);
}

export function getArchetype(p) {
  const isGuard = p.pos === "PG" || p.pos === "SG";
  const isWing = p.pos === "SF";
  const isBig = p.pos === "PF" || p.pos === "C";
  const isWingOrGuard = isGuard || isWing;
  const tR = Math.min(1, Math.max(0, p.tR ?? 0));
  const tpPct = p.tpPct ?? 0;
  const fg = p.fg ?? 45;

  let best = { id: "role", label: "ROLE", color: "#94a3b8", score: 0 };

  // 1. Versatile – do-everything (slightly easier so a few more qualify; satisfies Big + Playmaker + Defense + Scoring in balance)
  if (p.pts >= 18 && p.ast >= 4.5 && p.reb >= 5 && (p.rating ?? 0) >= 42) {
    const score = archScore(18, 32, p.pts) * 0.35 + archScore(4.5, 10, p.ast) * 0.35 + archScore(5, 12, p.reb) * 0.3;
    if (score > best.score) best = { id: "versatile", label: "VERSATILE", color: "#f472b6", score };
  }

  // 2. Rim protector – big, blocks (wider score range so more 1s and 3s)
  if (isBig && p.blk >= 1) {
    const score = archScore(1, 3.2, p.blk) * 0.65 + archScore(5, 14, p.reb) * 0.35;
    if (score > best.score) best = { id: "rimProt", label: "RIM PROTECTOR", color: "#60a5fa", score };
  }

  // 4. Interior – big, boards, not a stretch (broad bar so more bigs land here)
  if (isBig && p.reb >= 5 && tR < 0.32) {
    const score = archScore(5, 16, p.reb) * 0.6 + archScore(42, 58, fg) * 0.4;
    if (score > best.score) best = { id: "interior", label: "INTERIOR BIG", color: "#4ade80", score };
  }

  // 5. Stretch – any real 3P volume and % (broad so more wings/bigs get Stretch 1/2)
  if (tR >= 0.14 && tpPct >= 26) {
    const score = archScore(0.14, 0.55, tR) * 0.5 + archScore(26, 42, tpPct) * 0.5;
    if (score > best.score) best = { id: "stretch", label: "STRETCH", color: "#67e8f9", score };
  }

  // 6. Playmaker – one archetype for all facilitators (guard/wing/PF/C)
  if (isBig && p.ast >= 3) {
    const score = archScore(3, 9, p.ast) * 0.6 + archScore(5, 14, p.reb) * 0.4;
    if (score > best.score) best = { id: "playmaker", label: "PLAYMAKER", color: "#fbbf24", score };
  }
  if (isWingOrGuard && p.ast >= 4) {
    const score = archScore(4, 11, p.ast) * 0.7 + archScore(42, 58, p.rating ?? 0) * 0.3;
    if (score > best.score) best = { id: "playmaker", label: "PLAYMAKER", color: "#fbbf24", score };
  }
  if ((isWing || p.pos === "PF") && p.ast >= 3.5 && p.reb >= 4 && (p.rating ?? 0) >= 38) {
    const score = archScore(3.5, 7, p.ast) * 0.6 + archScore(38, 52, p.rating ?? 0) * 0.4;
    if (score > best.score) best = { id: "playmaker", label: "PLAYMAKER", color: "#fbbf24", score };
  }

  // 7. Lockdown – defensive specialist (low bar so more Lockdown 1s; level bands spread 1/2/3)
  if (p.stl >= 0.7 || (isBig && p.blk >= 0.9)) {
    const score = archScore(0.7, 2.4, p.stl) * 0.55 + archScore(0.35, 2.4, p.blk) * 0.45;
    if (score > best.score) best = { id: "lockdown", label: "LOCKDOWN", color: "#f87171", score };
  }

  // 8. 3&D – shoot and defend (wider score range so more 3&D 1 and 3&D 3, not just 2)
  if (tpPct >= 29 && tR >= 0.24 && (p.stl >= 0.5 || p.blk >= 0.35)) {
    const shoot = (archScore(29, 42, tpPct) + archScore(0.24, 0.58, tR)) * 0.5;
    const def = archScore(0.45, 2, p.stl + p.blk);
    const score = shoot * 0.55 + def * 0.45;
    if (score > best.score) best = { id: "threeD", label: "3&D", color: "#34d399", score };
  }

  // 9. Spot-up – shooter first (broad so R. Hinson–type and others get a home)
  if (tR >= 0.20 && tpPct >= 26 && p.pts < 26) {
    const score = archScore(0.20, 0.55, tR) * 0.5 + archScore(26, 42, tpPct) * 0.5;
    if (score > best.score) best = { id: "spotUp", label: "SPOT-UP", color: "#38bdf8", score };
  }

  // 10. Scorer – primary scoring (15+ ppg) or catch-all for anyone who didn’t fit above (no Role)
  if (p.pts >= 15) {
    const score = archScore(15, 30, p.pts) * 0.7 + archScore(38, 56, p.rating ?? 0) * 0.3;
    if (score > best.score) best = { id: "scorer", label: "SCORER", color: "#f97316", score };
  }

  // 11. Everyone else → Scorer (no Role; catch-all so every player has an archetype)
  if (best.id === "role") {
    best = { id: "scorer", label: "SCORER", color: "#f97316", score: archScore(4, 22, p.pts) * 0.6 + archScore(32, 52, p.rating ?? 32) * 0.4 };
  }

  return { id: best.id, label: best.label, color: best.color };
}

export function archetypeMatchupFactor(defArch, offArch) {
  const def = defArch?.id;
  const off = offArch?.id;
  const b = {
    lockdown: { scorer: 0.87, versatile: 0.91 },
    rimProt: { interior: 0.84, playmaker: 0.87, stretch: 0.88 },
    threeD: { spotUp: 0.9, scorer: 0.91 },
    playmaker: { versatile: 0.93 },
  };
  return b[def]?.[off] ?? 1.0;
}

// Archetype matching: synergistic combos (ids are base only; level is for display).
export function archetypeChemBonus(lineup) {
  const archs = lineup.map(({ player }) => getArchetype(player).id);
  let bonus = 0;

  // Playmaker + shooters/scorers
  if (archs.includes("playmaker") && archs.includes("spotUp")) bonus += 7;
  if (archs.includes("playmaker") && archs.includes("scorer")) bonus += 6;
  if (archs.includes("playmaker") && archs.includes("stretch")) bonus += 5;

  // Defense (rim + perimeter)
  if (archs.includes("rimProt") && archs.includes("lockdown")) bonus += 7;
  if (archs.includes("rimProt") && archs.includes("threeD")) bonus += 4;
  if (archs.includes("lockdown") && archs.includes("threeD")) bonus += 5;

  // Inside-out (bigs + spacing)
  if (archs.includes("interior") && (archs.includes("spotUp") || archs.includes("stretch"))) bonus += 5;

  // 3&D + scorers
  if (archs.includes("threeD") && archs.includes("scorer")) bonus += 6;
  if (archs.includes("threeD") && archs.includes("spotUp")) bonus += 4;

  // Versatility
  if (archs.includes("versatile")) bonus += 4;

  // Anti-synergy: too many ball-dominant scorers
  const scorerCount = archs.filter((a) => a === "scorer").length;
  if (scorerCount >= 3) bonus -= 8;
  else if (scorerCount >= 2) bonus -= 3;

  // Too many interior bigs, no spacing
  const interiorCount = archs.filter((a) => a === "interior").length;
  if (interiorCount >= 2 && !archs.some((a) => ["stretch", "spotUp", "threeD"].includes(a))) bonus -= 4;

  if (!archs.includes("rimProt") && interiorCount >= 2) bonus -= 2;

  const nonShooterCount = archs.filter((a) => ["interior", "lockdown", "rimProt"].includes(a)).length;
  if (nonShooterCount >= 3) bonus -= 3;

  return bonus;
}

// Returns list of active synergy labels and their bonus for UI.
export function getActiveSynergies(lineup) {
  if (!lineup || lineup.length !== 5) return [];
  const archs = lineup.map(({ player }) => getArchetype(player).id);
  const list = [];

  if (archs.includes("playmaker") && archs.includes("spotUp")) list.push({ label: "Playmaker + Spot-up", bonus: 7 });
  if (archs.includes("playmaker") && archs.includes("scorer")) list.push({ label: "Playmaker + Scorer", bonus: 6 });
  if (archs.includes("playmaker") && archs.includes("stretch")) list.push({ label: "Playmaker + Stretch", bonus: 5 });
  if (archs.includes("rimProt") && archs.includes("lockdown")) list.push({ label: "Rim Protector + Lockdown", bonus: 7 });
  if (archs.includes("rimProt") && archs.includes("threeD")) list.push({ label: "Rim Protector + 3&D", bonus: 4 });
  if (archs.includes("lockdown") && archs.includes("threeD")) list.push({ label: "Lockdown + 3&D", bonus: 5 });
  if (archs.includes("interior") && (archs.includes("spotUp") || archs.includes("stretch"))) list.push({ label: "Interior + Spacing", bonus: 5 });
  if (archs.includes("threeD") && archs.includes("scorer")) list.push({ label: "3&D + Scorer", bonus: 6 });
  if (archs.includes("threeD") && archs.includes("spotUp")) list.push({ label: "3&D + Spot-up", bonus: 4 });
  if (archs.includes("versatile")) list.push({ label: "Versatile", bonus: 4 });

  const scorerCount = archs.filter((a) => a === "scorer").length;
  if (scorerCount >= 3) list.push({ label: "Too many scorers", bonus: -8 });
  else if (scorerCount >= 2) list.push({ label: "Two primary scorers", bonus: -3 });
  const interiorCount = archs.filter((a) => a === "interior").length;
  if (interiorCount >= 2 && !archs.some((a) => ["stretch", "spotUp", "threeD"].includes(a))) list.push({ label: "Interior bigs, no spacing", bonus: -4 });
  if (!archs.includes("rimProt") && interiorCount >= 2) list.push({ label: "No rim protector", bonus: -2 });
  const nonShooterCount = archs.filter((a) => ["interior", "lockdown", "rimProt"].includes(a)).length;
  if (nonShooterCount >= 3) list.push({ label: "3+ non-shooters", bonus: -3 });

  return list;
}

/** Returns balance flags for a lineup; used for UI (getTeamBalance) and for complete-team bonus in sim (teamEff). */
function getBalanceFlags(lineup) {
  if (!lineup || lineup.length !== 5) return { hasBig: false, hasPlaymaker: false, hasDefense: false, hasScoring: false };
  const archs = lineup.map(({ player }) => getArchetype(player).id);
  const hasBig =
    archs.some((a) => ["rimProt", "interior", "stretch", "versatile"].includes(a)) ||
    lineup.some(({ player }) => player.pos === "C" || player.pos === "PF");
  const hasPlaymaker = archs.some((a) => ["playmaker", "versatile"].includes(a));
  const hasDefense = archs.some((a) => ["lockdown", "threeD", "rimProt", "versatile"].includes(a));
  const hasScoring = archs.some((a) => ["scorer", "spotUp", "versatile", "stretch"].includes(a));
  return { hasBig, hasPlaymaker, hasDefense, hasScoring };
}

export function getTeamBalance(lineup) {
  if (!lineup) return null;
  const archs = lineup.map(({ player }) => getArchetype(player).id);
  const unique = new Set(archs).size;
  const { hasBig, hasPlaymaker, hasDefense, hasScoring } = getBalanceFlags(lineup);
  const scorerCount = archs.filter((a) => a === "scorer").length;
  let score = 0;
  if (unique >= 4) score += 2;
  else if (unique >= 3) score += 1;
  if (hasBig) score += 1;
  if (hasPlaymaker) score += 1;
  if (hasDefense) score += 1;
  if (hasScoring) score += 1;
  if (scorerCount >= 3) score -= 3;
  else if (scorerCount >= 2) score -= 1;
  const missing = [];
  if (!hasBig) missing.push("Big Man");
  if (!hasPlaymaker) missing.push("Playmaker");
  if (!hasDefense) missing.push("Defender");
  if (!hasScoring) missing.push("Scorer");
  // Letter grade: if you're missing a category, cap the grade so it matches the "Missing: X" message
  let grade =
    score >= 6 ? "A+" : score >= 5 ? "A" : score >= 4 ? "B+" : score >= 3 ? "B" : score >= 2 ? "C" : "D";
  if (missing.length > 0) {
    const cap = { "A+": "A", "A": "B+", "B+": "B", "B": "C", "C": "D", "D": "D" };
    grade = cap[grade] ?? grade;
  }
  const color =
    grade === "A+" || grade === "A" ? "#22c55e" : grade === "B+" || grade === "B" ? "#fbbf24" : "#ef4444";
  const balanceMod =
    lineup.length === 5 ? (missing.length === 0 ? 6 : -4 * missing.length) : 0;
  return {
    grade,
    color,
    score,
    missing,
    balanceMod,
    archetypeBonus: archetypeChemBonus(lineup),
    activeSynergies: getActiveSynergies(lineup),
  };
}

