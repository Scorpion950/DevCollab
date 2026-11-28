import { PublicIntro, StartCTA } from "@/components/public-intro";
import { WorkflowGuide } from "@/components/demos/workflow-guide";
export const metadata={title:"How it works · DevCollab"};
const questions=[
  ["What is DevCollab?","A collaborative engineering platform connecting organizations, tasks, GitHub pull requests, internal code reviews, AI coding agents, a browser IDE, real-time editing sessions, and engineering analytics."],
  ["Can developers work together without an agent?","Yes. Teams manage tasks across Kanban and list views, link pull requests, collaborate in live shared IDE sessions, and perform line-level internal code reviews."],
  ["Who approves AI-generated changes?","Human reviewers remain in full control. Developers approve agent execution plans, inspect validated unified diffs, and explicitly decide what gets accepted or applied."],
  ["How do organizations control visibility?","Organization roles (Owner, Admin, Member) and project roles (Project Manager, Developer) govern access across dashboards, repositories, AI runs, IDE workspaces, and cost analytics."],
  ["Are GitHub repositories supported?","Yes. Projects connect repositories via a dedicated GitHub App with webhook sync, PR tracking, AI context snapshots, and isolated local workspace branches. The walkthrough above illustrates the workflow with sample data."],
];
export default function HowItWorks(){
  return <main id="main" className="frame public-page"><PublicIntro label="Workflow / Field guide" title="From an idea to production." accent="One connected workflow." description="Discover how DevCollab brings projects, developers, AI agents, and code reviews together."/><WorkflowGuide/>
    <section className="faq"><h2>Workflow questions</h2><div>{questions.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section><StartCTA/></main>;
}
