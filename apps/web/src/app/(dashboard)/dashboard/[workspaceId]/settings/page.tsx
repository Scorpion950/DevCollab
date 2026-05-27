'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Settings, Save, Trash2, Shield, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { WorkspaceWithMembers } from '@devcollab/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const { data: workspace, isLoading } = useQuery<WorkspaceWithMembers>({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}`).then((r) => r.data.data),
  });

  useEffect(() => {
    if (workspace) {
      setName(workspace.name || '');
      setDescription(workspace.description || '');
    }
  }, [workspace]);

  const { mutate: updateWorkspace, isPending: isUpdating } = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      api.patch(`/workspaces/${workspaceId}`, data).then((r) => r.data),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      alert('Workspace updated successfully!');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to update workspace');
    },
  });

  const { mutate: deleteWorkspace, isPending: isDeleting } = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspaceId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      router.push('/dashboard');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to delete workspace');
    },
  });

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateWorkspace({ name, description });
  };

  const handleDelete = () => {
    if (confirm('Are you absolutely sure you want to delete this workspace? This action cannot be undone and will delete all projects, tasks, and data inside.')) {
      deleteWorkspace();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  // Check if current user is owner/admin
  const currentUserRole = workspace?.members.find((m: any) => m.userId === queryClient.getQueryData(['user'])?.id)?.role;
  const isOwner = currentUserRole === 'OWNER';
  const isAdminOrOwner = isOwner || currentUserRole === 'ADMIN';

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      <Button variant="ghost" onClick={() => router.back()} className="mb-6 -ml-2">
        <ArrowLeft size={16} className="mr-2" />
        Back to Workspace
      </Button>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Settings size={24} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Workspace Settings</h1>
          <p className="text-sm text-text-secondary">
            Manage your workspace details and configuration
          </p>
        </div>
      </div>

      <div className="space-y-8">
        <div className="card">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            General Information
          </h2>
          <form onSubmit={handleUpdate} className="space-y-4">
            {error && (
              <div className="text-xs text-danger bg-danger/10 p-3 rounded-lg border border-danger/20 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5" />
                {error}
              </div>
            )}
            
            <div>
              <label className="text-sm font-medium text-text-secondary mb-1.5 block">
                Workspace Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Workspace"
                required
                className="bg-bg-surface"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-text-secondary mb-1.5 block">
                Description (Optional)
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this workspace for?"
                className="bg-bg-surface min-h-[100px] resize-y"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? (
                  <Loader2 size={16} className="animate-spin mr-2" />
                ) : (
                  <Save size={16} className="mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </form>
        </div>

        <div className="card border-danger/20 bg-danger/5">
          <h2 className="text-lg font-semibold text-danger mb-2 flex items-center gap-2">
            <Shield size={18} /> Danger Zone
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            Irreversible actions that will permanently affect this workspace.
          </p>
          
          <div className="flex items-center justify-between p-4 bg-bg-surface rounded-lg border border-danger/10">
            <div>
              <h3 className="font-medium text-text-primary mb-1">Delete Workspace</h3>
              <p className="text-xs text-text-muted">
                Permanently remove this workspace and all its data.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || !isOwner}
            >
              {isDeleting ? (
                <Loader2 size={16} className="animate-spin mr-2" />
              ) : (
                <Trash2 size={16} className="mr-2" />
              )}
              Delete Workspace
            </Button>
          </div>
          {!isOwner && (
            <p className="text-[10px] text-text-muted mt-2 text-right">
              Only the workspace owner can delete the workspace.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
