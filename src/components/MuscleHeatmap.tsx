import {useMemo,useState} from 'react';
import type {StrengthEntry} from '../types/health';

const labels:Record<string,string>={Chest:'胸部',Back:'背部',Shoulders:'肩部',Biceps:'肱二头肌',Triceps:'肱三头肌',Core:'核心',Glutes:'臀部',Quadriceps:'股四头肌',Hamstrings:'腿后侧',Calves:'小腿',Other:'其他'};
const front=['Shoulders','Chest','Biceps','Core','Quadriceps','Calves'];
const back=['Shoulders','Back','Triceps','Glutes','Hamstrings','Calves'];

export function MuscleHeatmap({entries}:{entries:StrengthEntry[]}){
  const stats=useMemo(()=>{const map=new Map<string,{count:number,last:string}>();for(const entry of entries)for(const part of entry.primaryBodyParts){const current=map.get(part)??{count:0,last:''};current.count++;if(entry.date>current.last)current.last=entry.date;map.set(part,current)}return map},[entries]);
  const max=Math.max(1,...[...stats.values()].map(x=>x.count));
  const [selected,setSelected]=useState('Back');
  const zone=(part:string,side:string)=>{const item=stats.get(part)??{count:0,last:''},level=item.count/max;return <button key={`${side}-${part}`} className={`muscle-zone ${side}-${part.toLowerCase()}`} style={{'--heat':level} as React.CSSProperties} onClick={()=>setSelected(part)} aria-pressed={selected===part} aria-label={`${labels[part]??part}，训练${item.count}次`}>{item.count>0&&<span>{item.count}</span>}</button>};
  const current=stats.get(selected)??{count:0,last:''};
  return <div className="muscle-heatmap"><div className="muscle-figures"><div className="muscle-view"><small>正面</small><div className="body-map front-map"><i className="body-head"/><i className="body-torso"/><i className="body-arm left"/><i className="body-arm right"/><i className="body-leg left"/><i className="body-leg right"/>{front.map(x=>zone(x,'front'))}</div></div><div className="muscle-view"><small>背面</small><div className="body-map back-map"><i className="body-head"/><i className="body-torso"/><i className="body-arm left"/><i className="body-arm right"/><i className="body-leg left"/><i className="body-leg right"/>{back.map(x=>zone(x,'back'))}</div></div></div><div className="heat-legend"><span>少</span><i/><i/><i/><i/><span>多</span></div><div className="muscle-selection" aria-live="polite"><b>{labels[selected]??selected}</b><span>{current.count} 次训练{current.last?` · 最近 ${current.last}`:' · 暂无记录'}</span></div></div>
}
