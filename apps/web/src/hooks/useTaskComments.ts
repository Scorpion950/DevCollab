import { useState, useEffect } from 'react';
import { TaskComment } from '@/types';
import { api } from '@/lib/api';

export const useTaskComments = (taskId: string) => {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchComments = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/tasks/${taskId}/comments`);
        setComments(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching comments:', err);
        setError('Failed to fetch comments');
      } finally {
        setIsLoading(false);
      }
    };

    if (taskId) {
      fetchComments();
    }
  }, [taskId]);

  const addComment = async (content: string, mentions: string[] = []) => {
    try {
      const response = await api.post(`/tasks/${taskId}/comments`, {
        content,
        mentions,
      });
      setComments([...comments, response.data]);
      return response.data;
    } catch (err) {
      console.error('Error creating comment:', err);
      throw err;
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await api.delete(`/tasks/${taskId}/comments/${commentId}`);
      setComments(comments.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error('Error deleting comment:', err);
      throw err;
    }
  };

  return {
    comments,
    isLoading,
    error,
    addComment,
    deleteComment,
  };
};
