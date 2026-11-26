type Task = { id: string; title: string; owner: string; state: "In progress" | "In review" | "Done" };

export type SampleProject = {
  name: string; branch: string; tasks: Task[];
  agent: string; activity: string[]; file: string; before: string; after: string;
};

export const projects: [SampleProject, ...SampleProject[]] = [
  {
    name: "Atlas API", branch: "feat/request-tracing", agent: "Agent 01",
    tasks: [
      { id: "ATL-024", title: "Add request tracing middleware", owner: "Agent 01", state: "In progress" },
      { id: "ATL-023", title: "Review pagination contract", owner: "Mira K.", state: "In review" },
      { id: "ATL-022", title: "Normalize error responses", owner: "Eli R.", state: "Done" },
    ],
    activity: ["Read middleware configuration", "Added request ID propagation", "Prepared changes for review"],
    file: "src/middleware/trace.ts", before: "req.traceId = Date.now();", after: 'req.traceId = randomUUID();',
  },
  {
    name: "Relay Console", branch: "feat/event-filters", agent: "Agent 02",
    tasks: [
      { id: "RLY-018", title: "Add event stream filters", owner: "Agent 02", state: "In progress" },
      { id: "RLY-017", title: "Review filter keyboard controls", owner: "Eli R.", state: "In review" },
      { id: "RLY-016", title: "Document event categories", owner: "Mira K.", state: "Done" },
    ],
    activity: ["Read event stream fixtures", "Applied category selection", "Prepared filter tests for review"],
    file: "src/events/filter.ts", before: "return events;", after: "return events.filter(matches);",
  },
];
