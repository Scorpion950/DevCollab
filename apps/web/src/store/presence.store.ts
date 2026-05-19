import { create } from 'zustand';

interface Viewer {
  id: string;
  name: string;
  avatar?: string;
  viewingTaskId?: string;
}

interface PresenceStore {
  viewers: Viewer[];
  taskViewers: Record<string, Viewer[]>;
  setViewers: (viewers: Viewer[]) => void;
  addViewer: (viewer: Viewer) => void;
  removeViewer: (userId: string) => void;
  setTaskViewers: (taskId: string, viewers: Viewer[]) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  viewers: [],
  taskViewers: {},

  setViewers: (viewers) => set({ viewers }),

  addViewer: (viewer) =>
    set((state) => {
      // Check if viewer already exists
      const exists = state.viewers.find((v) => v.id === viewer.id);
      if (exists) {
        return state;
      }
      return { viewers: [...state.viewers, viewer] };
    }),

  removeViewer: (userId) =>
    set((state) => ({
      viewers: state.viewers.filter((v) => v.id !== userId),
    })),

  setTaskViewers: (taskId, viewers) =>
    set((state) => ({
      taskViewers: { ...state.taskViewers, [taskId]: viewers },
    })),
}));
