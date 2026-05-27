'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Shield, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function ProjectMembersPage() {
  const { workspaceId, projectId } = useParams<{ workspaceId: string; projectId: string }>();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [error, setError] = useState('');

  const { data: project, isLoading: isLoadingProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/projects/${projectId}`).then((r) => r.data.data),
  });

  const { data: workspaceMembers, isLoading: isLoadingWorkspaceMembers } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}`).then((r) => r.data.data.members),
  });

  const { mutate: addMember, isPending: isAdding } = useMutation({
    mutationFn: (data: { userId: string; role: string }) =>
      api.post(`/workspaces/${workspaceId}/projects/${projectId}/members`, data).then((r) => r.data),
    onSuccess: () => {
      setSelectedUser('');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to add member to project');
    },
  });

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    addMember({ userId: selectedUser, role });
  };

  if (isLoadingProject || isLoadingWorkspaceMembers) {
    return <div className="p-8 text-text-muted">Loading project members...</div>;
  }

  // Filter out users already in the project
  const projectMemberIds = new Set(project?.members?.map((m: any) => m.userId) || []);
  const availableWorkspaceMembers = workspaceMembers?.filter((m: any) => !projectMemberIds.has(m.userId)) || [];

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Users size={24} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Project Members</h1>
          <p className="text-sm text-text-secondary">
            Manage who has access to {project?.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          <div className="card">
            <h2 className="text-lg font-semibold text-text-primary mb-4 border-b border-border pb-4">
              Current Members
            </h2>
            <div className="space-y-4">
              {project?.members?.map((m: any) => {
                const avatar =
                  m.user.avatar ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    m.user.name
                  )}&background=7C3AED&color=fff&bold=true`;
                return (
                  <div key={m.userId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={avatar} alt={m.user.name} className="w-10 h-10 rounded-full" />
                      <div>
                        <p className="font-medium text-text-primary">{m.user.name}</p>
                        <p className="text-xs text-text-muted">{m.user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge badge-outline text-xs capitalize flex items-center gap-1">
                        {m.role === 'OWNER' && <Shield size={12} className="text-primary" />}
                        {m.role.toLowerCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="md:col-span-1">
          <div className="card bg-bg-elevated border-primary/20">
            <h2 className="text-lg font-semibold text-text-primary mb-1 flex items-center gap-2">
              <UserPlus size={18} className="text-primary" />
              Add to Project
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Select a workspace member to add them to this project.
            </p>

            <form onSubmit={handleAddMember} className="space-y-4">
              {error && (
                <div className="text-xs text-danger bg-danger/10 p-2 rounded border border-danger/20">
                  {error}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">Select User</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="w-full bg-bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                  required
                >
                  <option value="" disabled>-- Select a member --</option>
                  {availableWorkspaceMembers.map((m: any) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name} ({m.user.email})
                    </option>
                  ))}
                </select>
                {availableWorkspaceMembers.length === 0 && (
                  <p className="text-[10px] text-warning mt-1">All workspace members are already in this project.</p>
                )}
              </div>
              
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="ADMIN">Admin (Full Access)</option>
                  <option value="MEMBER">Member (Can edit tasks)</option>
                  <option value="VIEWER">Viewer (Read-only)</option>
                </select>
              </div>

              <Button type="submit" className="w-full" disabled={isAdding || !selectedUser}>
                {isAdding ? <Loader2 size={16} className="animate-spin" /> : 'Add Member'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
