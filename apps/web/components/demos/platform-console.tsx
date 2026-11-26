"use client";
import { useState } from "react";
import { Activity, Box, CircuitBoard, Columns3, FileDiff, Gauge, LayoutPanelLeft } from "lucide-react";
import { demoProjects, states, usage, type Stage } from "./fixtures";
import { AgentRun } from "./agent-run";
import { Review } from "./review";
import { Button } from "../ui/button";

const stations = [
  {name:"Workspace",icon:LayoutPanelLeft},{name:"Task board",icon:Columns3},{name:"Agent execution",icon:CircuitBoard},
  {name:"Code review",icon:FileDiff},{name:"Analytics",icon:Gauge},
];
function ProjectWorkspace({ index, station, setStation, overrides, setOverrides }: { index:number; station:string; setStation:(name:string)=>void; overrides:Record<string,Stage>; setOverrides:(values:Record<string,Stage>)=>void }) {
  const project=demoProjects[index]!;

  const [taskId,setTaskId]=useState(project.tasks[0]!.id);

  const [ownerOpen,setOwnerOpen]=useState(false);
  const tasks=project.tasks.map(task=>({...task,state:overrides[task.id]??task.state}));
  const selected=tasks.find(task=>task.id===taskId)!;
  const metrics=usage[index]!;
  function inspect(id:string) { setTaskId(id);setOwnerOpen(false); }
  const inspector=<aside className="inset"><p className="eyebrow">{selected.id} / Task detail</p><h3>{selected.title}</h3><p>{selected.description}</p>
    <label className="control-label">Task status<select value={selected.state} onChange={e=>setOverrides({...overrides,[taskId]:e.target.value as Stage})}>{states.map(s=><option key={s}>{s}</option>)}</select></label>
    <button className="owner" aria-expanded={ownerOpen} onClick={()=>setOwnerOpen(!ownerOpen)}>Assigned to {selected.owner}</button>
    {ownerOpen&&<p>{selected.owner.startsWith("Agent")?"Scoped coding agent · prepares patches for human review.":"Project developer · reviews acceptance criteria and implementation."}</p>}</aside>;
  return <><div className="station-tabs" aria-label="Demo views">{stations.map(({name,icon:Icon})=><button key={name} aria-pressed={station===name} onClick={()=>setStation(name)}><Icon size={16}/>{name}</button>)}</div>
    {station==="Workspace"&&<div className="demo-pad"><p className="eyebrow">{project.branch}</p><h2>{project.name} workspace</h2><div className="two-pane"><div><h3>Task list</h3>{tasks.map(t=><button className="task-select" aria-pressed={t.id===taskId} key={t.id} onClick={()=>inspect(t.id)}><small>{t.id} · {t.state}</small>{t.title}<small>{t.owner}</small></button>)}</div>{inspector}</div>
    <div className="two-pane report-row"><div><h3>Agent activity</h3>{project.activity.map(line=><p key={line}>{line}</p>)}</div><div><h3>Change summary</h3><code>{project.file}</code><pre><span className="removed">− {project.before}</span>{"\n"}<span className="added">+ {project.after}</span></pre></div></div></div>}
    {station==="Task board"&&<div className="demo-pad"><p className="eyebrow">Local task management</p><h2>{project.name} board</h2><div className="board">{states.map(stage=><div key={stage}><h3>{stage}</h3>{tasks.filter(t=>t.state===stage).map(t=><button className="task-select" key={t.id} aria-pressed={t.id===taskId} onClick={()=>inspect(t.id)}><small>{t.id}</small>{t.title}</button>)}{!tasks.some(t=>t.state===stage)&&<small>No tasks</small>}</div>)}</div>{inspector}<Button variant="secondary" onClick={()=>{setOverrides({});inspect(project.tasks[0]!.id)}}>Reset board</Button></div>}
    {station==="Agent execution"&&<AgentRun/>}{station==="Code review"&&<Review/>}
    {station==="Analytics"&&<div className="demo-pad"><p className="eyebrow">Sample data / last 7 days</p><h2>{project.name} activity</h2><p>Select a sample project to compare engineering effort and estimated usage.</p><dl className="metric-grid">{Object.entries({"Tasks completed":metrics.completed,"Active tasks":metrics.active,"Agent executions":metrics.runs,"Estimated tokens":metrics.tokens,"Estimated cost":metrics.cost}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>}
  </>;
}
export function PlatformConsole() {
  const [index,setIndex]=useState(0);
  const [edits,setEdits]=useState<Record<number,Record<string,Stage>>>({});
  const [station,setStation]=useState("Workspace");
  return <section className="console"><div className="console-bar"><Activity size={16}/> Product explorer <small>Interactive concept · Sample data</small></div><div className="console-grid">
    <aside className="console-sidebar"><p className="eyebrow">Projects</p>{demoProjects.map((project,i)=><button aria-pressed={index===i} key={project.name} onClick={()=>setIndex(i)}><Box size={15}/>{project.name}</button>)}</aside>
    <div className="console-content"><ProjectWorkspace key={index} index={index} station={station} setStation={setStation} overrides={edits[index]??{}} setOverrides={values=>setEdits({...edits,[index]:values})}/></div></div></section>;
}
