import { useState, useEffect, useCallback } from "react";

const POSITIONS = ["PG","SG","SF","PF","C"];
const BUDGET = 140;

// ── Rating formula ────────────────────────────────────
function calcRating(p) {
  return +(p.pts*1.0 + p.ast*1.5 + p.reb*1.1 + p.stl*2.2 + p.blk*1.8 - p.tov*1.2 + (p.fg-44)*0.4 + (p.ts-54)*0.3).toFixed(1);
}
function ratingToCost(r) {
  if (r >= 65) return 40;
  if (r >= 55) return 32;
  if (r >= 42) return 25;
  if (r >= 30) return 18;
  if (r >= 18) return 12;
  if (r >= 8)  return 8;
  return 5;
}

// ── Chemistry pairs (real teammates) ─────────────────
const CHEM_PAIRS = [
  ["S. Curry '16","K.Thompson '16"],["S. Curry '16","D. Green '16"],["K.Thompson '16","D. Green '16"],
  ["S. Curry '16","D. Green '16","K.Thompson '16"],
  ["LeBron '18","K. Love '14"],["LeBron '18","K. Irving '19"],
  ["D. Wade '09","LeBron '18"],
  ["K. Bryant '08","D. Howard '13"],
  ["R.Westbrook '17","K. Durant '14"],
  ["J. Harden '19","C. Paul '15"],
  ["N. Jokic '22","J. Murray '22"],
  ["G.Antetok. '20","K. Middleton '20"],["G.Antetok. '20","D. Holiday '21"],
  ["J. Embiid '23","J. Harden '19"],
  ["D. Rose '11","C. Boozer '11"],
  ["K. Durant '14","R.Westbrook '17"],
  ["T. Young '22","J. Collins '21"],
  ["D. Lillard '21","C.McCollum '21"],
  ["B. Adebayo '22","J. Butler '20"],
  ["K. Towns '22","K. Anthony-Towns"],
  ["A. Davis '20","LeBron '18"],
];

function chemBoost(lineup) {
  const names = new Set(lineup.map(x => x.player.name));
  let boost = 0;
  for (const pair of CHEM_PAIRS) {
    const arr = Array.isArray(pair) ? pair : [pair];
    if (arr.every(n => names.has(n))) boost += arr.length >= 3 ? 4 : 2;
  }
  return boost;
}

// ── Players ───────────────────────────────────────────
const raw = [
  // PG
  {name:"S. Curry '16",    pos:"PG",pts:31.2,ast:6.9,reb:5.6,stl:2.2,blk:0.2,tov:3.4,fg:50.4,ts:67.0,threeRate:0.45,twoRate:0.55},
  {name:"R.Westbrook '17", pos:"PG",pts:33.4,ast:11.0,reb:11.3,stl:1.7,blk:0.4,tov:5.7,fg:42.5,ts:55.4,threeRate:0.22,twoRate:0.78},
  {name:"D. Rose '11",     pos:"PG",pts:28.1,ast:8.1,reb:4.3,stl:1.1,blk:0.3,tov:3.6,fg:45.9,ts:55.5,threeRate:0.18,twoRate:0.82},
  {name:"C. Paul '15",     pos:"PG",pts:20.1,ast:10.4,reb:4.6,stl:2.5,blk:0.2,tov:2.3,fg:48.5,ts:59.1,threeRate:0.28,twoRate:0.72},
  {name:"D. Lillard '21",  pos:"PG",pts:29.8,ast:8.1,reb:4.4,stl:1.0,blk:0.3,tov:3.3,fg:45.1,ts:62.2,threeRate:0.42,twoRate:0.58},
  {name:"K. Irving '19",   pos:"PG",pts:27.4,ast:6.9,reb:5.0,stl:1.5,blk:0.4,tov:3.1,fg:48.7,ts:61.0,threeRate:0.35,twoRate:0.65},
  {name:"T. Young '22",    pos:"PG",pts:28.4,ast:9.7,reb:3.9,stl:0.9,blk:0.2,tov:4.3,fg:43.0,ts:60.3,threeRate:0.40,twoRate:0.60},
  {name:"J. Wall '17",     pos:"PG",pts:23.2,ast:11.0,reb:4.2,stl:2.0,blk:0.6,tov:3.8,fg:45.1,ts:56.0,threeRate:0.20,twoRate:0.80},
  {name:"M. Conley '17",   pos:"PG",pts:18.5,ast:6.4,reb:3.1,stl:1.8,blk:0.3,tov:2.1,fg:46.2,ts:57.8,threeRate:0.38,twoRate:0.62},
  {name:"I. Thomas '17",   pos:"PG",pts:30.2,ast:6.4,reb:3.2,stl:0.9,blk:0.2,tov:2.8,fg:46.3,ts:61.9,threeRate:0.32,twoRate:0.68},
  {name:"F.VanVleet '22",  pos:"PG",pts:20.0,ast:7.1,reb:4.3,stl:1.9,blk:0.4,tov:2.7,fg:40.8,ts:55.1,threeRate:0.44,twoRate:0.56},
  {name:"D. Fox '22",      pos:"PG",pts:24.0,ast:5.1,reb:3.5,stl:1.4,blk:0.3,tov:3.2,fg:48.8,ts:57.8,threeRate:0.22,twoRate:0.78},
  {name:"K. Walker '19",   pos:"PG",pts:25.6,ast:5.9,reb:4.4,stl:1.1,blk:0.3,tov:2.8,fg:43.4,ts:57.1,threeRate:0.36,twoRate:0.64},
  {name:"M. Smart '22",    pos:"PG",pts:12.1,ast:5.9,reb:3.5,stl:1.7,blk:0.4,tov:2.3,fg:36.9,ts:50.5,threeRate:0.30,twoRate:0.70},
  {name:"D. Graham '23",   pos:"PG",pts:12.9,ast:6.1,reb:3.0,stl:0.9,blk:0.1,tov:2.2,fg:40.2,ts:53.0,threeRate:0.38,twoRate:0.62},
  {name:"S. Dinwiddie '20",pos:"PG",pts:20.6,ast:6.8,reb:3.5,stl:0.7,blk:0.2,tov:2.9,fg:42.6,ts:57.5,threeRate:0.33,twoRate:0.67},
  {name:"T. Rozier '22",   pos:"PG",pts:21.4,ast:4.3,reb:4.4,stl:1.3,blk:0.3,tov:2.6,fg:44.1,ts:57.5,threeRate:0.38,twoRate:0.62},
  {name:"C. Boozer '11",   pos:"PG",pts:17.5,ast:3.5,reb:8.8,stl:0.5,blk:0.3,tov:2.3,fg:52.0,ts:55.0,threeRate:0.02,twoRate:0.98},
  {name:"Q. Snell '20",    pos:"PG",pts:8.2,ast:2.0,reb:2.2,stl:0.6,blk:0.1,tov:1.1,fg:41.0,ts:56.0,threeRate:0.45,twoRate:0.55},
  {name:"J. Murray '22",   pos:"PG",pts:21.1,ast:6.2,reb:4.0,stl:1.1,blk:0.3,tov:2.8,fg:45.6,ts:59.0,threeRate:0.36,twoRate:0.64},
  // SG
  {name:"J. Harden '19",   pos:"SG",pts:38.2,ast:7.9,reb:7.0,stl:2.1,blk:0.7,tov:5.3,fg:44.2,ts:61.8,threeRate:0.48,twoRate:0.52},
  {name:"K. Bryant '08",   pos:"SG",pts:30.1,ast:5.7,reb:6.6,stl:1.9,blk:0.5,tov:3.3,fg:45.9,ts:56.0,threeRate:0.20,twoRate:0.80},
  {name:"D. Wade '09",     pos:"SG",pts:32.0,ast:7.9,reb:5.3,stl:2.3,blk:1.4,tov:3.8,fg:49.1,ts:60.2,threeRate:0.10,twoRate:0.90},
  {name:"K.Thompson '16",  pos:"SG",pts:23.5,ast:2.2,reb:4.1,stl:0.9,blk:0.6,tov:1.8,fg:47.1,ts:61.1,threeRate:0.52,twoRate:0.48},
  {name:"B. Beal '21",     pos:"SG",pts:33.1,ast:4.7,reb:5.0,stl:1.3,blk:0.4,tov:3.5,fg:48.5,ts:59.0,threeRate:0.33,twoRate:0.67},
  {name:"Z. LaVine '22",   pos:"SG",pts:26.7,ast:4.6,reb:4.8,stl:0.9,blk:0.5,tov:2.8,fg:48.0,ts:61.5,threeRate:0.40,twoRate:0.60},
  {name:"D. DeRozan '20",  pos:"SG",pts:22.7,ast:6.1,reb:4.2,stl:0.9,blk:0.3,tov:2.5,fg:49.4,ts:55.8,threeRate:0.05,twoRate:0.95},
  {name:"T. Herro '22",    pos:"SG",pts:21.3,ast:4.0,reb:4.9,stl:1.0,blk:0.2,tov:2.6,fg:44.7,ts:59.6,threeRate:0.42,twoRate:0.58},
  {name:"C.McCollum '21",  pos:"SG",pts:24.0,ast:4.6,reb:4.4,stl:1.0,blk:0.4,tov:2.0,fg:47.1,ts:59.0,threeRate:0.38,twoRate:0.62},
  {name:"M. Brogdon '22",  pos:"SG",pts:19.9,ast:5.9,reb:5.1,stl:1.2,blk:0.3,tov:2.6,fg:45.8,ts:60.5,threeRate:0.36,twoRate:0.64},
  {name:"J. Holiday '21",  pos:"SG",pts:18.0,ast:6.1,reb:5.2,stl:1.6,blk:0.5,tov:2.5,fg:47.4,ts:58.3,threeRate:0.35,twoRate:0.65},
  {name:"V. Carter '01",   pos:"SG",pts:27.6,ast:3.9,reb:5.9,stl:1.1,blk:0.8,tov:2.9,fg:43.9,ts:54.5,threeRate:0.28,twoRate:0.72},
  {name:"W. Barton '20",   pos:"SG",pts:15.7,ast:4.1,reb:5.2,stl:0.9,blk:0.4,tov:1.9,fg:42.5,ts:56.3,threeRate:0.36,twoRate:0.64},
  {name:"D. Russell '22",  pos:"SG",pts:18.1,ast:5.6,reb:3.4,stl:0.7,blk:0.2,tov:2.5,fg:43.0,ts:57.5,threeRate:0.38,twoRate:0.62},
  {name:"D. Schroder '21", pos:"SG",pts:15.4,ast:5.8,reb:3.5,stl:1.2,blk:0.2,tov:2.7,fg:43.3,ts:56.1,threeRate:0.30,twoRate:0.70},
  {name:"T. Prince '22",   pos:"SG",pts:14.1,ast:2.6,reb:4.3,stl:1.1,blk:0.2,tov:1.3,fg:44.6,ts:58.5,threeRate:0.44,twoRate:0.56},
  {name:"J. Ingles '21",   pos:"SG",pts:12.1,ast:4.5,reb:4.1,stl:1.0,blk:0.2,tov:1.5,fg:42.1,ts:60.5,threeRate:0.50,twoRate:0.50},
  {name:"G. Temple '19",   pos:"SG",pts:9.5,ast:2.2,reb:3.1,stl:0.9,blk:0.2,tov:1.1,fg:41.5,ts:54.0,threeRate:0.35,twoRate:0.65},
  {name:"W. Bradley '16",  pos:"SG",pts:11.4,ast:1.6,reb:3.0,stl:1.2,blk:0.5,tov:1.3,fg:43.0,ts:55.3,threeRate:0.40,twoRate:0.60},
  {name:"E. Moore '18",    pos:"SG",pts:7.6,ast:2.5,reb:2.8,stl:0.9,blk:0.1,tov:1.2,fg:40.0,ts:52.0,threeRate:0.38,twoRate:0.62},
  // SF
  {name:"LeBron '18",      pos:"SF",pts:29.0,ast:9.6,reb:9.1,stl:1.5,blk:0.9,tov:4.4,fg:54.2,ts:62.0,threeRate:0.25,twoRate:0.75},
  {name:"K. Durant '14",   pos:"SF",pts:34.1,ast:5.8,reb:7.8,stl:1.4,blk:0.7,tov:3.7,fg:50.3,ts:63.5,threeRate:0.30,twoRate:0.70},
  {name:"G.Antetok. '20",  pos:"SF",pts:31.6,ast:6.8,reb:14.3,stl:1.5,blk:1.7,tov:4.2,fg:55.3,ts:61.0,threeRate:0.25,twoRate:0.75},
  {name:"K. Leonard '17",  pos:"SF",pts:27.4,ast:3.7,reb:6.8,stl:2.0,blk:0.7,tov:2.2,fg:48.0,ts:59.3,threeRate:0.28,twoRate:0.72},
  {name:"J. Tatum '23",    pos:"SF",pts:31.8,ast:4.8,reb:9.3,stl:1.1,blk:0.7,tov:3.1,fg:46.6,ts:58.0,threeRate:0.35,twoRate:0.65},
  {name:"P. George '19",   pos:"SF",pts:30.1,ast:4.4,reb:8.8,stl:2.4,blk:0.4,tov:3.0,fg:43.9,ts:57.1,threeRate:0.38,twoRate:0.62},
  {name:"J. Butler '20",   pos:"SF",pts:20.0,ast:6.5,reb:7.0,stl:2.1,blk:0.8,tov:2.7,fg:45.5,ts:59.1,threeRate:0.20,twoRate:0.80},
  {name:"K. Middleton '20",pos:"SF",pts:21.1,ast:4.3,reb:6.2,stl:1.1,blk:0.5,tov:2.3,fg:49.3,ts:59.0,threeRate:0.35,twoRate:0.65},
  {name:"M. Bridges '23",  pos:"SF",pts:24.0,ast:3.7,reb:4.6,stl:1.3,blk:0.6,tov:1.6,fg:47.0,ts:58.5,threeRate:0.36,twoRate:0.64},
  {name:"H. Barnes '22",   pos:"SF",pts:19.8,ast:2.6,reb:5.0,stl:0.8,blk:0.5,tov:1.6,fg:48.5,ts:58.2,threeRate:0.38,twoRate:0.62},
  {name:"A. Wiggins '22",  pos:"SF",pts:18.3,ast:2.2,reb:5.0,stl:0.9,blk:0.7,tov:1.8,fg:47.7,ts:56.5,threeRate:0.34,twoRate:0.66},
  {name:"T. Warren '20",   pos:"SF",pts:21.5,ast:2.0,reb:4.7,stl:0.7,blk:0.3,tov:1.5,fg:53.6,ts:61.0,threeRate:0.25,twoRate:0.75},
  {name:"K. Kuzma '22",    pos:"SF",pts:17.1,ast:3.5,reb:8.0,stl:0.8,blk:0.4,tov:2.0,fg:43.3,ts:55.0,threeRate:0.32,twoRate:0.68},
  {name:"O.Porter Jr '18", pos:"SF",pts:16.0,ast:2.0,reb:7.2,stl:1.3,blk:0.5,tov:1.3,fg:49.4,ts:63.2,threeRate:0.42,twoRate:0.58},
  {name:"R. Bullock '22",  pos:"SF",pts:12.2,ast:1.8,reb:3.6,stl:0.8,blk:0.2,tov:1.1,fg:43.0,ts:57.5,threeRate:0.46,twoRate:0.54},
  {name:"J. Crowder '22",  pos:"SF",pts:9.4,ast:2.2,reb:5.0,stl:1.1,blk:0.4,tov:1.2,fg:38.3,ts:52.5,threeRate:0.44,twoRate:0.56},
  {name:"D. Nwaba '19",    pos:"SF",pts:7.5,ast:1.2,reb:3.5,stl:1.2,blk:0.4,tov:1.0,fg:41.0,ts:52.0,threeRate:0.20,twoRate:0.80},
  {name:"M. Muscala '20",  pos:"SF",pts:9.0,ast:1.9,reb:4.6,stl:0.5,blk:0.7,tov:1.2,fg:43.0,ts:57.0,threeRate:0.48,twoRate:0.52},
  {name:"T. Chandler '16", pos:"SF",pts:7.0,ast:1.5,reb:4.2,stl:0.7,blk:0.3,tov:1.0,fg:44.5,ts:55.5,threeRate:0.10,twoRate:0.90},
  {name:"S. Curry '19",    pos:"SF",pts:8.9,ast:1.4,reb:3.7,stl:0.7,blk:0.3,tov:1.1,fg:44.0,ts:56.0,threeRate:0.40,twoRate:0.60},
  // PF
  {name:"A. Davis '20",    pos:"PF",pts:28.8,ast:2.5,reb:11.5,stl:1.6,blk:2.8,tov:2.4,fg:53.4,ts:62.6,threeRate:0.10,twoRate:0.90},
  {name:"G.Antetok. '19",  pos:"PF",pts:27.7,ast:5.9,reb:12.5,stl:1.3,blk:1.5,tov:3.7,fg:57.8,ts:61.0,threeRate:0.25,twoRate:0.75},
  {name:"D. Nowitzki '11", pos:"PF",pts:24.6,ast:2.8,reb:7.4,stl:0.5,blk:0.8,tov:1.8,fg:51.9,ts:64.4,threeRate:0.28,twoRate:0.72},
  {name:"K. Love '14",     pos:"PF",pts:27.7,ast:4.7,reb:13.3,stl:0.8,blk:0.5,tov:2.7,fg:45.7,ts:57.5,threeRate:0.32,twoRate:0.68},
  {name:"D. Green '16",    pos:"PF",pts:14.8,ast:7.8,reb:10.1,stl:2.4,blk:1.5,tov:3.2,fg:49.0,ts:59.8,threeRate:0.38,twoRate:0.62},
  {name:"Z. Randle '21",   pos:"PF",pts:25.6,ast:5.4,reb:10.8,stl:0.9,blk:0.3,tov:3.5,fg:45.6,ts:57.5,threeRate:0.28,twoRate:0.72},
  {name:"P. Siakam '22",   pos:"PF",pts:24.0,ast:5.4,reb:8.3,stl:1.0,blk:0.7,tov:2.6,fg:47.2,ts:59.1,threeRate:0.30,twoRate:0.70},
  {name:"J. Collins '21",  pos:"PF",pts:23.2,ast:1.8,reb:8.0,stl:0.7,blk:1.0,tov:1.9,fg:55.3,ts:63.0,threeRate:0.30,twoRate:0.70},
  {name:"D. Sabonis '22",  pos:"PF",pts:19.9,ast:5.0,reb:12.1,stl:0.8,blk:0.6,tov:2.8,fg:55.5,ts:60.0,threeRate:0.10,twoRate:0.90},
  {name:"L.Aldridge '18",  pos:"PF",pts:23.1,ast:1.8,reb:8.5,stl:0.6,blk:1.2,tov:2.0,fg:50.8,ts:57.5,threeRate:0.12,twoRate:0.88},
  {name:"T. Harris '22",   pos:"PF",pts:19.3,ast:3.7,reb:7.7,stl:1.0,blk:0.5,tov:2.0,fg:50.0,ts:60.1,threeRate:0.30,twoRate:0.70},
  {name:"B. Griffin '15",  pos:"PF",pts:22.0,ast:5.0,reb:9.0,stl:0.9,blk:0.5,tov:3.1,fg:48.5,ts:55.5,threeRate:0.10,twoRate:0.90},
  {name:"O. Anunoby '22",  pos:"PF",pts:17.1,ast:2.4,reb:5.3,stl:1.5,blk:0.6,tov:1.5,fg:47.1,ts:58.5,threeRate:0.36,twoRate:0.64},
  {name:"J. Grant '22",    pos:"PF",pts:19.5,ast:2.1,reb:5.1,stl:0.8,blk:0.9,tov:1.9,fg:44.5,ts:57.5,threeRate:0.34,twoRate:0.66},
  {name:"J. Poeltl '22",   pos:"PF",pts:12.0,ast:2.8,reb:9.0,stl:0.9,blk:2.0,tov:1.9,fg:61.0,ts:65.0,threeRate:0.02,twoRate:0.98},
  {name:"M. Morris '20",   pos:"PF",pts:16.7,ast:2.1,reb:6.6,stl:0.9,blk:0.4,tov:1.8,fg:45.0,ts:56.0,threeRate:0.28,twoRate:0.72},
  {name:"K. Looney '22",   pos:"PF",pts:8.0,ast:2.8,reb:9.7,stl:0.6,blk:0.5,tov:1.5,fg:57.5,ts:64.5,threeRate:0.02,twoRate:0.98},
  {name:"T. Tucker '21",   pos:"PF",pts:7.8,ast:2.0,reb:6.4,stl:1.1,blk:0.3,tov:1.1,fg:43.0,ts:55.5,threeRate:0.40,twoRate:0.60},
  {name:"B. Biyombo '16",  pos:"PF",pts:9.2,ast:0.6,reb:10.3,stl:0.8,blk:1.9,tov:1.4,fg:60.0,ts:61.5,threeRate:0.02,twoRate:0.98},
  {name:"R. Holmes '21",   pos:"PF",pts:12.1,ast:2.0,reb:8.0,stl:0.7,blk:1.0,tov:2.0,fg:62.0,ts:66.0,threeRate:0.02,twoRate:0.98},
  // C
  {name:"N. Jokic '22",    pos:"C",pts:28.6,ast:8.3,reb:14.6,stl:1.6,blk:0.9,tov:4.1,fg:58.3,ts:67.3,threeRate:0.12,twoRate:0.88},
  {name:"J. Embiid '23",   pos:"C",pts:34.7,ast:5.7,reb:11.2,stl:1.2,blk:1.7,tov:4.0,fg:54.8,ts:64.6,threeRate:0.20,twoRate:0.80},
  {name:"S. O'Neal '00",   pos:"C",pts:31.5,ast:4.0,reb:14.4,stl:0.5,blk:3.2,tov:3.5,fg:57.4,ts:61.5,threeRate:0.02,twoRate:0.98},
  {name:"D. Howard '13",   pos:"C",pts:18.1,ast:1.5,reb:13.1,stl:1.1,blk:3.0,tov:2.5,fg:57.3,ts:61.5,threeRate:0.02,twoRate:0.98},
  {name:"R. Gobert '22",   pos:"C",pts:16.5,ast:1.2,reb:15.6,stl:0.8,blk:2.3,tov:1.8,fg:71.3,ts:68.2,threeRate:0.02,twoRate:0.98},
  {name:"K. Towns '22",    pos:"C",pts:24.6,ast:4.8,reb:9.8,stl:1.1,blk:0.9,tov:3.5,fg:49.9,ts:62.5,threeRate:0.38,twoRate:0.62},
  {name:"B. Adebayo '22",  pos:"C",pts:21.0,ast:3.5,reb:10.0,stl:1.5,blk:1.0,tov:2.5,fg:55.5,ts:60.5,threeRate:0.04,twoRate:0.96},
  {name:"C. Capella '19",  pos:"C",pts:16.2,ast:1.7,reb:13.4,stl:1.3,blk:2.1,tov:2.0,fg:65.0,ts:64.0,threeRate:0.02,twoRate:0.98},
  {name:"A. Horford '22",  pos:"C",pts:14.2,ast:3.9,reb:7.6,stl:0.9,blk:1.3,tov:1.6,fg:44.7,ts:58.8,threeRate:0.36,twoRate:0.64},
  {name:"N. Vucevic '21",  pos:"C",pts:24.5,ast:3.8,reb:11.8,stl:0.9,blk:1.0,tov:2.5,fg:49.5,ts:57.5,threeRate:0.28,twoRate:0.72},
  {name:"M. Turner '22",   pos:"C",pts:13.4,ast:1.4,reb:7.2,stl:0.7,blk:2.8,tov:1.6,fg:47.7,ts:60.0,threeRate:0.30,twoRate:0.70},
  {name:"B. Lopez '19",    pos:"C",pts:18.1,ast:1.9,reb:5.2,stl:0.8,blk:1.8,tov:1.7,fg:48.5,ts:59.8,threeRate:0.38,twoRate:0.62},
  {name:"D. Jordan '16",   pos:"C",pts:12.7,ast:1.0,reb:15.0,stl:0.7,blk:2.3,tov:2.0,fg:70.0,ts:70.0,threeRate:0.02,twoRate:0.98},
  {name:"I.Hartenstein '23",pos:"C",pts:9.5,ast:2.8,reb:10.2,stl:1.2,blk:1.1,tov:1.5,fg:57.3,ts:62.0,threeRate:0.04,twoRate:0.96},
  {name:"T. Zubac '22",    pos:"C",pts:11.0,ast:1.8,reb:9.5,stl:0.5,blk:0.9,tov:1.6,fg:59.0,ts:62.0,threeRate:0.04,twoRate:0.96},
  {name:"M. Plumlee '20",  pos:"C",pts:8.5,ast:2.5,reb:7.8,stl:0.5,blk:0.8,tov:1.5,fg:58.0,ts:59.5,threeRate:0.02,twoRate:0.98},
  {name:"W.Hernangomez '20",pos:"C",pts:9.5,ast:1.2,reb:7.0,stl:0.5,blk:0.6,tov:1.5,fg:53.0,ts:57.0,threeRate:0.08,twoRate:0.92},
  {name:"D. Dedmon '19",   pos:"C",pts:8.5,ast:1.5,reb:7.3,stl:0.8,blk:0.9,tov:1.4,fg:50.5,ts:59.5,threeRate:0.30,twoRate:0.70},
  {name:"T. Maker '19",    pos:"C",pts:6.5,ast:1.0,reb:4.5,stl:0.5,blk:1.0,tov:1.1,fg:42.0,ts:53.0,threeRate:0.30,twoRate:0.70},
  {name:"R. Lopez '19",    pos:"C",pts:8.0,ast:1.5,reb:4.5,stl:0.5,blk:1.0,tov:1.3,fg:44.5,ts:55.0,threeRate:0.38,twoRate:0.62},
];

const PLAYERS = raw.map((p,i)=>{
  const rating = calcRating(p);
  return {...p, id:i+1, rating, cost:ratingToCost(rating)};
}).sort((a,b)=>b.rating-a.rating);

// ── Position mult ─────────────────────────────────────
const ADJ = {PG:["SG"],SG:["PG","SF"],SF:["SG","PF"],PF:["SF","C"],C:["PF"]};
function posMult(player, slot) {
  if (player.pos===slot) return 1.0;
  if (ADJ[player.pos]?.includes(slot)) return 0.82;
  return 0.65;
}
function teamEff(lineup) {
  return lineup.reduce((s,{player,slot})=>s+player.rating*posMult(player,slot),0) + chemBoost(lineup);
}

// ── Opponent generator ────────────────────────────────
function genOpp(excludeIds=new Set()) {
  const used = new Set(excludeIds);
  const team = [];
  let rem = BUDGET;
  for (const pos of POSITIONS) {
    const pool = PLAYERS.filter(p=>p.pos===pos&&!used.has(p.id));
    if (!pool.length) continue;
    const slotsLeft = POSITIONS.length - team.length;
    const avg = rem / slotsLeft;
    const weights = pool.map(p=>{
      const fit = Math.max(0.1, 1 - Math.abs(p.cost-avg)/Math.max(avg,1));
      return p.rating * fit * (p.cost<=rem?1:0.05);
    });
    const tot = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*tot, pick = pool[pool.length-1];
    for (let i=0;i<pool.length;i++){r-=weights[i];if(r<=0){pick=pool[i];break;}}
    team.push({player:pick,slot:pos});
    used.add(pick.id);
    rem-=pick.cost;
  }
  return team;
}

// ── Simulation ────────────────────────────────────────
function ri(n) { return Math.round(n); }
function rf(n,d=1) { return parseFloat(n.toFixed(d)); }
function clamp(v,mn,mx){return Math.max(mn,Math.min(mx,v));}
function jitter(base,spread){return base*(1+(Math.random()-0.5)*spread);}

function buildBox(lineup) {
  const totEff = lineup.reduce((s,{player,slot})=>s+player.rating*posMult(player,slot),0);
  return lineup.map(({player,slot})=>{
    const m   = posMult(player,slot);
    const sh  = (player.rating*m)/totEff;
          const min = 48;
    const sc  = (min/36)*m*jitter(1,0.25);

    // FGA based on usage
    const fga  = clamp(ri(jitter(player.pts/2.1,0.3)*sc),2,25);
    const fgPct = clamp(player.fg*(m*0.2+0.8)*jitter(1,0.08),28,75)/100;
    const fgm  = clamp(ri(fga*fgPct),0,fga);

    const tpaTotal = clamp(ri(fga * player.threeRate * jitter(1,0.2)),0,fga);
    const tpPct  = clamp((player.fg*(m*0.2+0.8)-4)*jitter(1,0.12),25,55)/100;
    const tpm    = clamp(ri(tpaTotal*tpPct),0,tpaTotal);

    const pts  = clamp(fgm*2 + tpm + clamp(ri(jitter(player.pts*0.28,0.3)*sc),0,12), 0, 55);
    const ast  = clamp(ri(jitter(player.ast,0.3)*sc*0.85),0,18);
    const reb  = clamp(ri(jitter(player.reb,0.25)*sc*0.85),0,22);
    const stl  = clamp(ri(jitter(player.stl,0.4)*sc),0,6);
    const blk  = clamp(ri(jitter(player.blk,0.4)*sc),0,7);
    const tov  = clamp(ri(jitter(player.tov,0.35)*sc*0.85),0,9);

    return {
      name:player.name, pos:slot, native:player.pos, oop:player.pos!==slot, cost:player.cost,
      min, pts, ast, reb, stl, blk, tov,
      fgm, fga, tpm, tpa:tpaTotal,
      fgPct: fga>0?rf(fgm/fga*100):0,
      tpPct: tpaTotal>0?rf(tpm/tpaTotal*100):0,
      rating:rf(player.rating*m,1),
    };
  });
}

function simulate(myLineup, oppLineup) {
  const myE  = teamEff(myLineup);
  const oppE = teamEff(oppLineup);
  const pace = 96+Math.random()*10;
  const tot  = myE+oppE;

  let myScore  = Math.round(pace*(myE/tot)*1.10+38+(Math.random()-0.5)*10);
  let oppScore = Math.round(pace*(oppE/tot)*1.10+38+(Math.random()-0.5)*10);

  let ot = 0;
  while (myScore===oppScore) {
    ot++;
    myScore  += Math.round(5+Math.random()*15*(myE/tot));
    oppScore += Math.round(5+Math.random()*15*(oppE/tot));
  }

  return {
    myScore, oppScore, ot,
    myStats:  buildBox(myLineup),
    oppStats: buildBox(oppLineup),
    myEff:  rf(myE,1), oppEff: rf(oppE,1),
    myChem: chemBoost(myLineup), oppChem: chemBoost(oppLineup),
  };
}

// ── Tier config ───────────────────────────────────────
const TIERS = [
  {min:65, label:"Elite",  color:"#fbbf24",bg:"#78350f"},
  {min:55, label:"Star",   color:"#c084fc",bg:"#3b0764"},
  {min:42, label:"Solid",  color:"#60a5fa",bg:"#1e3a5f"},
  {min:30, label:"Role",   color:"#4ade80",bg:"#14532d"},
  {min:18, label:"Bench",  color:"#94a3b8",bg:"#1e293b"},
  {min:8,  label:"Filler", color:"#64748b",bg:"#0f172a"},
  {min:0,  label:"Min",    color:"#475569",bg:"#0f172a"},
];
function getTier(cost) {
  const costToMin = {40:65,32:55,25:42,18:30,12:18,8:8,5:0};
  const minR = costToMin[cost]??0;
  return TIERS.find(t=>minR>=t.min)||TIERS[TIERS.length-1];
}

const SMAXES = {pts:55,ast:18,reb:22,stl:6,blk:7,tov:9,fgPct:80,tpPct:55};
function cellBg(stat,val){
  const r=Math.min(val/(SMAXES[stat]||1),1);
  if(stat==="tov") return `rgba(239,68,68,${0.12+r*0.55})`;
  return `rgba(${ri(15+(1-r)*25)},${ri(100+r*120)},${ri(50+(1-r)*20)},${0.15+r*0.55})`;
}

const Tag=({label,color,bg,style={}})=>(
  <span style={{fontSize:10,fontWeight:800,background:bg,color,borderRadius:4,padding:"1px 5px",whiteSpace:"nowrap",...style}}>{label}</span>
);
const Bar=({v,max=85})=>(
  <div style={{height:3,background:"#0f172a",borderRadius:2,marginTop:3,overflow:"hidden"}}>
    <div style={{height:"100%",width:`${Math.min((v/max)*100,100)}%`,background:`hsl(${Math.min(v*1.5,120)},75%,48%)`,borderRadius:2}}/>
  </div>
);

// ── Main ──────────────────────────────────────────────
export default function App() {
  const [phase,   setPhase]  = useState("draft");
  const [roster,  setRoster] = useState({PG:null,SG:null,SF:null,PF:null,C:null});
  const [slotSel, setSlotSel]= useState(null); // which slot the user is filling
  const [opp,     setOpp]    = useState(null);
  const [result,  setResult] = useState(null);
  const [posF,    setPosF]   = useState("ALL");
  const [sortBy,  setSortBy] = useState("rating");

  const myIds = new Set(Object.values(roster).filter(Boolean).map(p=>p.id));
  const spent  = Object.values(roster).reduce((s,p)=>s+(p?.cost||0),0);
  const rem    = BUDGET-spent;
  const filled = POSITIONS.filter(p=>roster[p]).length;
  const full   = filled===5;
  const myLineup = full ? POSITIONS.map(pos=>({player:roster[pos],slot:pos})) : null;
  const myEffVal = myLineup ? rf(teamEff(myLineup),1) : null;
  const myCh     = myLineup ? chemBoost(myLineup) : 0;
  const oppEffVal= opp ? rf(teamEff(opp),1) : null;

  useEffect(()=>{setOpp(genOpp());},[]);

  const pickPlayer = useCallback((player)=>{
    const targetSlot = slotSel || player.pos;
    const prev = roster[targetSlot];
    if ((player.cost-(prev?.cost||0)) > rem) return;
    setRoster(r=>({...r,[targetSlot]:player}));
    setSlotSel(null);
  },[roster,rem,slotSel]);

  const drop = slot=>{ setRoster(r=>({...r,[slot]:null})); if(slotSel===slot) setSlotSel(null); };

  const go = ()=>{
    if(!full||!opp) return;
    setResult(simulate(myLineup,opp));
    setPhase("result");
  };
  const reset = ()=>{
    setRoster({PG:null,SG:null,SF:null,PF:null,C:null});
    setOpp(genOpp()); setResult(null); setPhase("draft"); setSlotSel(null);
  };

  const display = PLAYERS
    .filter(p=>posF==="ALL"||p.pos===posF)
    .sort((a,b)=>sortBy==="rating"?b.rating-a.rating:sortBy==="cost"?b.cost-a.cost:a.name.localeCompare(b.name));

  // ── RESULT ───────────────────────────────────────────
  if (phase==="result"&&result) {
    const won = result.myScore>result.oppScore;
    const cols = [["PLAYER","left"],["SLT","c"],["MIN","c"],["PTS","c"],["AST","c"],["REB","c"],["STL","c"],["BLK","c"],["TOV","c"],["FGM-FGA","c"],["FG%","c"],["3PM-3PA","c"],["3P%","c"],["RTG","c"]];
    return (
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        <div style={{maxWidth:1020,margin:"0 auto"}}>
          {/* Scoreboard */}
          <div style={{textAlign:"center",padding:"18px 16px",background:"#0f172a",borderRadius:16,border:`2px solid ${won?"#22c55e":"#ef4444"}`,marginBottom:14}}>
            <div style={{fontSize:38}}>{won?"🏆":"💀"}</div>
            <div style={{fontSize:26,fontWeight:900,color:won?"#22c55e":"#ef4444",letterSpacing:2}}>
              {won?"VICTORY":"DEFEAT"}{result.ot>0?` (${result.ot}OT)`:""}
            </div>
            <div style={{display:"flex",justifyContent:"center",gap:28,marginTop:10}}>
              {[["YOUR TEAM",result.myScore,"#60a5fa",result.myEff,result.myChem],["OPPONENT",result.oppScore,"#f87171",result.oppEff,result.oppChem]].map(([lbl,sc,col,eff,chem],i)=>(
                <div key={i} style={{textAlign:"center"}}>
                  <div style={{fontSize:11,color:col,fontWeight:800,letterSpacing:1}}>{lbl}</div>
                  <div style={{fontSize:46,fontWeight:900,color:col,lineHeight:1}}>{sc}</div>
                  <div style={{fontSize:11,color:"#475569"}}>RTG {eff}{chem>0?` +${chem} chem`:""}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Box scores */}
          {[{lbl:"YOUR TEAM",stats:result.myStats,acc:"#60a5fa"},{lbl:"OPPONENT",stats:result.oppStats,acc:"#f87171"}].map(({lbl,stats,acc})=>(
            <div key={lbl} style={{marginBottom:12,background:"#0f172a",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b"}}>
              <div style={{padding:"8px 14px",background:"#1e293b",fontWeight:800,fontSize:11,letterSpacing:2,color:acc}}>{lbl}</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid #1e293b"}}>
                      {cols.map(([h,a])=>(
                        <th key={h} style={{padding:"6px 7px",textAlign:a==="c"?"center":"left",color:"#475569",fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                        <td style={{padding:"7px 7px",fontWeight:700,whiteSpace:"nowrap"}}>
                          {s.name}
                          {s.oop&&<span style={{marginLeft:4,fontSize:9,background:"#78350f",color:"#fbbf24",borderRadius:3,padding:"1px 3px"}}>OOP</span>}
                        </td>
                        <td style={{textAlign:"center",color:"#64748b"}}>{s.pos}</td>
                        <td style={{textAlign:"center",padding:"7px 5px"}}>{s.min}</td>
                        <td style={{textAlign:"center",background:cellBg("pts",s.pts),padding:"7px 5px",fontWeight:700}}>{s.pts}</td>
                        <td style={{textAlign:"center",background:cellBg("ast",s.ast),padding:"7px 5px"}}>{s.ast}</td>
                        <td style={{textAlign:"center",background:cellBg("reb",s.reb),padding:"7px 5px"}}>{s.reb}</td>
                        <td style={{textAlign:"center",background:cellBg("stl",s.stl),padding:"7px 5px"}}>{s.stl}</td>
                        <td style={{textAlign:"center",background:cellBg("blk",s.blk),padding:"7px 5px"}}>{s.blk}</td>
                        <td style={{textAlign:"center",background:cellBg("tov",s.tov),padding:"7px 5px"}}>{s.tov}</td>
                        <td style={{textAlign:"center",padding:"7px 5px",whiteSpace:"nowrap"}}>{s.fgm}-{s.fga}</td>
                        <td style={{textAlign:"center",background:cellBg("fgPct",s.fgPct),padding:"7px 5px"}}>{s.fgPct}%</td>
                        <td style={{textAlign:"center",padding:"7px 5px",whiteSpace:"nowrap"}}>{s.tpm}-{s.tpa}</td>
                        <td style={{textAlign:"center",background:cellBg("tpPct",s.tpPct),padding:"7px 5px"}}>{s.tpPct}%</td>
                        <td style={{textAlign:"center",background:`rgba(99,102,241,${s.rating/90})`,padding:"7px 5px",fontWeight:700,color:"#c7d2fe"}}>{s.rating}</td>
                      </tr>
                    ))}
                    {/* Totals */}
                    <tr style={{borderTop:"2px solid #1e293b",background:"#0d1626",fontWeight:800}}>
                      <td style={{padding:"7px 7px",color:acc}}>TEAM</td>
                      <td/><td/>
                      <td style={{textAlign:"center",padding:"7px 5px",color:acc}}>{stats.reduce((s,x)=>s+x.pts,0)}</td>
                      <td style={{textAlign:"center",padding:"7px 5px"}}>{stats.reduce((s,x)=>s+x.ast,0)}</td>
                      <td style={{textAlign:"center",padding:"7px 5px"}}>{stats.reduce((s,x)=>s+x.reb,0)}</td>
                      <td style={{textAlign:"center",padding:"7px 5px"}}>{stats.reduce((s,x)=>s+x.stl,0)}</td>
                      <td style={{textAlign:"center",padding:"7px 5px"}}>{stats.reduce((s,x)=>s+x.blk,0)}</td>
                      <td style={{textAlign:"center",padding:"7px 5px"}}>{stats.reduce((s,x)=>s+x.tov,0)}</td>
                      <td style={{textAlign:"center",padding:"7px 5px",whiteSpace:"nowrap"}}>{stats.reduce((s,x)=>s+x.fgm,0)}-{stats.reduce((s,x)=>s+x.fga,0)}</td>
                      <td style={{textAlign:"center",padding:"7px 5px"}}>{stats.reduce((s,x)=>s+x.fga,0)>0?rf(stats.reduce((s,x)=>s+x.fgm,0)/stats.reduce((s,x)=>s+x.fga,0)*100):0}%</td>
                      <td style={{textAlign:"center",padding:"7px 5px",whiteSpace:"nowrap"}}>{stats.reduce((s,x)=>s+x.tpm,0)}-{stats.reduce((s,x)=>s+x.tpa,0)}</td>
                      <td style={{textAlign:"center",padding:"7px 5px"}}>{stats.reduce((s,x)=>s+x.tpa,0)>0?rf(stats.reduce((s,x)=>s+x.tpm,0)/stats.reduce((s,x)=>s+x.tpa,0)*100):0}%</td>
                      <td/>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div style={{textAlign:"center",paddingBottom:16}}>
            <button onClick={reset} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:10,padding:"12px 32px",fontSize:14,fontWeight:800,cursor:"pointer",letterSpacing:1}}>🔄 NEW GAME</button>
          </div>
        </div>
      </div>
    );
  }

  // ── DRAFT ─────────────────────────────────────────────
  return (
    <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:14}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:900,background:"linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              💰 NBA BUDGET BALL <span style={{fontSize:11,color:"#475569",WebkitTextFillColor:"#475569"}}>v2.0</span>
            </h1>
            <div style={{fontSize:10,color:"#475569",marginTop:1}}>
              100 players · Budget ${BUDGET} · Tiers: Elite $40 · Star $32 · Solid $25 · Role $18 · Bench $12 · Filler $8
              {slotSel && <span style={{color:"#f59e0b",fontWeight:700}}> · Placing player into <b>{slotSel}</b> slot — pick any position</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            {[["BUDGET",`$${rem}`,rem<15?"#ef4444":rem<30?"#f59e0b":"#22c55e"],["SPENT",`$${spent}`,"#94a3b8"],["RTG",myEffVal??"-","#a78bfa"],["CHEM",myCh>0?`+${myCh}`:"-","#f472b6"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center",background:"#0f172a",borderRadius:7,padding:"4px 12px",border:"1px solid #1e293b"}}>
                <div style={{fontSize:9,color:"#475569",letterSpacing:1}}>{l}</div>
                <div style={{fontSize:17,fontWeight:900,color:c}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Budget bar */}
        <div style={{background:"#1e293b",borderRadius:4,height:5,marginBottom:12,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${Math.min((spent/BUDGET)*100,100)}%`,background:"linear-gradient(90deg,#3b82f6,#8b5cf6,#ec4899)",transition:"width 0.3s",borderRadius:4}}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"270px 1fr",gap:12}}>

          {/* LEFT */}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>

            {/* My lineup */}
            <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #1e293b"}}>
              <div style={{fontWeight:800,fontSize:10,letterSpacing:2,color:"#60a5fa",marginBottom:8}}>YOUR STARTING 5</div>
              {POSITIONS.map(pos=>{
                const p = roster[pos];
                const m = p?posMult(p,pos):1;
                const tier = p?getTier(p.cost):null;
                const isActive = slotSel===pos;
                return (
                  <div key={pos} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,background:isActive?"#1a2a0a":p?"#0d2137":"#080f1e",borderRadius:8,padding:"7px 8px",border:`1px solid ${isActive?"#84cc16":p?"#1d4ed8":"#1e293b"}`,cursor:"pointer"}}
                    onClick={()=>setSlotSel(slotSel===pos?null:pos)}>
                    <div style={{width:24,height:24,borderRadius:5,background:isActive?"#365314":p?"#1e3a5f":"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:isActive?"#84cc16":"#60a5fa",flexShrink:0}}>{pos}</div>
                    {p?(
                      <>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                          <div style={{display:"flex",gap:3,marginTop:1,flexWrap:"wrap"}}>
                            <Tag label={tier.label} color={tier.color} bg={tier.bg}/>
                            {m<1&&<Tag label={`OOP ×${m}`} color="#fbbf24" bg="#78350f"/>}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:13,color:"#fbbf24",fontWeight:900}}>${p.cost}</div>
                          <div style={{fontSize:9,color:"#6366f1"}}>RTG {p.rating}</div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();drop(pos);}} style={{background:"#7f1d1d",border:"none",borderRadius:4,color:"#fca5a5",fontSize:11,width:18,height:18,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                      </>
                    ):(
                      <div style={{fontSize:10,color:isActive?"#84cc16":"#334155",fontStyle:"italic"}}>
                        {isActive?`Picking for ${pos} — choose any player →`:`Click to set ${pos} slot →`}
                      </div>
                    )}
                  </div>
                );
              })}
              {myCh>0&&<div style={{fontSize:11,color:"#f472b6",textAlign:"center",margin:"4px 0",fontWeight:700}}>⚡ Chemistry Boost +{myCh}</div>}
              <button onClick={go} disabled={!full} style={{width:"100%",marginTop:4,background:full?"linear-gradient(135deg,#22c55e,#16a34a)":"#1e293b",color:full?"white":"#374151",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:800,cursor:full?"pointer":"not-allowed",transition:"all 0.2s",boxShadow:full?"0 4px 18px rgba(34,197,94,0.3)":"none"}}>
                {full?"▶  SIMULATE GAME":`${5-filled} SLOT${5-filled!==1?"S":""} REMAINING`}
              </button>
            </div>

            {/* Opponent */}
            {opp&&(
              <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #1e293b"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontWeight:800,fontSize:10,letterSpacing:2,color:"#f87171"}}>OPPONENT</div>
                  <div style={{fontSize:10,color:"#f59e0b",fontWeight:700}}>RTG {oppEffVal}{chemBoost(opp)>0?` +${chemBoost(opp)}⚡`:""}</div>
                </div>
                {opp.map(({player,slot})=>{
                  const t=getTier(player.cost);
                  return (
                    <div key={slot} style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,fontSize:11}}>
                      <span style={{width:22,fontSize:9,fontWeight:800,color:"#64748b"}}>{slot}</span>
                      <span style={{flex:1,color:"#cbd5e1",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{player.name}</span>
                      <Tag label={t.label} color={t.color} bg={t.bg}/>
                      <span style={{color:"#fbbf24",fontSize:10,fontWeight:700,marginLeft:3}}>${player.cost}</span>
                    </div>
                  );
                })}
                <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid #1e293b",display:"flex",justifyContent:"space-between",fontSize:11,color:"#64748b"}}>
                  <span>Total</span><span style={{color:"#f87171",fontWeight:700}}>${opp.reduce((s,x)=>s+x.player.cost,0)}</span>
                </div>
                <button onClick={()=>setOpp(genOpp(myIds))} style={{width:"100%",marginTop:6,background:"#160d2a",color:"#a78bfa",border:"1px solid #4c1d95",borderRadius:6,padding:"6px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  🎲 Reroll Opponent
                </button>
              </div>
            )}

            {/* Legend */}
            <div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #1e293b"}}>
              <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:5}}>HOW TO DRAFT</div>
              <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>• Click a player to add them to their natural position</div>
              <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>• Click a <b style={{color:"#84cc16"}}>slot</b> first to place <i>any</i> player there (OOP penalty applies)</div>
              <div style={{fontSize:10,color:"#64748b",marginBottom:6}}>• Real teammates give ⚡ Chemistry boost</div>
              <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>OOP PENALTIES</div>
              <div style={{fontSize:10,color:"#64748b"}}>Adjacent ×0.82 · Wrong side ×0.65</div>
            </div>
          </div>

          {/* RIGHT — Player pool */}
          <div>
            <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {["ALL",...POSITIONS].map(f=>(
                  <button key={f} onClick={()=>setPosF(f)} style={{background:posF===f?"#3b82f6":"#1e293b",color:posF===f?"white":"#94a3b8",border:"none",borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{f}</button>
                ))}
              </div>
              <div style={{marginLeft:"auto",display:"flex",gap:3,alignItems:"center"}}>
                <span style={{fontSize:9,color:"#475569"}}>SORT:</span>
                {[["rating","RTG"],["cost","$"],["name","A–Z"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setSortBy(k)} style={{background:sortBy===k?"#4c1d95":"#1e293b",color:sortBy===k?"#c4b5fd":"#64748b",border:"none",borderRadius:5,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:6}}>
              {display.map(p=>{
                const inR    = myIds.has(p.id);
                const targetSlot = slotSel || p.pos;
                const prev   = roster[targetSlot];
                const delta  = p.cost-(prev?.cost||0);
                const afford = delta<=rem;
                const tier   = getTier(p.cost);
                const wouldOop = slotSel && slotSel!==p.pos;
                const mult   = slotSel ? posMult(p,slotSel) : 1;

                return (
                  <div key={p.id}
                    onClick={()=>!inR&&afford&&pickPlayer(p)}
                    style={{
                      background:inR?"#0d2a0d":slotSel&&afford?"#131a2e":"#0f172a",
                      border:`1px solid ${inR?"#22c55e":slotSel&&afford?"#6366f1":"#1e293b"}`,
                      borderRadius:9,padding:9,
                      cursor:inR||!afford?"not-allowed":"pointer",
                      opacity:!afford&&!inR?0.35:1,
                      transition:"all 0.12s",
                    }}
                  >
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                        <div style={{display:"flex",gap:2,marginTop:2,flexWrap:"wrap"}}>
                          <Tag label={p.pos} color="#93c5fd" bg="#1e3a5f"/>
                          <Tag label={tier.label} color={tier.color} bg={tier.bg}/>
                          {wouldOop&&afford&&<Tag label={`×${mult}`} color="#fbbf24" bg="#78350f"/>}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:5}}>
                        <div style={{fontSize:14,color:"#fbbf24",fontWeight:900}}>${p.cost}</div>
                        <div style={{fontSize:9,color:"#6366f1"}}>RTG {p.rating}</div>
                      </div>
                    </div>
                    <Bar v={p.rating}/>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:2,marginTop:5}}>
                      {[["PTS",p.pts,"pts"],["AST",p.ast,"ast"],["REB",p.reb,"reb"],["STL",p.stl,"stl"],["BLK",p.blk,"blk"],["TOV",p.tov,"tov"]].map(([l,v,k])=>(
                        <div key={l} style={{background:cellBg(k,v),borderRadius:3,padding:"2px 1px",textAlign:"center"}}>
                          <div style={{fontSize:8,color:"#94a3b8"}}>{l}</div>
                          <div style={{fontSize:11,fontWeight:800}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {inR&&<div style={{marginTop:4,fontSize:9,color:"#22c55e",fontWeight:700,textAlign:"center"}}>✓ IN LINEUP</div>}
                    {!afford&&!inR&&<div style={{marginTop:4,fontSize:9,color:"#ef4444",textAlign:"center"}}>+${delta-rem} over budget</div>}
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