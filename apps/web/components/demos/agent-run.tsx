"use client";
import { useEffect, useState } from "react";
import { execution, patch } from "./fixtures";
import { Button } from "../ui/button";

export function AgentRun() {
  const [current,setCurrent] = useState(-1);
  const [inspected,setInspected] = useState<number | null>(null);
  useEffect(() => {
    if (current < 0 || current >= execution.length - 1) return;
    const timer = setTimeout(() => setCurrent(current + 1), 900);
    return () => clearTimeout(timer);
  }, [current]);
  const detail = execution[inspected ?? Math.max(current,0)]!;
  return <div className="demo-pad"><p className="eyebrow">Interactive Concept Demo — Simulated Execution</p>
    <h2>Validate a registration request</h2>
    <div className="two-pane"><ol className="stage-list">{execution.map(([title],i)=><li key={title}><button type="button" data-active={i===current} aria-pressed={i===(inspected??current)} onClick={()=>setInspected(i)}><span>{i<current?"✓":String(i+1).padStart(2,"0")}</span>{title}</button></li>)}</ol>
    <div className="inset"><p className="eyebrow">Step inspection</p><h3>{detail[0]}</h3><p>{detail[1]}</p>
    <h4>Sample file change</h4><code>{patch.file}</code><pre>{patch.after}</pre>
    <p role="status">{current<0?"Ready to simulate":execution[current]?.[0]}</p></div></div>
    <div className="action-row"><Button disabled={current!==-1} onClick={()=>setCurrent(0)}>Start simulation</Button><Button variant="secondary" onClick={()=>{setCurrent(-1);setInspected(null)}}>Reset simulation</Button></div></div>;
}
