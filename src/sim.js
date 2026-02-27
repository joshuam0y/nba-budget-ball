// Pure simulation and stats logic for NBA Budget Ball.
// No React imports here – this is all reusable game logic.

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
export const BUDGET = 140;
export const SEASON_LENGTH = 11;

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
  console.log(`✓ Parsed ${players.length} players. Sample:`, players[0]);

  // Precompute archetype on load so UI doesn't recompute it everywhere.
  const withIdsAndArch = players.map((p, i) => {
    const archetype = getArchetype(p);
    return { ...p, id: i + 1, archetype };
  });

  return { players: withIdsAndArch, teamRoster };
}

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
        boost += matches.length >= 3 ? 4 : 2;
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
  if (
    (getArchetype(player).id === "pmBig" ||
      getArchetype(player).id === "stretch" ||
      getArchetype(player).id === "rimProt" ||
      getArchetype(player).id === "paint" ||
      getArchetype(player).id === "glass") &&
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
  return (
    base +
    chemBoost(lineup, teamRoster) +
    (lineup.length === 5 ? archetypeChemBonus(lineup) : 0)
  );
}

export function genLineup(excludeIds = new Set(), pool = []) {
  const used = new Set(excludeIds);
  const team = [];
  let rem = BUDGET;
  for (const pos of POSITIONS) {
    const eligible = pool.filter((p) => p.pos === pos && !used.has(p.id));
    const cands =
      eligible.length > 0 ? eligible : pool.filter((p) => !used.has(p.id));
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
    rem -= pick.cost;
  }
  return team;
}

export function generateRivalLineup(myLineup, pool, excludeIds) {
  const archs = myLineup.map(({ player }) => getArchetype(player).id);
  const hasScorers = archs.some((a) =>
    ["bucket", "scoringGuard", "wing"].includes(a)
  );
  const hasPassers = archs.some((a) =>
    ["fg", "pmBig", "pointForward"].includes(a)
  );
  const hasBigs = archs.some((a) =>
    ["rimProt", "paint", "glass", "stretch"].includes(a)
  );
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

const TEAM_NAMES = [
  "The Big Bad Wolf",
  "Bucket Getters",
  "Paint Beasts",
  "Corner Killers",
  "Iso Kings",
  "Glass Eaters",
  "Dime Dealers",
  "Lock Legends",
  "Splash Bros",
  "Hardwood Wolves",
  "Night Shift",
];

export function generateLeague(myLineup, pool) {
  const usedIds = new Set(myLineup.map((x) => x.player.id));
  const teams = [];
  for (let i = 0; i < 11; i++) {
    const lineup =
      i === 0
        ? generateRivalLineup(myLineup, pool, usedIds)
        : genLineup(usedIds, pool);
    lineup.forEach((x) => usedIds.add(x.player.id));
    teams.push({
      name: TEAM_NAMES[i],
      lineup,
      w: 0,
      l: 0,
      eff: rf(teamEff(lineup, null), 1),
    });
  }
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

  // Difficulty tuning: tilt effective ratings slightly.
  let myE = teamEff(myLineup, teamRoster);
  let oppE = teamEff(oppLineup, teamRoster);
  if (difficulty === "casual") {
    myE *= 1.06;
    oppE *= 0.96;
  } else if (difficulty === "hardcore") {
    myE *= 0.96;
    oppE *= 1.06;
  }
  oppE *= isPlayoffGame ? 1.08 : 1.0;
  const isPlayoff = !!teamRoster?._playoff;
  const myOff = clamp(
    myE / (myE + oppE),
    isPlayoff ? 0.46 : 0.44,
    isPlayoff ? 0.54 : 0.56
  );
  const pace = Math.round((isPlayoff ? 90 : 96) + Math.random() * 12);
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
    const isMy =
      i % 2 === 0
        ? Math.random() < myOff + 0.03
        : Math.random() < myOff - 0.03;
    const offS = isMy ? myStats : oppStats;
    const defS = isMy ? oppStats : myStats;
    const offV = isMy ? myVar : oppVar;
    const offL = isMy ? myLineup : oppLineup;
    const defL = isMy ? oppLineup : myLineup;
    const si = wIdx(offS, (_, j) =>
      Math.max(
        0.01,
        offL[j].player.rating * posMult(offL[j].player, offL[j].slot) *
          offV[j]
      )
    );
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
      isClutch && (offArch.id === "bucket" || offArch.id === "swiss")
        ? 1.08
        : isClutch && offArch.id === "role"
        ? 0.92
        : 1.0;
    const matchupMult = archetypeMatchupFactor(defArch, offArch);
    const defFactor = clamp(
      (1 - (dp.rating * dm - 35) * 0.002) * matchupMult,
      0.84,
      1.04
    );
    const base = is3 ? (sp.tpPct > 0 ? sp.tpPct : baseFg * 0.65) : baseFg * (m * 0.1 + 0.9);
    const archVar =
      offArch.id === "spotUp" ? 1.8 : offArch.id === "role" ? 0.8 : 1.2;
    const fgPct = clamp(base * clutchMult + gauss(archVar), 18, 52) / 100;
    const adjFg = clamp(fgPct * defFactor, 0.44, 0.72);
    const tovChance = clamp(
      ((sp.tov / 40) * offV[si] * 0.7) / clutchMult,
      0.02,
      0.15
    );
    const blkChance = clamp(dp.blk * dm * 0.04, 0, 0.12);
    if (Math.random() < tovChance) {
      shooter.tov++;
      defS[
        wIdx(defS, (_, j) =>
          Math.max(
            0.01,
            defL[j].player.stl * posMult(defL[j].player, defL[j].slot)
          )
        )
      ].stl++;
    } else if (!is3 && Math.random() < blkChance) {
      shooter.fga++;
      defender.blk++;
      const rebSide = Math.random() < 0.8 ? defS : offS;
      const rebL = Math.random() < 0.8 ? defL : offL;
      rebSide[
        wIdx(rebSide, (_, j) =>
          Math.max(
            0.01,
            rebL[j].player.reb * posMult(rebL[j].player, rebL[j].slot)
          )
        )
      ].reb++;
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
      if (Math.random() < 0.65)
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
      if (Math.random() < 0.27)
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
    myStats: finalize(myStats),
    oppStats: finalize(oppStats),
    myEff: rf(myE, 1),
    oppEff: rf(oppE, 1),
    myChem: chemBoost(myLineup, teamRoster),
    oppChem: chemBoost(oppLineup, teamRoster),
  };
}

export function addToSeason(season, gameStats, won, myScore, oppScore) {
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
  gameStats.slice(0, 5).forEach((s) => {
    if (!next.players[s.name])
      next.players[s.name] = {
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
        gp: 0,
      };
    const p = next.players[s.name];
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

export function simLeagueGames(aiTeams, tr) {
  const records = aiTeams.map((t) => ({ ...t, w: 0, l: 0, gameLog: [] }));
  const n = records.length;
  const results = {};
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      results[`${i}-${j}`] = quickSim(
        records[i].lineup,
        records[j].lineup,
        tr
      );
  for (let i = 0; i < n; i++) {
    const opps = [...Array(n).keys()].filter((x) => x !== i);
    for (let k = opps.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      [opps[k], opps[r]] = [opps[r], opps[k]];
    }
    records[i].gameLog = opps.map((j) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      return i < j ? (results[key] === 0 ? 1 : 0) : results[key] === 1 ? 1 : 0;
    });
  }
  return records;
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

export function getArchetype(p) {
  const isGuard = p.pos === "PG" || p.pos === "SG";
  const isWing = p.pos === "SF";
  const isBig = p.pos === "PF" || p.pos === "C";

  const isSwiss = p.pts > 32 && p.ast > 7 && p.reb > 9 && p.fg > 48;

  const isPmBig = isBig && p.ast > 5 && p.reb > 9 && p.pts < 42 && p.rating > 53;
  const isRimProt =
    isBig && p.blk > 2.7 && p.reb > 10 && p.pts < 24;
  const isPaint = isBig && p.reb > 16 && p.tR < 0.05;
  const isStretchBig =
    isBig &&
    p.tR > 0.25 &&
    p.tpPct > 30 &&
    p.reb > 4 &&
    p.pts > 14 &&
    p.rating > 42;
  const isMidrange =
    (isBig || isWing || isGuard) &&
    p.pts > 18 &&
    p.tR < 0.28 &&
    p.fg > 44 &&
    p.rating > 46;
  const isGlass =
    isBig && p.reb > 12 && p.pts < 26 && p.fg > 46 && p.rating > 42;

  const isPointForward =
    (p.pos === "SF" || p.pos === "PF") &&
    p.ast > 4 &&
    p.reb > 5 &&
    p.pts < 28 &&
    p.rating > 43;
  const isWingScorer =
    isWing && p.pts > 20 && p.ast >= 3 && p.reb >= 3 && p.rating > 45;

  const isFloorGeneral =
    p.ast > 11 &&
    p.pts < 50 &&
    (p.pos === "PG" || p.pos === "SG") &&
    p.rating > 50;
  const isBucketGetter =
    (isGuard || isWing || isBig) &&
    p.pts > 22 &&
    p.ast < 6 &&
    p.rating > 47;
  const isScoringGuard =
    isGuard && p.pts > 24 && p.ast >= 3 && p.rating > 48;

  const isLockdown =
    p.stl > 2.0 && (p.blk > 1.0 || p.pts < 16) && p.rating > 42;
  const is3D =
    p.tpPct > 35 &&
    p.tR > 0.35 &&
    (p.stl > 1.2 || p.blk > 0.8) &&
    p.pts < 26 &&
    p.rating > 38;
  const isSpotUp =
    p.tR > 0.40 &&
    p.tpPct > 35 &&
    p.pts < 28 &&
    (p.stl > 0.8 || p.reb > 2.5) &&
    p.rating > 36;

  if (isSwiss)
    return { label: "SWISS ARMY KNIFE", color: "#f472b6", id: "swiss" };
  if (isPmBig)
    return { label: "PLAYMAKING BIG", color: "#a78bfa", id: "pmBig" };
  if (isPaint)
    return { label: "PAINT MONSTER", color: "#4ade80", id: "paint" };
  if (isRimProt)
    return { label: "RIM PROTECTOR", color: "#60a5fa", id: "rimProt" };
  if (isStretchBig)
    return { label: "STRETCH BIG", color: "#67e8f9", id: "stretch" };
  if (isGlass)
    return { label: "GLASS CLEANER", color: "#86efac", id: "glass" };
  if (isLockdown)
    return { label: "LOCKDOWN", color: "#f87171", id: "lockdown" };
  if (is3D) return { label: "3&D", color: "#34d399", id: "threeD" };
  if (isPointForward)
    return { label: "POINT FORWARD", color: "#34d399", id: "pointForward" };
  if (isFloorGeneral)
    return { label: "FLOOR GENERAL", color: "#fbbf24", id: "fg" };
  if (isBucketGetter)
    return { label: "BUCKET GETTER", color: "#f97316", id: "bucket" };
  if (isScoringGuard)
    return { label: "SCORING GUARD", color: "#a78bfa", id: "scoringGuard" };
  if (isWingScorer)
    return { label: "WING SCORER", color: "#e879f9", id: "wing" };
  if (isSpotUp)
    return { label: "SPOT UP SHOOTER", color: "#38bdf8", id: "spotUp" };
  if (isMidrange)
    return { label: "MIDRANGE ARTIST", color: "#c084fc", id: "midrange" };
  return { label: "ROLE PLAYER", color: "#94a3b8", id: "role" };
}

export function archetypeMatchupFactor(defArch, offArch) {
  const b = {
    lockdown: {
      bucket: 0.87,
      wing: 0.9,
      swiss: 0.91,
      scoringGuard: 0.89,
    },
    rimProt: { paint: 0.84, glass: 0.82, pmBig: 0.87, stretch: 0.88 },
    threeD: { spotUp: 0.9, bucket: 0.92, wing: 0.92, scoringGuard: 0.91 },
    fg: { playmaker: 0.9, swiss: 0.93 },
  };
  return b[defArch.id]?.[offArch.id] || 1.0;
}

export function archetypeChemBonus(lineup) {
  const archs = lineup.map(({ player }) => getArchetype(player).id);
  let bonus = 0;
  if (archs.includes("fg") && archs.includes("spotUp")) bonus += 3;
  if (
    archs.includes("fg") &&
    (archs.includes("bucket") || archs.includes("scoringGuard"))
  )
    bonus += 2;
  if (archs.includes("rimProt") && archs.includes("lockdown")) bonus += 3;
  if (archs.includes("swiss")) bonus += 1;
  if (
    archs.includes("pmBig") &&
    (archs.includes("spotUp") || archs.includes("stretch"))
  )
    bonus += 2;
  if (
    archs.includes("threeD") &&
    (archs.includes("bucket") || archs.includes("scoringGuard"))
  )
    bonus += 2;
  if (
    archs.includes("playmaker") &&
    (archs.includes("wing") || archs.includes("scoringGuard"))
  )
    bonus += 2;
  if (archs.includes("fg") && archs.includes("wing")) bonus += 2;
  const bucketCount = archs.filter((a) =>
    ["bucket", "scoringGuard"].includes(a)
  ).length;
  if (bucketCount >= 3) bonus -= 4;
  else if (bucketCount >= 2) bonus -= 1;
  return bonus;
}

export function getTeamBalance(lineup) {
  if (!lineup) return null;
  const archs = lineup.map(({ player }) => getArchetype(player).id);
  const unique = new Set(archs).size;
  const hasBig =
    archs.some((a) =>
      ["rimProt", "paint", "glass", "pmBig", "stretch", "swiss"].includes(a)
    ) ||
    lineup.some(
      ({ player }) => player.pos === "C" || player.pos === "PF"
    );
  const hasPlaymaker = archs.some((a) =>
    ["fg", "playmaker", "swiss", "pmBig", "scoringGuard"].includes(a)
  );
  const hasDefense = archs.some((a) =>
    ["lockdown", "threeD", "rimProt"].includes(a)
  );
  const hasScoring = archs.some((a) =>
    [
      "bucket",
      "wing",
      "spotUp",
      "midrange",
      "swiss",
      "stretch",
      "scoringGuard",
    ].includes(a)
  );
  const bucketCount = archs.filter((a) =>
    ["bucket", "scoringGuard"].includes(a)
  ).length;
  let score = 0;
  if (unique >= 4) score += 2;
  else if (unique >= 3) score += 1;
  if (hasBig) score += 1;
  if (hasPlaymaker) score += 1;
  if (hasDefense) score += 1;
  if (hasScoring) score += 1;
  if (bucketCount >= 3) score -= 3;
  else if (bucketCount >= 2) score -= 1;
  const grade =
    score >= 6 ? "A+" : score >= 5 ? "A" : score >= 4 ? "B+" : score >= 3 ? "B" : score >= 2 ? "C" : "D";
  const color =
    score >= 5 ? "#22c55e" : score >= 3 ? "#fbbf24" : "#ef4444";
  const missing = [];
  if (!hasBig) missing.push("Big Man");
  if (!hasPlaymaker) missing.push("Playmaker");
  if (!hasDefense) missing.push("Defender");
  if (!hasScoring) missing.push("Scorer");
  return {
    grade,
    color,
    score,
    missing,
    archetypeBonus: archetypeChemBonus(lineup),
  };
}

