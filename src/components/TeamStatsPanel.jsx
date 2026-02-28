import { useState } from "react";
import { rf } from "../sim";

const FACTOR_36 = 0.75;
const fmt1 = (v) => (v ?? 0).toFixed(1);
const fmt0 = (v) => Math.round(v ?? 0);

export function TeamStatsPanel({ teamName, playerSeasonRows, playerPlayoffRows, perMode, onPerModeChange, showPlayoff, isMobile }) {
  const [sortKey, setSortKey] = useState("pts");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortAsc((asc) => !asc);
      return;
    }
    setSortKey(key);
    setSortAsc(false);
  };

  const renderTable = (rows, label) => {
    if (!rows || rows.length === 0) return null;
    const mult = perMode === "per36" ? FACTOR_36 : 1;

    const valueFor = (r, key) => {
      const gp = r.gp > 0 ? r.gp : 1;
      const pg = (k) => (r[k] ?? 0) / gp;
      if (["pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta"].includes(key))
        return pg(key) * mult;
      if (key === "fgPct") return r.fga > 0 ? r.fgm / r.fga : 0;
      if (key === "tpPct") return r.tpa > 0 ? r.tpm / r.tpa : 0;
      if (key === "ftPct") return r.fta > 0 ? r.ftm / r.fta : 0;
      return 0;
    };

    const sorted = [...rows].sort((a, b) => {
      const av = valueFor(a, sortKey);
      const bv = valueFor(b, sortKey);
      return sortAsc ? av - bv : bv - av;
    });

    if (isMobile) {
      return (
        <div key={label} style={{ marginBottom: showPlayoff ? 12 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#60a5fa", letterSpacing: 1, marginBottom: 8 }}>{label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.map((r) => {
              const gp = r.gp > 0 ? r.gp : 1;
              const pg = (k) => (r[k] ?? 0) / gp;
              const val = (k) => rf(pg(k) * mult, 1);
              const fgPct = r.fga > 0 ? rf((r.fgm / r.fga) * 100, 1) : null;
              const tpPct = r.tpa > 0 ? rf((r.tpm / r.tpa) * 100, 1) : null;
              const ftPct = r.fta > 0 ? rf((r.ftm / r.fta) * 100, 1) : null;
              return (
                <details key={`${label}-${r.name}`} style={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 12, padding: 12 }}>
                  <summary style={{ cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{r.pos || "—"} · GP {fmt0(r.gp || 0)}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>{perMode === "per36" ? "PER 36" : "PER G"}</div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#60a5fa" }}>{val("pts")} PTS</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                      {[["REB", val("reb")], ["AST", val("ast")], ["TOV", val("tov")], ["STL", val("stl")], ["BLK", val("blk")], ["3PM", val("tpm")]].map(([k, v]) => (
                        <div key={k} style={{ background: "#0b1220", border: "1px solid #1e293b", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, letterSpacing: 1 }}>{k}</div>
                          <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 900 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </summary>
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {[
                      ["FG%", fgPct != null ? `${fgPct}%` : "—"],
                      ["3P%", tpPct != null ? `${tpPct}%` : "—"],
                      ["FT%", ftPct != null ? `${ftPct}%` : "—"],
                      ["FGM", fmt0(r.fgm || 0)],
                      ["3PM", fmt0(r.tpm || 0)],
                      ["FTM", fmt0(r.ftm || 0)],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: "#0b1220", border: "1px solid #1e293b", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 900, letterSpacing: 1 }}>{k}</div>
                        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 900 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div key={label} style={{ marginBottom: showPlayoff ? 12 : 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#60a5fa", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: 920 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b", background: "#0f172a" }}>
                <th style={{ padding: "4px 6px", textAlign: "left", color: "#475569", fontSize: 9 }}>PLAYER</th>
                <th style={{ padding: "4px 6px", textAlign: "center", color: "#475569", fontSize: 9 }}>POS</th>
                <th style={{ padding: "4px 6px", textAlign: "center", color: "#475569", fontSize: 9 }}>GP</th>
                <th colSpan={12} style={{ padding: "4px 8px", textAlign: "center", color: "#60a5fa", fontSize: 9, fontWeight: 800, borderLeft: "1px solid #334155", borderRight: "1px solid #334155" }}>PER GAME</th>
                <th colSpan={6} style={{ padding: "4px 8px", textAlign: "center", color: "#22c55e", fontSize: 9, fontWeight: 800, borderRight: "1px solid #334155" }}>TOTALS</th>
                <th colSpan={3} style={{ padding: "4px 8px", textAlign: "center", color: "#475569", fontSize: 9, fontWeight: 800 }}>%</th>
              </tr>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                {["PLAYER", "POS", "GP", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FGM", "FGA", "3PM", "3PA", "FTM", "FTA", "FGM", "FGA", "3PM", "3PA", "FTM", "FTA", "FG%", "3P%", "FT%"].map((h, idx) => (
                  <th key={idx} style={{ padding: "4px 6px", textAlign: h === "PLAYER" ? "left" : "center", color: "#475569", fontSize: 9 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const gp = r.gp > 0 ? r.gp : 1;
                const pg = (k) => (r[k] ?? 0) / gp;
                const val = (k) => fmt1(pg(k) * mult);
                const fgPct = r.fga > 0 ? rf((r.fgm / r.fga) * 100, 1) : "—";
                const tpPct = r.tpa > 0 ? rf((r.tpm / r.tpa) * 100, 1) : "—";
                const ftPct = r.fta > 0 ? rf((r.ftm / r.fta) * 100, 1) : "—";
                return (
                  <tr key={r.name} style={{ borderBottom: "1px solid #0d1626" }}>
                    <td style={{ padding: "4px 6px", fontWeight: 700, color: "#e2e8f0" }}>{r.name}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center", color: "#64748b" }}>{r.pos || "—"}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center", color: "#64748b" }}>{fmt0(r.gp || 0)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center", borderLeft: "1px solid #334155" }}>{val("pts")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{val("reb")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{val("ast")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{val("stl")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{val("blk")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{val("tov")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{val("fgm")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{val("fga")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{val("tpm")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{val("tpa")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center", borderRight: "1px solid #334155" }}>{val("ftm")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center", borderRight: "1px solid #334155" }}>{val("fta")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{fmt0(r.fgm || 0)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{fmt0(r.fga || 0)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{fmt0(r.tpm || 0)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{fmt0(r.tpa || 0)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{fmt0(r.ftm || 0)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center", borderRight: "1px solid #334155" }}>{fmt0(r.fta || 0)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{fgPct}{typeof fgPct === "number" ? "%" : ""}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{tpPct}{typeof tpPct === "number" ? "%" : ""}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{ftPct}{typeof ftPct === "number" ? "%" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const hasSeason = playerSeasonRows && playerSeasonRows.length > 0;
  const hasPlayoff = showPlayoff && playerPlayoffRows && playerPlayoffRows.length > 0;
  if (!hasSeason && !hasPlayoff) return null;
  return (
    <div style={{ background: "#0f172a", borderRadius: 10, border: "1px solid #1e293b", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: 2, color: "#60a5fa" }}>📊 {teamName} — PLAYER STATS</span>
        <div style={{ display: "flex", gap: 4 }}>
          {["PER G", "PER 36"].map((m) => (
            <button
              key={m}
              onClick={() => onPerModeChange(m === "PER 36" ? "per36" : "game")}
              style={{
                background: perMode === (m === "PER 36" ? "per36" : "game") ? "#334155" : "#1e293b",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8, fontSize: 9 }}>
        {[
          ["pts", "PTS"], ["reb", "REB"], ["ast", "AST"], ["stl", "STL"], ["blk", "BLK"], ["tov", "TOV"],
          ["fgm", "FGM"], ["fga", "FGA"], ["tpm", "3PM"], ["tpa", "3PA"], ["ftm", "FTM"], ["fta", "FTA"],
          ["fgPct", "FG%"], ["tpPct", "3P%"], ["ftPct", "FT%"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleSort(key)}
            style={{
              background: sortKey === key ? "#1d4ed8" : "#0f172a",
              color: sortKey === key ? "#e5e7eb" : "#9ca3af",
              border: "1px solid #1e293b",
              borderRadius: 999,
              padding: "2px 8px",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}{sortKey === key ? (sortAsc ? " ↑" : " ↓") : ""}
          </button>
        ))}
      </div>
      {hasSeason && renderTable(playerSeasonRows, "SEASON")}
      {hasPlayoff && renderTable(playerPlayoffRows, "PLAYOFFS")}
    </div>
  );
}
