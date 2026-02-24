import { useState, useEffect, useCallback } from "react";
import "./index.css";

const POSITIONS = ["PG","SG","SF","PF","C"];
const BUDGET = 140;
const SEASON_LENGTH = 10;

function calcRating(p) {
  return +(p.pts*1.0+p.ast*1.5+p.reb*1.1+p.stl*2.2+p.blk*1.8-p.tov*1.2+(p.fg-44)*0.4+(p.ts-54)*0.3).toFixed(1);
}
function ratingToCost(r,minR,maxR){
  const norm=(r-minR)/Math.max(maxR-minR,1);
  return Math.round(5+norm*35);
}

const CHEM_PAIRS=[
  ["S. Curry '16","K. Thompson '16"],["S. Curry '16","D. Green '16"],["K. Thompson '16","D. Green '16"],
  ["S. Curry '16","D. Green '16","K. Thompson '16"],
  ["LeBron '18","K. Love '14"],["LeBron '18","K. Irving '19"],["D. Wade '09","LeBron '13"],
  ["K. Bryant '08","D. Howard '13"],["K. Bryant '01","S. O'Neal '00"],
  ["R. Westbrook '17","K. Durant '14"],["J. Harden '19","C. Paul '15"],
  ["N. Jokic '22","J. Murray '22"],["G. Antetok. '20","K. Middleton '20"],
  ["J. Embiid '23","J. Harden '19"],["D. Rose '11","C. Boozer '11"],
  ["T. Young '22","J. Collins '21"],["D. Lillard '21","C. McCollum '21"],
  ["B. Adebayo '22","J. Butler '20"],["A. Davis '20","LeBron '18"],
  ["M. Jordan '96","S. Pippen '96"],["M. Jordan '92","S. Pippen '92"],
  ["M. Jordan '96","S. Pippen '96","D. Rodman '96"],
  ["Magic '87","K. Abdul-Jabbar '87"],["Magic '88","J. Worthy '88"],
  ["L. Bird '86","K. McHale '86"],["L. Bird '86","R. Parish '86"],
  ["S. O'Neal '00","K. Bryant '01"],["S. O'Neal '00","K. Bryant '00"],
  ["A. Iverson '01","D. Mutombo '01"],
  ["S. Nash '05","A. Marion '05"],["S. Nash '06","S. Stoudemire '06"],
  ["T. Duncan '03","T. Parker '07"],["T. Duncan '05","M. Ginobili '05"],
  ["T. Parker '07","M. Ginobili '07"],["T. Duncan '03","T. Parker '07","M. Ginobili '07"],
  ["D. Nowitzki '11","J. Kidd '11"],["D. Wade '06","S. O'Neal '06"],
  ["K. Garnett '04","S. Cassell '04"],["K. Garnett '08","P. Pierce '08"],
  ["C. Paul '08","C. Kaman '08"],["D. Williams '10","C. Boozer '10"],
];
function chemBoost(lineup){
  const names=new Set(lineup.map(x=>x.player.name));
  let b=0;
  for(const pair of CHEM_PAIRS) if(pair.every(n=>names.has(n))) b+=pair.length>=3?4:2;
  return b;
}

const raw=[
  {name:"Magic '87",pos:"PG",pts:23.9,ast:12.2,reb:6.3,stl:1.8,blk:0.5,tov:3.9,fg:52.2,ts:58.0,tR:0.05},
  {name:"Magic '88",pos:"PG",pts:19.6,ast:11.9,reb:6.6,stl:1.6,blk:0.4,tov:3.5,fg:49.2,ts:56.5,tR:0.04},
  {name:"I. Thomas '87",pos:"PG",pts:28.6,ast:10.0,reb:3.6,stl:1.4,blk:0.2,tov:4.1,fg:46.5,ts:55.8,tR:0.12},
  {name:"J. Stockton '92",pos:"PG",pts:17.0,ast:13.7,reb:3.0,stl:2.8,blk:0.2,tov:2.9,fg:48.2,ts:56.3,tR:0.12},
  {name:"J. Stockton '96",pos:"PG",pts:16.2,ast:11.2,reb:3.1,stl:2.0,blk:0.2,tov:2.6,fg:52.4,ts:59.0,tR:0.15},
  {name:"G. Payton '96",pos:"PG",pts:19.3,ast:7.5,reb:3.9,stl:2.9,blk:0.2,tov:2.6,fg:48.1,ts:54.3,tR:0.10},
  {name:"K. Anderson '96",pos:"PG",pts:15.5,ast:7.1,reb:3.4,stl:1.5,blk:0.1,tov:2.5,fg:43.5,ts:52.0,tR:0.18},
  {name:"T. Hardaway '97",pos:"PG",pts:20.3,ast:8.6,reb:3.5,stl:1.8,blk:0.2,tov:3.1,fg:43.2,ts:52.5,tR:0.32},
  {name:"S. Marbury '00",pos:"PG",pts:22.3,ast:8.9,reb:3.6,stl:1.4,blk:0.2,tov:3.4,fg:44.1,ts:53.0,tR:0.22},
  {name:"A. Iverson '01",pos:"PG",pts:31.1,ast:4.6,reb:3.8,stl:2.5,blk:0.3,tov:4.3,fg:42.1,ts:50.9,tR:0.18},
  {name:"S. Nash '05",pos:"PG",pts:15.5,ast:11.5,reb:3.3,stl:1.0,blk:0.1,tov:3.3,fg:50.2,ts:61.5,tR:0.35},
  {name:"S. Nash '06",pos:"PG",pts:18.8,ast:10.5,reb:4.2,stl:0.8,blk:0.2,tov:3.5,fg:51.2,ts:63.5,tR:0.38},
  {name:"C. Paul '08",pos:"PG",pts:21.1,ast:11.6,reb:4.0,stl:2.7,blk:0.1,tov:2.7,fg:48.8,ts:60.2,tR:0.28},
  {name:"D. Williams '10",pos:"PG",pts:21.4,ast:9.9,reb:3.8,stl:1.2,blk:0.3,tov:3.5,fg:47.1,ts:57.5,tR:0.30},
  {name:"T. Parker '07",pos:"PG",pts:18.6,ast:5.5,reb:3.0,stl:0.8,blk:0.1,tov:2.2,fg:50.9,ts:57.8,tR:0.06},
  {name:"S. Curry '16",pos:"PG",pts:31.2,ast:6.9,reb:5.6,stl:2.2,blk:0.2,tov:3.4,fg:50.4,ts:67.0,tR:0.45},
  {name:"S. Curry '21",pos:"PG",pts:32.0,ast:5.8,reb:5.5,stl:1.3,blk:0.4,tov:3.4,fg:48.2,ts:65.5,tR:0.46},
  {name:"R. Westbrook '17",pos:"PG",pts:33.4,ast:11.0,reb:11.3,stl:1.7,blk:0.4,tov:5.7,fg:42.5,ts:55.4,tR:0.22},
  {name:"D. Rose '11",pos:"PG",pts:28.1,ast:8.1,reb:4.3,stl:1.1,blk:0.3,tov:3.6,fg:45.9,ts:55.5,tR:0.18},
  {name:"C. Paul '15",pos:"PG",pts:20.1,ast:10.4,reb:4.6,stl:2.5,blk:0.2,tov:2.3,fg:48.5,ts:59.1,tR:0.28},
  {name:"K. Irving '19",pos:"PG",pts:27.4,ast:6.9,reb:5.0,stl:1.5,blk:0.4,tov:3.1,fg:48.7,ts:61.0,tR:0.35},
  {name:"D. Lillard '21",pos:"PG",pts:29.8,ast:8.1,reb:4.4,stl:1.0,blk:0.3,tov:3.3,fg:45.1,ts:62.2,tR:0.42},
  {name:"I. Thomas '17",pos:"PG",pts:30.2,ast:6.4,reb:3.2,stl:0.9,blk:0.2,tov:2.8,fg:46.3,ts:61.9,tR:0.32},
  {name:"T. Young '22",pos:"PG",pts:28.4,ast:9.7,reb:3.9,stl:0.9,blk:0.2,tov:4.3,fg:43.0,ts:60.3,tR:0.40},
  {name:"J. Wall '17",pos:"PG",pts:23.2,ast:11.0,reb:4.2,stl:2.0,blk:0.6,tov:3.8,fg:45.1,ts:56.0,tR:0.20},
  {name:"J. Murray '22",pos:"PG",pts:21.1,ast:6.2,reb:4.0,stl:1.1,blk:0.3,tov:2.8,fg:45.6,ts:59.0,tR:0.36},
  {name:"D. Fox '23",pos:"PG",pts:25.2,ast:6.1,reb:3.8,stl:1.5,blk:0.3,tov:3.1,fg:49.5,ts:58.5,tR:0.22},
  {name:"L. Doncic '23",pos:"PG",pts:32.4,ast:8.0,reb:8.6,stl:1.4,blk:0.5,tov:4.0,fg:48.7,ts:60.5,tR:0.40},
  {name:"S. Gilgeous-A '23",pos:"PG",pts:31.4,ast:5.5,reb:4.8,stl:1.6,blk:0.9,tov:2.9,fg:53.5,ts:64.2,tR:0.28},
  {name:"M. Conley '17",pos:"PG",pts:18.5,ast:6.4,reb:3.1,stl:1.8,blk:0.3,tov:2.1,fg:46.2,ts:57.8,tR:0.38},
  {name:"F. VanVleet '22",pos:"PG",pts:20.0,ast:7.1,reb:4.3,stl:1.9,blk:0.4,tov:2.7,fg:40.8,ts:55.1,tR:0.44},
  {name:"D. Graham '23",pos:"PG",pts:12.9,ast:6.1,reb:3.0,stl:0.9,blk:0.1,tov:2.2,fg:40.2,ts:53.0,tR:0.38},
  {name:"M. Smart '22",pos:"PG",pts:12.1,ast:5.9,reb:3.5,stl:1.7,blk:0.4,tov:2.3,fg:36.9,ts:50.5,tR:0.30},
  {name:"K. Walker '19",pos:"PG",pts:25.6,ast:5.9,reb:4.4,stl:1.1,blk:0.3,tov:2.8,fg:43.4,ts:57.1,tR:0.36},
  {name:"D. Lillard '19",pos:"PG",pts:25.9,ast:6.9,reb:4.6,stl:1.1,blk:0.3,tov:2.9,fg:44.4,ts:59.0,tR:0.42},
  {name:"C. Boozer '11",pos:"PG",pts:17.5,ast:3.5,reb:8.8,stl:0.5,blk:0.3,tov:2.3,fg:52.0,ts:55.0,tR:0.02},
  {name:"S. Dinwiddie '20",pos:"PG",pts:20.6,ast:6.8,reb:3.5,stl:0.7,blk:0.2,tov:2.9,fg:42.6,ts:57.5,tR:0.33},
  {name:"T. Rozier '22",pos:"PG",pts:21.4,ast:4.3,reb:4.4,stl:1.3,blk:0.3,tov:2.6,fg:44.1,ts:57.5,tR:0.38},
  {name:"Q. Snell '20",pos:"PG",pts:8.2,ast:2.0,reb:2.2,stl:0.6,blk:0.1,tov:1.1,fg:41.0,ts:56.0,tR:0.45},
  {name:"D. Schroder '21",pos:"PG",pts:15.4,ast:5.8,reb:3.5,stl:1.2,blk:0.2,tov:2.7,fg:43.3,ts:56.1,tR:0.30},
  {name:"M. Jordan '92",pos:"SG",pts:30.1,ast:6.4,reb:6.5,stl:2.3,blk:0.9,tov:2.9,fg:51.9,ts:59.9,tR:0.12},
  {name:"M. Jordan '96",pos:"SG",pts:30.4,ast:4.3,reb:5.9,stl:2.2,blk:0.5,tov:2.4,fg:49.5,ts:58.2,tR:0.24},
  {name:"M. Jordan '98",pos:"SG",pts:28.7,ast:3.5,reb:5.8,stl:1.7,blk:0.5,tov:2.2,fg:46.5,ts:55.1,tR:0.21},
  {name:"C. Drexler '92",pos:"SG",pts:25.0,ast:6.6,reb:6.6,stl:2.0,blk:0.8,tov:3.2,fg:47.0,ts:55.5,tR:0.18},
  {name:"R. Miller '95",pos:"SG",pts:19.5,ast:3.0,reb:3.0,stl:1.1,blk:0.2,tov:1.9,fg:47.3,ts:57.8,tR:0.45},
  {name:"A. Hardaway '95",pos:"SG",pts:20.9,ast:7.2,reb:4.4,stl:1.8,blk:0.5,tov:3.1,fg:51.0,ts:57.5,tR:0.20},
  {name:"M. Richmond '96",pos:"SG",pts:23.1,ast:3.8,reb:3.8,stl:1.4,blk:0.2,tov:2.3,fg:44.8,ts:54.0,tR:0.28},
  {name:"K. Bryant '00",pos:"SG",pts:22.5,ast:4.9,reb:6.3,stl:1.6,blk:0.5,tov:2.9,fg:46.8,ts:54.8,tR:0.18},
  {name:"K. Bryant '01",pos:"SG",pts:28.5,ast:5.0,reb:5.9,stl:1.5,blk:0.4,tov:3.0,fg:46.4,ts:54.5,tR:0.20},
  {name:"K. Bryant '06",pos:"SG",pts:35.4,ast:4.5,reb:5.3,stl:1.8,blk:0.4,tov:3.1,fg:45.0,ts:55.5,tR:0.25},
  {name:"K. Bryant '08",pos:"SG",pts:30.1,ast:5.7,reb:6.6,stl:1.9,blk:0.5,tov:3.3,fg:45.9,ts:56.0,tR:0.22},
  {name:"D. Wade '06",pos:"SG",pts:27.2,ast:6.7,reb:5.7,stl:1.9,blk:1.2,tov:3.6,fg:49.7,ts:59.0,tR:0.12},
  {name:"D. Wade '09",pos:"SG",pts:32.0,ast:7.9,reb:5.3,stl:2.3,blk:1.4,tov:3.8,fg:49.1,ts:60.2,tR:0.10},
  {name:"T. McGrady '03",pos:"SG",pts:32.1,ast:5.5,reb:6.5,stl:1.7,blk:0.8,tov:3.2,fg:45.7,ts:56.8,tR:0.28},
  {name:"R. Allen '05",pos:"SG",pts:21.8,ast:3.0,reb:4.2,stl:1.1,blk:0.1,tov:2.0,fg:43.8,ts:57.2,tR:0.48},
  {name:"V. Carter '01",pos:"SG",pts:27.6,ast:3.9,reb:5.9,stl:1.1,blk:0.8,tov:2.9,fg:43.9,ts:54.5,tR:0.28},
  {name:"J. Harden '19",pos:"SG",pts:38.2,ast:7.9,reb:7.0,stl:2.1,blk:0.7,tov:5.3,fg:44.2,ts:61.8,tR:0.48},
  {name:"J. Harden '17",pos:"SG",pts:29.1,ast:11.2,reb:8.1,stl:1.5,blk:0.5,tov:5.7,fg:44.0,ts:60.5,tR:0.40},
  {name:"K. Thompson '16",pos:"SG",pts:23.5,ast:2.2,reb:4.1,stl:0.9,blk:0.6,tov:1.8,fg:47.1,ts:61.1,tR:0.52},
  {name:"B. Beal '21",pos:"SG",pts:33.1,ast:4.7,reb:5.0,stl:1.3,blk:0.4,tov:3.5,fg:48.5,ts:59.0,tR:0.33},
  {name:"D. DeRozan '20",pos:"SG",pts:22.7,ast:6.1,reb:4.2,stl:0.9,blk:0.3,tov:2.5,fg:49.4,ts:55.8,tR:0.05},
  {name:"Z. LaVine '22",pos:"SG",pts:26.7,ast:4.6,reb:4.8,stl:0.9,blk:0.5,tov:2.8,fg:48.0,ts:61.5,tR:0.40},
  {name:"T. Herro '22",pos:"SG",pts:21.3,ast:4.0,reb:4.9,stl:1.0,blk:0.2,tov:2.6,fg:44.7,ts:59.6,tR:0.42},
  {name:"C. McCollum '21",pos:"SG",pts:24.0,ast:4.6,reb:4.4,stl:1.0,blk:0.4,tov:2.0,fg:47.1,ts:59.0,tR:0.38},
  {name:"M. Brogdon '22",pos:"SG",pts:19.9,ast:5.9,reb:5.1,stl:1.2,blk:0.3,tov:2.6,fg:45.8,ts:60.5,tR:0.36},
  {name:"J. Holiday '21",pos:"SG",pts:18.0,ast:6.1,reb:5.2,stl:1.6,blk:0.5,tov:2.5,fg:47.4,ts:58.3,tR:0.35},
  {name:"D. Russell '22",pos:"SG",pts:18.1,ast:5.6,reb:3.4,stl:0.7,blk:0.2,tov:2.5,fg:43.0,ts:57.5,tR:0.38},
  {name:"W. Barton '20",pos:"SG",pts:15.7,ast:4.1,reb:5.2,stl:0.9,blk:0.4,tov:1.9,fg:42.5,ts:56.3,tR:0.36},
  {name:"T. Prince '22",pos:"SG",pts:14.1,ast:2.6,reb:4.3,stl:1.1,blk:0.2,tov:1.3,fg:44.6,ts:58.5,tR:0.44},
  {name:"J. Ingles '21",pos:"SG",pts:12.1,ast:4.5,reb:4.1,stl:1.0,blk:0.2,tov:1.5,fg:42.1,ts:60.5,tR:0.50},
  {name:"W. Bradley '16",pos:"SG",pts:11.4,ast:1.6,reb:3.0,stl:1.2,blk:0.5,tov:1.3,fg:43.0,ts:55.3,tR:0.40},
  {name:"G. Temple '19",pos:"SG",pts:9.5,ast:2.2,reb:3.1,stl:0.9,blk:0.2,tov:1.1,fg:41.5,ts:54.0,tR:0.35},
  {name:"E. Moore '18",pos:"SG",pts:7.6,ast:2.5,reb:2.8,stl:0.9,blk:0.1,tov:1.2,fg:40.0,ts:52.0,tR:0.38},
  {name:"M. Ginobili '05",pos:"SG",pts:16.0,ast:3.9,reb:4.1,stl:1.6,blk:0.4,tov:2.4,fg:46.3,ts:57.8,tR:0.38},
  {name:"M. Ginobili '07",pos:"SG",pts:22.8,ast:4.8,reb:4.4,stl:2.0,blk:0.5,tov:2.8,fg:49.2,ts:60.5,tR:0.40},
  {name:"R. Allen '13",pos:"SG",pts:10.9,ast:1.5,reb:2.6,stl:0.7,blk:0.1,tov:1.0,fg:44.5,ts:60.2,tR:0.55},
  {name:"J. Richardson '06",pos:"SG",pts:19.7,ast:3.4,reb:4.6,stl:1.8,blk:0.3,tov:2.0,fg:43.8,ts:55.0,tR:0.35},
  {name:"L. Sprewell '94",pos:"SG",pts:21.0,ast:4.2,reb:4.2,stl:1.8,blk:0.3,tov:2.5,fg:43.5,ts:52.5,tR:0.20},
  {name:"S. Cassell '04",pos:"SG",pts:19.8,ast:7.3,reb:3.6,stl:1.2,blk:0.2,tov:2.5,fg:49.2,ts:57.5,tR:0.25},
  {name:"L. Bird '86",pos:"SF",pts:25.8,ast:6.8,reb:9.8,stl:2.0,blk:0.6,tov:3.3,fg:49.6,ts:58.5,tR:0.20},
  {name:"L. Bird '88",pos:"SF",pts:29.9,ast:6.1,reb:9.3,stl:1.6,blk:0.8,tov:3.1,fg:52.7,ts:60.2,tR:0.22},
  {name:"S. Pippen '92",pos:"SF",pts:21.0,ast:7.7,reb:7.7,stl:2.1,blk:1.0,tov:3.0,fg:50.7,ts:56.5,tR:0.12},
  {name:"S. Pippen '96",pos:"SF",pts:19.4,ast:5.9,reb:6.4,stl:1.8,blk:0.9,tov:2.8,fg:48.0,ts:54.8,tR:0.22},
  {name:"D. Rodman '96",pos:"SF",pts:5.5,ast:2.5,reb:14.9,stl:0.7,blk:0.5,tov:1.3,fg:48.0,ts:52.0,tR:0.02},
  {name:"G. Gervin '82",pos:"SF",pts:26.2,ast:3.2,reb:4.6,stl:1.2,blk:0.9,tov:2.5,fg:49.8,ts:55.0,tR:0.05},
  {name:"A. English '88",pos:"SF",pts:25.0,ast:4.0,reb:5.0,stl:1.0,blk:0.5,tov:2.4,fg:50.5,ts:56.0,tR:0.04},
  {name:"T. McGrady '01",pos:"SF",pts:26.8,ast:4.4,reb:7.5,stl:1.5,blk:1.0,tov:3.0,fg:45.5,ts:56.0,tR:0.25},
  {name:"K. Durant '10",pos:"SF",pts:27.7,ast:3.0,reb:6.8,stl:1.4,blk:1.0,tov:2.8,fg:47.6,ts:59.0,tR:0.30},
  {name:"K. Durant '14",pos:"SF",pts:34.1,ast:5.8,reb:7.8,stl:1.4,blk:0.7,tov:3.7,fg:50.3,ts:63.5,tR:0.30},
  {name:"K. Durant '22",pos:"SF",pts:29.9,ast:6.4,reb:7.4,stl:0.9,blk:1.4,tov:3.3,fg:51.8,ts:65.0,tR:0.28},
  {name:"R. Artest '04",pos:"SF",pts:18.3,ast:2.9,reb:5.5,stl:2.7,blk:0.5,tov:2.1,fg:43.5,ts:50.5,tR:0.20},
  {name:"LeBron '13",pos:"SF",pts:26.8,ast:7.3,reb:8.0,stl:1.7,blk:0.9,tov:3.0,fg:56.5,ts:64.0,tR:0.22},
  {name:"LeBron '18",pos:"SF",pts:29.0,ast:9.6,reb:9.1,stl:1.5,blk:0.9,tov:4.4,fg:54.2,ts:62.0,tR:0.25},
  {name:"LeBron '20",pos:"SF",pts:25.3,ast:10.2,reb:7.8,stl:1.2,blk:0.5,tov:3.9,fg:49.3,ts:58.5,tR:0.24},
  {name:"G. Antetok. '20",pos:"SF",pts:31.6,ast:6.8,reb:14.3,stl:1.5,blk:1.7,tov:4.2,fg:55.3,ts:61.0,tR:0.25},
  {name:"K. Leonard '17",pos:"SF",pts:27.4,ast:3.7,reb:6.8,stl:2.0,blk:0.7,tov:2.2,fg:48.0,ts:59.3,tR:0.28},
  {name:"K. Leonard '19",pos:"SF",pts:26.6,ast:3.3,reb:6.9,stl:1.8,blk:0.4,tov:2.2,fg:49.6,ts:60.5,tR:0.30},
  {name:"J. Tatum '23",pos:"SF",pts:31.8,ast:4.8,reb:9.3,stl:1.1,blk:0.7,tov:3.1,fg:46.6,ts:58.0,tR:0.35},
  {name:"P. George '19",pos:"SF",pts:30.1,ast:4.4,reb:8.8,stl:2.4,blk:0.4,tov:3.0,fg:43.9,ts:57.1,tR:0.38},
  {name:"J. Butler '20",pos:"SF",pts:20.0,ast:6.5,reb:7.0,stl:2.1,blk:0.8,tov:2.7,fg:45.5,ts:59.1,tR:0.20},
  {name:"K. Middleton '20",pos:"SF",pts:21.1,ast:4.3,reb:6.2,stl:1.1,blk:0.5,tov:2.3,fg:49.3,ts:59.0,tR:0.35},
  {name:"M. Bridges '23",pos:"SF",pts:24.0,ast:3.7,reb:4.6,stl:1.3,blk:0.6,tov:1.6,fg:47.0,ts:58.5,tR:0.36},
  {name:"H. Barnes '22",pos:"SF",pts:19.8,ast:2.6,reb:5.0,stl:0.8,blk:0.5,tov:1.6,fg:48.5,ts:58.2,tR:0.38},
  {name:"A. Wiggins '22",pos:"SF",pts:18.3,ast:2.2,reb:5.0,stl:0.9,blk:0.7,tov:1.8,fg:47.7,ts:56.5,tR:0.34},
  {name:"T. Warren '20",pos:"SF",pts:21.5,ast:2.0,reb:4.7,stl:0.7,blk:0.3,tov:1.5,fg:53.6,ts:61.0,tR:0.25},
  {name:"K. Kuzma '22",pos:"SF",pts:17.1,ast:3.5,reb:8.0,stl:0.8,blk:0.4,tov:2.0,fg:43.3,ts:55.0,tR:0.32},
  {name:"O. Porter Jr '18",pos:"SF",pts:16.0,ast:2.0,reb:7.2,stl:1.3,blk:0.5,tov:1.3,fg:49.4,ts:63.2,tR:0.42},
  {name:"R. Bullock '22",pos:"SF",pts:12.2,ast:1.8,reb:3.6,stl:0.8,blk:0.2,tov:1.1,fg:43.0,ts:57.5,tR:0.46},
  {name:"J. Crowder '22",pos:"SF",pts:9.4,ast:2.2,reb:5.0,stl:1.1,blk:0.4,tov:1.2,fg:38.3,ts:52.5,tR:0.44},
  {name:"D. Nwaba '19",pos:"SF",pts:7.5,ast:1.2,reb:3.5,stl:1.2,blk:0.4,tov:1.0,fg:41.0,ts:52.0,tR:0.20},
  {name:"M. Muscala '20",pos:"SF",pts:9.0,ast:1.9,reb:4.6,stl:0.5,blk:0.7,tov:1.2,fg:43.0,ts:57.0,tR:0.48},
  {name:"J. Worthy '88",pos:"SF",pts:19.7,ast:3.0,reb:5.2,stl:1.2,blk:0.5,tov:2.3,fg:53.0,ts:57.5,tR:0.04},
  {name:"D. Wilkins '88",pos:"SF",pts:26.0,ast:2.7,reb:5.7,stl:1.2,blk:0.5,tov:2.8,fg:47.5,ts:55.0,tR:0.08},
  {name:"P. Pierce '08",pos:"SF",pts:20.4,ast:4.1,reb:5.2,stl:1.2,blk:0.4,tov:2.7,fg:44.5,ts:56.5,tR:0.32},
  {name:"C. Anthony '13",pos:"SF",pts:28.7,ast:4.4,reb:7.9,stl:0.8,blk:0.5,tov:2.9,fg:44.9,ts:53.5,tR:0.32},
  {name:"S. Curry '19",pos:"SF",pts:8.9,ast:1.4,reb:3.7,stl:0.7,blk:0.3,tov:1.1,fg:44.0,ts:56.0,tR:0.40},
  {name:"T. Chandler '16",pos:"SF",pts:7.0,ast:1.5,reb:4.2,stl:0.7,blk:0.3,tov:1.0,fg:44.5,ts:55.5,tR:0.10},
  {name:"R. Gay '14",pos:"SF",pts:18.5,ast:2.2,reb:6.2,stl:1.3,blk:0.7,tov:2.0,fg:46.2,ts:55.0,tR:0.28},
  {name:"L. Babbitt '13",pos:"SF",pts:5.2,ast:0.7,reb:2.4,stl:0.4,blk:0.2,tov:0.5,fg:45.0,ts:59.0,tR:0.55},
  {name:"K. McHale '86",pos:"PF",pts:21.3,ast:2.5,reb:8.1,stl:0.9,blk:2.2,tov:2.2,fg:57.4,ts:61.5,tR:0.02},
  {name:"K. McHale '87",pos:"PF",pts:26.1,ast:3.0,reb:9.9,stl:0.8,blk:1.7,tov:2.5,fg:60.4,ts:64.0,tR:0.02},
  {name:"C. Barkley '93",pos:"PF",pts:25.6,ast:5.1,reb:12.2,stl:1.6,blk:1.0,tov:3.3,fg:52.0,ts:57.5,tR:0.15},
  {name:"C. Barkley '87",pos:"PF",pts:23.0,ast:4.0,reb:14.6,stl:1.6,blk:1.0,tov:3.1,fg:59.4,ts:63.5,tR:0.05},
  {name:"K. Malone '97",pos:"PF",pts:27.4,ast:4.5,reb:9.9,stl:1.4,blk:0.6,tov:3.0,fg:55.0,ts:59.5,tR:0.04},
  {name:"K. Malone '00",pos:"PF",pts:25.5,ast:3.7,reb:9.4,stl:1.3,blk:0.7,tov:2.8,fg:52.9,ts:57.5,tR:0.06},
  {name:"T. Duncan '03",pos:"PF",pts:23.3,ast:3.9,reb:12.9,stl:0.7,blk:2.9,tov:2.7,fg:51.3,ts:56.5,tR:0.02},
  {name:"T. Duncan '05",pos:"PF",pts:20.3,ast:3.4,reb:11.1,stl:0.7,blk:2.6,tov:2.3,fg:49.4,ts:55.0,tR:0.02},
  {name:"K. Garnett '04",pos:"PF",pts:24.2,ast:5.0,reb:13.9,stl:1.5,blk:2.2,tov:2.3,fg:49.9,ts:56.5,tR:0.06},
  {name:"K. Garnett '08",pos:"PF",pts:18.8,ast:3.4,reb:9.2,stl:1.3,blk:1.3,tov:1.8,fg:53.3,ts:58.5,tR:0.04},
  {name:"D. Nowitzki '06",pos:"PF",pts:26.6,ast:2.8,reb:9.0,stl:0.7,blk:0.8,tov:2.4,fg:48.0,ts:60.5,tR:0.26},
  {name:"D. Nowitzki '11",pos:"PF",pts:24.6,ast:2.8,reb:7.4,stl:0.5,blk:0.8,tov:1.8,fg:51.9,ts:64.4,tR:0.28},
  {name:"K. Love '14",pos:"PF",pts:27.7,ast:4.7,reb:13.3,stl:0.8,blk:0.5,tov:2.7,fg:45.7,ts:57.5,tR:0.32},
  {name:"D. Green '16",pos:"PF",pts:14.8,ast:7.8,reb:10.1,stl:2.4,blk:1.5,tov:3.2,fg:49.0,ts:59.8,tR:0.38},
  {name:"A. Davis '20",pos:"PF",pts:28.8,ast:2.5,reb:11.5,stl:1.6,blk:2.8,tov:2.4,fg:53.4,ts:62.6,tR:0.10},
  {name:"G. Antetok. '19",pos:"PF",pts:27.7,ast:5.9,reb:12.5,stl:1.3,blk:1.5,tov:3.7,fg:57.8,ts:61.0,tR:0.25},
  {name:"Z. Randle '21",pos:"PF",pts:25.6,ast:5.4,reb:10.8,stl:0.9,blk:0.3,tov:3.5,fg:45.6,ts:57.5,tR:0.28},
  {name:"P. Siakam '22",pos:"PF",pts:24.0,ast:5.4,reb:8.3,stl:1.0,blk:0.7,tov:2.6,fg:47.2,ts:59.1,tR:0.30},
  {name:"J. Collins '21",pos:"PF",pts:23.2,ast:1.8,reb:8.0,stl:0.7,blk:1.0,tov:1.9,fg:55.3,ts:63.0,tR:0.30},
  {name:"D. Sabonis '22",pos:"PF",pts:19.9,ast:5.0,reb:12.1,stl:0.8,blk:0.6,tov:2.8,fg:55.5,ts:60.0,tR:0.10},
  {name:"L. Aldridge '18",pos:"PF",pts:23.1,ast:1.8,reb:8.5,stl:0.6,blk:1.2,tov:2.0,fg:50.8,ts:57.5,tR:0.12},
  {name:"T. Harris '22",pos:"PF",pts:19.3,ast:3.7,reb:7.7,stl:1.0,blk:0.5,tov:2.0,fg:50.0,ts:60.1,tR:0.30},
  {name:"B. Griffin '15",pos:"PF",pts:22.0,ast:5.0,reb:9.0,stl:0.9,blk:0.5,tov:3.1,fg:48.5,ts:55.5,tR:0.10},
  {name:"J. Grant '22",pos:"PF",pts:19.5,ast:2.1,reb:5.1,stl:0.8,blk:0.9,tov:1.9,fg:44.5,ts:57.5,tR:0.34},
  {name:"O. Anunoby '22",pos:"PF",pts:17.1,ast:2.4,reb:5.3,stl:1.5,blk:0.6,tov:1.5,fg:47.1,ts:58.5,tR:0.36},
  {name:"J. Poeltl '22",pos:"PF",pts:12.0,ast:2.8,reb:9.0,stl:0.9,blk:2.0,tov:1.9,fg:61.0,ts:65.0,tR:0.02},
  {name:"M. Morris '20",pos:"PF",pts:16.7,ast:2.1,reb:6.6,stl:0.9,blk:0.4,tov:1.8,fg:45.0,ts:56.0,tR:0.28},
  {name:"K. Looney '22",pos:"PF",pts:8.0,ast:2.8,reb:9.7,stl:0.6,blk:0.5,tov:1.5,fg:57.5,ts:64.5,tR:0.02},
  {name:"T. Tucker '21",pos:"PF",pts:7.8,ast:2.0,reb:6.4,stl:1.1,blk:0.3,tov:1.1,fg:43.0,ts:55.5,tR:0.40},
  {name:"B. Biyombo '16",pos:"PF",pts:9.2,ast:0.6,reb:10.3,stl:0.8,blk:1.9,tov:1.4,fg:60.0,ts:61.5,tR:0.02},
  {name:"R. Holmes '21",pos:"PF",pts:12.1,ast:2.0,reb:8.0,stl:0.7,blk:1.0,tov:2.0,fg:62.0,ts:66.0,tR:0.02},
  {name:"C. Anthony '07",pos:"PF",pts:28.9,ast:3.8,reb:6.0,stl:1.1,blk:0.5,tov:3.1,fg:47.5,ts:55.5,tR:0.20},
  {name:"A. Kirilenko '04",pos:"PF",pts:16.5,ast:3.0,reb:8.5,stl:2.1,blk:3.3,tov:2.0,fg:50.5,ts:57.5,tR:0.15},
  {name:"A. Marion '05",pos:"PF",pts:20.1,ast:2.0,reb:11.6,stl:2.3,blk:1.1,tov:1.7,fg:49.8,ts:56.5,tR:0.12},
  {name:"S. Stoudemire '06",pos:"PF",pts:26.0,ast:1.6,reb:9.0,stl:0.9,blk:0.7,tov:2.5,fg:56.0,ts:60.5,tR:0.06},
  {name:"R. Villanueva '07",pos:"PF",pts:12.0,ast:1.5,reb:5.0,stl:0.7,blk:0.5,tov:1.3,fg:44.0,ts:54.5,tR:0.28},
  {name:"J. Kidd '11",pos:"PF",pts:8.2,ast:7.8,reb:4.2,stl:1.5,blk:0.2,tov:2.2,fg:40.0,ts:52.0,tR:0.38},
  {name:"W. Unseld '73",pos:"PF",pts:12.5,ast:3.5,reb:14.0,stl:0.8,blk:0.5,tov:2.0,fg:49.5,ts:53.0,tR:0.02},
  {name:"D. Williams '10",pos:"PF",pts:6.5,ast:2.0,reb:5.0,stl:0.5,blk:0.5,tov:1.0,fg:46.0,ts:55.0,tR:0.10},
  {name:"H. Turkoglu '09",pos:"PF",pts:16.8,ast:4.3,reb:5.7,stl:1.0,blk:0.3,tov:2.1,fg:44.2,ts:55.8,tR:0.32},
  {name:"K. Abdul-Jabbar '87",pos:"C",pts:23.4,ast:3.0,reb:8.0,stl:0.9,blk:2.3,tov:2.8,fg:60.1,ts:62.5,tR:0.02},
  {name:"K. Abdul-Jabbar '80",pos:"C",pts:24.8,ast:4.5,reb:10.8,stl:0.8,blk:3.4,tov:3.1,fg:60.4,ts:64.0,tR:0.02},
  {name:"W. Chamberlain '62",pos:"C",pts:36.0,ast:2.3,reb:22.0,stl:1.0,blk:4.5,tov:3.5,fg:54.0,ts:56.0,tR:0.02},
  {name:"B. Russell '64",pos:"C",pts:15.0,ast:4.7,reb:24.7,stl:0.8,blk:7.0,tov:2.0,fg:43.3,ts:47.5,tR:0.02},
  {name:"H. Olajuwon '94",pos:"C",pts:27.3,ast:3.6,reb:11.9,stl:1.6,blk:3.7,tov:2.9,fg:52.1,ts:57.0,tR:0.02},
  {name:"H. Olajuwon '96",pos:"C",pts:26.9,ast:3.5,reb:10.9,stl:1.6,blk:3.1,tov:3.1,fg:51.5,ts:56.0,tR:0.02},
  {name:"P. Ewing '90",pos:"C",pts:28.6,ast:2.1,reb:10.9,stl:1.0,blk:4.0,tov:3.0,fg:55.2,ts:59.0,tR:0.02},
  {name:"D. Robinson '94",pos:"C",pts:29.8,ast:4.8,reb:10.7,stl:1.7,blk:3.3,tov:2.8,fg:50.7,ts:57.0,tR:0.04},
  {name:"D. Robinson '96",pos:"C",pts:25.0,ast:3.3,reb:12.2,stl:1.6,blk:3.1,tov:2.3,fg:51.6,ts:57.5,tR:0.04},
  {name:"S. O'Neal '00",pos:"C",pts:31.5,ast:4.0,reb:14.4,stl:0.5,blk:3.2,tov:3.5,fg:57.4,ts:61.5,tR:0.02},
  {name:"S. O'Neal '06",pos:"C",pts:20.0,ast:3.8,reb:9.5,stl:0.5,blk:1.8,tov:2.5,fg:60.0,ts:63.0,tR:0.02},
  {name:"D. Mutombo '01",pos:"C",pts:10.5,ast:1.2,reb:12.3,stl:0.4,blk:3.5,tov:1.9,fg:57.0,ts:59.0,tR:0.02},
  {name:"Y. Ming '06",pos:"C",pts:22.3,ast:1.9,reb:10.2,stl:0.6,blk:2.0,tov:2.6,fg:52.5,ts:57.5,tR:0.02},
  {name:"D. Howard '08",pos:"C",pts:20.7,ast:1.3,reb:14.2,stl:0.9,blk:2.9,tov:2.5,fg:60.1,ts:63.5,tR:0.02},
  {name:"D. Howard '13",pos:"C",pts:18.1,ast:1.5,reb:13.1,stl:1.1,blk:3.0,tov:2.5,fg:57.3,ts:61.5,tR:0.02},
  {name:"A. Bogut '10",pos:"C",pts:13.8,ast:2.9,reb:10.7,stl:0.8,blk:2.5,tov:2.0,fg:52.3,ts:57.0,tR:0.02},
  {name:"T. Duncan '14",pos:"C",pts:15.1,ast:2.7,reb:9.7,stl:0.6,blk:2.3,tov:1.8,fg:49.8,ts:55.0,tR:0.02},
  {name:"N. Jokic '22",pos:"C",pts:28.6,ast:8.3,reb:14.6,stl:1.6,blk:0.9,tov:4.1,fg:58.3,ts:67.3,tR:0.12},
  {name:"N. Jokic '24",pos:"C",pts:26.4,ast:9.0,reb:12.4,stl:1.4,blk:0.9,tov:3.5,fg:58.3,ts:66.5,tR:0.12},
  {name:"J. Embiid '23",pos:"C",pts:34.7,ast:5.7,reb:11.2,stl:1.2,blk:1.7,tov:4.0,fg:54.8,ts:64.6,tR:0.20},
  {name:"R. Gobert '22",pos:"C",pts:16.5,ast:1.2,reb:15.6,stl:0.8,blk:2.3,tov:1.8,fg:71.3,ts:68.2,tR:0.02},
  {name:"K. Towns '22",pos:"C",pts:24.6,ast:4.8,reb:9.8,stl:1.1,blk:0.9,tov:3.5,fg:49.9,ts:62.5,tR:0.38},
  {name:"B. Adebayo '22",pos:"C",pts:21.0,ast:3.5,reb:10.0,stl:1.5,blk:1.0,tov:2.5,fg:55.5,ts:60.5,tR:0.04},
  {name:"C. Capella '19",pos:"C",pts:16.2,ast:1.7,reb:13.4,stl:1.3,blk:2.1,tov:2.0,fg:65.0,ts:64.0,tR:0.02},
  {name:"A. Horford '22",pos:"C",pts:14.2,ast:3.9,reb:7.6,stl:0.9,blk:1.3,tov:1.6,fg:44.7,ts:58.8,tR:0.36},
  {name:"B. Lopez '19",pos:"C",pts:18.1,ast:1.9,reb:5.2,stl:0.8,blk:1.8,tov:1.7,fg:48.5,ts:59.8,tR:0.38},
  {name:"D. Jordan '16",pos:"C",pts:12.7,ast:1.0,reb:15.0,stl:0.7,blk:2.3,tov:2.0,fg:70.0,ts:70.0,tR:0.02},
  {name:"M. Turner '22",pos:"C",pts:13.4,ast:1.4,reb:7.2,stl:0.7,blk:2.8,tov:1.6,fg:47.7,ts:60.0,tR:0.30},
  {name:"N. Vucevic '21",pos:"C",pts:24.5,ast:3.8,reb:11.8,stl:0.9,blk:1.0,tov:2.5,fg:49.5,ts:57.5,tR:0.28},
  {name:"I. Hartenstein '23",pos:"C",pts:9.5,ast:2.8,reb:10.2,stl:1.2,blk:1.1,tov:1.5,fg:57.3,ts:62.0,tR:0.04},
  {name:"T. Zubac '22",pos:"C",pts:11.0,ast:1.8,reb:9.5,stl:0.5,blk:0.9,tov:1.6,fg:59.0,ts:62.0,tR:0.04},
  {name:"M. Plumlee '20",pos:"C",pts:8.5,ast:2.5,reb:7.8,stl:0.5,blk:0.8,tov:1.5,fg:58.0,ts:59.5,tR:0.02},
  {name:"W. Hernangomez '20",pos:"C",pts:9.5,ast:1.2,reb:7.0,stl:0.5,blk:0.6,tov:1.5,fg:53.0,ts:57.0,tR:0.08},
  {name:"D. Dedmon '19",pos:"C",pts:8.5,ast:1.5,reb:7.3,stl:0.8,blk:0.9,tov:1.4,fg:50.5,ts:59.5,tR:0.30},
  {name:"T. Maker '19",pos:"C",pts:6.5,ast:1.0,reb:4.5,stl:0.5,blk:1.0,tov:1.1,fg:42.0,ts:53.0,tR:0.30},
  {name:"B. Bol '23",pos:"C",pts:9.0,ast:1.2,reb:5.0,stl:0.5,blk:1.8,tov:1.0,fg:50.0,ts:59.0,tR:0.28},
  {name:"V. Wembanyama '24",pos:"C",pts:21.4,ast:3.6,reb:10.6,stl:1.2,blk:3.6,tov:3.3,fg:46.5,ts:57.5,tR:0.26},
  {name:"J. Nurkic '23",pos:"C",pts:15.2,ast:3.2,reb:11.0,stl:0.8,blk:1.2,tov:2.5,fg:52.5,ts:58.5,tR:0.06},
  {name:"R. Lopez '19",pos:"C",pts:8.0,ast:1.5,reb:4.5,stl:0.5,blk:1.0,tov:1.3,fg:44.5,ts:55.0,tR:0.38},
];

const _rated=raw.map((p,i)=>({...p,id:i+1,rating:calcRating(p)}));
const _minR=Math.min(..._rated.map(p=>p.rating));
const _maxR=Math.max(..._rated.map(p=>p.rating));
const PLAYERS=_rated.map(p=>({...p,cost:ratingToCost(p.rating,_minR,_maxR)})).sort((a,b)=>b.rating-a.rating);

const ADJ={PG:["SG"],SG:["PG","SF"],SF:["SG","PF"],PF:["SF","C"],C:["PF"]};
function posMult(player,slot){if(player.pos===slot)return 1.0;if(ADJ[player.pos]?.includes(slot))return 0.82;return 0.65;}
function teamEff(lineup){return lineup.reduce((s,{player,slot})=>s+player.rating*posMult(player,slot),0)+chemBoost(lineup);}
function rf(n,d=1){return parseFloat(n.toFixed(d));}
function ri(n){return Math.round(n);}
function clamp(v,mn,mx){return Math.max(mn,Math.min(mx,v));}
function gauss(sigma=1){const u=Math.max(1e-10,Math.random()),v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*sigma;}
function gameVariance(rating){const norm=clamp((rating-_minR)/Math.max(_maxR-_minR,1),0,1);return clamp(1+gauss(0.28-norm*0.10),0.30,1.90);}

function genOpp(excludeIds=new Set()){
  const used=new Set(excludeIds);const team=[];let rem=BUDGET;
  for(const pos of POSITIONS){
    const pool=PLAYERS.filter(p=>p.pos===pos&&!used.has(p.id));
    if(!pool.length)continue;
    const avg=rem/Math.max(POSITIONS.length-team.length,1);
    const weights=pool.map(p=>Math.max(0.1,1-Math.abs(p.cost-avg)/Math.max(avg,1))*p.rating*(p.cost<=rem?1:0.05));
    const tot=weights.reduce((a,b)=>a+b,0);
    let r=Math.random()*tot,pick=pool[pool.length-1];
    for(let i=0;i<pool.length;i++){r-=weights[i];if(r<=0){pick=pool[i];break;}}
    team.push({player:pick,slot:pos});used.add(pick.id);rem-=pick.cost;
  }
  return team;
}

function wIdx(arr,wFn){
  const w=arr.map(wFn);const t=w.reduce((a,b)=>a+b,0);
  if(t<=0)return 0;let r=Math.random()*t;
  for(let i=0;i<arr.length;i++){r-=w[i];if(r<=0)return i;}
  return arr.length-1;
}

function simulate(myLineup,oppLineup){
  const myE=teamEff(myLineup),oppE=teamEff(oppLineup);
  const myOff=clamp(myE/(myE+oppE),0.42,0.58);
  const pace=Math.round(96+Math.random()*12);
  const myVar=myLineup.map(({player})=>gameVariance(player.rating));
  const oppVar=oppLineup.map(({player})=>gameVariance(player.rating));

  const mkStats=(lineup)=>lineup.map(({player,slot})=>({
    name:player.name,pos:slot,native:player.pos,oop:player.pos!==slot,
    cost:player.cost,min:48,pts:0,ast:0,reb:0,stl:0,blk:0,tov:0,
    fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,
    rating:rf(player.rating*posMult(player,slot),1),
    gv:gameVariance(player.rating),
  }));
  const myStats=mkStats(myLineup);
  const oppStats=mkStats(oppLineup);

  for(let i=0;i<pace*2;i++){
    const isMyBall=i%2===0?Math.random()<(myOff+0.03):Math.random()<(myOff-0.03);
    const offStats=isMyBall?myStats:oppStats;
    const defStats=isMyBall?oppStats:myStats;
    const offVar=isMyBall?myVar:oppVar;
    const offLineup=isMyBall?myLineup:oppLineup;
    const defLineup=isMyBall?oppLineup:myLineup;

    const si=wIdx(offStats,(_,j)=>Math.max(0.01,offLineup[j].player.rating*posMult(offLineup[j].player,offLineup[j].slot)*offVar[j]));
    const shooter=offStats[si];
    const sp=offLineup[si].player;
    const m=posMult(sp,offLineup[si].slot);
    const gv=offVar[si];
    const di=defLineup.findIndex(x=>x.slot===offLineup[si].slot);
    const defIdx=di>=0?di:0;
    const defender=defStats[defIdx];
    const dp=defLineup[defIdx].player;
    const dm=posMult(dp,defLineup[defIdx].slot);

    const is3=Math.random()<sp.tR*(0.75+Math.random()*0.5);
    const fgPct=clamp(sp.fg*(m*0.18+0.82)+gauss(3.5),24,76)/100;
    const defFactor=clamp(1-(dp.rating*dm-35)*0.002,0.88,1.04);
    const adjFg=clamp(fgPct*defFactor,0.44,0.72);
    const tovChance=clamp((sp.tov/40)*gv*0.7,0.02,0.15);
    const blkChance=clamp(dp.blk*dm*0.04,0,0.12);

    if(Math.random()<tovChance){
      shooter.tov++;
      const si2=wIdx(defStats,(_,j)=>Math.max(0.01,defLineup[j].player.stl*posMult(defLineup[j].player,defLineup[j].slot)));
      defStats[si2].stl++;
    } else if(!is3&&Math.random()<blkChance){
      shooter.fga++;defender.blk++;
      const ri2=wIdx(Math.random()<0.80?defStats:offStats,(_,j)=>{const l=Math.random()<0.80?defLineup:offLineup;return Math.max(0.01,l[j].player.reb*posMult(l[j].player,l[j].slot));});
      (Math.random()<0.80?defStats:offStats)[ri2].reb++;
    } else if(Math.random()<adjFg){
      shooter.fga++;shooter.fgm++;
      if(is3){shooter.tpa++;shooter.tpm++;}
      let pts=is3?3:2;
      const ftChance=is3?0.04:0.18;
      if(Math.random()<ftChance){
        const ftPct=clamp(0.55+(sp.tR-0.10)*1.8+gauss(0.04),0.50,0.95);
        const ftsMade=Math.random()<ftPct?1:0;
        pts+=ftsMade;shooter.fta++;shooter.ftm+=ftsMade;
      }
      shooter.pts+=pts;
      if(Math.random()<0.65){
        const ai=wIdx(offStats,(s,j)=>j===si?0:Math.max(0.01,offLineup[j].player.ast));
        offStats[ai].ast++;
      }
    } else {
      shooter.fga++;if(is3)shooter.tpa++;
      if(!is3&&Math.random()<0.08){
        const ftPct=clamp(0.55+(sp.tR-0.10)*1.8+gauss(0.04),0.50,0.95);
        const ft1=Math.random()<ftPct?1:0,ft2=Math.random()<ftPct?1:0;
        shooter.fta+=2;shooter.ftm+=ft1+ft2;shooter.pts+=ft1+ft2;
      }
      if(Math.random()<0.27){
        const ri2=wIdx(offStats,(_,j)=>Math.max(0.01,offLineup[j].player.reb*posMult(offLineup[j].player,offLineup[j].slot)));
        offStats[ri2].reb++;
      } else {
        const ri2=wIdx(defStats,(_,j)=>Math.max(0.01,defLineup[j].player.reb*posMult(defLineup[j].player,defLineup[j].slot)));
        defStats[ri2].reb++;
      }
    }
  }

  const finalize=stats=>stats.map(s=>({...s,
    fgPct:s.fga>0?rf(s.fgm/s.fga*100):0,
    tpPct:s.tpa>0?rf(s.tpm/s.tpa*100):0,
    ftPct:s.fta>0?rf(s.ftm/s.fta*100):0,
    hotCold:s.gv>=1.40?"🔥":s.gv<=0.60?"🥶":"",
  }));

  let ms=myStats.reduce((s,p)=>s+p.pts,0);
  let os=oppStats.reduce((s,p)=>s+p.pts,0);
  let ot=0;
  while(ms===os){ot++;ms+=ri(5+Math.random()*15*myOff);os+=ri(5+Math.random()*15*(1-myOff));}

  return{myScore:ms,oppScore:os,ot,myStats:finalize(myStats),oppStats:finalize(oppStats),myEff:rf(myE,1),oppEff:rf(oppE,1),myChem:chemBoost(myLineup),oppChem:chemBoost(oppLineup)};
}

function getTier(cost){
  if(cost>=35)return{label:"Elite",color:"#fbbf24",bg:"#78350f"};
  if(cost>=28)return{label:"Star",color:"#c084fc",bg:"#3b0764"};
  if(cost>=20)return{label:"Solid",color:"#60a5fa",bg:"#1e3a5f"};
  if(cost>=13)return{label:"Role",color:"#4ade80",bg:"#14532d"};
  if(cost>=8) return{label:"Bench",color:"#94a3b8",bg:"#1e293b"};
  return             {label:"Filler",color:"#64748b",bg:"#0f172a"};
}
const SMAXES={pts:65,ast:20,reb:30,stl:7,blk:8,tov:10,fgPct:80,tpPct:55};
function cellBg(stat,val){const r=Math.min(val/(SMAXES[stat]||1),1);if(stat==="tov")return`rgba(239,68,68,${0.12+r*0.55})`;return`rgba(${ri(15+(1-r)*25)},${ri(100+r*120)},${ri(50+(1-r)*20)},${0.15+r*0.55})`;}
const Tag=({label,color,bg})=>(<span style={{fontSize:10,fontWeight:800,background:bg,color,borderRadius:4,padding:"1px 5px",whiteSpace:"nowrap"}}>{label}</span>);
const Bar=({v,max=85})=>(<div style={{height:3,background:"#0f172a",borderRadius:2,marginTop:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min((v/max)*100,100)}%`,background:`hsl(${Math.min(v*1.5,120)},75%,48%)`,borderRadius:2}}/></div>);

// ── Season stats accumulator ──────────────────────────
function addToSeason(season, gameStats, won, myScore, oppScore) {
  const next = { ...season };
  next.gp++;
  if (won) next.w++; else next.l++;
  next.ptsFor += myScore;
  next.ptsAgainst += oppScore;
  gameStats.forEach(s => {
    if (!next.players[s.name]) next.players[s.name] = {pts:0,ast:0,reb:0,stl:0,blk:0,gp:0};
    const p = next.players[s.name];
    p.pts += s.pts; p.ast += s.ast; p.reb += s.reb;
    p.stl += s.stl; p.blk += s.blk; p.gp++;
  });
  return next;
}
function emptySeason(){ return {gp:0,w:0,l:0,ptsFor:0,ptsAgainst:0,players:{}}; }

export default function App(){
  const [phase,   setPhase]  =useState("draft");  // draft | game | season
  const [roster,  setRoster] =useState({PG:null,SG:null,SF:null,PF:null,C:null});
  const [slotSel, setSlotSel]=useState(null);
  const [opp,     setOpp]    =useState(null);
  const [result,  setResult] =useState(null);
  const [season,  setSeason] =useState(emptySeason());
  const [gameNum, setGameNum]=useState(1);
  const [posF,    setPosF]   =useState("ALL");
  const [sortBy,  setSortBy] =useState("rating");
  const [search,  setSearch] =useState("");
  const [inSeason,setInSeason]=useState(false);

  const myIds=new Set(Object.values(roster).filter(Boolean).map(p=>p.id));
  const spent=Object.values(roster).reduce((s,p)=>s+(p?.cost||0),0);
  const rem=BUDGET-spent;
  const filled=POSITIONS.filter(p=>roster[p]).length;
  const full=filled===5;
  const myLineup=full?POSITIONS.map(pos=>({player:roster[pos],slot:pos})):null;
  const myEffVal=myLineup?rf(teamEff(myLineup),1):null;
  const myCh=myLineup?chemBoost(myLineup):0;
  const oppEffVal=opp?rf(teamEff(opp),1):null;

  useEffect(()=>{setOpp(genOpp());},[]);

  const pickPlayer=useCallback((player)=>{
    if(inSeason)return; // lock roster during season
    const targetSlot=slotSel||player.pos;
    const prev=roster[targetSlot];
    if((player.cost-(prev?.cost||0))>rem)return;
    setRoster(r=>({...r,[targetSlot]:player}));setSlotSel(null);
  },[roster,rem,slotSel,inSeason]);

  const drop=slot=>{if(inSeason)return;setRoster(r=>({...r,[slot]:null}));if(slotSel===slot)setSlotSel(null);};

  const startSeason=()=>{
    if(!full)return;
    setInSeason(true);setSeason(emptySeason());setGameNum(1);
    setOpp(genOpp(myIds));setResult(null);setPhase("game");
  };

  const playGame=()=>{
    if(!full||!opp)return;
    const res=simulate(myLineup,opp);
    const won=res.myScore>res.oppScore;
    const newSeason=addToSeason(season,res.myStats,won,res.myScore,res.oppScore);
    setSeason(newSeason);setResult(res);setPhase("game");
  };

  const nextGame=()=>{
    if(gameNum>=SEASON_LENGTH){setPhase("season");return;}
    setGameNum(g=>g+1);setOpp(genOpp(myIds));setResult(null);
  };

  const endSeason=()=>setPhase("season");

  const newSeason=()=>{
    setInSeason(false);setSeason(emptySeason());setGameNum(1);
    setResult(null);setOpp(genOpp());setPhase("draft");
  };

  const display=PLAYERS
    .filter(p=>(posF==="ALL"||p.pos===posF)&&(search===""||p.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>sortBy==="rating"?b.rating-a.rating:sortBy==="cost"?b.cost-a.cost:a.name.localeCompare(b.name));

  // ── SEASON SUMMARY ────────────────────────────────────
  if(phase==="season"){
    const ppg=season.gp>0?rf(season.ptsFor/season.gp):0;
    const papg=season.gp>0?rf(season.ptsAgainst/season.gp):0;
    const pcts=season.gp>0?rf(season.w/season.gp*100):0;
    const playerRows=Object.entries(season.players).map(([name,s])=>({
      name,gp:s.gp,
      ppg:rf(s.pts/s.gp),apg:rf(s.ast/s.gp),rpg:rf(s.reb/s.gp),
      spg:rf(s.stl/s.gp),bpg:rf(s.blk/s.gp),
    })).sort((a,b)=>b.ppg-a.ppg);
    const mvp=playerRows[0];
    const playoff=season.w>=6;
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          {/* Season banner */}
          <div style={{textAlign:"center",padding:"20px 16px",background:"#0f172a",borderRadius:16,border:`2px solid ${playoff?"#22c55e":"#ef4444"}`,marginBottom:16}}>
            <div style={{fontSize:40}}>{playoff?"🏆":"💀"}</div>
            <div style={{fontSize:26,fontWeight:900,color:playoff?"#22c55e":"#ef4444",letterSpacing:2}}>
              {playoff?"PLAYOFF BOUND!":"MISSED THE PLAYOFFS"}
            </div>
            <div style={{fontSize:14,color:"#94a3b8",marginTop:4}}>Need 6 wins to make playoffs</div>
          </div>

          {/* Record card */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
            {[
              ["RECORD",`${season.w}–${season.l}`,season.w>=season.l?"#22c55e":"#ef4444"],
              ["WIN %",`${pcts}%`,season.w>=season.l?"#22c55e":"#ef4444"],
              ["PPG",ppg,"#60a5fa"],
              ["OPP PPG",papg,"#f87171"],
            ].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center",background:"#0f172a",borderRadius:10,padding:"12px 8px",border:"1px solid #1e293b"}}>
                <div style={{fontSize:10,color:"#475569",letterSpacing:1,marginBottom:4}}>{l}</div>
                <div style={{fontSize:24,fontWeight:900,color:c}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Season MVP */}
          {mvp&&(
            <div style={{background:"#0f172a",borderRadius:12,padding:14,marginBottom:16,border:"1px solid #fbbf24",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#fbbf24",fontWeight:800,letterSpacing:2,marginBottom:4}}>🏅 SEASON MVP</div>
              <div style={{fontSize:20,fontWeight:900}}>{mvp.name}</div>
              <div style={{fontSize:13,color:"#94a3b8",marginTop:4}}>
                {mvp.ppg} PPG · {mvp.apg} APG · {mvp.rpg} RPG · {mvp.spg} SPG · {mvp.bpg} BPG
              </div>
            </div>
          )}

          {/* Player averages table */}
          <div style={{background:"#0f172a",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b",marginBottom:16}}>
            <div style={{padding:"10px 14px",background:"#1e293b",fontWeight:800,fontSize:11,letterSpacing:2,color:"#60a5fa"}}>SEASON AVERAGES</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{borderBottom:"1px solid #1e293b"}}>
                  {[["PLAYER","left"],["GP","c"],["PPG","c"],["APG","c"],["RPG","c"],["SPG","c"],["BPG","c"]].map(([h,a])=>(
                    <th key={h} style={{padding:"8px 10px",textAlign:a==="c"?"center":"left",color:"#475569",fontWeight:700,fontSize:11}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerRows.map((s,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                    <td style={{padding:"8px 10px",fontWeight:700}}>{i===0?"🏅 ":""}{s.name}</td>
                    <td style={{textAlign:"center",color:"#64748b"}}>{s.gp}</td>
                    <td style={{textAlign:"center",background:cellBg("pts",s.ppg*1.5),padding:"8px 6px",fontWeight:700}}>{s.ppg}</td>
                    <td style={{textAlign:"center",background:cellBg("ast",s.apg*1.5),padding:"8px 6px"}}>{s.apg}</td>
                    <td style={{textAlign:"center",background:cellBg("reb",s.rpg*1.5),padding:"8px 6px"}}>{s.rpg}</td>
                    <td style={{textAlign:"center",background:cellBg("stl",s.spg*2),padding:"8px 6px"}}>{s.spg}</td>
                    <td style={{textAlign:"center",background:cellBg("blk",s.bpg*2),padding:"8px 6px"}}>{s.bpg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{textAlign:"center"}}>
            <button onClick={newSeason} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:10,padding:"13px 36px",fontSize:15,fontWeight:800,cursor:"pointer"}}>
              🔄 NEW SEASON
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── GAME SCREEN ───────────────────────────────────────
  if(phase==="game"&&inSeason){
    const won=result?result.myScore>result.oppScore:false;
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        <div style={{maxWidth:1040,margin:"0 auto"}}>
          {/* Season progress bar */}
          <div style={{background:"#0f172a",borderRadius:10,padding:"10px 16px",marginBottom:12,border:"1px solid #1e293b",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#64748b"}}>SEASON GAME {result?gameNum:gameNum} / {SEASON_LENGTH}</div>
            <div style={{flex:1,background:"#1e293b",borderRadius:4,height:6,minWidth:120}}>
              <div style={{height:"100%",width:`${((result?gameNum:gameNum-1)/SEASON_LENGTH)*100}%`,background:"linear-gradient(90deg,#3b82f6,#8b5cf6)",borderRadius:4,transition:"width 0.3s"}}/>
            </div>
            <div style={{fontSize:12,fontWeight:800,color:season.w>=season.l?"#22c55e":"#f87171"}}>{season.w}W – {season.l}L</div>
            {[["PPG",season.gp>0?rf(season.ptsFor/season.gp):"-","#60a5fa"],["OPP",season.gp>0?rf(season.ptsAgainst/season.gp):"-","#f87171"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center",background:"#1e293b",borderRadius:6,padding:"3px 10px"}}>
                <div style={{fontSize:9,color:"#475569"}}>{l}</div>
                <div style={{fontSize:13,fontWeight:800,color:c}}>{v}</div>
              </div>
            ))}
          </div>

          {!result?(
            // Pre-game: show matchup and play button
            <div style={{background:"#0f172a",borderRadius:16,padding:24,border:"1px solid #1e293b",textAlign:"center",marginBottom:12}}>
              <div style={{fontSize:14,color:"#64748b",marginBottom:16,fontWeight:700,letterSpacing:1}}>GAME {gameNum}</div>
              <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:32,marginBottom:20}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:13,color:"#60a5fa",fontWeight:800,marginBottom:4}}>YOUR TEAM</div>
                  <div style={{fontSize:32,fontWeight:900,color:"#60a5fa"}}>{rf(teamEff(myLineup),0)}</div>
                  <div style={{fontSize:11,color:"#475569"}}>RTG</div>
                </div>
                <div style={{fontSize:24,color:"#334155",fontWeight:300}}>VS</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:13,color:"#f87171",fontWeight:800,marginBottom:4}}>OPPONENT</div>
                  <div style={{fontSize:32,fontWeight:900,color:"#f87171"}}>{opp?rf(teamEff(opp),0):"-"}</div>
                  <div style={{fontSize:11,color:"#475569"}}>RTG</div>
                </div>
              </div>
              {opp&&(
                <div style={{marginBottom:16,fontSize:12,color:"#475569"}}>
                  {opp.map(({player,slot})=>`${slot}: ${player.name}`).join(" · ")}
                </div>
              )}
              <button onClick={playGame} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"12px 36px",fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 18px rgba(34,197,94,0.3)"}}>
                ▶ PLAY GAME {gameNum}
              </button>
            </div>
          ):(
            // Post-game result
            <>
              <div style={{textAlign:"center",padding:"16px",background:"#0f172a",borderRadius:16,border:`2px solid ${won?"#22c55e":"#ef4444"}`,marginBottom:12}}>
                <div style={{fontSize:28}}>{won?"🏆":"💀"}</div>
                <div style={{fontSize:22,fontWeight:900,color:won?"#22c55e":"#ef4444",letterSpacing:2}}>{won?"VICTORY":"DEFEAT"}{result.ot>0?` (${result.ot}OT)`:""}</div>
                <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:8}}>
                  {[["YOUR TEAM",result.myScore,"#60a5fa",result.myEff],["OPPONENT",result.oppScore,"#f87171",result.oppEff]].map(([lbl,sc,col,eff],i)=>(
                    <div key={i} style={{textAlign:"center"}}>
                      <div style={{fontSize:11,color:col,fontWeight:800}}>{lbl}</div>
                      <div style={{fontSize:42,fontWeight:900,color:col,lineHeight:1}}>{sc}</div>
                      <div style={{fontSize:10,color:"#475569"}}>RTG {eff}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:8,fontSize:11,color:"#f59e0b",fontWeight:700}}>
                  🏅 {[...result.myStats].sort((a,b)=>b.pts-a.pts)[0]?.name} — {[...result.myStats].sort((a,b)=>b.pts-a.pts)[0]?.pts}pts
                </div>
              </div>

              {/* Box scores */}
              {[{lbl:"YOUR TEAM",stats:result.myStats,acc:"#60a5fa"},{lbl:"OPPONENT",stats:result.oppStats,acc:"#f87171"}].map(({lbl,stats,acc})=>(
                <div key={lbl} style={{marginBottom:10,background:"#0f172a",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b"}}>
                  <div style={{padding:"7px 14px",background:"#1e293b",fontWeight:800,fontSize:11,letterSpacing:2,color:acc}}>{lbl}</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:700}}>
                      <thead>
                        <tr style={{borderBottom:"1px solid #1e293b"}}>
                          {[["PLAYER","left"],["POS","c"],["MIN","c"],["PTS","c"],["AST","c"],["REB","c"],["STL","c"],["BLK","c"],["TOV","c"],["FGM-FGA","c"],["FG%","c"],["3PM-3PA","c"],["3P%","c"],["FTM-FTA","c"],["FT%","c"],["RTG","c"]].map(([h,a])=>(
                            <th key={h} style={{padding:"5px 6px",textAlign:a==="c"?"center":"left",color:"#475569",fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.map((s,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                            <td style={{padding:"5px 6px",fontWeight:700,whiteSpace:"nowrap"}}>{s.hotCold&&<span style={{marginRight:3}}>{s.hotCold}</span>}{s.name}{s.oop&&<span style={{marginLeft:4,fontSize:9,background:"#78350f",color:"#fbbf24",borderRadius:3,padding:"1px 3px"}}>OOP</span>}</td>
                            <td style={{textAlign:"center",color:"#64748b"}}>{s.pos}</td>
                            <td style={{textAlign:"center"}}>{s.min}</td>
                            <td style={{textAlign:"center",background:cellBg("pts",s.pts),fontWeight:700,padding:"5px 4px"}}>{s.pts}</td>
                            <td style={{textAlign:"center",background:cellBg("ast",s.ast),padding:"5px 4px"}}>{s.ast}</td>
                            <td style={{textAlign:"center",background:cellBg("reb",s.reb),padding:"5px 4px"}}>{s.reb}</td>
                            <td style={{textAlign:"center",background:cellBg("stl",s.stl),padding:"5px 4px"}}>{s.stl}</td>
                            <td style={{textAlign:"center",background:cellBg("blk",s.blk),padding:"5px 4px"}}>{s.blk}</td>
                            <td style={{textAlign:"center",background:cellBg("tov",s.tov),padding:"5px 4px"}}>{s.tov}</td>
                            <td style={{textAlign:"center",padding:"5px 4px",whiteSpace:"nowrap"}}>{s.fgm}-{s.fga}</td>
                            <td style={{textAlign:"center",background:cellBg("fgPct",s.fgPct),padding:"5px 4px"}}>{s.fgPct}%</td>
                            <td style={{textAlign:"center",padding:"5px 4px",whiteSpace:"nowrap"}}>{s.tpm}-{s.tpa}</td>
                            <td style={{textAlign:"center",background:cellBg("tpPct",s.tpPct),padding:"5px 4px"}}>{s.tpPct}%</td>
                            <td style={{textAlign:"center",padding:"5px 4px",whiteSpace:"nowrap"}}>{s.ftm}-{s.fta}</td>
                            <td style={{textAlign:"center",padding:"5px 4px"}}>{s.ftPct}%</td>
                            <td style={{textAlign:"center",background:`rgba(99,102,241,${s.rating/90})`,padding:"5px 4px",fontWeight:700,color:"#c7d2fe"}}>{s.rating}</td>
                          </tr>
                        ))}
                        <tr style={{borderTop:"2px solid #1e293b",background:"#0d1626",fontWeight:800}}>
                          <td style={{padding:"5px 6px",color:acc}}>TEAM</td><td/><td/>
                          <td style={{textAlign:"center",color:acc}}>{stats.reduce((s,x)=>s+x.pts,0)}</td>
                          <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.ast,0)}</td>
                          <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.reb,0)}</td>
                          <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.stl,0)}</td>
                          <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.blk,0)}</td>
                          <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.tov,0)}</td>
                          <td style={{textAlign:"center",whiteSpace:"nowrap"}}>{stats.reduce((s,x)=>s+x.fgm,0)}-{stats.reduce((s,x)=>s+x.fga,0)}</td>
                          <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.fga,0)>0?rf(stats.reduce((s,x)=>s+x.fgm,0)/stats.reduce((s,x)=>s+x.fga,0)*100):0}%</td>
                          <td style={{textAlign:"center",whiteSpace:"nowrap"}}>{stats.reduce((s,x)=>s+x.tpm,0)}-{stats.reduce((s,x)=>s+x.tpa,0)}</td>
                          <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.tpa,0)>0?rf(stats.reduce((s,x)=>s+x.tpm,0)/stats.reduce((s,x)=>s+x.tpa,0)*100):0}%</td>
                          <td style={{textAlign:"center",whiteSpace:"nowrap"}}>{stats.reduce((s,x)=>s+x.ftm,0)}-{stats.reduce((s,x)=>s+x.fta,0)}</td>
                          <td style={{textAlign:"center"}}>{stats.reduce((s,x)=>s+x.fta,0)>0?rf(stats.reduce((s,x)=>s+x.ftm,0)/stats.reduce((s,x)=>s+x.fta,0)*100):0}%</td>
                          <td/>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <div style={{display:"flex",gap:10,justifyContent:"center",paddingBottom:16}}>
                {gameNum<SEASON_LENGTH?(
                  <button onClick={nextGame} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"12px 32px",fontSize:14,fontWeight:800,cursor:"pointer"}}>
                    ▶ NEXT GAME ({gameNum+1}/{SEASON_LENGTH})
                  </button>
                ):(
                  <button onClick={endSeason} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:10,padding:"12px 32px",fontSize:14,fontWeight:800,cursor:"pointer"}}>
                    🏆 VIEW SEASON RESULTS
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── DRAFT SCREEN ──────────────────────────────────────
  return(
    <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:14}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:900,background:"linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              💰 NBA BUDGET BALL <span style={{fontSize:11,color:"#475569",WebkitTextFillColor:"#475569"}}>v2.3</span>
            </h1>
            <div style={{fontSize:10,color:"#475569",marginTop:1}}>200 players · All eras · Budget ${BUDGET} · 10-game season</div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[["BUDGET",`$${rem}`,rem<15?"#ef4444":rem<30?"#f59e0b":"#22c55e"],["SPENT",`$${spent}`,"#94a3b8"],["RTG",myEffVal??"-","#a78bfa"],["CHEM",myCh>0?`+${myCh}`:"-","#f472b6"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center",background:"#0f172a",borderRadius:7,padding:"4px 10px",border:"1px solid #1e293b"}}>
                <div style={{fontSize:9,color:"#475569",letterSpacing:1}}>{l}</div>
                <div style={{fontSize:15,fontWeight:900,color:c}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{background:"#1e293b",borderRadius:4,height:5,marginBottom:12,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${Math.min((spent/BUDGET)*100,100)}%`,background:"linear-gradient(90deg,#3b82f6,#8b5cf6,#ec4899)",transition:"width 0.3s",borderRadius:4}}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"270px 1fr",gap:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #1e293b"}}>
              <div style={{fontWeight:800,fontSize:10,letterSpacing:2,color:"#60a5fa",marginBottom:8}}>YOUR STARTING 5</div>
              {POSITIONS.map(pos=>{
                const p=roster[pos];const m=p?posMult(p,pos):1;const tier=p?getTier(p.cost):null;const isActive=slotSel===pos;
                return(
                  <div key={pos} onClick={()=>!inSeason&&setSlotSel(slotSel===pos?null:pos)} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,background:isActive?"#1a2a0a":p?"#0d2137":"#080f1e",borderRadius:8,padding:"7px 8px",border:`1px solid ${isActive?"#84cc16":p?"#1d4ed8":"#1e293b"}`,cursor:inSeason?"default":"pointer"}}>
                    <div style={{width:24,height:24,borderRadius:5,background:isActive?"#365314":p?"#1e3a5f":"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:isActive?"#84cc16":"#60a5fa",flexShrink:0}}>{pos}</div>
                    {p?(
                      <>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                          <div style={{display:"flex",gap:3,marginTop:1}}>
                            <Tag label={tier.label} color={tier.color} bg={tier.bg}/>
                            {m<1&&<Tag label={`OOP ×${m}`} color="#fbbf24" bg="#78350f"/>}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:13,color:"#fbbf24",fontWeight:900}}>${p.cost}</div>
                          <div style={{fontSize:9,color:"#6366f1"}}>RTG {p.rating}</div>
                        </div>
                        {!inSeason&&<button onClick={e=>{e.stopPropagation();drop(pos);}} style={{background:"#7f1d1d",border:"none",borderRadius:4,color:"#fca5a5",fontSize:11,width:18,height:18,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>}
                      </>
                    ):(
                      <div style={{fontSize:10,color:isActive?"#84cc16":"#334155",fontStyle:"italic"}}>{isActive?`Picking for ${pos} →`:`Click to set ${pos} →`}</div>
                    )}
                  </div>
                );
              })}
              {myCh>0&&<div style={{fontSize:11,color:"#f472b6",textAlign:"center",margin:"4px 0",fontWeight:700}}>⚡ Chemistry Boost +{myCh}</div>}
              <button onClick={startSeason} disabled={!full||inSeason} style={{width:"100%",marginTop:4,background:full&&!inSeason?"linear-gradient(135deg,#f59e0b,#d97706)":"#1e293b",color:full&&!inSeason?"white":"#374151",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:800,cursor:full&&!inSeason?"pointer":"not-allowed",transition:"all 0.2s",boxShadow:full&&!inSeason?"0 4px 18px rgba(245,158,11,0.3)":"none"}}>
                {inSeason?"🔒 SEASON IN PROGRESS":full?"🏀 START 10-GAME SEASON":`${5-filled} SLOT${5-filled!==1?"S":""} REMAINING`}
              </button>
              {inSeason&&(
                <button onClick={()=>setPhase("game")} style={{width:"100%",marginTop:6,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                  ▶ BACK TO SEASON (Game {gameNum})
                </button>
              )}
            </div>

            {opp&&!inSeason&&(
              <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #1e293b"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontWeight:800,fontSize:10,letterSpacing:2,color:"#f87171"}}>NEXT OPPONENT</div>
                  <div style={{fontSize:10,color:"#f59e0b",fontWeight:700}}>RTG {oppEffVal}</div>
                </div>
                {opp.map(({player,slot})=>{const t=getTier(player.cost);return(
                  <div key={slot} style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,fontSize:11}}>
                    <span style={{width:22,fontSize:9,fontWeight:800,color:"#64748b"}}>{slot}</span>
                    <span style={{flex:1,color:"#cbd5e1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{player.name}</span>
                    <Tag label={t.label} color={t.color} bg={t.bg}/>
                    <span style={{color:"#fbbf24",fontSize:10,fontWeight:700,marginLeft:3}}>${player.cost}</span>
                  </div>
                );})}
                <button onClick={()=>setOpp(genOpp(myIds))} style={{width:"100%",marginTop:6,background:"#160d2a",color:"#a78bfa",border:"1px solid #4c1d95",borderRadius:6,padding:"6px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🎲 Reroll</button>
              </div>
            )}

            <div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #1e293b",fontSize:10,color:"#64748b"}}>
              <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
              <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
              <div style={{marginBottom:2}}>• Click <span style={{color:"#84cc16"}}>green slot</span> to place any position (OOP penalty)</div>
              <div style={{marginBottom:2}}>• Real teammates = ⚡ Chemistry boost</div>
              <div style={{marginBottom:2}}>• Win 6+ of 10 games to make playoffs</div>
              <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginTop:6,marginBottom:2}}>OOP PENALTIES</div>
              <div>Adjacent ×0.82 · Wrong ×0.65</div>
            </div>
          </div>

          <div>
            <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {["ALL",...POSITIONS].map(f=>(
                  <button key={f} onClick={()=>setPosF(f)} style={{background:posF===f?"#3b82f6":"#1e293b",color:posF===f?"white":"#94a3b8",border:"none",borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{f}</button>
                ))}
              </div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search player..." style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 10px",fontSize:11,color:"#e2e8f0",outline:"none",width:160}}/>
              <div style={{marginLeft:"auto",display:"flex",gap:3}}>
                {[["rating","RTG"],["cost","$"],["name","A–Z"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setSortBy(k)} style={{background:sortBy===k?"#4c1d95":"#1e293b",color:sortBy===k?"#c4b5fd":"#64748b",border:"none",borderRadius:5,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:6}}>
              {display.map(p=>{
                const inR=myIds.has(p.id);
                const targetSlot=slotSel||p.pos;
                const prev=roster[targetSlot];
                const delta=p.cost-(prev?.cost||0);
                const afford=delta<=rem;
                const tier=getTier(p.cost);
                const wouldOop=slotSel&&slotSel!==p.pos;
                const mult=slotSel?posMult(p,slotSel):1;
                return(
                  <div key={p.id} onClick={()=>!inR&&afford&&!inSeason&&pickPlayer(p)} style={{background:inR?"#0d2a0d":slotSel&&afford?"#131a2e":"#0f172a",border:`1px solid ${inR?"#22c55e":slotSel&&afford?"#6366f1":"#1e293b"}`,borderRadius:9,padding:9,cursor:inR||!afford||inSeason?"not-allowed":"pointer",opacity:(!afford&&!inR)||inSeason?0.45:1,transition:"all 0.12s"}}>
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
                    {!afford&&!inR&&<div style={{marginTop:4,fontSize:9,color:"#ef4444",textAlign:"center"}}>+${delta-rem} over</div>}
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