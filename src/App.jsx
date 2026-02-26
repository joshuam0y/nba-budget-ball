import "./index.css";
import { useState, useEffect, useCallback, useRef } from "react";
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from "@vercel/speed-insights/react"

const POSITIONS = ["PG","SG","SF","PF","C"];
const BUDGET = 140;
const SEASON_LENGTH = 11;
const TEAM_NAMES = [
  "Rim Wreckers","Bucket Getters","Paint Beasts","Corner Killers",
  "Iso Kings","Glass Eaters","Dime Dealers","Lock Legends",
  "Splash Bros","Hardwood Wolves","Night Shift",
];

function rf(n,d=1){return parseFloat((+n).toFixed(d));}
function ri(n){return Math.round(n);}
function clamp(v,mn,mx){return Math.max(mn,Math.min(mx,v));}
function gauss(s=1){const u=Math.max(1e-10,Math.random()),v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*s;}

function processCSV(text){
  const lines=text.trim().split("\n").filter(l=>l.trim());
  const headers=lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase());
  const idx=name=>headers.indexOf(name.toLowerCase());
  const get=(row,name)=>(row[idx(name)]||"").trim().replace(/^"|"$/g,"");
  const num=(row,name)=>parseFloat(get(row,name))||0;
  const players=[],seen=new Set(),teamRoster={};
  for(let i=1;i<lines.length;i++){
    const row=lines[i].split(",");
    if(row.length<10)continue;
    const name=get(row,"name"),fullName=get(row,"fullname"),pos=get(row,"pos"),season=get(row,"season"),tm=get(row,"tm").toUpperCase();
    if(!name||!season||!pos||tm==="TOT")continue;
    const key=`${name}|${season}|${tm}`;
    if(seen.has(key))continue;
    seen.add(key);
    const pts=num(row,"pts"),ast=num(row,"ast"),reb=num(row,"reb"),stl=num(row,"stl"),blk=num(row,"blk"),tov=num(row,"tov");
    const fg=num(row,"fg"),ts=num(row,"ts"),tR=num(row,"tr"),ftPct=num(row,"ftpct"),tpPct=num(row,"tppct");
    const rating=num(row,"rating"),cost=Math.min(40,Math.max(5,Math.round(num(row,"cost"))));
    if(pts<1||!rating)continue;
    players.push({name,fullName,pos,season,tm,pts,ast,reb,stl,blk,tov,fg,ts,tR,ftPct,tpPct,rating,cost});
    const rk=`${season}|${tm}`;
    if(!teamRoster[rk])teamRoster[rk]=[];
    teamRoster[rk].push(name);
  }
  if(players.length===0){console.error("No players parsed. Headers:",headers);return null;}
  console.log(`✓ Parsed ${players.length} players. Sample:`,players[0]);
  return{players:players.map((p,i)=>({...p,id:i+1})),teamRoster};
}

function chemBoost(lineup,teamRoster){
  if(!teamRoster)return 0;
  let boost=0;
  const counted=new Set();
  for(const rk of Object.keys(teamRoster)){
    if(!Array.isArray(teamRoster[rk]))continue;
    const roster=new Set(teamRoster[rk]);
    const matches=lineup.filter(({player})=>roster.has(player.name));
    if(matches.length>=2){
      const pairKey=`${rk}|${matches.map(m=>m.player.name).sort().join(",")}`;
      if(!counted.has(pairKey)){counted.add(pairKey);boost+=matches.length>=3?4:2;}
    }
  }
  return boost;
}

const ADJ={PG:["SG"],SG:["PG","SF"],SF:["SG","PF"],PF:["SF","C"],C:["PF"]};
function posMult(player,slot){
  if(player.pos===slot)return 1.0;
  if((getArchetype(player).id==="pmBig"||getArchetype(player).id==="stretch"||getArchetype(player).id==="rimProt"||getArchetype(player).id==="paint"||getArchetype(player).id==="glass")&&(slot==="PG"||slot==="SG"))return 0.45;
  if(ADJ[player.pos]?.includes(slot))return 0.82;
  return 0.65;
}
function teamEff(lineup,teamRoster){
  const base=lineup.reduce((s,{player,slot})=>s+player.rating*posMult(player,slot),0);
  return base+chemBoost(lineup,teamRoster)+(lineup.length===5?archetypeChemBonus(lineup):0);
}

function genLineup(excludeIds=new Set(),pool=[]){
  const used=new Set(excludeIds);const team=[];let rem=BUDGET;
  for(const pos of POSITIONS){
    const eligible=pool.filter(p=>p.pos===pos&&!used.has(p.id));
    const cands=eligible.length>0?eligible:pool.filter(p=>!used.has(p.id));
    if(!cands.length)continue;
    const avg=rem/Math.max(POSITIONS.length-team.length,1);
    const weights=cands.map(p=>Math.max(0.1,1-Math.abs(p.cost-avg)/Math.max(avg,1))*p.rating*(p.cost<=rem?1:0.05));
    const tot=weights.reduce((a,b)=>a+b,0);
    let r=Math.random()*tot,pick=cands[cands.length-1];
    for(let k=0;k<cands.length;k++){r-=weights[k];if(r<=0){pick=cands[k];break;}}
    team.push({player:pick,slot:pos});used.add(pick.id);rem-=pick.cost;
  }
  return team;
}

function generateLeague(myLineup,pool){
  const usedIds=new Set(myLineup.map(x=>x.player.id));
  const teams=[];
  for(let i=0;i<11;i++){
    const lineup=genLineup(usedIds,pool);
    lineup.forEach(x=>usedIds.add(x.player.id));
    teams.push({name:TEAM_NAMES[i],lineup,w:0,l:0,eff:rf(teamEff(lineup,null),1)});
  }
  return teams;
}

function gameVariance(rating){
  return clamp(1+gauss(0.28-clamp((rating-20)/Math.max(80,1),0,1)*0.10),0.30,1.90);
}
function quickSim(lineupA,lineupB,tr){
  const eA=teamEff(lineupA,tr),eB=teamEff(lineupB,tr);
  return Math.random()<clamp(eA/(eA+eB),0.40,0.60)?0:1;
}

function simulate(myLineup,oppLineup,teamRoster){
  const isPlayoffGame=!!teamRoster?._playoff;
  const myE=teamEff(myLineup,teamRoster),oppE=teamEff(oppLineup,teamRoster)*(isPlayoffGame?1.08:1.0);
  const isPlayoff=!!teamRoster?._playoff;
  const myOff=clamp(myE/(myE+oppE),isPlayoff?0.46:0.44,isPlayoff?0.54:0.56);
  const pace=Math.round((isPlayoff?90:96)+Math.random()*12);
  const myVar=myLineup.map(({player})=>gameVariance(player.rating));
  const oppVar=oppLineup.map(({player})=>gameVariance(player.rating));
  const mkStats=lineup=>lineup.map(({player,slot})=>({
    name:player.name,pos:slot,native:player.pos,oop:player.pos!==slot,cost:player.cost,min:48,
    pts:0,ast:0,reb:0,stl:0,blk:0,tov:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,
    rating:rf(player.rating*posMult(player,slot),1),gv:gameVariance(player.rating),
  }));
  const myStats=mkStats(myLineup),oppStats=mkStats(oppLineup);
  function wIdx(arr,wFn){
    const w=arr.map(wFn),t=w.reduce((a,b)=>a+b,0);
    if(t<=0)return 0;let r=Math.random()*t;
    for(let i=0;i<arr.length;i++){r-=w[i];if(r<=0)return i;}
    return arr.length-1;
  }
  for(let i=0;i<pace*2;i++){
    const isMy=i%2===0?Math.random()<(myOff+0.03):Math.random()<(myOff-0.03);
    const offS=isMy?myStats:oppStats,defS=isMy?oppStats:myStats;
    const offV=isMy?myVar:oppVar,offL=isMy?myLineup:oppLineup,defL=isMy?oppLineup:myLineup;
    const si=wIdx(offS,(_,j)=>Math.max(0.01,offL[j].player.rating*posMult(offL[j].player,offL[j].slot)*offV[j]));
    const shooter=offS[si],sp=offL[si].player,m=posMult(sp,offL[si].slot);
    const di=defL.findIndex(x=>x.slot===offL[si].slot),defIdx=di>=0?di:0;
    const defender=defS[defIdx],dp=defL[defIdx].player,dm=posMult(dp,defL[defIdx].slot);
    const is3=Math.random()<sp.tR*(0.75+Math.random()*0.5);
    const baseFg=sp.fg>0?sp.fg:44;
    const defArch=getArchetype(dp),offArch=getArchetype(sp);
    const scoreDiff=Math.abs(myStats.reduce((s,p)=>s+p.pts,0)-oppStats.reduce((s,p)=>s+p.pts,0));
    const isClutch=scoreDiff<=5&&i>pace*1.5;
    const clutchMult=isClutch?(offArch.id==="bucket"||offArch.id==="swiss"?1.08:offArch.id==="role"?0.92:1.0):1.0;
    const matchupMult=archetypeMatchupFactor(defArch,offArch);
    const defFactor=clamp((1-(dp.rating*dm-35)*0.002)*matchupMult,0.84,1.04);
    const base=is3?(sp.tpPct>0?sp.tpPct:baseFg*0.65):baseFg*(m*0.10+0.90);
    const archVar=offArch.id==="spotUp"?1.8:offArch.id==="role"?0.8:1.2;
    const fgPct=clamp(base*clutchMult+gauss(archVar),18,52)/100;
    const adjFg=clamp(fgPct*defFactor,0.44,0.72);
    const tovChance=clamp((sp.tov/40)*offV[si]*0.7/clutchMult,0.02,0.15);
    const blkChance=clamp(dp.blk*dm*0.04,0,0.12);
    if(Math.random()<tovChance){
      shooter.tov++;
      defS[wIdx(defS,(_,j)=>Math.max(0.01,defL[j].player.stl*posMult(defL[j].player,defL[j].slot)))].stl++;
    } else if(!is3&&Math.random()<blkChance){
      shooter.fga++;defender.blk++;
      const rebSide=Math.random()<0.80?defS:offS,rebL=Math.random()<0.80?defL:offL;
      rebSide[wIdx(rebSide,(_,j)=>Math.max(0.01,rebL[j].player.reb*posMult(rebL[j].player,rebL[j].slot)))].reb++;
    } else if(Math.random()<adjFg){
      shooter.fga++;shooter.fgm++;if(is3){shooter.tpa++;shooter.tpm++;}
      let pts=is3?3:2;
      if(Math.random()<(is3?0.08:0.32)){
        const ftPct=clamp((sp.ftPct>0?sp.ftPct/100:0.72)*(0.9+Math.random()*0.2)+gauss(0.04),0.40,0.98);
        const made=Math.random()<ftPct?1:0;pts+=made;shooter.fta++;shooter.ftm+=made;
      }
      shooter.pts+=pts;
      if(Math.random()<0.65)offS[wIdx(offS,(s,j)=>j===si?0:Math.max(0.01,offL[j].player.ast))].ast++;
    } else {
      shooter.fga++;if(is3)shooter.tpa++;
      if(!is3&&Math.random()<0.18){
        const fp=clamp((sp.ftPct>0?sp.ftPct/100:0.72)*(0.9+Math.random()*0.2)+gauss(0.04),0.40,0.98);
        const f1=Math.random()<fp?1:0,f2=Math.random()<fp?1:0;
        shooter.fta+=2;shooter.ftm+=f1+f2;shooter.pts+=f1+f2;
      }
      if(Math.random()<0.27)offS[wIdx(offS,(_,j)=>Math.max(0.01,offL[j].player.reb*posMult(offL[j].player,offL[j].slot)))].reb++;
      else defS[wIdx(defS,(_,j)=>Math.max(0.01,defL[j].player.reb*posMult(defL[j].player,defL[j].slot)))].reb++;
    }
  }
  const finalize=stats=>stats.map(s=>({...s,
    fgPct:s.fga>0?rf(s.fgm/s.fga*100):0,tpPct:s.tpa>0?rf(s.tpm/s.tpa*100):0,
    ftPct:s.fta>0?rf(s.ftm/s.fta*100):0,hotCold:s.gv>=1.40?"🔥":s.gv<=0.60?"🥶":"",
  }));
  let ms=myStats.reduce((s,p)=>s+p.pts,0),os=oppStats.reduce((s,p)=>s+p.pts,0),ot=0;
  while(ms===os){ot++;ms+=ri(5+Math.random()*15*myOff);os+=ri(5+Math.random()*15*(1-myOff));}
  return{myScore:ms,oppScore:os,ot,myStats:finalize(myStats),oppStats:finalize(oppStats),
    myEff:rf(myE,1),oppEff:rf(oppE,1),myChem:chemBoost(myLineup,teamRoster),oppChem:chemBoost(oppLineup,teamRoster)};
}

function addToSeason(season,gameStats,won,myScore,oppScore){
  const next={...season,players:{}};
  Object.entries(season.players).forEach(([k,v])=>next.players[k]={...v});
  next.gp++;if(won)next.w++;else next.l++;
  next.ptsFor+=myScore;next.ptsAgainst+=oppScore;
  gameStats.slice(0,5).forEach(s=>{
    if(!next.players[s.name])next.players[s.name]={pts:0,ast:0,reb:0,stl:0,blk:0,tov:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,gp:0};
    const p=next.players[s.name];
    p.pts+=s.pts;p.ast+=s.ast;p.reb+=s.reb;p.stl+=s.stl;p.blk+=s.blk;p.tov+=s.tov;
    p.fgm+=s.fgm;p.fga+=s.fga;p.tpm+=s.tpm;p.tpa+=s.tpa;p.ftm+=s.ftm;p.fta+=s.fta;p.gp++;
  });
  return next;
}
function emptySeason(){return{gp:0,w:0,l:0,ptsFor:0,ptsAgainst:0,players:{}};}

function simLeagueGames(aiTeams,tr){
  const records=aiTeams.map(t=>({...t,w:0,l:0,gameLog:[]}));
  const n=records.length,results={};
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)results[`${i}-${j}`]=quickSim(records[i].lineup,records[j].lineup,tr);
  for(let i=0;i<n;i++){
    const opps=[...Array(n).keys()].filter(x=>x!==i);
    for(let k=opps.length-1;k>0;k--){const r=Math.floor(Math.random()*(k+1));[opps[k],opps[r]]=[opps[r],opps[k]];}
    records[i].gameLog=opps.map(j=>{const key=i<j?`${i}-${j}`:`${j}-${i}`;return(i<j?results[key]===0:results[key]===1)?1:0;});
  }
  return records;
}
function getAiRecordsAtGame(aiTeams,g){
  return aiTeams.map(t=>{const games=t.gameLog.slice(0,g);const w=games.filter(x=>x===1).length;return{...t,w,l:games.length-w};});
}

function getTier(cost){
  if(cost>=35)return{label:"Elite",color:"#fbbf24",bg:"#78350f"};
  if(cost>=28)return{label:"Star",color:"#c084fc",bg:"#3b0764"};
  if(cost>=20)return{label:"Solid",color:"#60a5fa",bg:"#1e3a5f"};
  if(cost>=13)return{label:"Role",color:"#4ade80",bg:"#14532d"};
  if(cost>=8)return{label:"Bench",color:"#94a3b8",bg:"#1e293b"};
  return{label:"Filler",color:"#64748b",bg:"#0f172a"};
}
const SMAXES={pts:65,ast:20,reb:30,stl:7,blk:8,tov:10,fgPct:80,tpPct:55};
function cellBg(stat,val){const r=Math.min(val/(SMAXES[stat]||1),1);if(stat==="tov")return`rgba(239,68,68,${0.12+r*0.55})`;return`rgba(${ri(15+(1-r)*25)},${ri(100+r*120)},${ri(50+(1-r)*20)},${0.15+r*0.55})`;}
const Tag=({label,color,bg})=><span style={{fontSize:10,fontWeight:800,background:bg,color,borderRadius:4,padding:"1px 5px",whiteSpace:"nowrap"}}>{label}</span>;

function getArchetype(p){
  const isGuard=p.pos==="PG"||p.pos==="SG";
  const isWing=p.pos==="SF";
  const isBig=p.pos==="PF"||p.pos==="C";
  const isSwiss=p.pts>32&&p.ast>7&&p.reb>9&&p.fg>48;
  const isPmBig=isBig&&p.ast>6&&p.reb>10&&p.pts<42;
  const isRimProt=isBig&&((p.blk>2.2&&p.reb>10)||(p.blk>3.0&&p.reb>8));
  const isPaint=isBig&&p.reb>16&&p.tR<0.05;
  const isLockdown=p.stl>2.5&&(p.blk>1.0||p.pts<14);
  const is3D=p.tpPct>36&&p.tR>0.38&&(p.stl>1.5||p.blk>1.0)&&p.pts<24;
  const isFloorGeneral=p.ast>11&&p.pts<50;
  const isIsoScorer=isGuard&&p.pts>36&&p.ast<12;
  const isBucketGetter=(isGuard||isWing||isBig)&&p.pts>28&&p.ast<8&&p.reb<13;
  const isStretchBig=isBig&&p.tR>0.32&&p.tpPct>34&&p.reb>9&&p.pts>22;
  const isWingScorer=(isWing||p.pos==="SG")&&p.pts>22&&p.ast>=3&&p.reb>=3;
  const isScoringGuard=isGuard&&p.pts>26&&p.ast>=4;
  const isSpotUp=p.tR>0.45&&p.tpPct>37&&p.pts<32;
  const isMidrange=isBig&&p.pts>20&&p.tR<0.18&&p.fg>50;
  const isGlass=isBig&&p.reb>13&&p.blk<2.5&&p.pts<38;
  const isPlaymaker=p.ast>9&&p.pts<30;
  if(isSwiss)return{label:"SWISS ARMY KNIFE",color:"#f472b6",id:"swiss"};
  if(isPmBig)return{label:"PLAYMAKING BIG",color:"#a78bfa",id:"pmBig"};
  if(isRimProt)return{label:"RIM PROTECTOR",color:"#60a5fa",id:"rimProt"};
  if(isPaint)return{label:"PAINT MONSTER",color:"#4ade80",id:"paint"};
  if(isLockdown)return{label:"LOCKDOWN",color:"#f87171",id:"lockdown"};
  if(is3D)return{label:"3&D",color:"#34d399",id:"threeD"};
  if(isFloorGeneral)return{label:"FLOOR GENERAL",color:"#fbbf24",id:"fg"};
  if(isIsoScorer)return{label:"ISO SCORER",color:"#fb923c",id:"iso"};
  if(isBucketGetter)return{label:"BUCKET GETTER",color:"#f97316",id:"bucket"};
  if(isStretchBig)return{label:"STRETCH BIG",color:"#67e8f9",id:"stretch"};
  if(isWingScorer)return{label:"WING SCORER",color:"#e879f9",id:"wing"};
  if(isScoringGuard)return{label:"SCORING GUARD",color:"#a78bfa",id:"scoringGuard"};
  if(isSpotUp)return{label:"SPOT UP SHOOTER",color:"#38bdf8",id:"spotUp"};
  if(isMidrange)return{label:"MIDRANGE ARTIST",color:"#c084fc",id:"midrange"};
  if(isGlass)return{label:"GLASS CLEANER",color:"#86efac",id:"glass"};
  if(isPlaymaker)return{label:"PLAYMAKER",color:"#fbbf24",id:"playmaker"};
  return{label:"ROLE PLAYER",color:"#94a3b8",id:"role"};
}
function archetypeMatchupFactor(defArch,offArch){
  const b={
    lockdown:{iso:0.87,bucket:0.88,wing:0.90,swiss:0.91,scoringGuard:0.89},
    rimProt:{paint:0.84,glass:0.82,pmBig:0.87,stretch:0.88},
    threeD:{spotUp:0.90,iso:0.92,wing:0.92,scoringGuard:0.91},
    fg:{playmaker:0.90,swiss:0.93},
  };
  return b[defArch.id]?.[offArch.id]||1.0;
}
function archetypeChemBonus(lineup){
  const archs=lineup.map(({player})=>getArchetype(player).id);
  let bonus=0;
  if(archs.includes("fg")&&archs.includes("spotUp"))bonus+=3;
  if(archs.includes("fg")&&(archs.includes("iso")||archs.includes("bucket")||archs.includes("scoringGuard")))bonus+=2;
  if(archs.includes("rimProt")&&archs.includes("lockdown"))bonus+=3;
  if(archs.includes("swiss"))bonus+=1;
  if(archs.includes("pmBig")&&(archs.includes("spotUp")||archs.includes("stretch")))bonus+=2;
  if(archs.includes("threeD")&&(archs.includes("iso")||archs.includes("bucket")||archs.includes("scoringGuard")))bonus+=2;
  if(archs.includes("playmaker")&&(archs.includes("wing")||archs.includes("scoringGuard")))bonus+=2;
  if(archs.includes("fg")&&archs.includes("wing"))bonus+=2;
  const isoCount=archs.filter(a=>["iso","bucket","scoringGuard"].includes(a)).length;
  if(isoCount>=3)bonus-=4;else if(isoCount>=2)bonus-=1;
  return bonus;
}
function getTeamBalance(lineup){
  if(!lineup)return null;
  const archs=lineup.map(({player})=>getArchetype(player).id);
  const unique=new Set(archs).size;
  const hasBig=archs.some(a=>["rimProt","paint","glass","pmBig","stretch","swiss"].includes(a))||lineup.some(({player})=>player.pos==="C"||player.pos==="PF");
  const hasPlaymaker=archs.some(a=>["fg","playmaker","swiss","pmBig","scoringGuard"].includes(a));
  const hasDefense=archs.some(a=>["lockdown","threeD","rimProt"].includes(a));
  const hasScoring=archs.some(a=>["iso","bucket","wing","spotUp","midrange","swiss","stretch","scoringGuard"].includes(a));
  const isoCount=archs.filter(a=>["iso","bucket","scoringGuard"].includes(a)).length;
  let score=0;
  if(unique>=4)score+=2;else if(unique>=3)score+=1;
  if(hasBig)score+=1;if(hasPlaymaker)score+=1;if(hasDefense)score+=1;if(hasScoring)score+=1;
  if(isoCount>=3)score-=3;else if(isoCount>=2)score-=1;
  const grade=score>=6?"A+":score>=5?"A":score>=4?"B+":score>=3?"B":score>=2?"C":"D";
  const color=score>=5?"#22c55e":score>=3?"#fbbf24":"#ef4444";
  const missing=[];
  if(!hasBig)missing.push("Big Man");if(!hasPlaymaker)missing.push("Playmaker");
  if(!hasDefense)missing.push("Defender");if(!hasScoring)missing.push("Scorer");
  return{grade,color,score,missing,archetypeBonus:archetypeChemBonus(lineup)};
}

function BoxScore({stats,acc,label}){
  return(
    <div style={{marginBottom:10,background:"#0f172a",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b"}}>
      <div style={{padding:"7px 14px",background:"#1e293b",fontWeight:800,fontSize:11,letterSpacing:2,color:acc}}>{label}</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:700}}>
          <thead><tr style={{borderBottom:"1px solid #1e293b"}}>
            {[["PLAYER","left"],["POS","c"],["PTS","c"],["REB","c"],["AST","c"],["STL","c"],["BLK","c"],["TOV","c"],["FGM-A","c"],["FG%","c"],["3PM-A","c"],["3P%","c"],["FTM-A","c"],["FT%","c"],["RTG","c"]].map(([h,a])=>(
              <th key={h} style={{padding:"5px 6px",textAlign:a==="c"?"center":"left",color:"#475569",fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {stats.map((s,i)=>(
              <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                <td style={{padding:"5px 6px",fontWeight:700,whiteSpace:"nowrap"}}>{s.hotCold&&<span style={{marginRight:3}}>{s.hotCold}</span>}{s.name}{s.oop&&<span style={{marginLeft:4,fontSize:9,background:"#78350f",color:"#fbbf24",borderRadius:3,padding:"1px 3px"}}>OOP</span>}</td>
                <td style={{textAlign:"center",color:"#64748b"}}>{s.pos}</td>
                <td style={{textAlign:"center",background:cellBg("pts",s.pts),fontWeight:700,padding:"5px 4px"}}>{s.pts}</td>
                <td style={{textAlign:"center",background:cellBg("reb",s.reb),padding:"5px 4px"}}>{s.reb}</td>
                <td style={{textAlign:"center",background:cellBg("ast",s.ast),padding:"5px 4px"}}>{s.ast}</td>
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
              <td style={{padding:"5px 6px",color:acc}}>TEAM</td><td/>
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
  );
}

function StandingsTable({aiTeams,myRecord,myName,highlight}){
  const all=[
    {name:myName,w:myRecord.w,l:myRecord.l,eff:myRecord.eff||0,isPlayer:true},
    ...aiTeams.map(t=>({name:t.name,w:t.w,l:t.l,eff:t.eff,isPlayer:false}))
  ].sort((a,b)=>b.w-a.w||(b.eff-a.eff));
  return(
    <div style={{background:"#0f172a",borderRadius:10,overflow:"hidden",border:"1px solid #1e293b"}}>
      <div style={{padding:"8px 12px",background:"#1e293b",fontWeight:800,fontSize:10,letterSpacing:2,color:"#60a5fa"}}>🏆 LEAGUE STANDINGS</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead><tr style={{borderBottom:"1px solid #1e293b"}}>
          {[["#","c"],["TEAM","left"],["W","c"],["L","c"],["PCT","c"],["RTG","c"]].map(([h,a])=>(
            <th key={h} style={{padding:"5px 8px",textAlign:a==="c"?"center":"left",color:"#475569",fontSize:10}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {all.map((t,i)=>{
            const pct=t.w+t.l>0?rf(t.w/(t.w+t.l)*100,1):0,isHL=highlight&&t.isPlayer;
            return(
              <tr key={t.name} style={{borderBottom:"1px solid #0d1626",background:isHL?"#0d2137":i%2===0?"#080f1e":"#0a1221"}}>
                <td style={{textAlign:"center",padding:"5px 8px",color:i<6?"#22c55e":i<10?"#f59e0b":"#475569",fontWeight:800}}>{i+1}</td>
                <td style={{padding:"5px 8px",fontWeight:700,color:t.isPlayer?"#60a5fa":"#e2e8f0"}}>
                  {t.isPlayer?"🌟 ":""}{t.name}
                  {i===5&&<span style={{marginLeft:4,fontSize:9,background:"#14532d",color:"#4ade80",borderRadius:3,padding:"1px 4px"}}>6 SEED</span>}
                  {(i===6||i===7)&&<span style={{marginLeft:4,fontSize:9,background:"#78350f",color:"#fbbf24",borderRadius:3,padding:"1px 4px"}}>PLAY-IN</span>}
                  {(i===8||i===9)&&<span style={{marginLeft:4,fontSize:9,background:"#3b0764",color:"#c084fc",borderRadius:3,padding:"1px 4px"}}>PLAY-IN</span>}
                  {i===10&&<span style={{marginLeft:4,fontSize:9,background:"#7f1d1d",color:"#fca5a5",borderRadius:3,padding:"1px 4px"}}>OUT</span>}
                </td>
                <td style={{textAlign:"center",color:"#22c55e",fontWeight:700}}>{t.w}</td>
                <td style={{textAlign:"center",color:"#f87171"}}>{t.l}</td>
                <td style={{textAlign:"center"}}>{pct}%</td>
                <td style={{textAlign:"center",color:"#a78bfa"}}>{rf(t.eff,0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{padding:"6px 12px",borderTop:"2px dashed #1e293b",fontSize:9,color:"#22c55e"}}>▲ Top 6 direct · 7-10 play-in tournament</div>
    </div>
  );
}

function buildBracket(seeds){
  return{
    playIn:[
      {id:"pi1",top:seeds[6],bot:seeds[7],winner:null,games:[],label:"7 vs 8 — winner gets 7 seed"},
      {id:"pi2",top:seeds[8],bot:seeds[9],winner:null,games:[],label:"9 vs 10 — loser eliminated"},
      {id:"pi3",top:null,bot:null,winner:null,games:[],label:"Loser(7v8) vs Winner(9v10) — 8 seed"},
    ],
    firstRound:[
      {id:"fr1",top:seeds[0],bot:null,winner:null,games:[],label:"(1) vs (8)"},
      {id:"fr2",top:seeds[1],bot:null,winner:null,games:[],label:"(2) vs (7)"},
      {id:"fr3",top:seeds[2],bot:seeds[5],winner:null,games:[],label:"(3) vs (6)"},
      {id:"fr4",top:seeds[3],bot:seeds[4],winner:null,games:[],label:"(4) vs (5)"},
    ],
    semis:[
      {id:"sf1",top:null,bot:null,winner:null,games:[],label:"W(1v8) vs W(4v5)"},
      {id:"sf2",top:null,bot:null,winner:null,games:[],label:"W(2v7) vs W(3v6)"},
    ],
    finals:{id:"f1",top:null,bot:null,winner:null,games:[],label:"FINALS"},
    champion:null,
  };
}

function BracketDisplay({bracket,onPlayMatch}){
  const{playIn,firstRound,semis,finals,champion}=bracket;
  const MatchupCard=({matchup,onPlay,isActive})=>{
    const{top,bot,winner,games,label}=matchup;
    const wA=games.filter(g=>g.winnerIdx===0).length,wB=games.filter(g=>g.winnerIdx===1).length,done=!!winner;
    return(
      <div style={{background:"#0f172a",border:`1px solid ${done?"#22c55e":isActive?"#6366f1":"#1e293b"}`,borderRadius:10,padding:10,minWidth:190}}>
        <div style={{fontSize:9,color:"#475569",letterSpacing:1,marginBottom:6,fontWeight:700}}>{label}</div>
        {[top,bot].map((team,ti)=>{
          const isW=winner?.name===team?.name,wins=ti===0?wA:wB;
          return team?(
            <div key={ti} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,padding:"5px 8px",borderRadius:6,background:isW?"#14532d":done&&!isW?"#1a0a0a":"#1e293b",border:`1px solid ${isW?"#22c55e":done&&!isW?"#3f0d0d":"#334155"}`}}>
              <div style={{flex:1,fontSize:11,fontWeight:800,color:team.isPlayer?"#60a5fa":"#e2e8f0"}}>{team.isPlayer?"🌟 ":""}{team.name}</div>
              {games.length>0&&<div style={{fontSize:12,fontWeight:900,color:isW?"#22c55e":"#94a3b8"}}>{wins}</div>}
              {isW&&<span style={{fontSize:10}}>✓</span>}
            </div>
          ):(
            <div key={ti} style={{marginBottom:4,padding:"5px 8px",borderRadius:6,background:"#0a0a0f",border:"1px dashed #1e293b"}}>
              <div style={{fontSize:10,color:"#334155",fontStyle:"italic"}}>TBD</div>
            </div>
          );
        })}
        {isActive&&!done&&top&&bot&&(
          <button onClick={onPlay} style={{width:"100%",marginTop:6,background:top?.isPlayer||bot?.isPlayer?"linear-gradient(135deg,#6366f1,#8b5cf6)":"linear-gradient(135deg,#475569,#334155)",color:"white",border:"none",borderRadius:6,padding:"6px",fontSize:11,fontWeight:800,cursor:"pointer"}}>
            {top?.isPlayer||bot?.isPlayer?`▶ PLAY GAME ${games.length+1}`:`⚡ SIM GAME ${games.length+1}`}
          </button>
        )}
        {done&&<div style={{textAlign:"center",fontSize:10,color:"#22c55e",marginTop:4,fontWeight:700}}>✓ DONE</div>}
      </div>
    );
  };
  const pi1done=!!playIn[0].winner,pi2done=!!playIn[1].winner,pi3done=!!playIn[2].winner,playInDone=pi1done&&pi2done&&pi3done;
  const fr1done=!!firstRound[0].winner,fr2done=!!firstRound[1].winner,fr3done=!!firstRound[2].winner,fr4done=!!firstRound[3].winner;
  const sf1done=!!semis[0].winner,sf2done=!!semis[1].winner,fdone=!!finals.winner;
  const activeMatch=!pi1done?"pi1":!pi2done?"pi2":!pi3done?"pi3":!fdone?"f1":null;
  return(
    <div style={{background:"#080f1e",borderRadius:14,padding:14,border:"1px solid #1e293b"}}>
      <div style={{fontWeight:900,fontSize:13,color:"#f59e0b",letterSpacing:2,marginBottom:12,textAlign:"center"}}>🏀 PLAYOFF BRACKET</div>
      <div style={{marginBottom:12,background:"#0a0f1a",borderRadius:10,padding:10,border:"1px solid #f59e0b44"}}>
        <div style={{fontSize:9,color:"#f59e0b",fontWeight:800,letterSpacing:2,marginBottom:8,textAlign:"center"}}>🎟 PLAY-IN TOURNAMENT</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
          <MatchupCard matchup={playIn[0]} isActive={activeMatch==="pi1"} onPlay={()=>onPlayMatch("pi1")}/>
          <MatchupCard matchup={playIn[1]} isActive={activeMatch==="pi2"} onPlay={()=>onPlayMatch("pi2")}/>
          <MatchupCard matchup={playIn[2]} isActive={activeMatch==="pi3"} onPlay={()=>onPlayMatch("pi3")}/>
        </div>
      </div>
      {playInDone&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 16px 1fr 16px 1fr",gap:4,alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:9,color:"#475569",letterSpacing:1,textAlign:"center",marginBottom:4}}>FIRST ROUND</div>
            <MatchupCard matchup={firstRound[0]} isActive={!fr1done} onPlay={()=>onPlayMatch("fr1")}/>
            <MatchupCard matchup={firstRound[1]} isActive={!fr2done} onPlay={()=>onPlayMatch("fr2")}/>
            <MatchupCard matchup={firstRound[2]} isActive={!fr3done} onPlay={()=>onPlayMatch("fr3")}/>
            <MatchupCard matchup={firstRound[3]} isActive={!fr4done} onPlay={()=>onPlayMatch("fr4")}/>
          </div>
          <div style={{textAlign:"center",color:"#1e293b",fontSize:16,paddingTop:40}}>→</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:9,color:"#475569",letterSpacing:1,textAlign:"center",marginBottom:4}}>SEMIFINALS</div>
            <MatchupCard matchup={semis[0]} isActive={!sf1done} onPlay={()=>onPlayMatch("sf1")}/>
            <MatchupCard matchup={semis[1]} isActive={!sf2done} onPlay={()=>onPlayMatch("sf2")}/>
          </div>
          <div style={{textAlign:"center",color:"#1e293b",fontSize:16,paddingTop:40}}>→</div>
          <div>
            <div style={{fontSize:9,color:"#f59e0b",letterSpacing:1,textAlign:"center",marginBottom:4}}>🏆 FINALS</div>
            <MatchupCard matchup={finals} isActive={!fdone} onPlay={()=>onPlayMatch("f1")}/>
            {champion&&(
              <div style={{marginTop:10,textAlign:"center",padding:"10px",background:"linear-gradient(135deg,#78350f,#92400e)",borderRadius:10,border:"2px solid #fbbf24"}}>
                <div style={{fontSize:18}}>🏆</div>
                <div style={{fontSize:11,color:"#fbbf24",fontWeight:900,letterSpacing:1}}>CHAMPION</div>
                <div style={{fontSize:15,fontWeight:900,color:champion.isPlayer?"#60a5fa":"#e2e8f0"}}>{champion.isPlayer?"🌟 ":""}{champion.name}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App(){
  const [phase,setPhase]=useState("import");
  const [playerPool,setPlayerPool]=useState([]);
  const [teamRoster,setTeamRoster]=useState(null);
  const [importErr,setImportErr]=useState("");
  const [importInfo,setImportInfo]=useState("");
  const [roster,setRoster]=useState({PG:null,SG:null,SF:null,PF:null,C:null});
  const [slotSel,setSlotSel]=useState(null);
  const [aiTeams,setAiTeams]=useState([]);
  const [schedIdx,setSchedIdx]=useState(0);
  const [result,setResult]=useState(null);
  const [season,setSeason]=useState(emptySeason());
  const [gameNum,setGameNum]=useState(1);
  const [posF,setPosF]=useState("ALL");
  const [sortBy,setSortBy]=useState("rating");
  const [search,setSearch]=useState("");
  const [archF,setArchF]=useState("ALL");
  const [yearF,setYearF]=useState("ALL");
  const [teamF,setTeamF]=useState("ALL");
  const [inSeason,setInSeason]=useState(false);
  const [bracket,setBracket]=useState(null);
  const [playoffResult,setPlayoffResult]=useState(null);
  const [activeMatchId,setActiveMatchId]=useState(null);
  const [showStandings,setShowStandings]=useState(false);
  const [elimInPlayoffs,setElimInPlayoffs]=useState(false);


const audioRef = useRef(null);
const trackIndex = useRef(0);
const hasStarted = useRef(false);

const TRACKS = ['cold.mp3','lemonade.mp3', 'outstanding.mp3', 'amazing.mp3', 'bestfriend.mp3', 'baddecisions.mp3'];

const playTrack = (index) => {
  const audio = audioRef.current;
  if(!audio) return;
  audio.src = TRACKS[index];
  audio.play().catch(() => {});
};

useEffect(() => {
  const audio = new Audio();
  audio.volume = 0.3;
  audioRef.current = audio;

  audio.addEventListener('ended', () => {
    trackIndex.current = Math.floor(Math.random() * TRACKS.length);
    playTrack(trackIndex.current);
  });

  return () => { audio.pause(); audio.src = ''; };
}, []);

const skipSong = (e) => {
  e?.stopPropagation();
  e?.preventDefault();
  trackIndex.current = Math.floor(Math.random() * TRACKS.length);
  playTrack(trackIndex.current);
};

const handleFirstClick = useCallback(() => {
  if(hasStarted.current) return;
  hasStarted.current = true;
  playTrack(trackIndex.current)
}, []);

const skipBtn = (
  <button
    onMouseDown={(e) => { e.stopPropagation(); }}
    onClick={(e) => { e.stopPropagation(); e.preventDefault(); skipSong(e); }}
    style={{position:"fixed",bottom:16,right:16,zIndex:9999,background:"#1e293b",border:"1px solid #334155",borderRadius:"50%",width:36,height:36,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>
    ⏭
  </button>
);

const volumeSlider = (
  <div style={{position:"fixed",bottom:60,right:10,zIndex:9999,display:"flex",alignItems:"center",gap:6,background:"#1e293b",border:"1px solid #334155",borderRadius:20,padding:"4px 10px",boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>
    <span style={{fontSize:11}}>🔊</span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      defaultValue="0.3"
      onChange={(e) => { if(audioRef.current) audioRef.current.volume = parseFloat(e.target.value); }}
      style={{width:60,accentColor:"#6366f1",cursor:"pointer"}}
    />
  </div>
);

  const myIds=new Set(Object.values(roster).filter(Boolean).map(p=>p.id));
  const spent=Object.values(roster).reduce((s,p)=>s+(p?.cost||0),0);
  const rem=BUDGET-spent,filled=POSITIONS.filter(p=>roster[p]).length,full=filled===5;
  const myLineup=full?POSITIONS.map(pos=>({player:roster[pos],slot:pos})):null;
  const myEffVal=myLineup?rf(teamEff(myLineup,teamRoster),1):null;
  const myCh=myLineup?chemBoost(myLineup,teamRoster):0;
  const myRecord={w:season.w,l:season.l,eff:myEffVal||0};

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
      setTimeout(()=>setPhase("draft"),600);
    }).catch(err=>{setImportErr(err.message);setImportInfo("");});
  },[]);

  const pickPlayer=useCallback((player)=>{
    if(inSeason)return;
    const targetSlot=slotSel||player.pos,prev=roster[targetSlot];
    if((player.cost-(prev?.cost||0))>rem)return;
    setRoster(r=>({...r,[targetSlot]:player}));setSlotSel(null);
  },[roster,rem,slotSel,inSeason]);

  const drop=slot=>{if(inSeason)return;setRoster(r=>({...r,[slot]:null}));if(slotSel===slot)setSlotSel(null);};

  const startSeason=()=>{
    if(!full)return;
    const teams=generateLeague(myLineup,playerPool),simmed=simLeagueGames(teams,teamRoster);
    setAiTeams(simmed);setInSeason(true);setSeason(emptySeason());setGameNum(1);setSchedIdx(0);
    setResult(null);setPhase("game");setBracket(null);setPlayoffResult(null);setElimInPlayoffs(false);
  };

  const playGame=()=>{
    if(!full||schedIdx>=aiTeams.length)return;
    const opp=aiTeams[schedIdx];
    const res=simulate(myLineup,opp.lineup,teamRoster);
    const won=res.myScore>res.oppScore;
    const uniqueStats=[...new Map(res.myStats.map(s=>[s.name,s])).values()];
    setSeason(s=>addToSeason(s,uniqueStats,won,res.myScore,res.oppScore));
    setAiTeams(teams=>teams.map((t,i)=>i===schedIdx?{...t,playerResult:won?'L':'W'}:t));
    setResult(res);
  };

  const nextGame=()=>{
    if(gameNum>=SEASON_LENGTH){setPhase("seasonEnd");return;}
    setGameNum(g=>g+1);setSchedIdx(i=>i+1);setResult(null);
  };

  const buildPlayoffBracket=(finalSeason,finalAi)=>{
    const all=[
      {name:"Your Team",w:finalSeason.w,l:SEASON_LENGTH-finalSeason.w,eff:myEffVal||0,lineup:myLineup,isPlayer:true},
      ...finalAi.map(t=>({...t,isPlayer:false}))
    ].sort((a,b)=>b.w-a.w||(b.eff-a.eff));
    setBracket(buildBracket(all.slice(0,10).map((t,i)=>({...t,seed:i+1}))));
    setPhase("playoffs");setPlayoffResult(null);setActiveMatchId(null);setElimInPlayoffs(false);
  };

  const playPlayoffGame=(matchId)=>{
    if(!bracket)return;
    const b=JSON.parse(JSON.stringify(bracket));
    let matchup=
      matchId==="pi1"?b.playIn[0]:matchId==="pi2"?b.playIn[1]:matchId==="pi3"?b.playIn[2]:
      matchId==="fr1"?b.firstRound[0]:matchId==="fr2"?b.firstRound[1]:matchId==="fr3"?b.firstRound[2]:matchId==="fr4"?b.firstRound[3]:
      matchId==="sf1"?b.semis[0]:matchId==="sf2"?b.semis[1]:b.finals;
    if(!matchup||matchup.winner)return;
    const topIsPlayer=matchup.top?.isPlayer,botIsPlayer=matchup.bot?.isPlayer;
    let res=null,winnerIdx;
    if(topIsPlayer||botIsPlayer){
      const pTop=topIsPlayer;
      res=simulate(myLineup,pTop?matchup.bot.lineup:matchup.top.lineup,{...teamRoster,_playoff:true});
      winnerIdx=(res.myScore>res.oppScore)?(pTop?0:1):(pTop?1:0);
    } else {
      winnerIdx=quickSim(matchup.top.lineup,matchup.bot.lineup,teamRoster);
    }
    matchup.games.push({winnerIdx,myScore:res?.myScore,oppScore:res?.oppScore,res});
    const wTop=matchup.games.filter(g=>g.winnerIdx===0).length,wBot=matchup.games.filter(g=>g.winnerIdx===1).length;
    if(wTop===1||wBot===1){
      matchup.winner=wTop===1?matchup.top:matchup.bot;
      const w=matchup.winner;
      const pElim=(topIsPlayer&&wBot===1)||(botIsPlayer&&wTop===1);
      if(pElim)setElimInPlayoffs(true);
      if(matchId==="pi1"){b.firstRound[1].bot=w;b.playIn[2].top=wTop===1?b.playIn[0].bot:b.playIn[0].top;}
      else if(matchId==="pi2")b.playIn[2].bot=w;
      else if(matchId==="pi3")b.firstRound[0].bot=w;
      else if(matchId==="fr1")b.semis[0].top=w;
      else if(matchId==="fr2")b.semis[0].bot=w;
      else if(matchId==="fr3")b.semis[1].top=w;
      else if(matchId==="fr4")b.semis[1].bot=w;
      else if(matchId==="sf1")b.finals.top=w;
      else if(matchId==="sf2")b.finals.bot=w;
      else if(matchId==="f1"){b.finals.winner=w;b.champion=w;}
    }
    setBracket(b);
    setPlayoffResult(res
      ?{...res,playerIsTop:topIsPlayer,matchId,seriesOver:!!matchup.winner,winner:matchup.winner,topName:matchup.top.name,botName:matchup.bot.name}
      :{aiOnly:true,matchId,seriesOver:!!matchup.winner,winner:matchup.winner,topName:matchup.top?.name,botName:matchup.bot?.name});
  };

  const newSeason=()=>{
    setInSeason(false);setSeason(emptySeason());setGameNum(1);setSchedIdx(0);
    setResult(null);setPhase("draft");setBracket(null);setPlayoffResult(null);setAiTeams([]);setElimInPlayoffs(false);
    setRoster({PG:null,SG:null,SF:null,PF:null,C:null});setImportInfo("");setImportErr("");
  };

  if(phase==="import") return(
    <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{maxWidth:400,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>💰</div>
        <h1 style={{margin:"0 0 6px",fontSize:28,fontWeight:900,background:"linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>NBA BUDGET BALL</h1>
        <div style={{fontSize:12,color:"#475569",marginBottom:32}}>v2.5 · All eras · CSV-powered</div>
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
    const finalAiRec=aiTeams.map(t=>{
      const gW=t.gameLog.filter(x=>x===1).length,gL=t.gameLog.length-gW;
      const pW=t.playerResult==='W'?1:0,pL=t.playerResult==='L'?1:0;
      return{...t,w:gW+pW,l:gL+pL};
    });
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        {volumeSlider}{skipBtn}
        
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <h2 style={{margin:0,fontSize:18,fontWeight:900,color:"#f59e0b"}}>🏆 PLAYOFFS</h2>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setShowStandings(s=>!s)} style={{background:"#1e293b",color:"#60a5fa",border:"1px solid #334155",borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{showStandings?"Hide":"Show"} Standings</button>
              {champion&&<button onClick={newSeason} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:7,padding:"5px 14px",fontSize:11,fontWeight:800,cursor:"pointer"}}>🔄 New Season</button>}
            </div>
          </div>
          {showStandings&&<div style={{marginBottom:12}}><StandingsTable aiTeams={finalAiRec} myRecord={myRecord} myName="Your Team" highlight/></div>}
          {champion&&(
            <div style={{textAlign:"center",padding:16,background:playerWon?"linear-gradient(135deg,#78350f,#92400e)":"#0f172a",borderRadius:16,border:`2px solid ${playerWon?"#fbbf24":"#475569"}`,marginBottom:12}}>
              <div style={{fontSize:36}}>{playerWon?"🏆":"👑"}</div>
              <div style={{fontSize:22,fontWeight:900,color:playerWon?"#fbbf24":"#e2e8f0",letterSpacing:2}}>{playerWon?"YOU ARE CHAMPIONS!":champion.name+" WIN THE CHAMPIONSHIP!"}</div>
            </div>
          )}
          {elimInPlayoffs&&!champion&&(
            <div style={{textAlign:"center",padding:12,background:"#1a0a0a",borderRadius:12,border:"2px solid #ef4444",marginBottom:12}}>
              <div style={{fontSize:24}}>💀</div><div style={{fontSize:16,fontWeight:900,color:"#ef4444"}}>YOUR SEASON IS OVER</div>
            </div>
          )}
          <BracketDisplay bracket={bracket} onPlayMatch={id=>{setActiveMatchId(id);setPlayoffResult(null);playPlayoffGame(id);}}/>
          {activeMatchId&&(()=>{
            const matchup=
              activeMatchId==="pi1"?bracket.playIn[0]:activeMatchId==="pi2"?bracket.playIn[1]:activeMatchId==="pi3"?bracket.playIn[2]:
              activeMatchId==="fr1"?bracket.firstRound[0]:activeMatchId==="fr2"?bracket.firstRound[1]:activeMatchId==="fr3"?bracket.firstRound[2]:activeMatchId==="fr4"?bracket.firstRound[3]:
              activeMatchId==="sf1"?bracket.semis[0]:activeMatchId==="sf2"?bracket.semis[1]:bracket.finals;
            if(!matchup)return null;
            const wT=matchup.games.filter(g=>g.winnerIdx===0).length,wB=matchup.games.filter(g=>g.winnerIdx===1).length;
            const done=!!matchup.winner,pInv=matchup.top?.isPlayer||matchup.bot?.isPlayer;
            return(
              <div style={{marginTop:12}}>
                <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #334155",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{fontWeight:800,fontSize:13,color:"#a78bfa"}}>{matchup.label}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>Series: {matchup.top?.name} {wT}–{wB} {matchup.bot?.name}</div>
                  </div>
                  {!done&&pInv&&<button onClick={()=>playPlayoffGame(activeMatchId)} style={{marginTop:8,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:8,padding:"9px 24px",fontSize:13,fontWeight:800,cursor:"pointer"}}>▶ Play Game {matchup.games.length+1}</button>}
                  {!done&&!pInv&&<button onClick={()=>playPlayoffGame(activeMatchId)} style={{marginTop:8,background:"linear-gradient(135deg,#475569,#334155)",color:"white",border:"none",borderRadius:8,padding:"9px 24px",fontSize:13,fontWeight:800,cursor:"pointer"}}>⚡ Sim Game {matchup.games.length+1}</button>}
                  {done&&<div style={{marginTop:8,fontSize:12,color:"#22c55e",fontWeight:700}}>✓ {matchup.winner?.name} advance</div>}
                </div>
                {playoffResult&&!playoffResult.aiOnly&&playoffResult.matchId===activeMatchId&&(()=>{
                  const pr=playoffResult,pTop=pr.playerIsTop;
                  const myS=pr.myStats,oppS=pr.oppStats;
                  const myScore=pr.myScore,oppScore=pr.oppScore,won=myScore>oppScore;
                  return(<>
                    <div style={{textAlign:"center",padding:"12px",background:"#0f172a",borderRadius:12,border:`1px solid ${won?"#22c55e":"#ef4444"}`,marginBottom:10}}>
                      <div style={{fontSize:20,fontWeight:900,color:won?"#22c55e":"#ef4444"}}>{won?"✓ WIN":"✗ LOSS"}{pr.ot>0?` (${pr.ot}OT)`:""}</div>
                      <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:6}}>
                        <div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#60a5fa",fontWeight:700}}>YOUR TEAM</div><div style={{fontSize:34,fontWeight:900,color:"#60a5fa"}}>{myScore}</div></div>
                        <div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#f87171",fontWeight:700}}>{pTop?pr.botName:pr.topName}</div><div style={{fontSize:34,fontWeight:900,color:"#f87171"}}>{oppScore}</div></div>
                      </div>
                      {pr.seriesOver&&<div style={{marginTop:6,fontSize:11,color:"#f59e0b",fontWeight:700}}>Series: {pr.winner?.name} win!</div>}
                    </div>
                    <BoxScore stats={myS} acc="#60a5fa" label="YOUR TEAM"/>
                    <BoxScore stats={oppS} acc="#f87171" label={pTop?pr.botName:pr.topName}/>
                  </>);
                })()}
                {playoffResult?.aiOnly&&playoffResult.matchId===activeMatchId&&(
                  <div style={{textAlign:"center",padding:10,background:"#0f172a",borderRadius:10,border:"1px solid #334155"}}>
                    <div style={{fontSize:12,color:"#94a3b8"}}>{playoffResult.seriesOver?`✓ ${playoffResult.winner?.name} win the series!`:"Game simulated."}</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  if(phase==="seasonEnd"){
    const finalAi=aiTeams.map(t=>{
      const gW=t.gameLog.filter(x=>x===1).length,gL=t.gameLog.length-gW;
      const pW=t.playerResult==='W'?1:0,pL=t.playerResult==='L'?1:0;
      return{...t,w:gW+pW,l:gL+pL};
    });
    const ppg=season.gp>0?rf(season.ptsFor/season.gp):0,papg=season.gp>0?rf(season.ptsAgainst/season.gp):0;
    const playerRows=Object.entries(season.players).map(([name,s])=>({
      name,gp:s.gp,ppg:rf(s.pts/s.gp),apg:rf(s.ast/s.gp),rpg:rf(s.reb/s.gp),spg:rf(s.stl/s.gp),bpg:rf(s.blk/s.gp),
      tpg:rf(s.tov/s.gp),fgPct:s.fga>0?rf(s.fgm/s.fga*100):0,tpPct:s.tpa>0?rf(s.tpm/s.tpa*100):0,ftPct:s.fta>0?rf(s.ftm/s.fta*100):0,
    })).sort((a,b)=>b.ppg-a.ppg);
    const mvp=playerRows[0];
    const all=[
      {name:"Your Team",w:season.w,l:SEASON_LENGTH-season.w,eff:myEffVal||0,isPlayer:true},
      ...finalAi.map(t=>({...t,isPlayer:false}))
    ].sort((a,b)=>b.w-a.w||(b.eff-a.eff));
    const mySeed=all.findIndex(t=>t.isPlayer)+1,playoff=mySeed<=10,playIn=mySeed>=7&&mySeed<=10;
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        {volumeSlider}{skipBtn}
      
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <div style={{textAlign:"center",padding:"16px",background:"#0f172a",borderRadius:16,border:`2px solid ${mySeed<=6?"#22c55e":playoff?"#f59e0b":"#ef4444"}`,marginBottom:14}}>
            <div style={{fontSize:36}}>{mySeed<=6?"🏆":playoff?"🎟":"💀"}</div>
            <div style={{fontSize:22,fontWeight:900,color:mySeed<=6?"#22c55e":playoff?"#f59e0b":"#ef4444",letterSpacing:2}}>
              {mySeed<=6?`PLAYOFFS BOUND — SEED #${mySeed}`:playoff?`PLAY-IN TOURNAMENT — SEED #${mySeed}`:"MISSED THE PLAYOFFS"}
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Final Record: {season.w}–{season.l} · PPG {ppg} · OPP {papg}</div>
          </div>
          <div style={{marginBottom:14}}><StandingsTable aiTeams={finalAi} myRecord={myRecord} myName="Your Team" highlight/></div>
          {mvp&&(
            <div style={{background:"#0f172a",borderRadius:12,padding:12,marginBottom:14,border:"1px solid #fbbf24",textAlign:"center"}}>
              <div style={{fontSize:10,color:"#fbbf24",fontWeight:800,letterSpacing:2,marginBottom:4}}>🏅 SEASON MVP</div>
              <div style={{fontSize:18,fontWeight:900}}>{mvp.name}</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{mvp.ppg} PPG · {mvp.apg} APG · {mvp.rpg} RPG</div>
            </div>
          )}
          <div style={{background:"#0f172a",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b",marginBottom:14}}>
            <div style={{padding:"8px 12px",background:"#1e293b",fontWeight:800,fontSize:10,letterSpacing:2,color:"#60a5fa"}}>SEASON AVERAGES</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{borderBottom:"1px solid #1e293b"}}>
                {[["PLAYER","left"],["GP","c"],["PPG","c"],["RPG","c"],["APG","c"],["SPG","c"],["BPG","c"],["TPG","c"],["FG%","c"],["3P%","c"],["FT%","c"]].map(([h,a])=>(
                  <th key={h} style={{padding:"6px 8px",textAlign:a==="c"?"center":"left",color:"#475569",fontSize:10}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {playerRows.map((s,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                    <td style={{padding:"6px 8px",fontWeight:700}}>{i===0?"🏅 ":""}{s.name}</td>
                    <td style={{textAlign:"center",color:"#64748b"}}>{s.gp}</td>
                    <td style={{textAlign:"center",background:cellBg("pts",s.ppg*1.5),padding:"5px 4px",fontWeight:700}}>{s.ppg}</td>
                    <td style={{textAlign:"center",background:cellBg("reb",s.rpg*1.5),padding:"5px 4px"}}>{s.rpg}</td>
                    <td style={{textAlign:"center",background:cellBg("ast",s.apg*1.5),padding:"5px 4px"}}>{s.apg}</td>
                    <td style={{textAlign:"center",background:cellBg("stl",s.spg*2),padding:"5px 4px"}}>{s.spg}</td>
                    <td style={{textAlign:"center",background:cellBg("blk",s.bpg*2),padding:"5px 4px"}}>{s.bpg}</td>
                    <td style={{textAlign:"center",background:cellBg("tov",s.tpg*1.5),padding:"5px 4px"}}>{s.tpg}</td>
                    <td style={{textAlign:"center",background:cellBg("fgPct",s.fgPct),padding:"5px 4px"}}>{s.fgPct}%</td>
                    <td style={{textAlign:"center",background:cellBg("tpPct",s.tpPct),padding:"5px 4px"}}>{s.tpPct}%</td>
                    <td style={{textAlign:"center",background:cellBg("ftPct",s.ftPct),padding:"5px 4px"}}>{s.ftPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    const opp=aiTeams[schedIdx],gp=Math.min(gameNum-1+(result?1:0),aiTeams.length>0?aiTeams[0].gameLog.length:0);
    const curAi=getAiRecordsAtGame(aiTeams,gp),won=result?result.myScore>result.oppScore:false;
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        {volumeSlider}{skipBtn}
        <div style={{maxWidth:1040,margin:"0 auto"}}>
          <div style={{background:"#0f172a",borderRadius:10,padding:"10px 14px",marginBottom:10,border:"1px solid #1e293b",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{fontSize:11,fontWeight:800,color:"#64748b"}}>GAME {gameNum} / {SEASON_LENGTH}</div>
            <div style={{flex:1,background:"#1e293b",borderRadius:4,height:5,minWidth:80}}>
              <div style={{height:"100%",width:`${((result?gameNum:gameNum-1)/SEASON_LENGTH)*100}%`,background:"linear-gradient(90deg,#3b82f6,#8b5cf6)",borderRadius:4,transition:"width 0.3s"}}/>
            </div>
            <div style={{fontSize:11,fontWeight:800,color:season.w>=season.l?"#22c55e":"#f87171"}}>{season.w}W–{season.l}L</div>
            <button onClick={()=>setShowStandings(s=>!s)} style={{background:"#1e293b",color:"#60a5fa",border:"1px solid #334155",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{showStandings?"Hide":"Show"} Standings</button>
          </div>
          {showStandings&&<div style={{marginBottom:10}}><StandingsTable aiTeams={curAi} myRecord={myRecord} myName="Your Team" highlight/></div>}
          {!result?(
            <div style={{background:"#0f172a",borderRadius:16,padding:24,border:"1px solid #1e293b",textAlign:"center",marginBottom:10}}>
              <div style={{fontSize:13,color:"#64748b",marginBottom:14,fontWeight:700,letterSpacing:1}}>GAME {gameNum} vs {opp?.name}</div>
              <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:32,marginBottom:18}}>
                <div style={{textAlign:"center"}}><div style={{fontSize:12,color:"#60a5fa",fontWeight:800,marginBottom:4}}>YOUR TEAM</div><div style={{fontSize:30,fontWeight:900,color:"#60a5fa"}}>{rf(teamEff(myLineup,teamRoster),0)}</div><div style={{fontSize:10,color:"#475569"}}>RTG</div></div>
                <div style={{fontSize:22,color:"#334155"}}>VS</div>
                <div style={{textAlign:"center"}}><div style={{fontSize:12,color:"#f87171",fontWeight:800,marginBottom:4}}>{opp?.name}</div><div style={{fontSize:30,fontWeight:900,color:"#f87171"}}>{opp?rf(opp.eff,0):"-"}</div><div style={{fontSize:10,color:"#475569"}}>RTG</div></div>
              </div>
              {opp&&<div style={{fontSize:11,color:"#475569",marginBottom:14}}>{opp.lineup.map(({player,slot})=>`${slot}: ${player.name}`).join(" · ")}</div>}
              <button onClick={playGame} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"11px 32px",fontSize:14,fontWeight:800,cursor:"pointer"}}>▶ PLAY GAME {gameNum}</button>
            </div>
          ):(
            <>
              <div style={{textAlign:"center",padding:"12px",background:"#0f172a",borderRadius:14,border:`2px solid ${won?"#22c55e":"#ef4444"}`,marginBottom:10}}>
                <div style={{fontSize:24}}>{won?"🏆":"💀"}</div>
                <div style={{fontSize:20,fontWeight:900,color:won?"#22c55e":"#ef4444",letterSpacing:2}}>{won?"VICTORY":"DEFEAT"}{result.ot>0?` (${result.ot}OT)`:""}</div>
                <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:6}}>
                  {[["YOUR TEAM",result.myScore,"#60a5fa",result.myEff],["OPPONENT",result.oppScore,"#f87171",result.oppEff]].map(([l,sc,col,eff],i)=>(
                    <div key={i} style={{textAlign:"center"}}><div style={{fontSize:10,color:col,fontWeight:700}}>{l}</div><div style={{fontSize:38,fontWeight:900,color:col,lineHeight:1}}>{sc}</div><div style={{fontSize:9,color:"#475569"}}>RTG {eff}</div></div>
                  ))}
                </div>
                <div style={{marginTop:6,fontSize:10,color:"#f59e0b",fontWeight:700}}>🏅 {[...result.myStats].sort((a,b)=>b.pts-a.pts)[0]?.name} — {[...result.myStats].sort((a,b)=>b.pts-a.pts)[0]?.pts}pts</div>
              </div>
              <BoxScore stats={result.myStats} acc="#60a5fa" label="YOUR TEAM"/>
              <BoxScore stats={result.oppStats} acc="#f87171" label={opp?.name||"OPPONENT"}/>
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

  const allArchetypes=[...new Set(playerPool.map(p=>getArchetype(p).label))].sort();
  const allYears=[...new Set(playerPool.map(p=>String(p.season)))].sort((a,b)=>b-a);
  const allTeams=[...new Set(playerPool.map(p=>p.tm))].sort();
  const display=playerPool
    .filter(p=>(posF==="ALL"||p.pos===posF)&&(search===""||p.name.toLowerCase().includes(search.toLowerCase()))&&(archF==="ALL"||getArchetype(p).label===archF)&&(yearF==="ALL"||String(p.season)===yearF)&&(teamF==="ALL"||p.tm===teamF))
    .sort((a,b)=>sortBy==="rating"?b.rating-a.rating:sortBy==="cost"?b.cost-a.cost:a.name.localeCompare(b.name));

  return(
    <div onClick={handleFirstClick} style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:14}}>
      <Analytics />
      <SpeedInsights />
      {volumeSlider}{skipBtn}
      <div style={{maxWidth:1200,margin:"0 auto",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:900,background:"linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              💰 NBA BUDGET BALL <span style={{fontSize:11,color:"#475569",WebkitTextFillColor:"#475569"}}>v2.5</span>
            </h1>
            <div style={{fontSize:10,color:"#475569",marginTop:1}}>{playerPool.length} players · Budget ${BUDGET} · {SEASON_LENGTH}-game season · Play-in + Playoffs</div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[["BUDGET",`$${rem}`,rem<15?"#ef4444":rem<30?"#f59e0b":"#22c55e"],["SPENT",`$${spent}`,"#94a3b8"],["CHEM",myCh>0?`+${myCh}`:"-","#f472b6"]].map(([l,v,c])=>(
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
        <div style={{display:"grid",gridTemplateColumns:"270px minmax(0,1fr)",gap:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #1e293b"}}>
              <div style={{fontWeight:800,fontSize:10,letterSpacing:2,color:"#60a5fa",marginBottom:8}}>YOUR STARTING 5</div>
              {POSITIONS.map(pos=>{
                const p=roster[pos],m=p?posMult(p,pos):1,tier=p?getTier(p.cost):null,isActive=slotSel===pos;
                return(
                  <div key={pos} onClick={()=>!inSeason&&setSlotSel(slotSel===pos?null:pos)} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,background:isActive?"#1a2a0a":p?"#0d2137":"#080f1e",borderRadius:8,padding:"7px 8px",border:`1px solid ${isActive?"#84cc16":p?"#1d4ed8":"#1e293b"}`,cursor:inSeason?"default":"pointer"}}>
                    <div style={{width:24,height:24,borderRadius:5,background:isActive?"#365314":p?"#1e3a5f":"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:isActive?"#84cc16":"#60a5fa",flexShrink:0}}>{pos}</div>
                    {p?(
                      <>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                          <div style={{display:"flex",gap:3,marginTop:1,flexWrap:"wrap"}}>
                            <Tag label={tier.label} color={tier.color} bg={tier.bg}/>
                            {m<1&&<Tag label={`OOP ×${m}`} color="#fbbf24" bg="#78350f"/>}
                            {myCh>0&&<Tag label="⚡CHEM" color="#f472b6" bg="#4a044e"/>}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:13,color:"#fbbf24",fontWeight:900}}>${p.cost}</div></div>
                        {!inSeason&&<button onClick={e=>{e.stopPropagation();drop(pos);}} style={{background:"#7f1d1d",border:"none",borderRadius:4,color:"#fca5a5",fontSize:11,width:18,height:18,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>}
                      </>
                    ):(
                      <div style={{fontSize:10,color:isActive?"#84cc16":"#334155",fontStyle:"italic"}}>{isActive?`Picking for ${pos} →`:`Click to set ${pos} →`}</div>
                    )}
                  </div>
                );
              })}
              {myCh>0&&<div style={{fontSize:11,color:"#f472b6",textAlign:"center",margin:"4px 0",fontWeight:700}}>⚡ Chemistry Boost +{myCh}</div>}
              {(()=>{
                const bal=getTeamBalance(myLineup);if(!bal)return null;
                return(
                  <div style={{marginTop:6,background:"#080f1e",borderRadius:8,padding:"6px 8px",border:"1px solid #1e293b"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:1}}>TEAM BALANCE</div>
                      <div style={{fontSize:16,fontWeight:900,color:bal.color}}>{bal.grade}</div>
                    </div>
                    {bal.archetypeBonus!==0&&<div style={{fontSize:10,color:"#a78bfa",fontWeight:700,marginBottom:3}}>🧩 Archetype Bonus {bal.archetypeBonus>0?`+${bal.archetypeBonus}`:bal.archetypeBonus}</div>}
                    {bal.missing.length>0&&<div style={{fontSize:9,color:"#f87171"}}>Missing: {bal.missing.join(", ")}</div>}
                  </div>
                );
              })()}
              <button onClick={startSeason} disabled={!full||inSeason} style={{width:"100%",marginTop:4,background:full&&!inSeason?"linear-gradient(135deg,#f59e0b,#d97706)":"#1e293b",color:full&&!inSeason?"white":"#374151",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:800,cursor:full&&!inSeason?"pointer":"not-allowed",transition:"all 0.2s"}}>
                {full?"🏀 START SEASON":`${5-filled} SLOT${5-filled!==1?"S":""} REMAINING`}
              </button>
            </div>
            <div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #1e293b",fontSize:10,color:"#64748b"}}>
              <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
              <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
              <div style={{marginBottom:2}}>• 12-team league — AI teams have real records</div>
              <div style={{marginBottom:2}}>• ⚡ Chemistry: real teammates same season+team</div>
              <div style={{marginBottom:2}}>• 🧩 Archetypes: balance your roster for bonuses</div>
              <div style={{marginBottom:2}}>• Top 6 direct · 7-10 play-in tournament</div>
              <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginTop:6,marginBottom:2}}>OOP PENALTIES</div>
              <div>Adjacent ×0.82 · Wrong ×0.65</div>
            </div>
          </div>
          <div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {["ALL",...POSITIONS].map(f=>(
                    <button key={f} onClick={()=>setPosF(f)} style={{background:posF===f?"#3b82f6":"#1e293b",color:posF===f?"white":"#94a3b8",border:"none",borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{f}</button>
                  ))}
                </div>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 10px",fontSize:11,color:"#e2e8f0",outline:"none",width:140}}/>
                <div style={{marginLeft:"auto",display:"flex",gap:3}}>
                  {[["rating","RTG"],["cost","$"],["name","A–Z"]].map(([k,l])=>(
                    <button key={k} onClick={()=>setSortBy(k)} style={{background:sortBy===k?"#4c1d95":"#1e293b",color:sortBy===k?"#c4b5fd":"#64748b",border:"none",borderRadius:5,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:3,flexWrap:"nowrap",overflowX:"auto",paddingBottom:4}}>
                {["ALL",...allArchetypes].map(f=>{
                  const arch=f==="ALL"?null:playerPool.find(p=>getArchetype(p).label===f);
                  const col=arch?getArchetype(arch).color:"#94a3b8";
                  return(<button key={f} onClick={()=>setArchF(f)} style={{background:archF===f?"#1e293b":"#0f172a",color:archF===f?col:"#475569",border:`1px solid ${archF===f?col:"#1e293b"}`,borderRadius:6,padding:"3px 8px",fontSize:9,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{f}</button>);
                })}
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <select value={yearF} onChange={e=>setYearF(e.target.value)} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 8px",fontSize:11,color:"#e2e8f0",outline:"none"}}>
                  <option value="ALL">All Years</option>
                  {allYears.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
                <select value={teamF} onChange={e=>setTeamF(e.target.value)} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 8px",fontSize:11,color:"#e2e8f0",outline:"none"}}>
                  <option value="ALL">All Teams</option>
                  {allTeams.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                {(archF!=="ALL"||yearF!=="ALL"||teamF!=="ALL")&&(
                  <button onClick={()=>{setArchF("ALL");setYearF("ALL");setTeamF("ALL");}} style={{background:"#7f1d1d",color:"#fca5a5",border:"none",borderRadius:6,padding:"5px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>✕ Clear</button>
                )}
                <div style={{fontSize:10,color:"#475569",marginLeft:"auto"}}>{display.length} players</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:6,minWidth:0}}>
              {display.map(p=>{
                const inR=myIds.has(p.id),targetSlot=slotSel||p.pos,prev=roster[targetSlot];
                const delta=p.cost-(prev?.cost||0),afford=delta<=rem,tier=getTier(p.cost);
                const wouldOop=slotSel&&slotSel!==p.pos,mult=slotSel?posMult(p,slotSel):1;
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
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:5}}><div style={{fontSize:14,color:"#fbbf24",fontWeight:900}}>${p.cost}</div></div>
                    </div>
                    <div style={{marginTop:6,textAlign:"center"}}>
                      <span style={{fontSize:10,fontWeight:800,background:"#1e293b",color:getArchetype(p).color,borderRadius:5,padding:"2px 8px",letterSpacing:1}}>{getArchetype(p).label}</span>
                    </div>
                    {p.tm&&p.season&&<div style={{marginTop:3,fontSize:8,color:"#334155",textAlign:"center"}}>{p.tm} · {p.season}</div>}
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