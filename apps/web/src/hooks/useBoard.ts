import { useState, useEffect } from 'react';
import { BoardTask } from '@/types';
import { api } from '@/lib/api';

export const useBoard = (projectId: string) => {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setIsLoading(true);
        const response = await api.get('/tasks', {
          params: { projectId },
        });
        setTasks(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching tasks:', err);
        setError('Failed to fetch tasks');
      } finally {
        setIsLoading(false);
      }
    };

    if (projectId) {
      fetchTasks();
    }
  }, [projectId]);

  return { tasks, isLoading, error };
};
