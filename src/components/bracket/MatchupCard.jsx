export function MatchupCard({ matchup, matchId, isActive, onSelectMatch, onPlayMatch, isYourNextGame, isMobile, density }) {
  const { top, bot, winner, games, label } = matchup;
  const wA = games.filter((g) => g.winnerIdx === 0).length, wB = games.filter((g) => g.winnerIdx === 1).length, done = !!winner;
  const hasUser = top?.isPlayer || bot?.isPlayer;
  const handleCardClick = () => onSelectMatch?.(matchId);
  const handlePlayClick = (e) => {
    e?.stopPropagation?.();
    onPlayMatch?.(matchId);
  };
  const slot = matchId === "finals" ? "finals" : (matchId?.split("-")?.[1] ?? "");
  const isPi1 = slot === "pi1";
  const compact = density === "compact";
  const cardPadding = isMobile ? (compact ? 12 : 16) : (compact ? 12 : 14);
  const labelSize = isMobile ? 10 : 9;
  const teamSize = isMobile ? 13 : 12;
  const showWins = !!top && !!bot;
  const note = done ? null : isPi1 ? "Play-in: loser gets another chance" : "Win advances";
  return (
    <div
      id={`match-${matchId}`}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCardClick(); } }}
      style={{
        background: isActive ? "#1e293b" : "#0f172a",
        border: `2px solid ${done ? "#22c55e" : isYourNextGame ? "#22c55e" : isActive ? "#6366f1" : "#1e293b"}`,
        borderRadius: 12,
        padding: cardPadding,
        minWidth: isMobile ? 0 : 200,
        width: isMobile ? "100%" : undefined,
        maxWidth: isMobile ? "100%" : 260,
        flex: isMobile ? "1 1 100%" : undefined,
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        boxShadow: isYourNextGame && !done ? "0 0 0 2px #22c55e40" : isActive ? "0 0 0 1px #6366f1" : "none",
        scrollMarginTop: 84,
      }}
    >
      {isYourNextGame && !done && <div style={{ fontSize: isMobile ? 10 : 9, color: "#22c55e", fontWeight: 800, letterSpacing: 0.5, marginBottom: 6 }}>YOUR GAME</div>}
      <div style={{ fontSize: labelSize, color: "#64748b", letterSpacing: 1, marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
      {[top, bot].map((team, ti) => {
        const isW = winner?.name === team?.name, wins = ti === 0 ? wA : wB;
        return team ? (
          <div
            key={ti}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              padding: isMobile ? (compact ? "9px 10px" : "10px 12px") : (compact ? "7px 9px" : "8px 10px"),
              borderRadius: 8,
              background: team.isPlayer ? "#0b2a4a" : isW ? "#14532d" : done && !isW ? "#1a0a0a" : "#1e293b",
              border: `1px solid ${team.isPlayer ? "#1d4ed8" : isW ? "#22c55e" : done && !isW ? "#7f1d1d" : "#334155"}`,
            }}
          >
            <div style={{ flex: 1, fontSize: teamSize, fontWeight: 800, color: team.isPlayer ? "#93c5fd" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {team.isPlayer ? "🌟 " : ""}{team.name}
            </div>
            {showWins && <div style={{ fontSize: 13, fontWeight: 900, color: isW ? "#22c55e" : "#94a3b8", minWidth: 18 }}>{wins}</div>}
            {isW && <span style={{ fontSize: 11, color: "#22c55e" }}>✓</span>}
          </div>
        ) : (
          <div key={ti} style={{ marginBottom: 6, padding: isMobile ? "10px 12px" : "8px 10px", borderRadius: 8, background: "#020617", border: "1px dashed #334155" }}>
            <div style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>TBD</div>
          </div>
        );
      })}
      {note && (
        <div style={{ marginTop: 6, fontSize: isMobile ? 11 : 10, color: "#94a3b8", fontWeight: 700, textAlign: "center" }}>
          {note}
        </div>
      )}
      {!done && top && bot && onPlayMatch && (
        <button
          type="button"
          onClick={handlePlayClick}
          style={{
            width: "100%",
            marginTop: 10,
            minHeight: isMobile ? 44 : undefined,
            background: hasUser ? "linear-gradient(135deg,#22c55e,#16a34a)" : "linear-gradient(135deg,#475569,#64748b)",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: isMobile ? "12px 14px" : "10px 12px",
            fontSize: isMobile ? 13 : 12,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: hasUser ? "0 2px 8px rgba(34,197,94,0.3)" : "0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          {hasUser ? `▶ Play Game ${games.length + 1}` : `⚡ Sim Game ${games.length + 1}`}
        </button>
      )}
      {done && (
        <div style={{ textAlign: "center", fontSize: isMobile ? 12 : 11, color: "#22c55e", marginTop: 8, fontWeight: 700 }}>
          ✓ {winner?.name} advance
        </div>
      )}
    </div>
  );
}
