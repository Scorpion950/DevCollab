import { create } from 'zustand';

interface TaskStore {
  selectedTaskId: string | null;
  isModalOpen: boolean;
  setSelectedTaskId: (taskId: string | null) => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  selectedTaskId: null,
  isModalOpen: false,

  setSelectedTaskId: (taskId) => set({ selectedTaskId: taskId }),

  openModal: () => set({ isModalOpen: true }),

  closeModal: () => set({ isModalOpen: false, selectedTaskId: null }),
}));
