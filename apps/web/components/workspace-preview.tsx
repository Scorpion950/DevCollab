"use client";

import { useState } from "react";
import { Activity, Box, Bot, Check, ChevronRight, CircleCheck, CircleDot, Code2, FileCode2, Folder, GitBranch, GitPullRequest, UsersRound, ListTodo, PanelLeft } from "lucide-react";
import { BrandMark } from "./brand";
import { projects } from "./preview-data";

export function WorkspacePreview() {
  const [selected, setSelected] = useState(0);
  const project = projects[selected] ?? projects[0];
  const { name, tasks, activity, agent } = project;
  return (
    <section className="frame preview-section" id="product" aria-labelledby="preview-title">
      <div className="section-rule">
        <h2 id="preview-title" className="eyebrow"><span className="index-mark" />Workspace preview</h2>
        <span className="concept-label"><span />Interactive concept</span>
      </div>
      <div className="workspace-window">
        <div className="window-bar">
          <span className="window-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="window-route"><PanelLeft size={13} /> devcollab <b>/</b> workspace</span>
          <span className="sample-tag">Sample data</span>
        </div>
        <div className="workspace-body">
          <aside className="project-sidebar" aria-label="Sample projects">
            <div className="workspace-name"><BrandMark />DevCollab</div>
            <p className="micro sidebar-label">Projects</p>
            <div className="project-choices">{projects.map((item, index) =>
              <button key={item.name} type="button" className="project-choice" aria-pressed={index === selected}
                onClick={() => setSelected(index)}><Box size={15} />{item.name}</button>
            )}</div>
            <div className="sidebar-bottom"><UsersRound size={14} /> 2 developers · 1 agent</div>
          </aside>
          <div className="project-main">
            <div className="project-breadcrumb"><Folder size={13} /> Projects <ChevronRight size={12} /> <span>{name}</span></div>
            <h3>{name}</h3>
            <div className="preview-columns">
              <div className="task-area">
                <h4 className="preview-heading"><ListTodo size={16} /> Task list <span className="count">{tasks.length}</span></h4>
                <ul className="tasks">{tasks.map(task => {
                  const isAgent = task.owner.startsWith("Agent");
                  const StatusIcon = task.state === "Done" ? CircleCheck : task.state === "In review" ? GitPullRequest : CircleDot;
                  return <li key={task.id}>
                    <span className="task-meta">{task.id}<span className={`task-state ${task.state === "In progress" ? "in-progress" : task.state === "In review" ? "in-review" : ""}`}><StatusIcon size={12} />{task.state}</span></span>
                    <strong>{task.title}</strong>
                    <span className="task-owner">{isAgent ? <span className="agent-avatar"><Bot size={12} /></span> : <span className="person-avatar">{task.owner[0]}</span>}{task.owner}</span>
                  </li>;
                })}</ul>
              </div>
              <div className="execution-area">
                <h4 className="preview-heading"><Activity size={16} /> Agent activity</h4>
                <div className="agent-activity">
                  <div className="agent-name"><Bot size={15} /> {agent} <span>/ sample run</span></div>
                  <ul>{activity.map(line => <li key={line}><Check size={12} />{line}</li>)}</ul>
                </div>
                <h4 className="preview-heading review-heading"><GitPullRequest size={15} /> Change summary</h4>
                <div className="diff">
                  <div><FileCode2 size={13} />{project.file}</div>
                  <code className="removed">− {project.before}</code>
                  <code className="added">+ {project.after}</code>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="workspace-foot"><span><GitBranch size={12} />{project.branch}</span><span><Code2 size={13} />TypeScript</span></div>
      </div>
    </section>
  );
}
