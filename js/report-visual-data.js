import { StatsEngine } from './stats-engine.js';

const absYardLine = (tags = {}) => {
  const yardLine = parseInt(tags.yardLine);
  if (!yardLine) return null;
  return (tags.fieldSide || 'own') === 'opp' ? 100 - yardLine : yardLine;
};
const isRun = play => play.tags?.runPass === 'Run' || (play.tags?.runPass !== 'Pass' && !!play.tags?.playType?.toLowerCase().includes('run'));
const isSuccess = play => {
  const tags = play.tags || {}, yards = parseInt(tags.yardage) || 0, distance = parseInt(tags.distance) || 10;
  if (String(tags.result || '').split(/\s*\+\s*/).includes('Touchdown') || tags.custom?.includes('1st Down')) return true;
  if (tags.down === '1') return yards >= distance * .5;
  if (tags.down === '2') return yards >= distance * .7;
  if (tags.down === '3' || tags.down === '4') return yards >= distance;
  return yards >= 4;
};
const fieldData = plays => {
  const W=1200,H=560,fStart=70,fEnd=1130,fTop=70,fBot=480,fW=fEnd-fStart,fH=fBot-fTop;
  const points=plays.filter(play=>absYardLine(play.tags)!==null).map(play=>{
    const tags=play.tags||{},yards=parseInt(tags.yardage)||0,results=String(tags.result||'').split(/\s*\+\s*/);
    let color='#888',radius=7;
    if(results.includes('Touchdown')){color='#22c55e';radius=9;}
    else if(yards>=20){color='#38bdf8';radius=8;}
    else if(yards>=4)color='#f97316';
    else if(yards<=0||results.includes('Loss')||results.includes('Sack'))color='#ef4444';
    else if(results.includes('Interception')||results.includes('Fumble')){color='#a855f7';radius=8;}
    const suffix=({'1':'st','2':'nd','3':'rd','4':'th'})[tags.down]||'';
    const situation=[tags.down?`${tags.down}${suffix} & ${tags.distance||'?'}`:'',tags.playType||''].filter(Boolean).join(' / ');
    const phase=tags.unit==='defense'?'Defense':tags.unit==='special'?'Special Teams':'Offense';
    const label=`Play ${play.id} - ${phase}${situation?' - '+situation:''} - ${yards>=0?'+':''}${yards} yd${tags.result?' - '+tags.result:''}`;
    const yFrac=tags.hash==='Left'?.25:tags.hash==='Right'?.75:.5;
    return {ref:play.__gid!=null?`${play.__gid}::${play.id}`:String(play.id),label,
      x:fStart+absYardLine(tags)/100*fW,y:fTop+yFrac*fH+(((Number(play.id)||0)*37)%11-5)*2.1,color,radius};
  });
  return {W,H,fStart,fEnd,fTop,fBot,fW,fH,points,total:plays.length};
};
const downDistanceData=plays=>{
  const buckets=[['1-3',v=>v>=1&&v<=3],['4-6',v=>v>=4&&v<=6],['7-10',v=>v>=7&&v<=10],['11+',v=>v>=11]];
  const rows=['1','2','3','4'].map(down=>({down,label:down+({'1':'st','2':'nd','3':'rd','4':'th'})[down],
    cells:buckets.map(([,test])=>{const matched=plays.filter(play=>play.tags?.down===down&&test(parseInt(play.tags?.distance)||0));
      return {count:matched.length,runs:matched.filter(isRun).length,successes:matched.filter(isSuccess).length};})}));
  const max=Math.max(1,...rows.flatMap(row=>row.cells.map(cell=>cell.count)));
  rows.forEach(row=>row.cells.forEach(cell=>{cell.runPct=cell.count?Math.round(cell.runs/cell.count*100):0;cell.successPct=cell.count?Math.round(cell.successes/cell.count*100):0;cell.intensity=cell.count/max;}));
  return {hasData:rows.some(row=>row.cells.some(cell=>cell.count)),buckets:buckets.map(([label])=>label),rows};
};
const formationPlayData=plays=>{
  const formsOf=play=>StatsEngine.splitFormations(StatsEngine.proj(play).formation);
  const formations=[...new Set(plays.flatMap(formsOf))],playTypes=[...new Set(plays.map(play=>play.tags?.playType).filter(Boolean))];
  if(!formations.length||!playTypes.length)return {hasData:false,playTypes,rows:[]};
  const matrix=formations.map(formation=>playTypes.map(type=>plays.filter(play=>formsOf(play).includes(formation)&&play.tags?.playType===type).length));
  const max=Math.max(1,...matrix.flat());
  return {hasData:true,playTypes,rows:formations.map((formation,index)=>{const total=matrix[index].reduce((sum,count)=>sum+count,0);
    return {formation,total,cells:matrix[index].map(count=>({count,intensity:count/max,pct:total?Math.round(count/total*100):0}))};})};
};
const hashData=plays=>{
  const hashes=['Left','Middle','Right'],types=[
    ['Run Inside',play=>/run inside/i.test(play.tags?.playType||'')],['Run Outside',play=>/run outside/i.test(play.tags?.playType||'')],
    ['Short Pass',play=>/short pass|screen/i.test(play.tags?.playType||'')],['Med/Deep Pass',play=>/(medium|deep) pass|play action/i.test(play.tags?.playType||'')],
    ['RPO/Trick',play=>/rpo|trick/i.test(play.tags?.playType||'')]];
  const totals=hashes.map(hash=>plays.filter(play=>play.tags?.hash===hash).length);
  const rows=types.map(([name,test])=>{const cells=hashes.map((hash,index)=>{const count=plays.filter(play=>play.tags?.hash===hash&&test(play)).length;
    return {count,pct:totals[index]?Math.round(count/totals[index]*100):0,intensity:totals[index]?count/totals[index]:0};});
    return {name,total:cells.reduce((sum,cell)=>sum+cell.count,0),cells};});
  return {hasData:totals.some(Boolean),hashes,totals,total:totals.reduce((sum,value)=>sum+value,0),rows};
};
export function offenseHeatMapData(plays=[]){
  const field=fieldData(plays),downDistance=downDistanceData(plays),formationPlay=formationPlayData(plays),hash=hashData(plays);
  const initial=field.points.length?'field':downDistance.hasData?'dd':formationPlay.hasData?'fxp':hash.hasData?'hash':'field';
  return {initial,field,downDistance,formationPlay,hash};
}
export function offenseVisualizationData(plays=[]){
  const eligible=plays.filter(play=>play.tags&&(play.tags.playType||play.tags.runPass));
  if(eligible.length<3)return null;
  const located=eligible.filter(play=>absYardLine(play.tags)!==null);
  const zones=[[0,20,'Own 1-20'],[20,40,'Own 20-40'],[40,60,'Midfield'],[60,80,'Opp 40-20'],[80,100,'Red Zone']].map(([lo,hi,label])=>{
    const matched=located.filter(play=>{const pos=absYardLine(play.tags);return(pos>=lo&&pos<hi)||(hi===100&&pos===100);});
    return {label,count:matched.length,pct:matched.length?Math.round(matched.filter(isSuccess).length/matched.length*100):null};});
  const points=eligible.map(play=>({x:absYardLine(play.tags),y:parseInt(play.tags?.yardage),run:isRun(play)})).filter(point=>point.x!=null&&!Number.isNaN(point.y));
  const quarters=['Q1','Q2','Q3','Q4'].map(quarter=>{const matched=eligible.filter(play=>play.tags?.quarter===quarter),yards=matched.reduce((sum,play)=>sum+(parseInt(play.tags?.yardage)||0),0);
    return {quarter,count:matched.length,runPct:matched.length?Math.round(matched.filter(isRun).length/matched.length*100):0,avg:matched.length?yards/matched.length:0};}).filter(row=>row.count);
  return {zones:located.length>=3?zones:null,spray:points.length>=3?{points,yMax:Math.max(10,...points.map(point=>point.y)),yMin:Math.min(-5,...points.map(point=>point.y))}:null,quarters:quarters.length>=2?quarters:null};
}
