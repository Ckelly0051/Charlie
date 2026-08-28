import { useState } from 'preact/hooks';
import { Module } from './native-report-kit.jsx';
import { offenseHeatMapData, offenseVisualizationData } from './report-visual-data.js';

const activate=(point,screen)=>point.ref.includes('::')?screen.watchRefs([point.ref],point.label):screen.watchPredicate(play=>String(play.id)===point.ref,point.label);
function FieldMap({data,screen}){
  if(!data.points.length)return <p class="hm-caption">No plays have field position tagged. Tag yard line and side to populate this view.</p>;
  const lines=[];
  for(let i=0;i<=100;i+=10){const x=data.fStart+i/100*data.fW,major=i%50===0;lines.push(<line key={'l'+i} x1={x} y1={data.fTop} x2={x} y2={data.fBot} stroke="#fff" stroke-width={major?2:1} opacity={major?.6:.3}/>);
    if(i>0&&i<100){const label=i===50?50:i<50?i:100-i;lines.push(<text key={'t'+i} x={x} y={data.fTop+26} fill="#fff" text-anchor="middle" font-size="16" opacity=".7">{label}</text>);
      lines.push(<text key={'b'+i} x={x} y={data.fBot-10} fill="#fff" text-anchor="middle" font-size="16" opacity=".7">{label}</text>);}}
  const h1=data.fTop+data.fH*.35,h2=data.fTop+data.fH*.65;
  return <div class="hm-field-wrap"><svg viewBox={`0 0 ${data.W} ${data.H}`} class="heatmap-field">
    <rect x="0" y={data.fTop} width={data.fStart} height={data.fH} fill="#0a3a0a"/><rect x={data.fEnd} y={data.fTop} width={data.fStart} height={data.fH} fill="#0a3a0a"/>
    <rect x={data.fStart} y={data.fTop} width={data.fW} height={data.fH} fill="#1f5e1f"/>{lines}
    <line x1={data.fStart} y1={h1} x2={data.fEnd} y2={h1} stroke="#fff" stroke-dasharray="4 8" opacity=".25"/><line x1={data.fStart} y1={h2} x2={data.fEnd} y2={h2} stroke="#fff" stroke-dasharray="4 8" opacity=".25"/>
    <text x="35" y={(data.fTop+data.fBot)/2} fill="#fff" text-anchor="middle" font-size="26" font-weight="bold" transform={`rotate(-90 35 ${(data.fTop+data.fBot)/2})`}>OWN</text>
    <text x="1165" y={(data.fTop+data.fBot)/2} fill="#fff" text-anchor="middle" font-size="26" font-weight="bold" transform={`rotate(90 1165 ${(data.fTop+data.fBot)/2})`}>OPP</text>
    {data.points.map(point=><g key={point.ref} class="hm-dot" data-heat-ref={point.ref} data-heat-label={point.label} tabindex="0" role="button" aria-label={'Watch: '+point.label} onClick={()=>activate(point,screen)}
      onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(point,screen);}}}><circle cx={point.x} cy={point.y} r={point.radius+7} fill="transparent"/>
      <circle cx={point.x} cy={point.y} r={point.radius} fill={point.color} stroke="#000" stroke-width=".75" opacity=".85"/><title>{point.label}</title></g>)}</svg>
    <div class="hm-legend">{[['#22c55e','TD'],['#38bdf8','20+ yds'],['#f97316','4-19 yds'],['#6b7280','1-3 yds'],['#ef4444','Loss/Sack'],['#a855f7','Turnover']].map(([color,label])=><span key={label}><i style={{background:color}}/> {label}</span>)}</div>
    <p class="hm-caption">{data.points.length} of {data.total} plays plotted. Select a dot to watch that exact play.</p></div>;
}
function DownDistance({data}){return <><table class="dd-grid"><thead><tr><th/>{data.buckets.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.down}><th>{row.label}</th>{row.cells.map((cell,i)=><td key={i}
  style={{background:cell.count?`rgba(233,69,96,${cell.intensity*.75+.05})`:'transparent'}}><div class="dd-count">{cell.count||''}</div>{cell.count?<div class="dd-meta">{cell.runPct}%R / {cell.successPct}%S</div>:null}</td>)}</tr>)}</tbody></table>
  <p class="hm-caption">Cell intensity = play count. R = run share, S = success rate.</p></>;}
function FormationPlay({data}){if(!data.hasData)return <p class="hm-caption">Need both formation and play type tagged on at least a few plays.</p>;return <><div class="hm-scroll"><table class="fxp-grid">
  <thead><tr><th/>{data.playTypes.map(x=><th class="rotated" key={x}><div>{x}</div></th>)}<th>Total</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.formation}><th>{row.formation}</th>{row.cells.map((cell,i)=><td key={i}
  style={{background:cell.count?`rgba(68,170,68,${cell.intensity*.85+.1})`:'transparent'}} title={`${row.formation} to ${data.playTypes[i]}: ${cell.count} (${cell.pct}%)`}>{cell.count||''}</td>)}<td><b>{row.total}</b></td></tr>)}</tbody></table></div>
  <p class="hm-caption">Darker = called more often. Hover a cell for percentage of that formation.</p></>;}
function HashTendency({data}){if(!data.hasData)return <p class="hm-caption">No hash data tagged on any plays.</p>;return <><table class="hash-grid"><thead><tr><th/>{data.hashes.map(x=><th key={x}>{x}</th>)}<th>Total</th></tr></thead>
  <tbody>{data.rows.map(row=><tr key={row.name}><th>{row.name}</th>{row.cells.map((cell,i)=><td key={i} style={{background:cell.count?`rgba(136,221,255,${cell.intensity*.8+.05})`:'transparent'}}
  title={`${cell.pct}% of ${data.hashes[i]} hash`}>{cell.count||''}</td>)}<td><b>{row.total}</b></td></tr>)}<tr><th>Total</th>{data.totals.map((x,i)=><td key={i}><b>{x}</b></td>)}<td><b>{data.total}</b></td></tr></tbody></table>
  <p class="hm-caption">Cell intensity = share of plays from that hash.</p></>;}
export function NativeHeatMaps({plays,screen}){const data=offenseHeatMapData(plays),[active,setActive]=useState(data.initial);
  const panel=active==='field'?<FieldMap data={data.field} screen={screen}/>:active==='dd'?<DownDistance data={data.downDistance}/>:active==='fxp'?<FormationPlay data={data.formationPlay}/>:<HashTendency data={data.hash}/>;
  return <Module title="Heat Maps"><div class="heatmap-tabs" role="tablist" aria-label="Heat map view">{[['field','Field Position'],['dd','Down & Distance'],['fxp','Formation x Play'],['hash','Hash Tendency']].map(([key,label])=>
    <button type="button" role="tab" aria-selected={active===key} class={`hm-tab${active===key?' active':''}`} onClick={()=>setActive(key)} key={key}>{label}</button>)}</div><div class="heatmap-panels"><div class="hm-panel active">{panel}</div></div></Module>;}
function Spray({data}){const W=600,H=240,L=36,B=26,T=10,R=10,xOf=x=>L+x/100*(W-L-R),yOf=y=>T+(1-(y-data.yMin)/(data.yMax-data.yMin))*(H-T-B),zero=yOf(0);
  return <div class="viz-block"><h4>Field Position vs. Yardage Gained <span class="viz-legend"><i class="dot run"/>Run <i class="dot pass"/>Pass</span></h4><svg class="viz-svg" viewBox={`0 0 ${W} ${H}`}>
  {[0,20,40,60,80,100].map(x=><g key={x}><line x1={xOf(x)} y1={T} x2={xOf(x)} y2={H-B} stroke="#243049"/><text x={xOf(x)} y={H-B+14} fill="#8b949e" font-size="9" text-anchor="middle">{x===0||x===100?'G':x<=50?x:100-x}</text></g>)}
  <line x1={L} y1={zero} x2={W-R} y2={zero} stroke="#4a5a7d" stroke-width="1.5" stroke-dasharray="4 3"/><text x={L-4} y={zero+3} fill="#8b949e" font-size="9" text-anchor="end">0</text>
  {data.points.map((p,i)=><circle key={i} cx={xOf(p.x)} cy={yOf(p.y)} r="4" fill={p.run?'#f97316':'#38bdf8'} fill-opacity=".8"/>)}</svg><p class="viz-caption">Field position vs. yardage gained.</p></div>;}
export function NativeOffenseVisualizations({plays}){const data=offenseVisualizationData(plays);if(!data||(!data.zones&&!data.spray&&!data.quarters))return null;return <Module title="Visualizations"><div class="viz-section">
  {data.zones?<div class="viz-block"><h4>Success by Field Zone <span class="viz-sub">attacking</span></h4><div class="viz-field-strip">{data.zones.map(zone=><div class="viz-zone" key={zone.label}
  style={{background:zone.pct==null?'#1c2128':`hsl(${Math.round(zone.pct/100*120)} 65% 42%)`}}><span class="viz-zone-label">{zone.label}</span><span class="viz-zone-val">{zone.pct==null?'-':zone.pct+'%'}</span><span class="viz-zone-n">{zone.count} plays</span></div>)}</div></div>:null}
  {data.spray?<Spray data={data.spray}/>:null}{data.quarters?<div class="viz-block"><h4>By Quarter <span class="viz-legend"><i class="dot run"/>Run <i class="dot pass"/>Pass / avg yds</span></h4><div class="viz-q-chart">
  {data.quarters.map(row=><div class="viz-q-row" key={row.quarter}><span class="viz-q-name">{row.quarter}</span><div class="viz-q-bars"><div class="viz-q-bar run" style={{width:row.runPct+'%'}}/><div class="viz-q-bar pass" style={{width:(100-row.runPct)+'%'}}/></div>
  <span class="viz-q-avg">{row.avg.toFixed(1)} yd</span><span class="viz-q-n">{row.count}</span></div>)}</div></div>:null}</div></Module>;}
