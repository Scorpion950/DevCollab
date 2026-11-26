"use client";
import { useState } from "react";
import { Boxes, FolderGit2, ListTodo, UsersRound, GitPullRequest, CircleCheck } from "lucide-react";
import { projects } from "../preview-data";
import { Button } from "../ui/button";

const project=projects[0], task=project.tasks[0]!;
const steps=[
  {name:"Create an organization",icon:Boxes,body:"Bring the engineering team into a shared organization. Membership determines which projects each person can see."},
  {name:"Create a project",icon:FolderGit2,body:"Connect a repository to a project so tasks and proposed changes share the same context."},
  {name:"Define development tasks",icon:ListTodo,body:"Describe a small change and agree on how a reviewer will know it works."},
  {name:"Assign work",icon:UsersRound,body:"Choose who prepares the patch. The task keeps its scope and acceptance criteria on either path."},
  {name:"Review changes",icon:GitPullRequest,body:"A human maintainer checks the diff and test results before approving the merge."},
  {name:"Complete the task",icon:CircleCheck,body:"After approval and merge, the task moves to Done. The project keeps the decision alongside the change."},
];
export function WorkflowGuide() {
  const [step,setStep]=useState(0);
  const [agent,setAgent]=useState(false);
  const current=steps[step]!;
  const owner=agent?project.agent:"Mira K.";
  const records=[
    [["Organization","Northline Engineering"],["Members","Mira K. · Eli R."],["Visibility","Invited team members"]],
    [["Project",project.name],["Example repository","northline/atlas-api"],["Default branch","main"]],
    [["Task",task.title],["Priority","High"],["Acceptance criteria","Every request has a unique trace ID that appears in its logs."]],
    [["Assigned to",owner],["Work in progress",agent?"Analyzes the handler, prepares the patch, then runs the sample request tests.":"Mira receives the task, updates the handler, and checks the request logs."],["Scope",agent?"Task branch only · human approval required":"Project developer · task branch"]],
    [["Patch author",owner],["Reviewer","Eli R."],["Review activity","Verified that simultaneous requests receive distinct identifiers."]],
    [["Task",task.id+" · Done"],["Contributor",owner],["Merge record","Eli approved the trace ID change. The task branch was merged into main."]],
  ];
  const Icon=current.icon;
  return <section className="console"><div className="console-bar">Workflow walkthrough <small>Planned behavior · Interactive concept</small></div><div className="guide-grid"><ol className="stage-list">{steps.map(({name},i)=><li key={name}><button aria-current={i===step?"step":undefined} data-active={step===i} onClick={()=>setStep(i)}><span>0{i+1}</span>{name}</button></li>)}</ol>
  <div className="demo-pad"><p className="eyebrow"><Icon size={17}/>Step {step+1} of 6</p><h2>{current.name}</h2><p>{current.body}</p>
    {step===3&&<div className="switches">{["Human developer","Autonomous AI agent"].map((name,i)=><button key={name} aria-pressed={agent===Boolean(i)} onClick={()=>setAgent(Boolean(i))}>{name}</button>)}</div>}
    <dl className="record">{records[step]!.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {step===4&&<pre><code className="removed">− {project.before}</code>{"\n"}<code className="added">+ {project.after}</code></pre>}
    <progress value={step+1} max={6} aria-label="Workflow progress"/>
    <div className="action-row"><Button variant="secondary" disabled={!step} onClick={()=>setStep(step-1)}>Previous step</Button><Button disabled={step===5} onClick={()=>setStep(step+1)}>Next step</Button></div>
  </div></div></section>;
}
