import { MatchupCard } from "./MatchupCard";
import { ConfBracketSection } from "./ConfBracketSection";

function rf(n, d) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(d ?? 0);
}

export function BracketDisplay({ bracket, finalsMVP, onSelectMatch, onPlayMatch, activeMatchId, nextPlayerMatchId, isMobile, density }) {
  const champion = bracket.champion;
  const hasConferences = bracket.east && bracket.west;
  const pad = isMobile ? 12 : 20;
  const titleSize = isMobile ? 13 : 14;
  const hintSize = isMobile ? 11 : 11;
  const jumpTo = (id) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div style={{ background: "linear-gradient(180deg,#0f172a 0%,#080f1e 100%)", borderRadius: 16, padding: pad, border: "1px solid #1e293b", boxShadow: "0 4px 24px rgba(0,0,0,0.3)", minWidth: 0, overflow: "hidden" }}>
      <div style={{ fontWeight: 900, fontSize: titleSize, color: "#f59e0b", letterSpacing: 2, marginBottom: 6, textAlign: "center" }}>🏀 PLAYOFF BRACKET</div>
      <div style={{ fontSize: hintSize, color: "#64748b", textAlign: "center", marginBottom: isMobile ? 12 : 16, lineHeight: 1.4, padding: "0 4px" }}>Tap a matchup to select it, then use the panel below to play or sim.</div>
      {isMobile && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
          <button type="button" onClick={() => jumpTo("east-root")} style={{ border: "1px solid #334155", background: "#0b1220", color: "#93c5fd", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer", minHeight: 40 }}>East</button>
          <button type="button" onClick={() => jumpTo("west-root")} style={{ border: "1px solid #334155", background: "#0b1220", color: "#fbbf24", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer", minHeight: 40 }}>West</button>
          <button type="button" onClick={() => jumpTo("finals-section")} style={{ border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer", minHeight: 40 }}>Finals</button>
        </div>
      )}
      {hasConferences ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 20 : 28, marginBottom: isMobile ? 16 : 24 }}>
            <div style={{ minWidth: 0 }}>
              <ConfBracketSection sub={bracket.east} confLabel="EAST" prefix="east-" onSelectMatch={onSelectMatch} onPlayMatch={onPlayMatch} activeMatchId={activeMatchId} nextPlayerMatchId={nextPlayerMatchId} isMobile={isMobile} density={density} />
            </div>
            <div style={{ minWidth: 0 }}>
              <ConfBracketSection sub={bracket.west} confLabel="WEST" prefix="west-" onSelectMatch={onSelectMatch} onPlayMatch={onPlayMatch} activeMatchId={activeMatchId} nextPlayerMatchId={nextPlayerMatchId} isMobile={isMobile} density={density} />
            </div>
          </div>
          {bracket.finals && (bracket.finals.top || bracket.finals.bot) && (
            <div id="finals-section" style={{ marginTop: isMobile ? 16 : 24, padding: isMobile ? 14 : 20, background: "linear-gradient(135deg,#1c1917 0%,#0f172a 50%)", borderRadius: 16, border: "2px solid #f59e0b", boxShadow: "0 0 20px rgba(245,158,11,0.15)" }}>
              <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 800, letterSpacing: 2, marginBottom: 10, textAlign: "center" }}>🏆 NBA FINALS</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <MatchupCard matchup={bracket.finals} matchId="finals" isActive={activeMatchId === "finals"} isYourNextGame={"finals" === nextPlayerMatchId} onSelectMatch={onSelectMatch} onPlayMatch={onPlayMatch} isMobile={isMobile} density={density} />
              </div>
              {champion && (
                <>
                  <div style={{ marginTop: 14, textAlign: "center", padding: isMobile ? 14 : 16, background: "linear-gradient(135deg,#78350f,#92400e)", borderRadius: 12, border: "2px solid #fbbf24", boxShadow: "0 4px 16px rgba(251,191,36,0.2)" }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>🏆</div>
                    <div style={{ fontSize: 11, color: "#fde68a", fontWeight: 900, letterSpacing: 2 }}>CHAMPION</div>
                    <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 900, color: champion.isPlayer ? "#93c5fd" : "#fef3c7", marginTop: 4 }}>{champion.isPlayer ? "🌟 " : ""}{champion.name}</div>
                  </div>
                  {finalsMVP && (
                    <div style={{ marginTop: 10, textAlign: "center", padding: 10, background: "#0f172a", borderRadius: 10, border: "1px solid #eab308" }}>
                      <div style={{ fontSize: 9, color: "#eab308", fontWeight: 800, letterSpacing: 2, marginBottom: 4 }}>🏆 FINALS MVP</div>
                      <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 900 }}>{finalsMVP.name}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{finalsMVP.pos || "—"} · {finalsMVP.team}</div>
                      {(finalsMVP.ppg != null || finalsMVP.rpg != null || finalsMVP.apg != null) && (
                        <div style={{ fontSize: 11, color: "#e5e7eb", marginTop: 4 }}>{rf(finalsMVP.ppg, 1)} PPG · {rf(finalsMVP.rpg, 1)} RPG · {rf(finalsMVP.apg, 1)} APG</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
