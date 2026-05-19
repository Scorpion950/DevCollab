import { useState, useEffect } from 'react';
import { BoardTask, TaskUpdateInput } from '@/types';
import { api } from '@/lib/api';

export const useTask = (taskId: string) => {
  const [task, setTask] = useState<BoardTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/tasks/${taskId}`);
        setTask(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching task:', err);
        setError('Failed to fetch task');
      } finally {
        setIsLoading(false);
      }
    };

    if (taskId) {
      fetchTask();
    }
  }, [taskId]);

  const updateTask = async (updates: TaskUpdateInput) => {
    try {
      const response = await api.put(`/tasks/${taskId}`, updates);
      setTask(response.data);
      return response.data;
    } catch (err) {
      console.error('Error updating task:', err);
      throw err;
    }
  };

  const deleteTask = async () => {
    try {
      await api.delete(`/tasks/${taskId}`);
      setTask(null);
    } catch (err) {
      console.error('Error deleting task:', err);
      throw err;
    }
  };

  return {
    task,
    isLoading,
    error,
    updateTask,
    deleteTask,
  };
};
