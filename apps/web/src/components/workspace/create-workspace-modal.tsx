'use client';

import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { X, Loader2, Building2 } from 'lucide-react';
import api from '@/lib/api';

interface CreateWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateWorkspaceModal({ open, onClose }: CreateWorkspaceModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: (data: typeof form) =>
      api.post('/workspaces', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      onClose();
      setForm({ name: '', description: '' });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to create workspace');
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md card-elevated animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Building2 size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">New Workspace</h2>
              <p className="text-xs text-text-muted">Create a space for your team</p>
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
            <label className="label">Workspace name *</label>
            <input
              type="text"
              placeholder="My Dev Team"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              autoFocus
              maxLength={50}
              id="workspace-name-input"
            />
          </div>

          <div>
            <label className="label">Description <span className="text-text-muted">(optional)</span></label>
            <textarea
              placeholder="What does your team work on?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input resize-none h-20"
              maxLength={200}
            />
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
            id="create-workspace-submit"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : 'Create Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
