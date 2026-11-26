import { projects } from "../preview-data";
export const states = ["To Do", "In Progress", "In Review", "Done"] as const;
export type Stage = typeof states[number];
const initialStage = {"In progress":"In Progress","In review":"In Review",Done:"Done"} as const;

const descriptions: Record<string,string> = {
  "ATL-024":"Give each incoming request a unique identifier and carry it through the service logs.",
  "ATL-023":"Check that cursors remain stable when new records arrive between requests.",
  "ATL-022":"Return one predictable error envelope across the API.",
  "RLY-018":"Show only events matching the selected category while retaining their original order.",
  "RLY-017":"Verify that filters can be reached, changed, and dismissed with the keyboard.",
  "RLY-016":"Describe each event category with a representative sample payload.",
};
export const demoProjects = projects.map(project => ({
  ...project,
  tasks: project.tasks.map(task => ({...task, state:initialStage[task.state], description:descriptions[task.id]})),
}));
export const usage = [
  {completed:18,active:5,runs:12,tokens:"186k",cost:"$2.79"},
  {completed:11,active:3,runs:7,tokens:"94k",cost:"$1.41"},
];
export const execution = [
  ["Task received","Add request validation to the registration endpoint. Reject blank addresses before processing."],
  ["Repository analyzed","Locate the example registration handler and its request tests."],
  ["Implementation planned","Trim the submitted address and handle an empty result."],
  ["Files modified","Prepare the example handler change in src/registration.ts."],
  ["Tests executed","Sample outcomes: blank address rejected; valid address accepted."],
  ["Changes prepared for review","Package the handler change and two request tests for inspection."],
  ["Human approval requested","A maintainer reviews the proposed patch before any merge."],
] as const;
export const patch = {
  file:"src/registration.ts",
  before:"const email = input.email;",
  after:'const email = input.email?.trim();\nif (!email) return badRequest("Email required");',
};
