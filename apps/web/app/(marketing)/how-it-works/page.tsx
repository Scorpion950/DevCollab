import { PublicIntro, StartCTA } from "@/components/public-intro";
import { WorkflowGuide } from "@/components/demos/workflow-guide";
export const metadata={title:"How it works · DevCollab"};
const questions=[
  ["What is DevCollab?","A planned collaborative engineering workspace that connects people, agents, tasks, and review history."],
  ["Can developers work together without an agent?","Yes. The planned workflow lets a developer own a task and another teammate review the changes."],
  ["Who approves AI-generated changes?","Human reviewers will approve changes. Agents will operate within scoped permissions."],
  ["How will organizations control visibility?","Organization and project permissions will determine who can access work and management information."],
  ["Will GitHub repositories be supported?","GitHub repository integration is planned. This walkthrough uses a fictional repository."],
];
export default function HowItWorks(){
  return <main id="main" className="frame public-page"><PublicIntro label="Workflow / Field guide" title="From an idea to production." accent="One connected workflow." description="Discover how DevCollab brings projects, developers, AI agents, and code reviews together."/><WorkflowGuide/>
    <section className="faq"><h2>Workflow questions</h2><div>{questions.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section><StartCTA/></main>;
}
