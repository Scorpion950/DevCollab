import { useQuery } from '@tanstack/react-query';
import { BoardTask } from '@/types';
import api from '@/lib/api';

export const useBoard = (projectId: string) => {
  const { data, isLoading, error } = useQuery<BoardTask[]>({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const response = await api.get('/tasks', { params: { projectId } });
      return response.data;
    },
    enabled: !!projectId,
    staleTime: 30_000, // Cache for 30s before refetching
  });

  return {
    tasks: data ?? [],
    isLoading,
    error: error ? 'Failed to fetch tasks' : null,
  };
};
