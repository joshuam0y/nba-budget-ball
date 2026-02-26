import pandas as pd
import numpy as np

# ── CONFIG ───────────────────────────────────────────────
INPUT_FILE  = "normalizedstats223.csv"
OUTPUT_FILE = "all_nba_filtered.csv"

MIN_GAMES   = 41
MIN_MP      = 1500
MIN_SEASON  = 1950

# ── LOAD ─────────────────────────────────────────────────
df = pd.read_csv(INPUT_FILE)
print(f"Loaded {len(df)} rows, {len(df.columns)} columns")
print("Columns:", list(df.columns))

# ── CLEAN ────────────────────────────────────────────────
df.columns = df.columns.str.strip().str.lower()

df = df[df["tm"].str.upper() != "TOT"]
print(f"After removing TOT: {len(df)} rows")

df = df[df["g"] >= MIN_GAMES]
df = df[df["mp"] >= MIN_MP]
df = df[df["season"] >= MIN_SEASON]
print(f"After filters: {len(df)} rows")

# ── DETECT STAT FORMAT ───────────────────────────────────
is_per100 = any("per_100" in c for c in df.columns)
suf = "_per_100_poss" if is_per100 else "_per_36_min"
print(f"Stat format: {'per 100 poss' if is_per100 else 'per 36 min'}")

def col(base):
    for name in [f"{base}{suf}", f"{base}_per_100_poss", f"{base}_per_36_min", base]:
        if name in df.columns:
            return name
    return None

stat_map = {
    "pts":  col("pts"),
    "ast":  col("ast"),
    "reb":  col("trb"),
    "stl":  col("stl"),
    "blk":  col("blk"),
    "tov":  col("tov"),
    "fga":  col("fga"),
    "x3pa": col("x3pa"),
    "fta":  col("fta"),
}

print("\nStat column mapping:")
for k, v in stat_map.items():
    print(f"  {k:6s} → {v}")

missing = [k for k, v in stat_map.items() if v is None]
if missing:
    print(f"\nWARNING: Could not find columns for: {missing}")

# ── NORMALIZE POSITION ───────────────────────────────────
POS_MAP = {
    "PG": "PG", "G": "PG",
    "SG": "SG", "G-F": "SG", "GF": "SG",
    "SF": "SF", "F": "SF", "F-G": "SF", "FG": "SF",
    "PF": "PF", "F-C": "PF", "FC": "PF",
    "C":  "C",  "C-F": "C",  "CF": "C",
}
def normalize_pos(p):
    p = str(p).strip().upper().replace("-", "-")
    if p in POS_MAP:
        return POS_MAP[p]
    for k in POS_MAP:
        if p.startswith(k):
            return POS_MAP[k]
    return "SF"

df["pos_clean"] = df["pos"].apply(normalize_pos)

# ── BUILD OUTPUT ─────────────────────────────────────────
def s(col_name):
    if col_name and col_name in df.columns:
        return pd.to_numeric(df[col_name], errors="coerce").fillna(0)
    return pd.Series(0, index=df.index)

pts  = s(stat_map["pts"])
ast  = s(stat_map["ast"])
reb  = s(stat_map["reb"])
stl  = s(stat_map["stl"])
blk  = s(stat_map["blk"])
tov  = s(stat_map["tov"])
fga  = s(stat_map["fga"])
x3pa = s(stat_map["x3pa"])
fta  = s(stat_map["fta"])

# FG%
fg_raw = pd.to_numeric(df["fg_percent"], errors="coerce").fillna(0)
fg_pct = fg_raw.apply(lambda x: x * 100 if x <= 1 else x)

# FT%
ft_raw = pd.to_numeric(df["ft_percent"], errors="coerce").fillna(0)
ft_pct = ft_raw.apply(lambda x: x * 100 if x <= 1 else x)

# 3P% (real historical)
x3p_raw = pd.to_numeric(df["x3p_percent"], errors="coerce").fillna(0)
x3p_pct = x3p_raw.apply(lambda x: x * 100 if x <= 1 else x)

# FT rate = FTA per FGA
ft_rate = np.where(fga > 0, (fta / fga).round(2), 0.0)

# TS%
ts_denom = 2 * (fga + 0.44 * fta)
ts_pct = np.where(ts_denom > 0, (pts / ts_denom * 100).round(1), 50.0)

# 3P attempt rate (tendency — used by sim for shot selection)
tr = np.where(fga > 0, (x3pa / fga).round(2), 0.0)

# Player label
def make_label(row):
    name = str(row["player"]).strip()
    season = str(row["season"])
    parts = name.split(" ")
    last = " ".join(parts[1:]) if len(parts) > 1 else parts[0]
    init = parts[0][0] + "." if parts[0] else ""
    yr = f"'{season[2:]}"
    return f"{init} {last} {yr}".strip()

df["label"] = df.apply(make_label, axis=1)

# ── KNN FILL MISSING STL/BLK ─────────────────────────────
out = pd.DataFrame({
    "name":     df["label"],
    "fullName": df["player"],
    "pos":      df["pos_clean"],
    "season":   df["season"],
    "tm":       df["tm"].str.upper(),
    "pts":      pts.round(1),
    "ast":      ast.round(1),
    "reb":      reb.round(1),
    "stl":      stl.round(2),
    "blk":      blk.round(2),
    "tov":      tov.round(1),
    "fg":       fg_pct.round(1),
    "ts":       ts_pct,
    "tR":       tr,
    "ftPct":    ft_pct.round(1),
    "ftRate":   ft_rate,
    "tpPct":    x3p_pct.round(1),   # real historical 3P%
})

def knn_fill(df_out, target_col, k=5):
    has_data = df_out[df_out[target_col] > 0].copy()
    missing  = df_out[df_out[target_col] <= 0].copy()
    if len(missing) == 0:
        return df_out
    print(f"KNN filling {len(missing)} rows missing '{target_col}'...")
    for idx, row in missing.iterrows():
        pos_match = has_data[has_data["pos"] == row["pos"]]
        pool = pos_match if len(pos_match) >= k else has_data
        dists = (
            (pool["pts"] - row["pts"]).abs() +
            (pool["reb"] - row["reb"]).abs() * 0.8 +
            (pool["ast"] - row["ast"]).abs() * 0.5
        )
        neighbors = pool.loc[dists.nsmallest(k).index]
        df_out.at[idx, target_col] = round(neighbors[target_col].mean(), 2)
    return df_out

out = knn_fill(out, "stl")
out = knn_fill(out, "blk")

# ── RATING & COST ────────────────────────────────────────
def calc_rating(r):
    return round(
        r["pts"]*1.0 + r["ast"]*1.5 + r["reb"]*1.1 +
        r["stl"]*2.2 + r["blk"]*1.8 - r["tov"]*1.2 +
        (r["fg"]-44)*0.4 + (r["ts"]-54)*0.15, 1
    )

out["rating"] = out.apply(calc_rating, axis=1)
mn, mx = out["rating"].min(), out["rating"].max()
out["cost"] = ((5 + (out["rating"] - mn) / max(mx - mn, 1) * 35)).round().astype(int)
out["cost"] = out["cost"].clip(5, 40)

# ── SORT & SAVE ──────────────────────────────────────────
out = out.sort_values("rating", ascending=False).reset_index(drop=True)
out = out.drop_duplicates(subset=["fullName"], keep="first")
out = out.reset_index(drop=True)

expected = ["name","fullName","pos","season","tm","pts","ast","reb","stl","blk","tov","fg","ts","tR","ftPct","ftRate","tpPct","rating","cost"]
assert list(out.columns) == expected, f"Column mismatch!\nGot:      {list(out.columns)}\nExpected: {expected}"

out.to_csv(OUTPUT_FILE, index=False)
print(f"\nCSV columns: {list(out.columns)}")
print(f"\n✓ Done! {len(out)} players saved to '{OUTPUT_FILE}'")
print(f"  Rating range: {mn:.1f} – {mx:.1f}")
print(f"  Cost range:   {out['cost'].min()} – {out['cost'].max()}")
print(f"  Positions:    {out['pos'].value_counts().to_dict()}")
print(f"  Seasons:      {out['season'].nunique()} unique seasons")
print(f"  Teams:        {out['tm'].nunique()} unique teams")
print("\nTop 10 players:")
print(out[["name","pos","season","tm","pts","ast","reb","rating","cost"]].head(10).to_string())