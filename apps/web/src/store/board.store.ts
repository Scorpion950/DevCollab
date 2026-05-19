import { create } from 'zustand';
import { BoardTask, TaskStatus } from '@/types';

interface BoardStore {
  tasks: BoardTask[];
  setTasks: (tasks: BoardTask[]) => void;
  addTask: (task: BoardTask) => void;
  updateTask: (taskId: string, updates: Partial<BoardTask>) => void;
  moveTask: (taskId: string, newStatus: TaskStatus, newOrder: number) => void;
  removeTask: (taskId: string) => void;
}

export const useBoardStore = create<BoardStore>((set) => ({
  tasks: [],

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, ...updates } : task
      ),
    })),

  moveTask: (taskId, newStatus, newOrder) =>
    set((state) => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return state;

      const otherTasks = state.tasks.filter((t) => t.id !== taskId);
      const tasksInNewStatus = otherTasks.filter((t) => t.status === newStatus);

      // Adjust orders of tasks that will be pushed down
      const adjustedTasks = otherTasks.map((t) => {
        if (t.status === newStatus && t.order >= newOrder) {
          return { ...t, order: t.order + 1 };
        }
        return t;
      });

      return {
        tasks: [
          ...adjustedTasks,
          { ...task, status: newStatus, order: newOrder },
        ],
      };
    }),

  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),
}));
