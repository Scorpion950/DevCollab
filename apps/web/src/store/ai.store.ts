import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AIAction = "summarize-project" | "whats-blocking-us" | "standup-report" | "task-breakdown" | "code-review";

interface ProjectAIState {
  activeAction: AIAction | null;
  result: any | null;
  codeContent: string;
  codeLanguage: string;
  taskDesc: string;
}

interface AIStore {
  projects: Record<string, ProjectAIState>;
  updateProjectAIState: (projectId: string, state: Partial<ProjectAIState>) => void;
  getProjectAIState: (projectId: string) => ProjectAIState;
}

export const useAIStore = create<AIStore>()(
  persist(
    (set, get) => ({
      projects: {},
      updateProjectAIState: (projectId, state) => {
        set((prev) => ({
          projects: {
            ...prev.projects,
            [projectId]: {
              ...(prev.projects[projectId] || {
                activeAction: null,
                result: null,
                codeContent: "",
                codeLanguage: "javascript",
                taskDesc: "",
              }),
              ...state,
            },
          },
        }));
      },
      getProjectAIState: (projectId) => {
        return get().projects[projectId] || {
          activeAction: null,
          result: null,
          codeContent: "",
          codeLanguage: "javascript",
          taskDesc: "",
        };
      },
    }),
    {
      name: 'ai-store',
    }
  )
);
