import { Blocks, Bot, ChartNoAxesColumnIncreasing, CirclePlay, Database, GitMerge, Layers3, ListTodo, Monitor, PackageCheck, Server, SquareCode, UsersRound } from "lucide-react";
import Link from "next/link";

import { WorkspaceIllustration } from "@/components/workspace-illustration";
import { PlatformConsole } from "@/components/demos/platform-console";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Layers3, title: "Unified Engineering Workspace", body: "Keep a project’s tasks, branches, and reviews in one shared context." },
  { icon: UsersRound, title: "Human + AI Collaboration", body: "Give every task a clear owner, whether it’s a developer or an agent." },
  { icon: Bot, title: "Autonomous Development Agents", body: "Hand an agent a scoped task and inspect its proposed changes." },
  { icon: ChartNoAxesColumnIncreasing, title: "Engineering and AI Cost Visibility", body: "Connect agent usage and engineering effort to the work that produced them." },
];

const workflow = [
  { icon: Blocks, name: "Create project", detail: "Set the scope and bring your team together." },
  { icon: ListTodo, name: "Define task", detail: "Describe the change and its acceptance criteria." },
  { icon: UsersRound, name: "Assign owner", detail: "Choose a developer or an AI agent." },
  { icon: GitMerge, name: "Review changes", detail: "Inspect the diff and request revisions." },
  { icon: PackageCheck, name: "Ship", detail: "Merge the approved changes for release." },
];

const architecture = [
  { icon: Monitor, name: "Web interface", stack: "Next.js · React · Tailwind CSS" },
  { icon: Server, name: "Service layer", stack: "NestJS · REST · TypeScript" },
  { icon: Database, name: "Data layer", stack: "Prisma · Neon PostgreSQL" },
];

export default function Home() {
  return (

      <main id="main">
        <section className="hero frame" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow hero-eyebrow"><span className="signal" aria-hidden="true"><i /><i /><i /></span> The next engineering workspace</p>
            <h1 id="hero-title">Build together.<br /><em>Ship smarter.</em></h1>
            <p className="hero-description">One engineering workspace where developers and autonomous AI agents collaborate to turn tasks into working software.</p>
            <div className="hero-actions">
              <Button asChild><a href="#product"><SquareCode size={16} /> Explore the Platform</a></Button>
              <Button asChild variant="secondary"><Link href="/how-it-works"><CirclePlay size={16} /> See How It Works</Link></Button>
            </div>
          </div>
          <WorkspaceIllustration />
        </section>
        <section id="product" className="frame home-product" aria-labelledby="product-title">
          <h2 className="section-heading" id="product-title">Explore the Workspace</h2>
          <p>Experience how projects, tasks, AI agents, code reviews, and engineering insights come together in DevCollab.</p>
          <PlatformConsole />
        </section>
        <section id="features" className="frame content-section" aria-labelledby="features-title">
          <p className="eyebrow"><span className="index-mark" /> Planned capabilities</p>
          <h2 id="features-title" className="section-heading">A workspace built for both.</h2>
          <div className="feature-grid">{features.map(({ icon: Icon, title, body }) => (
            <article className="feature-card" key={title}><span className="icon-tile"><Icon size={23} strokeWidth={1.5} /></span><h3>{title}</h3><p>{body}</p></article>
          ))}</div>
        </section>
        <section id="workflow" className="workflow-section" aria-labelledby="workflow-title">
          <div className="frame">
            <p className="eyebrow"><span className="index-mark" /> Planned workflow</p>
            <h2 id="workflow-title" className="section-heading">From task to release.</h2>
            <ol className="workflow-list">{workflow.map(({ icon: Icon, name, detail }, index) => (
              <li key={name}><div className="step-marker"><Icon size={19} /><span>0{index + 1}</span></div><h3>{name}</h3><p>{detail}</p></li>
            ))}</ol>
          </div>
        </section>
        <section id="architecture" className="frame content-section architecture-section" aria-labelledby="architecture-title">
          <div><p className="eyebrow"><span className="index-mark" /> Architecture</p><h2 id="architecture-title" className="section-heading">Under the hood.</h2></div>
          <ul className="architecture-list">{architecture.map(({ icon: Icon, name, stack }) => (
            <li key={name}><Icon size={20} /><h3>{name}</h3><p>{stack}</p></li>
          ))}</ul>
        </section>
      </main>
  );
}
