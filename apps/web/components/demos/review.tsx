"use client";
import { useState } from "react";
import { patch } from "./fixtures";
export function Review() {
  const [view,setView]=useState("Diff");
  return <div className="demo-pad"><p className="eyebrow">Sample review</p><h2>Inspect the proposed change</h2><p>Trim whitespace and reject a missing email before the registration handler continues.</p>
    <div className="switches">{["Original","Updated","Diff"].map(v=><button aria-pressed={v===view} key={v} onClick={()=>setView(v)}>{v}</button>)}</div>
    <div className="inset"><code>{patch.file}</code><pre>{view==="Original"?patch.before:view==="Updated"?patch.after:<><span className="removed">− {patch.before}</span>{"\n"}<span className="added">{patch.after.split("\n").map(line=>"+ "+line).join("\n")}</span></>}</pre></div>
    <p className="result-note">Sample tests passed · Blank address rejected · Valid address accepted</p></div>;
}
