import "./index.css";
import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONSTANTS ───────────────────────────────────────────
const POSITIONS = ["PG","SG","SF","PF","C"];
const BUDGET = 140;
const SEASON_LENGTH = 11;
const TEAM_NAMES = [
  "Rim Wreckers","Bucket Getters","Paint Beasts","Corner Killers",
  "Iso Kings","Glass Eaters","Dime Dealers","Lock Legends",
  "Splash Bros","Hardwood Wolves","Night Shift",
];

// ─── HELPERS ─────────────────────────────────────────────
function rf(n,d=1){return parseFloat((+n).toFixed(d));}
function ri(n){return Math.round(n);}
function clamp(v,mn,mx){return Math.max(mn,Math.min(mx,v));}
function gauss(s=1){const u=Math.max(1e-10,Math.random()),v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*s;}

// ─── RATING & COST ───────────────────────────────────────
// These are pre-computed by Python — kept here only for reference/AI team gen fallback
function calcRating(p){
  return +(p.pts*1.0+p.ast*1.5+p.reb*1.1+p.stl*2.2+p.blk*1.8-p.tov*1.2+(p.fg-44)*0.4+(p.ts-54)*0.3).toFixed(1);
}
function ratingToCost(r,mn,mx){
  return Math.round(5+((r-mn)/Math.max(mx-mn,1))*35);
}

// ─── CSV PROCESSING ──────────────────────────────────────
// Expects columns: name,fullName,pos,season,tm,pts,ast,reb,stl,blk,tov,fg,ts,tR,rating,cost
function processCSV(text){
  const lines=text.trim().split("\n").filter(l=>l.trim());
  const headers=lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase());

  const idx=name=>headers.indexOf(name.toLowerCase());
  const get=(row,name)=>(row[idx(name)]||"").trim().replace(/^"|"$/g,"");
  const num=(row,name)=>parseFloat(get(row,name))||0;

  const players=[];
  const seen=new Set();
  const teamRoster={};

  for(let i=1;i<lines.length;i++){
    const row=lines[i].split(",");
    if(row.length<10)continue;

    const name  =get(row,"name");
    const fullName=get(row,"fullname");
    const pos   =get(row,"pos");
    const season=get(row,"season");
    const tm    =get(row,"tm").toUpperCase();

    if(!name||!season||!pos||tm==="TOT")continue;
    const key=`${name}|${season}|${tm}`;
    if(seen.has(key))continue;
    seen.add(key);

    const pts   =num(row,"pts");
    const ast   =num(row,"ast");
    const reb   =num(row,"reb");
    const stl   =num(row,"stl");
    const blk   =num(row,"blk");
    const tov   =num(row,"tov");
    const fg    =num(row,"fg");
    const ts    =num(row,"ts");
    const tR    =num(row,"tr");   // headers are lowercased so tR→tr
    const rating=num(row,"rating");
    const cost  =Math.min(40,Math.max(5,Math.round(num(row,"cost"))));

    if(pts<1||!rating)continue;

    players.push({name,fullName,pos,season,tm,pts,ast,reb,stl,blk,tov,fg,ts,tR,rating,cost});

    // chemistry map: "2022|GSW" → [player names]
    const rk=`${season}|${tm}`;
    if(!teamRoster[rk])teamRoster[rk]=[];
    teamRoster[rk].push(name);
  }

  if(players.length===0){
    console.error("No players parsed. Headers found:",headers);
    return null;
  }

  console.log(`✓ Parsed ${players.length} players. Sample:`,players[0]);
  const withIds=players.map((p,i)=>({...p,id:i+1}));
  return{players:withIds,teamRoster};
}

// ─── DYNAMIC CHEMISTRY ───────────────────────────────────
// Returns boost for a lineup based on shared real-life team/season
function chemBoost(lineup, teamRoster){
  if(!teamRoster)return 0;
  let boost=0;
  // For each season|tm key, count how many lineup players were on that team
  const counted=new Set();
  for(const rk of Object.keys(teamRoster)){
    const roster=new Set(teamRoster[rk]);
    const matches=lineup.filter(({player})=>roster.has(player.name));
    if(matches.length>=2){
      const pairKey=`${rk}|${matches.map(m=>m.player.name).sort().join(",")}`;
      if(!counted.has(pairKey)){
        counted.add(pairKey);
        boost+=matches.length>=3?4:2;
      }
    }
  }
  return boost;
}

// ─── POSITION ────────────────────────────────────────────
const ADJ={PG:["SG"],SG:["PG","SF"],SF:["SG","PF"],PF:["SF","C"],C:["PF"]};
function posMult(player,slot){
  if(player.pos===slot)return 1.0;
  if(ADJ[player.pos]?.includes(slot))return 0.82;
  return 0.65;
}
function teamEff(lineup,teamRoster){
  return lineup.reduce((s,{player,slot})=>s+player.rating*posMult(player,slot),0)+chemBoost(lineup,teamRoster);
}

// ─── LEAGUE GENERATION ───────────────────────────────────
function genLineup(excludeIds=new Set(),pool=[]){
  const used=new Set(excludeIds);const team=[];let rem=BUDGET;
  for(const pos of POSITIONS){
    const eligible=pool.filter(p=>p.pos===pos&&!used.has(p.id));
    const fallback=pool.filter(p=>!used.has(p.id));
    const cands=eligible.length>0?eligible:fallback;
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
    const eff=rf(teamEff(lineup,null),1);
    teams.push({name:TEAM_NAMES[i],lineup,w:0,l:0,eff});
  }
  return teams;
}

// ─── SIMULATION ──────────────────────────────────────────
function gameVariance(rating){
  const norm=clamp((rating-20)/Math.max(80,1),0,1);
  return clamp(1+gauss(0.28-norm*0.10),0.30,1.90);
}

function quickSim(lineupA,lineupB,tr){
  const eA=teamEff(lineupA,tr),eB=teamEff(lineupB,tr);
  const pA=clamp(eA/(eA+eB),0.38,0.62);
  return Math.random()<pA?0:1;
}

function simSeries(lineupA,lineupB,tr){
  let wA=0,wB=0;
  while(wA<2&&wB<2){quickSim(lineupA,lineupB,tr)===0?wA++:wB++;}
  return wA===2?0:1;
}

function simulate(myLineup,oppLineup,teamRoster){
  const myE=teamEff(myLineup,teamRoster),oppE=teamEff(oppLineup,teamRoster);
  const myOff=clamp(myE/(myE+oppE),0.42,0.58);
  const pace=Math.round(96+Math.random()*12);
  const myVar=myLineup.map(({player})=>gameVariance(player.rating));
  const oppVar=oppLineup.map(({player})=>gameVariance(player.rating));

  const mkStats=lineup=>lineup.map(({player,slot})=>({
    name:player.name,pos:slot,native:player.pos,oop:player.pos!==slot,
    cost:player.cost,min:48,pts:0,ast:0,reb:0,stl:0,blk:0,tov:0,
    fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,
    rating:rf(player.rating*posMult(player,slot),1),
    gv:gameVariance(player.rating),
  }));

  const myStats=mkStats(myLineup),oppStats=mkStats(oppLineup);

  function wIdx(arr,wFn){
    const w=arr.map(wFn);const t=w.reduce((a,b)=>a+b,0);
    if(t<=0)return 0;let r=Math.random()*t;
    for(let i=0;i<arr.length;i++){r-=w[i];if(r<=0)return i;}
    return arr.length-1;
  }

  for(let i=0;i<pace*2;i++){
    const isMy=i%2===0?Math.random()<(myOff+0.03):Math.random()<(myOff-0.03);
    const offS=isMy?myStats:oppStats,defS=isMy?oppStats:myStats;
    const offV=isMy?myVar:oppVar;
    const offL=isMy?myLineup:oppLineup,defL=isMy?oppLineup:myLineup;

    const si=wIdx(offS,(_,j)=>Math.max(0.01,offL[j].player.rating*posMult(offL[j].player,offL[j].slot)*offV[j]));
    const shooter=offS[si];const sp=offL[si].player;const m=posMult(sp,offL[si].slot);
    const di=defL.findIndex(x=>x.slot===offL[si].slot);const defIdx=di>=0?di:0;
    const defender=defS[defIdx];const dp=defL[defIdx].player;const dm=posMult(dp,defL[defIdx].slot);

    const is3=Math.random()<sp.tR*(0.75+Math.random()*0.5);
    const fgPct=clamp(sp.fg*(m*0.18+0.82)+gauss(3.5),24,76)/100;
    const defFactor=clamp(1-(dp.rating*dm-35)*0.002,0.88,1.04);
    const adjFg=clamp(fgPct*defFactor,0.44,0.72);
    const tovChance=clamp((sp.tov/40)*offV[si]*0.7,0.02,0.15);
    const blkChance=clamp(dp.blk*dm*0.04,0,0.12);

    if(Math.random()<tovChance){
      shooter.tov++;
      defS[wIdx(defS,(_,j)=>Math.max(0.01,defL[j].player.stl*posMult(defL[j].player,defL[j].slot)))].stl++;
    } else if(!is3&&Math.random()<blkChance){
      shooter.fga++;defender.blk++;
      const rebSide=Math.random()<0.80?defS:offS;
      const rebL=Math.random()<0.80?defL:offL;
      rebSide[wIdx(rebSide,(_,j)=>Math.max(0.01,rebL[j].player.reb*posMult(rebL[j].player,rebL[j].slot)))].reb++;
    } else if(Math.random()<adjFg){
      shooter.fga++;shooter.fgm++;if(is3){shooter.tpa++;shooter.tpm++;}
      let pts=is3?3:2;
      if(Math.random()<(is3?0.04:0.18)){
        const ftPct=clamp(0.55+(sp.tR-0.10)*1.8+gauss(0.04),0.50,0.95);
        const made=Math.random()<ftPct?1:0;pts+=made;shooter.fta++;shooter.ftm+=made;
      }
      shooter.pts+=pts;
      if(Math.random()<0.65)offS[wIdx(offS,(s,j)=>j===si?0:Math.max(0.01,offL[j].player.ast))].ast++;
    } else {
      shooter.fga++;if(is3)shooter.tpa++;
      if(!is3&&Math.random()<0.08){
        const fp=clamp(0.55+(sp.tR-0.10)*1.8+gauss(0.04),0.50,0.95);
        const f1=Math.random()<fp?1:0,f2=Math.random()<fp?1:0;
        shooter.fta+=2;shooter.ftm+=f1+f2;shooter.pts+=f1+f2;
      }
      if(Math.random()<0.27)offS[wIdx(offS,(_,j)=>Math.max(0.01,offL[j].player.reb*posMult(offL[j].player,offL[j].slot)))].reb++;
      else defS[wIdx(defS,(_,j)=>Math.max(0.01,defL[j].player.reb*posMult(defL[j].player,defL[j].slot)))].reb++;
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
  return{myScore:ms,oppScore:os,ot,myStats:finalize(myStats),oppStats:finalize(oppStats),
    myEff:rf(myE,1),oppEff:rf(oppE,1),myChem:chemBoost(myLineup,teamRoster),oppChem:chemBoost(oppLineup,teamRoster)};
}

// ─── SEASON HELPERS ──────────────────────────────────────
function addToSeason(season,gameStats,won,myScore,oppScore){
  const next={...season,players:{...season.players}};
  next.gp++;if(won)next.w++;else next.l++;
  next.ptsFor+=myScore;next.ptsAgainst+=oppScore;
  gameStats.forEach(s=>{
    if(!next.players[s.name])next.players[s.name]={pts:0,ast:0,reb:0,stl:0,blk:0,gp:0};
    const p=next.players[s.name];
    p.pts+=s.pts;p.ast+=s.ast;p.reb+=s.reb;p.stl+=s.stl;p.blk+=s.blk;p.gp++;
  });
  return next;
}
function emptySeason(){return{gp:0,w:0,l:0,ptsFor:0,ptsAgainst:0,players:{}};}

function simLeagueGames(aiTeams,tr){
  const records=aiTeams.map(t=>({...t,w:0,l:0,gameLog:[]}));
  const n=records.length;
  const results={};
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

// ─── UI HELPERS ──────────────────────────────────────────
function getTier(cost){
  if(cost>=35)return{label:"Elite",color:"#fbbf24",bg:"#78350f"};
  if(cost>=28)return{label:"Star",color:"#c084fc",bg:"#3b0764"};
  if(cost>=20)return{label:"Solid",color:"#60a5fa",bg:"#1e3a5f"};
  if(cost>=13)return{label:"Role",color:"#4ade80",bg:"#14532d"};
  if(cost>=8) return{label:"Bench",color:"#94a3b8",bg:"#1e293b"};
  return{label:"Filler",color:"#64748b",bg:"#0f172a"};
}
const SMAXES={pts:65,ast:20,reb:30,stl:7,blk:8,tov:10,fgPct:80,tpPct:55};
function cellBg(stat,val){const r=Math.min(val/(SMAXES[stat]||1),1);if(stat==="tov")return`rgba(239,68,68,${0.12+r*0.55})`;return`rgba(${ri(15+(1-r)*25)},${ri(100+r*120)},${ri(50+(1-r)*20)},${0.15+r*0.55})`;}
const Tag=({label,color,bg})=><span style={{fontSize:10,fontWeight:800,background:bg,color,borderRadius:4,padding:"1px 5px",whiteSpace:"nowrap"}}>{label}</span>;
const Bar=({v,max=85})=><div style={{height:3,background:"#0f172a",borderRadius:2,marginTop:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min((v/max)*100,100)}%`,background:`hsl(${Math.min(v*1.5,120)},75%,48%)`,borderRadius:2}}/></div>;

// ─── BOX SCORE ───────────────────────────────────────────
function BoxScore({stats,acc,label}){
  return(
    <div style={{marginBottom:10,background:"#0f172a",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b"}}>
      <div style={{padding:"7px 14px",background:"#1e293b",fontWeight:800,fontSize:11,letterSpacing:2,color:acc}}>{label}</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:700}}>
          <thead><tr style={{borderBottom:"1px solid #1e293b"}}>
            {[["PLAYER","left"],["POS","c"],["PTS","c"],["AST","c"],["REB","c"],["STL","c"],["BLK","c"],["TOV","c"],["FGM-A","c"],["FG%","c"],["3PM-A","c"],["3P%","c"],["FTM-A","c"],["FT%","c"],["RTG","c"]].map(([h,a])=>(
              <th key={h} style={{padding:"5px 6px",textAlign:a==="c"?"center":"left",color:"#475569",fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {stats.map((s,i)=>(
              <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                <td style={{padding:"5px 6px",fontWeight:700,whiteSpace:"nowrap"}}>{s.hotCold&&<span style={{marginRight:3}}>{s.hotCold}</span>}{s.name}{s.oop&&<span style={{marginLeft:4,fontSize:9,background:"#78350f",color:"#fbbf24",borderRadius:3,padding:"1px 3px"}}>OOP</span>}</td>
                <td style={{textAlign:"center",color:"#64748b"}}>{s.pos}</td>
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

// ─── STANDINGS ───────────────────────────────────────────
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
            const pct=t.w+t.l>0?rf(t.w/(t.w+t.l)*100,1):0;
            const isHL=highlight&&t.isPlayer;
            return(
              <tr key={t.name} style={{borderBottom:"1px solid #0d1626",background:isHL?"#0d2137":i%2===0?"#080f1e":"#0a1221"}}>
                <td style={{textAlign:"center",padding:"5px 8px",color:i<6?"#22c55e":"#475569",fontWeight:800}}>{i+1}</td>
                <td style={{padding:"5px 8px",fontWeight:700,color:t.isPlayer?"#60a5fa":"#e2e8f0"}}>
                  {t.isPlayer?"🌟 ":""}{t.name}
                  {i===5&&<span style={{marginLeft:4,fontSize:9,background:"#14532d",color:"#4ade80",borderRadius:3,padding:"1px 4px"}}>LAST IN</span>}
                  {i===6&&<span style={{marginLeft:4,fontSize:9,background:"#7f1d1d",color:"#fca5a5",borderRadius:3,padding:"1px 4px"}}>OUT</span>}
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
      <div style={{padding:"6px 12px",borderTop:"2px dashed #1e293b",fontSize:9,color:"#22c55e"}}>▲ Top 6 make playoffs</div>
    </div>
  );
}

// ─── BRACKET ─────────────────────────────────────────────
function buildBracket(seeds){
  return{
    firstRound:[
      {id:"fr1",top:seeds[2],bot:seeds[5],winner:null,games:[],label:"(3) vs (6)"},
      {id:"fr2",top:seeds[3],bot:seeds[4],winner:null,games:[],label:"(4) vs (5)"},
    ],
    semis:[
      {id:"sf1",top:seeds[0],bot:null,winner:null,games:[],label:"(1) vs FR winner",byeTeam:seeds[0]},
      {id:"sf2",top:seeds[1],bot:null,winner:null,games:[],label:"(2) vs FR winner",byeTeam:seeds[1]},
    ],
    finals:{id:"f1",top:null,bot:null,winner:null,games:[],label:"FINALS"},
    champion:null,
  };
}

function BracketDisplay({bracket,onPlayMatch,playerName}){
  const{firstRound,semis,finals,champion}=bracket;
  const MatchupCard=({matchup,onPlay,isActive})=>{
    const{top,bot,winner,games,label}=matchup;
    const wA=games.filter(g=>g.winnerIdx===0).length;
    const wB=games.filter(g=>g.winnerIdx===1).length;
    const done=!!winner;
    return(
      <div style={{background:"#0f172a",border:`1px solid ${done?"#22c55e":isActive?"#6366f1":"#1e293b"}`,borderRadius:10,padding:10,minWidth:200}}>
        <div style={{fontSize:9,color:"#475569",letterSpacing:1,marginBottom:6,fontWeight:700}}>{label}</div>
        {[top,bot].map((team,ti)=>{
          const isW=winner?.name===team?.name;
          const wins=ti===0?wA:wB;
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
        {isActive&&!done&&top&&bot&&<button onClick={onPlay} style={{width:"100%",marginTop:6,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"white",border:"none",borderRadius:6,padding:"6px",fontSize:11,fontWeight:800,cursor:"pointer"}}>▶ PLAY GAME {games.length+1}</button>}
        {done&&<div style={{textAlign:"center",fontSize:10,color:"#22c55e",marginTop:4,fontWeight:700}}>✓ SERIES OVER</div>}
      </div>
    );
  };

  const fr1done=!!firstRound[0].winner,fr2done=!!firstRound[1].winner;
  const sf1done=!!semis[0].winner,sf2done=!!semis[1].winner,fdone=!!finals.winner;
  const pInFR1=firstRound[0].top?.isPlayer||firstRound[0].bot?.isPlayer;
  const pInFR2=firstRound[1].top?.isPlayer||firstRound[1].bot?.isPlayer;
  const pInSF1=semis[0].top?.isPlayer||semis[0].bot?.isPlayer;
  const pInSF2=semis[1].top?.isPlayer||semis[1].bot?.isPlayer;
  const activeMatch=!fr1done&&pInFR1?"fr1":!fr2done&&pInFR2?"fr2":!fr1done?"fr1":!fr2done?"fr2":!sf1done&&pInSF1?"sf1":!sf2done&&pInSF2?"sf2":!sf1done?"sf1":!sf2done?"sf2":!fdone?"f1":null;

  return(
    <div style={{background:"#080f1e",borderRadius:14,padding:14,border:"1px solid #1e293b"}}>
      <div style={{fontWeight:900,fontSize:13,color:"#f59e0b",letterSpacing:2,marginBottom:12,textAlign:"center"}}>🏀 PLAYOFF BRACKET</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 20px 1fr 20px 1fr",gap:4,alignItems:"center"}}>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:1,textAlign:"center",marginBottom:4}}>FIRST ROUND</div>
          <MatchupCard matchup={firstRound[0]} isActive={activeMatch==="fr1"} onPlay={()=>onPlayMatch("fr1")}/>
          <MatchupCard matchup={firstRound[1]} isActive={activeMatch==="fr2"} onPlay={()=>onPlayMatch("fr2")}/>
          <div style={{marginTop:4}}>
            <div style={{fontSize:9,color:"#475569",letterSpacing:1,textAlign:"center",marginBottom:4}}>BYES</div>
            {[semis[0].byeTeam,semis[1].byeTeam].map((t,i)=>(
              <div key={i} style={{marginBottom:4,padding:"5px 8px",borderRadius:6,background:"#0d2137",border:"1px solid #1d4ed8",display:"flex",alignItems:"center",gap:6}}>
                <div style={{flex:1,fontSize:11,fontWeight:800,color:t?.isPlayer?"#60a5fa":"#e2e8f0"}}>{t?.isPlayer?"🌟 ":""}{t?.name}</div>
                <span style={{fontSize:9,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"1px 5px"}}>#{i+1} — BYE</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{textAlign:"center",color:"#1e293b",fontSize:18}}>→</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:1,textAlign:"center",marginBottom:4}}>SEMIFINALS</div>
          <MatchupCard matchup={semis[0]} isActive={activeMatch==="sf1"} onPlay={()=>onPlayMatch("sf1")}/>
          <MatchupCard matchup={semis[1]} isActive={activeMatch==="sf2"} onPlay={()=>onPlayMatch("sf2")}/>
        </div>
        <div style={{textAlign:"center",color:"#1e293b",fontSize:18}}>→</div>
        <div>
          <div style={{fontSize:9,color:"#f59e0b",letterSpacing:1,textAlign:"center",marginBottom:4}}>🏆 FINALS</div>
          <MatchupCard matchup={finals} isActive={activeMatch==="f1"} onPlay={()=>onPlayMatch("f1")}/>
          {champion&&(
            <div style={{marginTop:10,textAlign:"center",padding:"10px",background:"linear-gradient(135deg,#78350f,#92400e)",borderRadius:10,border:"2px solid #fbbf24"}}>
              <div style={{fontSize:18}}>🏆</div>
              <div style={{fontSize:11,color:"#fbbf24",fontWeight:900,letterSpacing:1}}>CHAMPION</div>
              <div style={{fontSize:15,fontWeight:900,color:champion.isPlayer?"#60a5fa":"#e2e8f0"}}>{champion.isPlayer?"🌟 ":""}{champion.name}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────
export default function App(){
  const [phase,      setPhase]     =useState("import");
  const [playerPool, setPlayerPool]=useState([]);
  const [teamRoster, setTeamRoster]=useState(null);
  const [importErr,  setImportErr] =useState("");
  const [importInfo, setImportInfo]=useState("");
  const [roster,     setRoster]    =useState({PG:null,SG:null,SF:null,PF:null,C:null});
  const [slotSel,    setSlotSel]   =useState(null);
  const [aiTeams,    setAiTeams]   =useState([]);
  const [schedIdx,   setSchedIdx]  =useState(0);
  const [result,     setResult]    =useState(null);
  const [season,     setSeason]    =useState(emptySeason());
  const [gameNum,    setGameNum]   =useState(1);
  const [posF,       setPosF]      =useState("ALL");
  const [sortBy,     setSortBy]    =useState("rating");
  const [search,     setSearch]    =useState("");
  const [inSeason,   setInSeason]  =useState(false);
  const [bracket,    setBracket]   =useState(null);
  const [playoffResult,setPlayoffResult]=useState(null);
  const [activeMatchId,setActiveMatchId]=useState(null);
  const [showStandings,setShowStandings]=useState(false);
  const [elimInPlayoffs,setElimInPlayoffs]=useState(false);

  const myIds=new Set(Object.values(roster).filter(Boolean).map(p=>p.id));
  const spent=Object.values(roster).reduce((s,p)=>s+(p?.cost||0),0);
  const rem=BUDGET-spent;
  const filled=POSITIONS.filter(p=>roster[p]).length;
  const full=filled===5;
  const myLineup=full?POSITIONS.map(pos=>({player:roster[pos],slot:pos})):null;
  const myEffVal=myLineup?rf(teamEff(myLineup,teamRoster),1):null;
  const myCh=myLineup?chemBoost(myLineup,teamRoster):0;
  const myRecord={w:season.w,l:season.l,eff:myEffVal||0};

  // ── AUTO-LOAD CSV FROM PUBLIC FOLDER ───────────────────
  useEffect(()=>{
    setImportInfo("Loading players...");
    fetch("/nba_filtered.csv")
      .then(r=>{
        if(!r.ok)throw new Error(`HTTP ${r.status} — make sure nba_filtered.csv is in your /public folder`);
        return r.text();
      })
      .then(text=>{
        const result=processCSV(text);
        if(!result||result.players.length===0)throw new Error("CSV parsed but no valid players found — check column names");
        setPlayerPool(result.players);
        setTeamRoster(result.teamRoster);
        setImportInfo(`✓ ${result.players.length} players loaded`);
        setTimeout(()=>setPhase("draft"),600);
      })
      .catch(err=>{
        setImportErr(err.message);
        setImportInfo("");
      });
  },[]);

  const pickPlayer=useCallback((player)=>{
    if(inSeason)return;
    const targetSlot=slotSel||player.pos;
    const prev=roster[targetSlot];
    if((player.cost-(prev?.cost||0))>rem)return;
    setRoster(r=>({...r,[targetSlot]:player}));setSlotSel(null);
  },[roster,rem,slotSel,inSeason]);

  const drop=slot=>{if(inSeason)return;setRoster(r=>({...r,[slot]:null}));if(slotSel===slot)setSlotSel(null);};

  const startSeason=()=>{
    if(!full)return;
    const teams=generateLeague(myLineup,playerPool);
    const simmed=simLeagueGames(teams,teamRoster);
    setAiTeams(simmed);
    setInSeason(true);setSeason(emptySeason());setGameNum(1);setSchedIdx(0);
    setResult(null);setPhase("game");setBracket(null);setPlayoffResult(null);setElimInPlayoffs(false);
  };

  const playGame=()=>{
    if(!full||schedIdx>=aiTeams.length)return;
    const opp=aiTeams[schedIdx];
    const res=simulate(myLineup,opp.lineup,teamRoster);
    const won=res.myScore>res.oppScore;
    setSeason(s=>addToSeason(s,res.myStats,won,res.myScore,res.oppScore));
    setResult(res);
  };

  const nextGame=()=>{
    if(gameNum>=SEASON_LENGTH){setPhase("seasonEnd");return;}
    setGameNum(g=>g+1);setSchedIdx(i=>i+1);setResult(null);
  };

  // ── PLAYOFFS ─────────────────────────────────────────
  const buildPlayoffBracket=(finalSeason,finalAi)=>{
    const all=[
      {name:"Your Team",w:finalSeason.w,l:SEASON_LENGTH-finalSeason.w,eff:myEffVal||0,lineup:myLineup,isPlayer:true},
      ...finalAi.map(t=>({...t,isPlayer:false}))
    ].sort((a,b)=>b.w-a.w||(b.eff-a.eff));
    const playoff=all.slice(0,6).map((t,i)=>({...t,seed:i+1}));
    setBracket(buildBracket(playoff));
    setPhase("playoffs");setPlayoffResult(null);setActiveMatchId(null);setElimInPlayoffs(false);
  };

  const playPlayoffGame=(matchId)=>{
    if(!bracket)return;
    const b=JSON.parse(JSON.stringify(bracket));
    let matchup=matchId==="fr1"?b.firstRound[0]:matchId==="fr2"?b.firstRound[1]:matchId==="sf1"?b.semis[0]:matchId==="sf2"?b.semis[1]:b.finals;
    if(!matchup||matchup.winner)return;

    const topIsPlayer=matchup.top.isPlayer,botIsPlayer=matchup.bot.isPlayer;
    let res=null,winnerIdx;
    if(topIsPlayer||botIsPlayer){
      const pTop=topIsPlayer;
      res=simulate(pTop?matchup.top.lineup:matchup.bot.lineup,pTop?matchup.bot.lineup:matchup.top.lineup,teamRoster);
      const pWon=res.myScore>res.oppScore;
      winnerIdx=pTop?(pWon?0:1):(pWon?1:0);
    } else {
      winnerIdx=quickSim(matchup.top.lineup,matchup.bot.lineup,teamRoster);
    }
    matchup.games.push({winnerIdx,myScore:res?.myScore,oppScore:res?.oppScore,res});
    const wTop=matchup.games.filter(g=>g.winnerIdx===0).length;
    const wBot=matchup.games.filter(g=>g.winnerIdx===1).length;

    if(wTop===2||wBot===2){
      matchup.winner=wTop===2?matchup.top:matchup.bot;
      const w=matchup.winner;
      const pElim=(topIsPlayer&&wBot===2)||(botIsPlayer&&wTop===2);
      if(pElim)setElimInPlayoffs(true);
      if(matchId==="fr1")b.semis[0].bot=w;
      else if(matchId==="fr2")b.semis[1].bot=w;
      else if(matchId==="sf1")b.finals.top=w;
      else if(matchId==="sf2")b.finals.bot=w;
      else if(matchId==="f1"){b.finals.winner=w;b.champion=w;}
    }
    setBracket(b);
    setPlayoffResult(res?{...res,playerIsTop:topIsPlayer,matchId,seriesOver:!!matchup.winner,winner:matchup.winner,topName:matchup.top.name,botName:matchup.bot.name}:{aiOnly:true,matchId,seriesOver:!!matchup.winner,winner:matchup.winner,topName:matchup.top.name,botName:matchup.bot.name});
  };

  const newSeason=()=>{
    setInSeason(false);setSeason(emptySeason());setGameNum(1);setSchedIdx(0);
    setResult(null);setPhase("import");setBracket(null);setPlayoffResult(null);setAiTeams([]);setElimInPlayoffs(false);
    setRoster({PG:null,SG:null,SF:null,PF:null,C:null});setImportInfo("");setImportErr("");
  };

  // ── IMPORT SCREEN ────────────────────────────────────
  if(phase==="import"){
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{maxWidth:400,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>💰</div>
          <h1 style={{margin:"0 0 6px",fontSize:28,fontWeight:900,background:"linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>NBA BUDGET BALL</h1>
          <div style={{fontSize:12,color:"#475569",marginBottom:32}}>v2.5 · All eras · CSV-powered</div>
          {!importErr?(
            <div style={{background:"#0f172a",borderRadius:14,padding:24,border:"1px solid #1e293b"}}>
              <div style={{fontSize:28,marginBottom:10,animation:"spin 1s linear infinite"}}>⏳</div>
              <div style={{fontSize:13,color:"#60a5fa",fontWeight:700}}>{importInfo||"Loading player data..."}</div>
              <div style={{fontSize:11,color:"#334155",marginTop:8}}>Reading nba_filtered.csv from /public</div>
            </div>
          ):(
            <div style={{background:"#1a0a0a",borderRadius:14,padding:24,border:"1px solid #ef4444"}}>
              <div style={{fontSize:28,marginBottom:10}}>❌</div>
              <div style={{fontSize:12,color:"#f87171",fontWeight:700,marginBottom:12}}>{importErr}</div>
              <div style={{fontSize:11,color:"#64748b",lineHeight:1.6}}>
                Place <code style={{color:"#a78bfa"}}>nba_filtered.csv</code> in your project's <code style={{color:"#a78bfa"}}>public/</code> folder and refresh.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── PLAYOFFS ─────────────────────────────────────────
  if(phase==="playoffs"&&bracket){
    const champion=bracket.champion;
    const playerWon=champion?.isPlayer;
    const finalAiRec=getAiRecordsAtGame(aiTeams,aiTeams.length>0?aiTeams[0].gameLog.length:SEASON_LENGTH);
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        <div style={{maxWidth:1040,margin:"0 auto"}}>
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
              <div style={{fontSize:24}}>💀</div>
              <div style={{fontSize:16,fontWeight:900,color:"#ef4444"}}>YOUR SEASON IS OVER</div>
            </div>
          )}
          <BracketDisplay bracket={bracket} onPlayMatch={id=>{setActiveMatchId(id);setPlayoffResult(null);}} playerName="Your Team"/>
          {activeMatchId&&(()=>{
            const matchup=activeMatchId==="fr1"?bracket.firstRound[0]:activeMatchId==="fr2"?bracket.firstRound[1]:activeMatchId==="sf1"?bracket.semis[0]:activeMatchId==="sf2"?bracket.semis[1]:bracket.finals;
            if(!matchup)return null;
            const wT=matchup.games.filter(g=>g.winnerIdx===0).length;
            const wB=matchup.games.filter(g=>g.winnerIdx===1).length;
            const done=!!matchup.winner;
            const pInv=matchup.top?.isPlayer||matchup.bot?.isPlayer;
            return(
              <div style={{marginTop:12}}>
                <div style={{background:"#0f172a",borderRadius:12,padding:12,border:"1px solid #334155",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{fontWeight:800,fontSize:13,color:"#a78bfa"}}>{matchup.label} — Best of 3</div>
                    <div style={{fontSize:12,color:"#64748b"}}>Series: {matchup.top?.name} {wT}–{wB} {matchup.bot?.name}</div>
                  </div>
                  {!done&&pInv&&<button onClick={()=>playPlayoffGame(activeMatchId)} style={{marginTop:8,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:8,padding:"9px 24px",fontSize:13,fontWeight:800,cursor:"pointer"}}>▶ Play Game {matchup.games.length+1}</button>}
                  {!done&&!pInv&&<button onClick={()=>playPlayoffGame(activeMatchId)} style={{marginTop:8,background:"linear-gradient(135deg,#475569,#334155)",color:"white",border:"none",borderRadius:8,padding:"9px 24px",fontSize:13,fontWeight:800,cursor:"pointer"}}>⚡ Sim Game {matchup.games.length+1}</button>}
                  {done&&<div style={{marginTop:8,fontSize:12,color:"#22c55e",fontWeight:700}}>✓ {matchup.winner?.name} advance</div>}
                </div>
                {playoffResult&&!playoffResult.aiOnly&&playoffResult.matchId===activeMatchId&&(()=>{
                  const pr=playoffResult;const pTop=pr.playerIsTop;
                  const myS=pTop?pr.myStats:pr.oppStats,oppS=pTop?pr.oppStats:pr.myStats;
                  const myScore=pTop?pr.myScore:pr.oppScore,oppScore=pTop?pr.oppScore:pr.myScore;
                  const won=myScore>oppScore;
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

  // ── SEASON END ───────────────────────────────────────
  if(phase==="seasonEnd"){
    const finalAi=getAiRecordsAtGame(aiTeams,aiTeams.length>0?aiTeams[0].gameLog.length:SEASON_LENGTH);
    const ppg=season.gp>0?rf(season.ptsFor/season.gp):0;
    const papg=season.gp>0?rf(season.ptsAgainst/season.gp):0;
    const playerRows=Object.entries(season.players).map(([name,s])=>({
      name,gp:s.gp,ppg:rf(s.pts/s.gp),apg:rf(s.ast/s.gp),rpg:rf(s.reb/s.gp),spg:rf(s.stl/s.gp),bpg:rf(s.blk/s.gp),
    })).sort((a,b)=>b.ppg-a.ppg);
    const mvp=playerRows[0];
    const all=[
      {name:"Your Team",w:season.w,l:SEASON_LENGTH-season.w,eff:myEffVal||0,isPlayer:true},
      ...finalAi.map(t=>({...t,isPlayer:false}))
    ].sort((a,b)=>b.w-a.w||(b.eff-a.eff));
    const mySeed=all.findIndex(t=>t.isPlayer)+1;
    const playoff=mySeed<=6;
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <div style={{textAlign:"center",padding:"16px",background:"#0f172a",borderRadius:16,border:`2px solid ${playoff?"#22c55e":"#ef4444"}`,marginBottom:14}}>
            <div style={{fontSize:36}}>{playoff?"🏆":"💀"}</div>
            <div style={{fontSize:22,fontWeight:900,color:playoff?"#22c55e":"#ef4444",letterSpacing:2}}>{playoff?`PLAYOFFS BOUND — SEED #${mySeed}`:"MISSED THE PLAYOFFS"}</div>
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
                {[["PLAYER","left"],["GP","c"],["PPG","c"],["APG","c"],["RPG","c"],["SPG","c"],["BPG","c"]].map(([h,a])=>(
                  <th key={h} style={{padding:"6px 8px",textAlign:a==="c"?"center":"left",color:"#475569",fontSize:10}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {playerRows.map((s,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #0d1626"}}>
                    <td style={{padding:"6px 8px",fontWeight:700}}>{i===0?"🏅 ":""}{s.name}</td>
                    <td style={{textAlign:"center",color:"#64748b"}}>{s.gp}</td>
                    <td style={{textAlign:"center",background:cellBg("pts",s.ppg*1.5),padding:"5px 4px",fontWeight:700}}>{s.ppg}</td>
                    <td style={{textAlign:"center",background:cellBg("ast",s.apg*1.5),padding:"5px 4px"}}>{s.apg}</td>
                    <td style={{textAlign:"center",background:cellBg("reb",s.rpg*1.5),padding:"5px 4px"}}>{s.rpg}</td>
                    <td style={{textAlign:"center",background:cellBg("stl",s.spg*2),padding:"5px 4px"}}>{s.spg}</td>
                    <td style={{textAlign:"center",background:cellBg("blk",s.bpg*2),padding:"5px 4px"}}>{s.bpg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            {playoff&&<button onClick={()=>buildPlayoffBracket(season,finalAi)} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 18px rgba(245,158,11,0.3)"}}>🏆 START PLAYOFFS</button>}
            <button onClick={newSeason} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",border:"none",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:800,cursor:"pointer"}}>🔄 NEW SEASON</button>
          </div>
        </div>
      </div>
    );
  }

  // ── GAME SCREEN ──────────────────────────────────────
  if(phase==="game"&&inSeason){
    const opp=aiTeams[schedIdx];
    const gp=Math.min(gameNum-1+(result?1:0),aiTeams.length>0?aiTeams[0].gameLog.length:0);
    const curAi=getAiRecordsAtGame(aiTeams,gp);
    const won=result?result.myScore>result.oppScore:false;
    return(
      <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:16}}>
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
              <button onClick={playGame} style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",border:"none",borderRadius:10,padding:"11px 32px",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(34,197,94,0.3)"}}>▶ PLAY GAME {gameNum}</button>
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

  // ── DRAFT SCREEN ─────────────────────────────────────
  const display=playerPool
    .filter(p=>(posF==="ALL"||p.pos===posF)&&(search===""||p.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>sortBy==="rating"?b.rating-a.rating:sortBy==="cost"?b.cost-a.cost:a.name.localeCompare(b.name));

  return(
    <div style={{background:"#080f1e",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui",padding:14}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:900,background:"linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              💰 NBA BUDGET BALL <span style={{fontSize:11,color:"#475569",WebkitTextFillColor:"#475569"}}>v2.5</span>
            </h1>
            <div style={{fontSize:10,color:"#475569",marginTop:1}}>{playerPool.length} players · Budget ${BUDGET} · {SEASON_LENGTH}-game season · Playoffs</div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[["BUDGET",`$${rem}`,rem<15?"#ef4444":rem<30?"#f59e0b":"#22c55e"],["SPENT",`$${spent}`,"#94a3b8"],["RTG",myEffVal??"-","#a78bfa"],["CHEM",myCh>0?`+${myCh}`:"-","#f472b6"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center",background:"#0f172a",borderRadius:7,padding:"4px 10px",border:"1px solid #1e293b"}}>
                <div style={{fontSize:9,color:"#475569",letterSpacing:1}}>{l}</div>
                <div style={{fontSize:15,fontWeight:900,color:c}}>{v}</div>
              </div>
            ))}
            <button onClick={()=>setPhase("import")} style={{background:"#1e293b",color:"#64748b",border:"1px solid #334155",borderRadius:7,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>↩ Import</button>
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
                          <div style={{display:"flex",gap:3,marginTop:1,flexWrap:"wrap"}}>
                            <Tag label={tier.label} color={tier.color} bg={tier.bg}/>
                            {m<1&&<Tag label={`OOP ×${m}`} color="#fbbf24" bg="#78350f"/>}
                            {myCh>0&&<Tag label="⚡CHEM" color="#f472b6" bg="#4a044e"/>}
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
                {full?"🏀 START SEASON":`${5-filled} SLOT${5-filled!==1?"S":""} REMAINING`}
              </button>
            </div>

            <div style={{background:"#0f172a",borderRadius:10,padding:10,border:"1px solid #1e293b",fontSize:10,color:"#64748b"}}>
              <div style={{fontWeight:700,fontSize:9,color:"#475569",letterSpacing:1,marginBottom:4}}>HOW TO PLAY</div>
              <div style={{marginBottom:2}}>• Build your team within ${BUDGET} budget</div>
              <div style={{marginBottom:2}}>• 12-team league — AI teams have real records</div>
              <div style={{marginBottom:2}}>• ⚡ Chemistry: real teammates same season+team</div>
              <div style={{marginBottom:2}}>• Top 6 make playoffs — seeds 1 &amp; 2 get byes</div>
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
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 10px",fontSize:11,color:"#e2e8f0",outline:"none",width:140}}/>
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