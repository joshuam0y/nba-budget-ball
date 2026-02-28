import "./index.css";
import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
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

// Lazy-loaded heavy components for better initial bundle size
const LeagueLeadersLazy = lazy(() =>
  import("./LeagueLeaders").then((m) => ({ default: m.LeagueLeaders }))
);
const AllNBAAllDefensiveLazy = lazy(() =>
  import("./AllNBAAllDefensive").then((m) => ({ default: m.AllNBAAllDefensive }))
);
const BracketDisplayLazy = lazy(() =>
  import("./components/bracket").then((m) => ({ default: m.BracketDisplay }))
);

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
  const W = 600, H = 420;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas not supported"));

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f59e0b";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText("NBA BUDGET BALL", W / 2, 44);
  if (teamName && teamName.trim()) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(teamName.trim(), W / 2, 72);
  }
  ctx.fillStyle = "#64748b";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("STARTING 5", W / 2, 96);

  const y0 = 118;
  const lineH = 50;
  POSITIONS.forEach((pos, i) => {
    const p = roster[pos];
    const y = y0 + i * lineH;
    const pillX = 32;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(pillX, y - 14, 40, 28);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.strokeRect(pillX, y - 14, 40, 28);
    ctx.fillStyle = "#60a5fa";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(pos, pillX + 10, y + 5);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 19px system-ui, sans-serif";
    ctx.fillText(p ? p.name : "—", 88, y + 5);
    if (p) {
      ctx.fillStyle = "#fbbf24";
      ctx.font = "15px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("$" + p.cost, W - 36, y + 5);
    }
    ctx.textAlign = "left";
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const name = (teamName && teamName.trim()) ? teamName.trim() : "my";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Here's " + name + "'s lineup — paste the code to try it or build your own!", W / 2, H - 42);
  if (teamCode) {
    ctx.fillStyle = "#64748b";
    ctx.fillText("Code: " + teamCode, W / 2, H - 30);
  }
  ctx.fillStyle = "#475569";
  const linkText = shareUrl || origin;
  let drawUrl = linkText;
  if (shareUrl && ctx.measureText(linkText).width > W - 24) {
    for (let i = linkText.length; i > 0; i--) {
      const t = linkText.slice(0, i) + "…";
      if (ctx.measureText(t).width <= W - 24) { drawUrl = t; break; }
    }
  }
  ctx.fillText(shareUrl ? "Play: " + drawUrl : "Play at " + origin, W / 2, H - 16);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
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
  const [soundOn, setSoundOn] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [aiTeams,setAiTeams]=useState([]);
  const [schedule,setSchedule]=useState(null);
  const [result,setResult]=useState(null);
  const [season,setSeason]=useState(emptySeason());
  const [gameNum,setGameNum]=useState(1);
  const [posF,setPosF]=useState("ALL");
  const [sortBy,setSortBy]=useState("cost");
  const [sortDir,setSortDir]=useState("desc"); // desc | asc
  const [search,setSearch]=useState("");
  const [archF,setArchF]=useState("ALL");
  const [yearF,setYearF]=useState("ALL");
  const [teamF,setTeamF]=useState("ALL");
  const [showAllSeasons,setShowAllSeasons]=useState(false); // false = 1 per player, true = all seasons when year/team set
  const [inSeason,setInSeason]=useState(false);
  const [bracket,setBracket]=useState(null);
  const [playoffResult,setPlayoffResult]=useState(null);
  const [activeMatchId,setActiveMatchId]=useState(null);
  const [showStandings,setShowStandings]=useState(false);
  const [elimInPlayoffs,setElimInPlayoffs]=useState(false);
  const [showHelp,setShowHelp]=useState(false);
  const [showLeaders,setShowLeaders]=useState(false);
  const [leagueLeaders,setLeagueLeaders]=useState({});
  const [seasonHighs,setSeasonHighs]=useState({});
  const [playoffLeaders,setPlayoffLeaders]=useState({});
  const [playoffHighs,setPlayoffHighs]=useState({});
  const [finalsLeaders, setFinalsLeaders] = useState({});
  const [showPlayoffLeaders,setShowPlayoffLeaders]=useState(false);
  const [playoffLeadersView, setPlayoffLeadersView] = useState("playoff"); // "playoff" | "season" — which leaders/highs to show when on playoffs screen
  const [teamStatsPerMode, setTeamStatsPerMode] = useState("game"); // "game" | "per36"
  const [teamSeasonHighs, setTeamSeasonHighs] = useState({});
  const [teamPlayoffHighs, setTeamPlayoffHighs] = useState({});
  const [topPicks, setTopPicks] = useState([]);
  const [myTeamName, setMyTeamName] = useState("Your Team");
  const [teamNameHistory, setTeamNameHistory] = useState([]);
  const [difficulty, setDifficulty] = useState("standard"); // casual | standard | hardcore
  const [inspectPlayer, setInspectPlayer] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);

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

  // Load saved team / season from localStorage (preferred), then fall back to URL roster once players are loaded
  useEffect(() => {
    if (typeof window === "undefined" || !playerPool.length) return;
    try {
      const raw = window.localStorage.getItem("nba-budget-ball-state");
      let restored = false;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.teamName) setMyTeamName(saved.teamName);
        if (saved.difficulty) setDifficulty(saved.difficulty);
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
        if (saved.aiTeams) setAiTeams(saved.aiTeams);
        if (typeof saved.gameNum === "number") setGameNum(saved.gameNum);
        if (typeof saved.inSeason === "boolean") setInSeason(saved.inSeason);
        if (saved.bracket) setBracket(saved.bracket);
        if (saved.playoffResult) setPlayoffResult(saved.playoffResult);
        if (saved.activeMatchId != null) setActiveMatchId(saved.activeMatchId);
        if (typeof saved.elimInPlayoffs === "boolean") setElimInPlayoffs(saved.elimInPlayoffs);
        if (typeof saved.showStandings === "boolean") setShowStandings(saved.showStandings);
        if (typeof saved.showLeaders === "boolean") setShowLeaders(saved.showLeaders);
        if (saved.leagueLeaders) setLeagueLeaders(saved.leagueLeaders);
        if (saved.seasonHighs) setSeasonHighs(saved.seasonHighs);
        if (saved.playoffLeaders) setPlayoffLeaders(saved.playoffLeaders);
        if (saved.playoffHighs) setPlayoffHighs(saved.playoffHighs);
        if (saved.finalsLeaders) setFinalsLeaders(saved.finalsLeaders);
        if (typeof saved.showPlayoffLeaders === "boolean") setShowPlayoffLeaders(saved.showPlayoffLeaders);
        if (saved.playoffLeadersView) setPlayoffLeadersView(saved.playoffLeadersView);
        if (saved.teamStatsPerMode) setTeamStatsPerMode(saved.teamStatsPerMode);
        if (saved.teamSeasonHighs) setTeamSeasonHighs(saved.teamSeasonHighs);
        if (saved.teamPlayoffHighs) setTeamPlayoffHighs(saved.teamPlayoffHighs);

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

  // Persist team + season state whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rosterIds = {};
      POSITIONS.forEach((pos) => {
        rosterIds[pos] = roster[pos]?.id ?? null;
      });
      const payload = {
        teamName: myTeamName,
        roster: rosterIds,
        difficulty,
        phase,
        season,
        schedule,
        aiTeams,
        gameNum,
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
      };
      window.localStorage.setItem(
        "nba-budget-ball-state",
        JSON.stringify(payload)
      );
    } catch {
      // ignore localStorage issues
    }
  }, [roster, myTeamName, difficulty, phase, season, schedule, aiTeams, gameNum, inSeason, bracket, playoffResult, activeMatchId, elimInPlayoffs, showStandings, showLeaders, leagueLeaders, seasonHighs, playoffLeaders, playoffHighs, finalsLeaders, showPlayoffLeaders, playoffLeadersView, teamStatsPerMode, teamSeasonHighs, teamPlayoffHighs]);

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

  // How to Play shows after New Season (when user lands on draft), not on initial load

  const dismissTutorial = useCallback(() => {
    setShowTutorial(false);
  }, []);

  const handleCopyTeamCode = useCallback(() => {
    if (inSeason) return;
    const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
    const code = ids.join("-");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {
        window.prompt("Copy your team code:", code);
      });
    } else {
      window.prompt("Copy your team code:", code);
    }
  }, [roster, inSeason]);

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

  const [shareImageStatus, setShareImageStatus] = useState(null);
  const handleShareLineup = useCallback(async () => {
    if (inSeason) return;
    const filled = POSITIONS.every((pos) => roster[pos]);
    if (!filled) {
      setShareImageStatus("Complete your lineup first");
      setTimeout(() => setShareImageStatus(null), 2000);
      return;
    }
    const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
    const code = ids.join("-");
    const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
    if (url) url.searchParams.set("roster", code);
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const name = (myTeamName && myTeamName.trim()) ? myTeamName.trim() : "my";
    const shareText = "Here's " + name + "'s lineup — paste the code to try it or build your own!\nCode: " + code + "\nPlay: " + baseUrl;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    try {
      await nav?.clipboard?.writeText(shareText);
      setShareImageStatus("message_copied");
    } catch {
      window.prompt("Copy this message:", shareText);
      setShareImageStatus("Copy the message above");
      setTimeout(() => setShareImageStatus(null), 3000);
      return;
    }
    setTimeout(() => setShareImageStatus(null), 5000);
  }, [roster, myTeamName, inSeason]);

  const handleCopyLineupImage = useCallback(async () => {
    if (inSeason) return;
    const filled = POSITIONS.every((pos) => roster[pos]);
    if (!filled) {
      setShareImageStatus("Complete your lineup first");
      setTimeout(() => setShareImageStatus(null), 2000);
      return;
    }
    setShareImageStatus("Creating image…");
    try {
      const ids = POSITIONS.map((pos) => roster[pos]?.id || 0);
      const code = ids.join("-");
      const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
      if (url) url.searchParams.set("roster", code);
      const shareUrl = url ? url.toString() : null;
      const blob = await generateLineupImageBlob(roster, myTeamName, shareUrl, code);
      if (navigator?.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setShareImageStatus("Image copied!");
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "nba-budget-ball-lineup.png";
        a.click();
        URL.revokeObjectURL(a.href);
        setShareImageStatus("Downloaded");
      }
    } catch {
      setShareImageStatus("Couldn’t copy image");
    }
    setTimeout(() => setShareImageStatus(null), 2500);
  }, [roster, myTeamName, inSeason]);

const soundtrackRef = useRef(null);
  const trackIndexRef = useRef(0);
  const soundOnRef = useRef(soundOn);
  const volumeRef = useRef(volume);
  const restoredSessionRef = useRef(false);

  const SOUNDTRACK_TRACKS = ["/1.mp3", "/2.mp3", "/3.mp3", "/4.mp3"];

  soundOnRef.current = soundOn;
  volumeRef.current = volume;

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

  // Background soundtrack: 4 tracks, random next (never same), volume 50% default
  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio(SOUNDTRACK_TRACKS[0]);
    audio.volume = volume;
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

  useEffect(() => {
    const audio = soundtrackRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = soundtrackRef.current;
    if (!audio) return;
    if (soundOn) {
      audio.src = SOUNDTRACK_TRACKS[trackIndexRef.current];
      audio.volume = volumeRef.current;
      audio.play().catch(() => {});
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
      const key = `${name}|${teamLabel}`;
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
      return next;
    });
    if (myTeam && (teamALabel === myTeam || teamBLabel === myTeam)) {
      const myStats = teamALabel === myTeam ? res.myStats : res.oppStats;
      setTeamSeasonHighs((prev) => {
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
  }, []);

  const updatePlayoffLeaders = useCallback((res, teamALabel, teamBLabel) => {
    if (!res) return;
    setPlayoffLeaders((prev) => {
      const next = { ...prev };
      const applyTeam = (stats, teamLabel) => {
        stats.forEach((s) => {
          const key = `${s.name}|${teamLabel}`;
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
          const key = `${s.name}|${teamLabel}`;
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
              next[key] = { val, name: s.name, team, pos: s.pos };
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
  }, []);

  const updateLeagueLeaders = useCallback((res, myTeamLabel, oppTeamLabel, dayIndex) => {
    if (!res || dayIndex == null) return;
    setLeagueLeaders((prev) => {
      const next = { ...prev };
      const applyTeam = (stats, teamLabel) => {
        stats.forEach((s) => {
          const key = `${s.name}|${teamLabel}`;
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

  // Simulate all non-user games for a given game index (0-based).
  const applyDayResults = useCallback(
    (dayIndex, oppIndex, userWon) => {
      setAiTeams((prev) => {
        try {
          if (!Array.isArray(prev) || prev.length === 0) return prev;

          const USER_INDEX = NUM_TEAMS - 1;
          const next = prev.map((t) => ({
            ...t,
            gameLog: [...(t.gameLog || Array(SEASON_LENGTH).fill(null))],
          }));

          // Record opponent's result vs user for this day.
          if (oppIndex != null && next[oppIndex]) {
            next[oppIndex].gameLog[dayIndex] = userWon ? 0 : 1;
          }

          // Build list of AI teams that still need a game this day (exclude user opponent).
          const pool = [];
          for (let i = 0; i < NUM_TEAMS - 1; i++) {
            if (i === oppIndex) continue;
            if (!next[i]) continue;
            pool.push(i);
          }

          // Shuffle for randomness.
          for (let k = pool.length - 1; k > 0; k--) {
            const r = Math.floor(Math.random() * (k + 1));
            [pool[k], pool[r]] = [pool[r], pool[k]];
          }

          // Pair off and simulate.
          while (pool.length > 1) {
            const a = pool.pop();
            const b = pool.pop();
            const teamA = next[a];
            const teamB = next[b];
            if (
              !teamA ||
              !teamB ||
              !Array.isArray(teamA.lineup) ||
              !Array.isArray(teamB.lineup)
            ) {
              continue;
            }
            const res = simulate(teamA.lineup, teamB.lineup, teamRoster, {
              difficulty,
            });
            if (!res) continue;
            const aWon = res.myScore > res.oppScore;
            next[a].gameLog[dayIndex] = aWon ? 1 : 0;
            next[b].gameLog[dayIndex] = aWon ? 0 : 1;
            updateLeagueLeaders(res, teamA.name, teamB.name, dayIndex);
            updateSeasonHighs(res, teamA.name, teamB.name);
          }

          // Recompute W/L from full log.
          for (let i = 0; i < next.length; i++) {
            const gl = next[i].gameLog || [];
            next[i].w = gl.filter((x) => x === 1).length;
            next[i].l = gl.filter((x) => x === 0).length;
          }
          return next;
        } catch (err) {
          console.error("applyDayResults error:", err);
          return prev;
        }
      });
    },
    [teamRoster, updateLeagueLeaders, updateSeasonHighs]
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
  const sched = buildSeasonSchedule();
  const teams = generateLeague(myLineup, playerPool, myTeamName);
  // Initialize AI teams with empty 82-game logs; games will be added day-by-day.
  const ai = teams.slice(0, NUM_TEAMS - 1).map((t) => ({
    ...t,
    w: 0,
    l: 0,
    gameLog: Array(SEASON_LENGTH).fill(null),
  }));
  setSchedule(sched);
  setAiTeams(ai);
  setInSeason(true);
  setSeason(emptySeason());
  setGameNum(1);
  setResult(null);
  setPhase("game");
  setBracket(null);
  setPlayoffResult(null);
  setElimInPlayoffs(false);
  await Promise.all(myLineup.map(({player})=>incrementPick(player.name)));
  getTopPicks().then(setTopPicks);
};

  const playGame = () => {
    if (!full || !schedule || gameNum > SEASON_LENGTH) return;
    const USER_INDEX = NUM_TEAMS - 1;
    const oppIndex = schedule[USER_INDEX][gameNum - 1];
    const opp = aiTeams[oppIndex];
    if (!opp) return;
    const res = simulate(myLineup, opp.lineup, teamRoster, { difficulty });
    const won = res.myScore > res.oppScore;
    const uniqueStats = [...new Map(res.myStats.map((s) => [s.name, s])).values()];
    setSeason((s) => addToSeason(s, uniqueStats, won, res.myScore, res.oppScore));
    // Apply this day's results to all AI teams (including opponent vs user).
    const dayIndex = gameNum - 1;
    applyDayResults(dayIndex, oppIndex, won);
    updateLeagueLeaders(res, myTeamName, opp?.name || "Opponent", dayIndex);
    updateSeasonHighs(res, myTeamName, opp?.name || "Opponent", myTeamName);
    setResult(res);
  };

  const nextGame = () => {
    if (gameNum >= SEASON_LENGTH) {
      setPhase("seasonEnd");
      return;
    }
    setGameNum((g) => g + 1);
    setResult(null);
  };

  const simGames = (count) => {
    if (!full || !schedule || !aiTeams?.length || gameNum > SEASON_LENGTH) return;
    const toPlay = Math.min(count, SEASON_LENGTH - gameNum + 1);
    try {
      for (let k = 0; k < toPlay; k++) {
        const g = gameNum + k;
        const USER_INDEX = NUM_TEAMS - 1;
        const oppIndex = schedule[USER_INDEX]?.[g - 1];
        const opp = oppIndex != null ? aiTeams[oppIndex] : null;
        if (!opp?.lineup) continue;
        const res = simulate(myLineup, opp.lineup, teamRoster, { difficulty });
        const won = res.myScore > res.oppScore;
        const uniqueStats = [...new Map(res.myStats.map((s) => [s.name, s])).values()];
        const dayIndex = g - 1;
        setSeason((s) => addToSeason(s, uniqueStats, won, res.myScore, res.oppScore));
        applyDayResults(dayIndex, oppIndex, won);
        updateLeagueLeaders(res, myTeamName, opp?.name || "Opponent", dayIndex);
        updateSeasonHighs(res, myTeamName, opp?.name || "Opponent", myTeamName);
      }
      const nextGameNum = Math.min(gameNum + toPlay, SEASON_LENGTH);
      setGameNum(nextGameNum);
      setResult(null);
      if (gameNum + toPlay > SEASON_LENGTH) setPhase("seasonEnd");
    } catch (err) {
      console.error("Sim games error:", err);
    }
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
    const eastBracket = buildBracket(eastSeeds);
    const westBracket = buildBracket(westSeeds);
    const finalsMatchup = { id: "finals", top: null, bot: null, winner: null, games: [], label: "FINALS" };
    const newBracket = {
      east: eastBracket,
      west: westBracket,
      finals: finalsMatchup,
      champion: null,
    };
    setBracket(newBracket);
    setPhase("playoffs");
    setPlayoffResult(null);
    setActiveMatchId(getNextPlayerMatchId(newBracket) || getNextAIMatchId(newBracket) || null);
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

  const playPlayoffGame=(matchId)=>{
    if(!bracket) return;
    const b = JSON.parse(JSON.stringify(bracket));
    const out = runOnePlayoffGame(b, matchId, teamRoster, myLineup, difficulty);
    if (out.playerEliminated) setElimInPlayoffs(true);
    setBracket(out.bracket);
    setPlayoffResult(out.result);
    if (matchId === "finals" && out.result && out.result.myStats) {
      updateFinalsLeaders(out.result, out.result.topName, out.result.botName);
    }
  };

  const simAllAIGames = useCallback(() => {
    if (!bracket || !teamRoster) return;
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
    }
  }, [bracket, teamRoster, myLineup, difficulty]);

const newSeason = () => {
  setInSeason(false);
  setSeason(emptySeason());
  setGameNum(1);
  setResult(null);
  setPhase("teamSetup");
  setBracket(null);
  setPlayoffResult(null);
  setAiTeams([]);
  setSchedule(null);
  setElimInPlayoffs(false);
  setRoster({ PG: null, SG: null, SF: null, PF: null, C: null });
  setShowLeaders(false);
  setLeagueLeaders({});
  setSeasonHighs({});
  setPlayoffLeaders({});
  setPlayoffHighs({});
  setFinalsLeaders({});
  setShowPlayoffLeaders(false);
  setTeamSeasonHighs({});
  setTeamPlayoffHighs({});
  setShowTutorial(true);
  setImportInfo("");
  setImportErr("");
  setYearF("ALL");
  setTeamF("ALL");
  setShowAllSeasons(false);
  getTopPicks().then(setTopPicks);
};

if(phase==="teamSetup") return(
  <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex",alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
    <div style={{position:"fixed",bottom:16,left:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
      <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
      <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
      <input type="range" min="0" max="100" value={Math.round(volume*100)} onChange={(e)=>setVolume(Number(e.target.value)/100)} style={{width:80,accentColor:"#60a5fa"}} title="Volume" />
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
              setShowTutorial(true);
              setPhase("draft");
            }
          }}
          maxLength={20}
          placeholder="e.g. Hardwood Kings..."
          style={{width:"100%",background:"#080f1e",border:"1px solid #334155",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#e2e8f0",outline:"none",boxSizing:"border-box",marginBottom:16,textAlign:"center"}}
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
            setShowTutorial(true);
            setPhase("draft");
          }}
          disabled={!myTeamName.trim()}
          style={{width:"100%",background:myTeamName.trim()?"linear-gradient(135deg,#f59e0b,#d97706)":"#1e293b",color:myTeamName.trim()?"white":"#374151",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:800,cursor:myTeamName.trim()?"pointer":"not-allowed"}}>
          🏀 LET'S BUILD
        </button>
      </div>
    </div>
  </div>
);

  if(phase==="import") return(
    <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex",alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
      <button onClick={newSeason} style={{position:"absolute",top:12,right:12,zIndex:50,background:"#111827",color:"#e5e7eb",border:"1px solid #374151",borderRadius:999,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🔄 New Season</button>
      <div style={{position:"fixed",bottom:16,left:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
        <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
        <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
        <input type="range" min="0" max="100" value={Math.round(volume*100)} onChange={(e)=>setVolume(Number(e.target.value)/100)} style={{width:80,accentColor:"#60a5fa"}} title="Volume" />
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
    const finalsMVP = champion && (() => {
      const arr = Object.values(finalsLeaders || {}).filter((p) => p.team === champion.name);
      if (arr.length > 0) {
        const withScore = arr.map((p) => {
          const gp = p.gp || 1;
          const ppg = p.pts / gp;
          const rpg = p.reb / gp;
          const apg = p.ast / gp;
          return { ...p, gp, ppg, rpg, apg, fmvpScore: ppg * 2 + rpg * 0.8 + apg * 1.5 };
        });
        return withScore.reduce((best, p) => (!best || p.fmvpScore > best.fmvpScore ? p : best), null);
      }
      // Fallback: best player on champion lineup by rating when no Finals stats
      const lineup = champion.lineup;
      if (lineup && lineup.length) {
        const best = lineup.reduce((a, b) => ((a?.player?.rating ?? 0) >= (b?.player?.rating ?? 0) ? a : b));
        const p = best?.player;
        if (p) return { name: p.fullName || p.name, pos: p.pos, team: champion.name, ppg: p.pts ?? 0, rpg: p.reb ?? 0, apg: p.ast ?? 0 };
      }
      return null;
    })();
    const btnBase = { border:"1px solid #334155", borderRadius:10, fontWeight:700, cursor:"pointer", minHeight: isMobile ? 44 : undefined };
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding: isMobile ? 12 : 16, paddingBottom: isMobile ? 96 : undefined}}>
        <div style={{position:"fixed",bottom:16,left:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
          <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
          <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
          <input type="range" min="0" max="100" value={Math.round(volume*100)} onChange={(e)=>setVolume(Number(e.target.value)/100)} style={{width:80,accentColor:"#60a5fa"}} title="Volume" />
        </div>
        <div style={{maxWidth:1100,margin:"0 auto",minWidth:0,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom: isMobile ? 14 : 16,flexWrap:"wrap",gap: isMobile ? 8 : 10}}>
            <h2 style={{margin:0,fontSize: isMobile ? 18 : 20,fontWeight:900,color:"#f59e0b",letterSpacing:1}}>🏆 PLAYOFFS</h2>
            <div style={{display:"flex",gap: isMobile ? 6 : 8,alignItems:"center",flexWrap:"wrap"}}>
              {nextPlayerMatchId && (
                <button onClick={()=>{ setActiveMatchId(nextPlayerMatchId); setPlayoffResult(null); }} style={{...btnBase,background:"#052e16",color:"#86efac",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11,border:"1px solid #14532d"}}>⏭ Next game</button>
              )}
              <button onClick={()=>setShowStandings(s=>!s)} style={{...btnBase,background:showStandings?"#1e3a5f":"#1e293b",color:"#60a5fa",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11}}>{showStandings?"Hide":"Show"} Standings</button>
              <button onClick={()=>setShowPlayoffLeaders(s=>!s)} style={{...btnBase,background:showPlayoffLeaders?"#431407":"#1e293b",color:"#f97316",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11}}>{showPlayoffLeaders?"Hide":"Show"} Leaders</button>
              {getNextAIMatchId(bracket)&&<button onClick={()=>{ if(typeof window!=="undefined" && isMobile){ if(!window.confirm("Sim all CPU games in the current round?")) return; } simAllAIGames(); }} style={{...btnBase,background:"linear-gradient(135deg,#475569,#334155)",color:"#e2e8f0",border:"none",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11,boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>⚡ Sim CPU round</button>}
              <button onClick={()=>setBracketDensity(d=>d==="compact"?"comfortable":"compact")} style={{...btnBase,background:bracketDensity==="compact"?"#111827":"#1e293b",color:"#e2e8f0",padding: isMobile ? "10px 14px" : "6px 14px",fontSize: isMobile ? 12 : 11}}>{bracketDensity==="compact"?"Compact ✓":"Compact"}</button>
              <button onClick={newSeason} style={{...btnBase,background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",padding: isMobile ? "10px 16px" : "6px 16px",fontSize: isMobile ? 12 : 11,fontWeight:800,boxShadow:"0 2px 10px rgba(99,102,241,0.3)"}}>🔄 New Season</button>
              <button onClick={()=>setShowHelp(h=>!h)} style={{...btnBase,width: isMobile ? 40 : 32,height: isMobile ? 40 : 32,borderRadius:10,background:"#1e293b",color:"#60a5fa",fontSize:14,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>?</button>
            </div>
          </div>
          {showHelp&&<div style={{background:"#0f172a",borderRadius:10,padding: isMobile ? 12 : 10,border:"1px solid #334155",fontSize: isMobile ? 11 : 10,color:"#64748b",marginBottom:12,lineHeight:1.5}}>
            <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
            <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
            <div style={{marginBottom:2}}>• 30-team league (2 conferences, 6 divisions) — 82-game season</div>
            <div style={{marginBottom:2}}>• ⚡ Chemistry: real teammates same season+team</div>
            <div style={{marginBottom:2}}>• 🧩 Archetypes: balance your roster for bonuses</div>
            <div style={{marginBottom:2}}>• Top 6 direct · 7-10 play-in tournament</div>
            <div style={{marginBottom:2}}>• Difficulty: Casual = you're favored · Hardcore = CPU favored</div>
            <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginTop:6,marginBottom:2}}>OOP PENALTIES</div>
            <div>Adjacent ×0.82 · Wrong ×0.65</div>
          </div>}
          {champion&&(
            <>
              <div style={{textAlign:"center",padding: isMobile ? 14 : 16,background:playerWon?"linear-gradient(135deg,#78350f,#92400e)":"#0f172a",borderRadius:16,border:`2px solid ${playerWon?"#fbbf24":"#475569"}`,marginBottom:12}}>
                <div style={{fontSize: isMobile ? 32 : 36}}>{playerWon?"🏆":"👑"}</div>
                <div style={{fontSize: isMobile ? 18 : 22,fontWeight:900,color:playerWon?"#fbbf24":"#e2e8f0",letterSpacing:2,lineHeight:1.3}}>{playerWon?"YOU ARE CHAMPIONS!":champion.name+" WIN THE CHAMPIONSHIP!"}</div>
              </div>
              <div style={{textAlign:"center",padding: isMobile ? 14 : 12,background:"#0f172a",borderRadius:12,border:"1px solid #eab308",marginBottom:12}}>
                <div style={{fontSize:10,color:"#eab308",fontWeight:800,letterSpacing:2,marginBottom:4}}>🏆 FINALS MVP</div>
                {finalsMVP ? (
                  <>
                    <div style={{fontSize: isMobile ? 16 : 18,fontWeight:900}}>{finalsMVP.name}</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{finalsMVP.pos || "—"} · {finalsMVP.team}</div>
                    <div style={{fontSize: isMobile ? 13 : 12,color:"#e5e7eb",marginTop:4}}>{rf(finalsMVP.ppg,1)} PPG · {rf(finalsMVP.rpg,1)} RPG · {rf(finalsMVP.apg,1)} APG</div>
                  </>
                ) : (
                  <div style={{fontSize: 12, color: "#64748b"}}>—</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <button onClick={newSeason} style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "white", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 10px rgba(99,102,241,0.3)" }}>🔄 New Season</button>
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
            <BracketDisplayLazy bracket={bracket} activeMatchId={activeMatchId} nextPlayerMatchId={nextPlayerMatchId || undefined} onSelectMatch={id=>{setActiveMatchId(id);setPlayoffResult(null);}} onPlayMatch={id=>{setActiveMatchId(id);setPlayoffResult(null);playPlayoffGame(id);}} isMobile={isMobile} density={bracketDensity}/>
            </div>
          </Suspense>
          {activeMatchId&&(()=>{
            const parsed=getPlayoffMatchup(bracket,activeMatchId);
            const matchup=parsed?.matchup;
            if(!matchup)return null;
            const wT=matchup.games.filter(g=>g.winnerIdx===0).length,wB=matchup.games.filter(g=>g.winnerIdx===1).length;
            const done=!!matchup.winner,pInv=matchup.top?.isPlayer||matchup.bot?.isPlayer;
            return(
              <div style={{marginTop: isMobile ? 16 : 20}}>
                <div style={{background:"linear-gradient(180deg,#1e293b 0%,#0f172a 100%)",borderRadius:14,padding: isMobile ? 14 : 16,border:"2px solid #334155",marginBottom:12,boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>
                  <div style={{fontSize:10,color:"#64748b",letterSpacing:1,marginBottom:6,textTransform:"uppercase",fontWeight:700}}>Selected matchup</div>
                  <div style={{fontWeight:800,fontSize: isMobile ? 15 : 14,color:"#e2e8f0",marginBottom:8,lineHeight:1.3}}>{matchup.label}</div>
                  <div style={{display:"flex",alignItems:"center",gap: isMobile ? 8 : 12,flexWrap:"wrap",marginBottom:12}}>
                    <span style={{fontSize: isMobile ? 13 : 12,color:"#94a3b8",flex: isMobile ? "1 1 100%" : undefined}}>{matchup.top?.name ?? "TBD"}</span>
                    <span style={{fontSize: isMobile ? 16 : 14,fontWeight:900,color:"#64748b",flexShrink:0}}>{wT} – {wB}</span>
                    <span style={{fontSize: isMobile ? 13 : 12,color:"#94a3b8",flex: isMobile ? "1 1 100%" : undefined}}>{matchup.bot?.name ?? "TBD"}</span>
                  </div>
                  {!done&&matchup.top&&matchup.bot&&(
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {pInv?(
                        <button onClick={()=>playPlayoffGame(activeMatchId)} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding: isMobile ? "14px 24px" : "12px 28px",fontSize: isMobile ? 14 : 13,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 14px rgba(34,197,94,0.35)", minHeight: isMobile ? 48 : undefined}}>▶ Play Game {matchup.games.length+1}</button>
                      ):(
                        <button onClick={()=>playPlayoffGame(activeMatchId)} style={{background:"linear-gradient(135deg,#475569,#64748b)",color:"white",border:"none",borderRadius:10,padding: isMobile ? "14px 24px" : "12px 28px",fontSize: isMobile ? 14 : 13,fontWeight:800,cursor:"pointer", minHeight: isMobile ? 48 : undefined}}>⚡ Sim Game {matchup.games.length+1}</button>
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
            const btnLabel = pInv ? `▶ Play Game ${matchup.games.length + 1}` : `⚡ Sim Game ${matchup.games.length + 1}`;
            return (
              <div style={{ position:"fixed", left:12, right:12, bottom:12, background:"linear-gradient(180deg,#0f172a 0%,#0b1220 100%)", border:"1px solid #334155", borderRadius:14, padding:12, boxShadow:"0 10px 30px rgba(0,0,0,0.45)", zIndex:50 }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center" }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:10, color:"#64748b", fontWeight:900, letterSpacing:1, textTransform:"uppercase" }}>Selected</div>
                    <div style={{ fontSize:12, color:"#e2e8f0", fontWeight:900, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{matchup.label}</div>
                  </div>
                  <button onClick={()=>playPlayoffGame(activeMatchId)} style={{ background: pInv ? "linear-gradient(135deg,#22c55e,#16a34a)" : "linear-gradient(135deg,#475569,#64748b)", color:"white", border:"none", borderRadius:12, padding:"12px 14px", fontSize:13, fontWeight:900, minHeight:44, cursor:"pointer", flexShrink:0 }}>
                    {btnLabel}
                  </button>
                </div>
              </div>
            );
          })()}
          {showStandings&&<div style={{marginTop:16,marginBottom:12}}><StandingsTable aiTeams={finalAiRec} myRecord={myRecord} myName={myTeamName} highlight/></div>}
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
                <SeasonHighs highs={playoffLeadersView==="playoff"?playoffHighs:seasonHighs} myTeamName={myTeamName} title={playoffLeadersView==="playoff"?"📈 PLAYOFF HIGHS (SINGLE GAME)":"📈 SEASON HIGHS (SINGLE GAME)"}/>
              </div>
            </div>
          )}
          <div style={{marginTop: isMobile ? 14 : 16,marginBottom:12}}>
            <TeamStatsPanel teamName={myTeamName} playerSeasonRows={playerSeasonRows} playerPlayoffRows={playerPlayoffRows} perMode={teamStatsPerMode} onPerModeChange={setTeamStatsPerMode} showPlayoff={true} isMobile={isMobile}/>
            <div style={{marginTop:8}}>
              <TeamHighs teamSeasonHighs={teamSeasonHighs} teamPlayoffHighs={teamPlayoffHighs} roster={roster} title="📈 TEAM HIGHS (SINGLE GAME)" showPlayoff={true}/>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if(phase==="seasonEnd"){
    const finalAi = aiTeams;
    const userMeta = getNBATeamsWithMeta()[NUM_TEAMS - 1];
    const userRecord = { name: myTeamName, w: season.w, l: SEASON_LENGTH - season.w, eff: myEffVal || 0, isPlayer: true, division: userMeta.division, conference: userMeta.conference };
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
          (r.spg / maxSPG) * 2.5 +
          (r.bpg / maxBPG) * 2.5 +
          (r.rpg / maxRPG) * 1.0;
        const teamDefBonus = (1 - r.teamPct) * 0.0; // skip team defense for now
        r.dpoyScore = defScore + teamDefBonus;
      });

      leagueMVP = leagueRows.reduce(
        (best, r) => (!best || r.mvpScore > best.mvpScore ? r : best),
        null
      );
      leagueDPOY = leagueRows.reduce(
        (best, r) => (!best || r.dpoyScore > best.dpoyScore ? r : best),
        null
      );
    }
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        <div style={{position:"fixed",top:12,right:12,zIndex:50,display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setShowHelp(h=>!h)} style={{width:28,height:28,borderRadius:"50%",background:"#1e293b",border:"1px solid #334155",color:"#60a5fa",fontSize:14,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>?</button>
          <button onClick={newSeason} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:999,padding:"4px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}}>🔄 New Season</button>
        </div>
        <div style={{position:"fixed",bottom:16,left:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
          <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
          <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
          <input type="range" min="0" max="100" value={Math.round(volume*100)} onChange={(e)=>setVolume(Number(e.target.value)/100)} style={{width:80,accentColor:"#60a5fa"}} title="Volume" />
        </div>
        {showHelp&&<div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #334155",fontSize:10,color:"#64748b",marginBottom:14,maxWidth:800,marginLeft:"auto",marginRight:"auto"}}>
          <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
          <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
          <div style={{marginBottom:2}}>• 30-team league (2 conferences, 6 divisions) — 82-game season</div>
          <div style={{marginBottom:2}}>• ⚡ Chemistry: real teammates same season+team</div>
          <div style={{marginBottom:2}}>• 🧩 Archetypes: balance your roster for bonuses</div>
          <div style={{marginBottom:2}}>• Top 6 direct · 7-10 play-in tournament</div>
          <div style={{marginBottom:2}}>• Difficulty: Casual = you're favored · Hardcore = CPU favored</div>
          <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginTop:6,marginBottom:2}}>OOP PENALTIES</div>
          <div>Adjacent ×0.82 · Wrong ×0.65</div>
        </div>}
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <div style={{textAlign:"center",padding:"16px",background:"#0f172a",borderRadius:16,border:`2px solid ${mySeed<=6?"#22c55e":playoff?"#f59e0b":"#ef4444"}`,marginBottom:14}}>
            <div style={{fontSize:36}}>{mySeed<=6?"🏆":playoff?"🎟":"💀"}</div>
            <div style={{fontSize:22,fontWeight:900,color:mySeed<=6?"#22c55e":playoff?"#f59e0b":"#ef4444",letterSpacing:2}}>
              {mySeed<=6?`PLAYOFFS BOUND — SEED #${mySeed}`:playoff?`PLAY-IN TOURNAMENT — SEED #${mySeed}`:"MISSED THE PLAYOFFS"}
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Final Record: {season.w}–{season.l} · PPG {ppg} · OPP {papg}</div>
          </div>
          <div style={{marginBottom:14}}>
            <StandingsTable aiTeams={finalAi} myRecord={myRecord} myName={myTeamName} highlight/>
          </div>
          {(() => {
            const teamRecords = {};
            finalAi.forEach((t) => { teamRecords[t.name] = { w: t.w, l: t.l }; });
            teamRecords[myTeamName] = myRecord;
            return (
              <div style={{marginBottom:14}}>
                <Suspense fallback={<div style={{fontSize:11,color:"#64748b",padding:"4px 0"}}>Loading awards…</div>}>
                  <AllNBAAllDefensiveLazy leaders={leagueLeaders} teamRecords={teamRecords} myTeamName={myTeamName}/>
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
            <TeamStatsPanel teamName={myTeamName} playerSeasonRows={playerSeasonRows} playerPlayoffRows={playerPlayoffRows} perMode={teamStatsPerMode} onPerModeChange={setTeamStatsPerMode} showPlayoff={false} isMobile={isMobile}/>
            <div style={{marginTop:8}}>
              <TeamHighs teamSeasonHighs={teamSeasonHighs} teamPlayoffHighs={teamPlayoffHighs} roster={roster} title="📈 TEAM HIGHS (SINGLE GAME)" showPlayoff={false}/>
            </div>
          </div>
          {mvp&&(
            <div style={{background:"#0f172a",borderRadius:12,padding:12,marginBottom:14,border:"1px solid #fbbf24",textAlign:"center"}}>
              <div style={{fontSize:10,color:"#fbbf24",fontWeight:800,letterSpacing:2,marginBottom:4}}>
                🏅 TEAM MVP — {myTeamName}
              </div>
              <div style={{fontSize:18,fontWeight:900}}>{mvp.name}</div>
              <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>
                {mvp.pos || "—"} · {fmt0(mvp.gp)} GP
              </div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{fmt1(mvp.ppg)} PPG · {fmt1(mvp.apg)} APG · {fmt1(mvp.rpg)} RPG</div>
            </div>
          )}
          <div style={{marginBottom:14}}>
            <SeasonHighs highs={seasonHighs} myTeamName={myTeamName} title="📈 SEASON HIGHS (SINGLE GAME)"/>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            {playoff&&<button onClick={()=>buildPlayoffBracket(season,finalAi)} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 18px rgba(245,158,11,0.3)"}}>
              {playIn?"🎟 START PLAY-IN":"🏆 START PLAYOFFS"}
            </button>}
            <button onClick={newSeason} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:800,cursor:"pointer"}}>🔄 NEW SEASON</button>
          </div>
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
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        <div style={{position:"fixed",bottom:16,left:16,zIndex:50,display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
          <button onClick={()=>setSoundOn((s)=>!s)} style={{background:soundOn?"#14532d":"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:14,fontWeight:700,color:soundOn?"#22c55e":"#9ca3af",cursor:"pointer"}}>{soundOn?"🔊":"🔈"}</button>
          <button onClick={skipSong} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,color:"#e2e8f0",cursor:"pointer"}} title="Skip song">⏭ Skip</button>
          <input type="range" min="0" max="100" value={Math.round(volume*100)} onChange={(e)=>setVolume(Number(e.target.value)/100)} style={{width:80,accentColor:"#60a5fa"}} title="Volume" />
        </div>
        <div style={{maxWidth:1040,margin:"0 auto"}}>
          <div style={{background:"#0f172a",borderRadius:10,padding:"10px 14px",marginBottom:10,border:"1px solid #1e293b",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{fontSize:11,fontWeight:800,color:"#64748b"}}>GAME {gameNum} / {SEASON_LENGTH}</div>
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
            <button onClick={()=>setShowStandings(s=>!s)} style={{background:"#1e293b",color:"#60a5fa",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{showStandings?"Hide":"Show"} Standings</button>
            <button onClick={()=>setShowLeaders(s=>!s)} style={{background:"#1e293b",color:"#f97316",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{showLeaders?"Hide":"Show"} Leaders</button>
            <button onClick={newSeason} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}}>🔄 New Season</button>
            <button onClick={()=>setShowHelp(h=>!h)} style={{width:26,height:26,borderRadius:"50%",background:"#1e293b",border:"1px solid #334155",color:"#60a5fa",fontSize:12,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>?</button>
          </div>
          {showHelp&&<div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #334155",fontSize:10,color:"#64748b",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
            <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
            <div style={{marginBottom:2}}>• 30-team league (2 conferences, 6 divisions) — 82-game season</div>
            <div style={{marginBottom:2}}>• ⚡ Chemistry: real teammates same season+team</div>
            <div style={{marginBottom:2}}>• 🧩 Archetypes: balance your roster for bonuses</div>
            <div style={{marginBottom:2}}>• Top 6 direct · 7-10 play-in tournament</div>
            <div style={{marginBottom:2}}>• Difficulty: Casual = you're favored · Hardcore = CPU favored</div>
            <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginTop:6,marginBottom:2}}>OOP PENALTIES</div>
            <div>Adjacent ×0.82 · Wrong ×0.65</div>
          </div>}
          {opp && oppTopPlayer && (
            <div style={{background:"#020617",borderRadius:10,padding:10,border:"1px solid #1e293b",fontSize:11,color:"#9ca3af",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:1,marginBottom:2}}>SCOUTING REPORT</div>
                  <div style={{fontSize:11,color:"#e5e7eb",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {oppTopPlayer.name} · {rf(oppTopPlayer.pts,1)} PTS · {rf(oppTopPlayer.reb,1)} REB · {rf(oppTopPlayer.ast,1)} AST
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
            <TeamStatsPanel teamName={myTeamName} playerSeasonRows={playerSeasonRows} playerPlayoffRows={playerPlayoffRows} perMode={teamStatsPerMode} onPerModeChange={setTeamStatsPerMode} showPlayoff={false} isMobile={isMobile}/>
            <div style={{marginTop:8}}>
              <TeamHighs teamSeasonHighs={teamSeasonHighs} teamPlayoffHighs={{}} roster={roster} title="📈 TEAM HIGHS (SINGLE GAME)" showPlayoff={false}/>
            </div>
          </div>
          <SeasonHighs highs={seasonHighs} myTeamName={myTeamName} title="📈 SEASON HIGHS (SINGLE GAME)"/>
          {!result?(
            <div style={{background:"#0f172a",borderRadius:16,padding:24,border:"1px solid #1e293b",textAlign:"center",marginBottom:10}}>
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
                  <div style={{fontSize:10,fontWeight:700,color:"#e2e8f0"}}>{rf(v,1)}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      ))}
    </div>
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
                      onClick={()=>simGames(10)}
                      style={{background:"#4b5563",color:"white",border:"none",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:800,cursor:"pointer"}}
                    >
                      ⏩ SIM 10 GAMES
                    </button>
                    <button
                      onClick={()=>simGames(41)}
                      style={{background:"#475569",color:"white",border:"none",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:800,cursor:"pointer"}}
                    >
                      ⏩ SIM 41 GAMES
                    </button>
                    <button
                      onClick={()=>simGames(SEASON_LENGTH - gameNum + 1)}
                      style={{background:"#334155",color:"#94a3b8",border:"none",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:800,cursor:"pointer"}}
                    >
                      ⏭ SIM REST
                    </button>
                  </>
                )}
              </div>
            </div>
          ):(
            <>
              <div style={{textAlign:"center",padding:"12px",background:"#0f172a",borderRadius:14,border:`2px solid ${won?"#22c55e":"#ef4444"}`,marginBottom:10}}>
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
                  const gameScore = (s) => (s.pts || 0) + (s.reb || 0) * 0.5 + (s.ast || 0) * 0.5;
                  const pog = allStats.length ? allStats.reduce((best, s) => (!best || gameScore(s) > gameScore(best) ? s : best), null) : null;
                  if (!pog) return null;
                  return (
                    <div style={{marginTop:8,fontSize:11,color:"#fbbf24",fontWeight:800}}>
                      🏅 Player of the game: {pog.name} — {rf(pog.pts,0)} pts, {rf(pog.reb,0)} reb, {rf(pog.ast,0)} ast
                    </div>
                  );
                })()}
              </div>
              <BoxScore stats={result.myStats} acc="#60a5fa" label={myTeamName}/>
              <BoxScore stats={result.oppStats} acc="#f87171" label={opp?.name||"Opponent"}/>
              <div style={{display:"flex",gap:8,justifyContent:"center",paddingBottom:16}}>
                {gameNum<SEASON_LENGTH
                  ?<button onClick={nextGame} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"11px 28px",fontSize:13,fontWeight:800,cursor:"pointer"}}>▶ NEXT GAME ({gameNum+1}/{SEASON_LENGTH})</button>
                  :<button onClick={()=>setPhase("seasonEnd")} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:10,padding:"11px 28px",fontSize:13,fontWeight:800,cursor:"pointer"}}>🏆 VIEW SEASON RESULTS</button>
                }
              </div>
            </>
          )}
        </div>
      </div>
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

  // 1 per player: always collapse. All seasons: collapse only when year/team both ALL; when set, show dupes.
  const shouldCollapse = !showAllSeasons || (yearF === "ALL" && teamF === "ALL");
  const collapsedByName = shouldCollapse
    ? (() => {
        const byName = new Map();
        for (const p of filteredPool) {
          const key = p.fullName || p.name;
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
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#0f172a", borderRadius: 16, border: "2px solid #334155", maxWidth: 400, padding: 24, color: "#e2e8f0" }}>
            <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: "#f59e0b" }}>How to play</div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 20 }}>
              <div style={{ marginBottom: 8 }}>1. <strong style={{ color: "#e2e8f0" }}>Draft 5 players</strong> (one per position) within your <strong style={{ color: "#fbbf24" }}>${BUDGET}</strong> budget and build your lineup.</div>
              <div style={{ marginBottom: 8 }}>2. Battle through a <strong style={{ color: "#e2e8f0" }}>full {SEASON_LENGTH}-game season</strong> in a 30-team league with 2 conferences and 6 divisions — every win moves you up the standings.</div>
              <div style={{ marginBottom: 8 }}>3. Track the league with <strong style={{ color: "#e2e8f0" }}>League Leaders, Season Highs, and Playoff Highs</strong> — your players are highlighted in green anywhere they show up.</div>
              <div>4. <strong style={{ color: "#e2e8f0" }}>Playoffs</strong>: top 6 in each conference go straight in; seeds 7–10 fight through the play-in. Win the bracket to become champion!</div>
            </div>
            <button onClick={dismissTutorial} style={{ width: "100%", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", border: "none", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Got it</button>
          </div>
        </div>
      )}

      <div style={{ position: "fixed", bottom: 16, left: 16, zIndex: 50, display: "flex", alignItems: "center", gap: 6, background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
        <button onClick={() => setSoundOn((s) => !s)} style={{ background: soundOn ? "#14532d" : "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 700, color: soundOn ? "#22c55e" : "#9ca3af", cursor: "pointer" }}>{soundOn ? "🔊" : "🔈"}</button>
        <button onClick={skipSong} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "#e2e8f0", cursor: "pointer" }} title="Skip song">⏭ Skip</button>
        <input type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={(e) => setVolume(Number(e.target.value) / 100)} style={{ width: 80, accentColor: "#60a5fa" }} title="Volume" />
      </div>

      <Analytics />
      <SpeedInsights />

      <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 80 }}>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 900,
                background: "linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              💰 NBA BUDGET BALL{" "}
              <span
                style={{
                  fontSize: 11,
                  color: "#475569",
                  WebkitTextFillColor: "#475569",
                }}
              >
                v1.0
              </span>
            </h1>
            <div
              style={{
                fontSize: 10,
                color: "#475569",
                marginTop: 1,
              }}
            >
              {playerPool.length} players · Budget ${BUDGET} · {SEASON_LENGTH}
              -game season · Play-in + Playoffs
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              flex: 1,
            }}
          >
            {/* Difficulty */}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9,
                  color: "#475569",
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                DIFFICULTY
              </span>
              <div style={{ display: "flex", gap: 3 }}>
                {[
                  ["casual", "CASUAL"],
                  ["standard", "STANDARD"],
                  ["hardcore", "HARDCORE"],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => !inSeason && setDifficulty(val)}
                    style={{
                      background:
                        difficulty === val ? "#4b5563" : "#111827",
                      color:
                        difficulty === val ? "#fef3c7" : "#9ca3af",
                      border: "1px solid #374151",
                      borderRadius: 999,
                      padding: "3px 8px",
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: inSeason ? "not-allowed" : "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Share / New season */}
            <div
              style={{
                display: "flex",
                gap: 4,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={handleCopyTeamCode}
                disabled={inSeason}
                style={{
                  background: "#0f172a",
                  color: "#e2e8f0",
                  border: "1px solid #1e293b",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: inSeason ? "not-allowed" : "pointer",
                }}
              >
                🔗 Copy Code
              </button>
              <button
                onClick={handleShareLineup}
                disabled={inSeason}
                style={{
                  background: "#0f172a",
                  color: "#e2e8f0",
                  border: "1px solid #1e293b",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: inSeason ? "not-allowed" : "pointer",
                }}
              >
                📤 Share
              </button>
              <button
                onClick={handleLoadTeamCode}
                disabled={inSeason}
                style={{
                  background: "#0f172a",
                  color: "#60a5fa",
                  border: "1px solid #1e293b",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: inSeason ? "not-allowed" : "pointer",
                }}
              >
                📥 Load Code
              </button>
              <button
                onClick={newSeason}
                style={{
                  background: "#111827",
                  color: "#e5e7eb",
                  border: "1px solid #374151",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🔄 New Season
              </button>
            </div>
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
                const suggested = bal.missing?.length > 0 ? (bal.missing[0] === "Big Man" ? "Add a big" : bal.missing[0] === "Playmaker" ? "Add a playmaker" : bal.missing[0] === "Defender" ? "Add defense" : bal.missing[0] === "Scorer" ? "Add shooting" : "Add " + bal.missing[0].toLowerCase()) : null;
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
                <button
                  onClick={() => setShowHelp((o) => !o)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    color: "#60a5fa",
                    fontSize: 14,
                    fontWeight: 900,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ?
                </button>
              </div>
              {showHelp && (
                <div
                  style={{
                    background: "#0f172a",
                    borderRadius: 10,
                    padding: 10,
                    border: "1px solid #334155",
                    fontSize: 10,
                    color: "#64748b",
                    marginTop: 6,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 9,
                      color: "#475569",
                      letterSpacing: 1,
                      marginBottom: 4,
                    }}
                  >
                    HOW TO PLAY
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    • Build your team within ${BUDGET} budget
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    • 30-team league (2 conferences, 6 divisions) — 82-game
                    season
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    • ⚡ Chemistry: real teammates same season+team
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    • 🧩 Archetypes: balance your roster for bonuses
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    • Top 6 direct · 7-10 play-in tournament
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    • Difficulty: Casual = you're favored · Hardcore = CPU favored
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
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#475569" }}>View:</span>
                  <button
                    type="button"
                    onClick={() => setShowAllSeasons(false)}
                    style={{
                      background: !showAllSeasons ? "#1e3a5f" : "#0f172a",
                      color: !showAllSeasons ? "#93c5fd" : "#64748b",
                      border: `1px solid ${!showAllSeasons ? "#3b82f6" : "#334155"}`,
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    1/player
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllSeasons(true)}
                    style={{
                      background: showAllSeasons ? "#1e3a5f" : "#0f172a",
                      color: showAllSeasons ? "#93c5fd" : "#64748b",
                      border: `1px solid ${showAllSeasons ? "#3b82f6" : "#334155"}`,
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    All seasons
                  </button>
                </div>
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
  );
}