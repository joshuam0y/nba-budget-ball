import { MatchupCard } from "./MatchupCard";

export function ConfBracketSection({ sub, confLabel, prefix, onSelectMatch, onPlayMatch, activeMatchId, nextPlayerMatchId, isMobile, density }) {
  if (!sub || !sub.playIn) return null;
  const { playIn, firstRound, semis, finals } = sub;
  const pi1done = !!playIn[0].winner, pi2done = !!playIn[1].winner, pi3done = !!playIn[2].winner, playInDone = pi1done && pi2done && pi3done;
  const pre = (s) => (s === "f1" ? `${prefix}f` : `${prefix}${s}`);
  const confColor = confLabel === "EAST" ? "#3b82f6" : "#f59e0b";
  const jumpTo = (id) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const card = (matchup, id) => (
    <MatchupCard
      key={id}
      matchup={matchup}
      matchId={id}
      isActive={activeMatchId === id}
      isYourNextGame={id === nextPlayerMatchId}
      onSelectMatch={onSelectMatch}
      onPlayMatch={onPlayMatch}
      isMobile={isMobile}
      density={density}
    />
  );
  const compact = density === "compact";
  const sectionGap = isMobile ? (compact ? 12 : 16) : 24;
  const roundGap = isMobile ? (compact ? 8 : 10) : 12;
  const cardRowStyle = { display: "flex", flexWrap: "wrap", gap: roundGap, justifyContent: "center", alignItems: "stretch" };
  return (
    <div id={`${prefix}root`} style={{ marginBottom: isMobile ? 20 : 24 }}>
      <div style={{ fontWeight: 800, fontSize: isMobile ? 13 : 14, color: confColor, letterSpacing: 2, marginBottom: 12, textAlign: "center", paddingBottom: 6, borderBottom: `2px solid ${confColor}40` }}>
        {confLabel} CONFERENCE
      </div>
      {isMobile && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}>
          {[
            ["Play-In", `${prefix}playin`],
            ["R1", `${prefix}fr`],
            ["SF", `${prefix}sf`],
            ["CF", `${prefix}cf`],
          ].map(([t, id]) => (
            <button
              key={id}
              type="button"
              onClick={() => jumpTo(id)}
              style={{
                border: "1px solid #334155",
                background: "#0b1220",
                color: "#cbd5e1",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                minHeight: 40,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <div style={{ marginBottom: 16, background: "linear-gradient(180deg,#0f172a 0%,#0a0f1a 100%)", borderRadius: 14, padding: isMobile ? 12 : 16, border: "1px solid #1e293b" }}>
        <div id={`${prefix}playin`} style={{ fontSize: isMobile ? 11 : 11, color: "#f59e0b", fontWeight: 800, letterSpacing: 1.5, marginBottom: 10, textAlign: "center" }}>🎟 PLAY-IN</div>
        <div style={{ ...cardRowStyle, flexDirection: isMobile ? "column" : "row" }}>
          {card(playIn[0], pre("pi1"))}
          {card(playIn[1], pre("pi2"))}
          {card(playIn[2], pre("pi3"))}
        </div>
      </div>
      {playInDone && (
        <div style={{ display: "flex", flexDirection: "column", gap: sectionGap }}>
          <div>
            <div id={`${prefix}fr`} style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1, textAlign: "center", marginBottom: 8, fontWeight: 700 }}>FIRST ROUND</div>
            <div style={cardRowStyle}>
              {[firstRound[0], firstRound[1], firstRound[2], firstRound[3]].map((m, i) => card(m, pre(["fr1","fr2","fr3","fr4"][i])))}
            </div>
          </div>
          <div>
            <div id={`${prefix}sf`} style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1, textAlign: "center", marginBottom: 8, fontWeight: 700 }}>SEMIFINALS</div>
            <div style={cardRowStyle}>
              {card(semis[0], pre("sf1"))}
              {card(semis[1], pre("sf2"))}
            </div>
          </div>
          <div>
            <div id={`${prefix}cf`} style={{ fontSize: 11, color: "#f59e0b", letterSpacing: 1, textAlign: "center", marginBottom: 8, fontWeight: 700 }}>CONFERENCE FINALS</div>
            <div style={cardRowStyle}>
              {card(finals, pre("f"))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
