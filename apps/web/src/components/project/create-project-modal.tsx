'use client';

import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { X, Loader2, FolderKanban } from 'lucide-react';
import api from '@/lib/api';
import { PROJECT_COLORS, PROJECT_EMOJIS, cn } from '@/lib/utils';

interface CreateProjectModalProps {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
}

export function CreateProjectModal({
  workspaceId,
  open,
  onClose,
}: CreateProjectModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    description: '',
    color: PROJECT_COLORS[0],
    emoji: '🚀',
  });
  const [error, setError] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: (data: typeof form) =>
      api
        .post(`/workspaces/${workspaceId}/projects`, data)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      onClose();
      setForm({ name: '', description: '', color: PROJECT_COLORS[0], emoji: '🚀' });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to create project');
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md card-elevated animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg border flex items-center justify-center text-lg"
              style={{ backgroundColor: `${form.color}20`, borderColor: `${form.color}40` }}
            >
              {form.emoji}
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">New Project</h2>
              <p className="text-xs text-text-muted">Inside workspace</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="label">Project name *</label>
            <input
              type="text"
              placeholder="My Awesome Project"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              autoFocus
              maxLength={50}
              id="project-name-input"
            />
          </div>

          <div>
            <label className="label">Description <span className="text-text-muted">(optional)</span></label>
            <textarea
              placeholder="What are you building?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input resize-none h-16"
              maxLength={300}
            />
          </div>

          {/* Emoji picker */}
          <div>
            <label className="label">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {PROJECT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setForm({ ...form, emoji })}
                  className={cn(
                    'w-8 h-8 rounded-md text-base flex items-center justify-center border transition-all',
                    form.emoji === emoji
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border-strong bg-bg-elevated'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="label">Color</label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm({ ...form, color })}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 transition-transform',
                    form.color === color
                      ? 'border-white scale-110'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() => mutate(form)}
            disabled={isPending || !form.name.trim()}
            className="btn-primary flex-1"
            id="create-project-submit"
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              'Create Project'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
