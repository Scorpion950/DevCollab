'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, UserPlus, Shield, X, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { WorkspaceWithMembers } from '@devcollab/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function WorkspaceMembersPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [inviteError, setInviteError] = useState('');

  const { data: workspace, isLoading } = useQuery<WorkspaceWithMembers>({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}`).then((r) => r.data.data),
  });

  const { mutate: inviteMember, isPending: isInviting } = useMutation({
    mutationFn: (data: { email: string; role: string }) =>
      api.post(`/workspaces/${workspaceId}/invite`, data).then((r) => r.data),
    onSuccess: (data) => {
      setEmail('');
      setInviteError('');
      alert(`Invite link generated (Phase 3 email system pending):\n\n${data.data.inviteUrl}`);
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (err: any) => {
      setInviteError(err.response?.data?.error || 'Failed to invite user');
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    inviteMember({ email, role });
  };

  if (isLoading) {
    return <div className="p-8 text-text-muted">Loading members...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <Button variant="ghost" onClick={() => router.back()} className="mb-6 -ml-2">
        <ArrowLeft size={16} className="mr-2" />
        Back to Dashboard
      </Button>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Users size={24} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Manage Members</h1>
          <p className="text-sm text-text-secondary">
            {workspace?.name} • {workspace?.members.length} members
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
              {workspace?.members.map((m) => {
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
              Invite to Workspace
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Send an invitation email to add a new member to your workspace.
            </p>

            <form onSubmit={handleInvite} className="space-y-4">
              {inviteError && (
                <div className="text-xs text-danger bg-danger/10 p-2 rounded border border-danger/20">
                  {inviteError}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">Email Address</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <Input
                    type="email"
                    required
                    placeholder="colleague@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 bg-bg-surface"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="ADMIN">Admin (Full Access)</option>
                  <option value="MEMBER">Member (Can edit tasks/projects)</option>
                  <option value="VIEWER">Viewer (Read-only)</option>
                </select>
              </div>

              <Button type="submit" className="w-full" disabled={isInviting}>
                {isInviting ? 'Sending...' : 'Send Invite'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
