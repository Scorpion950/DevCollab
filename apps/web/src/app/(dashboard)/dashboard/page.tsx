'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  FolderKanban,
  Users,
  TrendingUp,
  Clock,
  ArrowRight,
  Building2,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import api from '@/lib/api';
import { Workspace, Project } from '@devcollab/types';
import { useAuthStore } from '@/store/auth.store';
import { CreateWorkspaceModal } from '@/components/workspace/create-workspace-modal';
import { formatRelativeTime } from '@/lib/utils';

interface WorkspaceWithMeta extends Workspace {
  myRole: string;
  _count: { projects: number; members: number };
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);

  const { data: workspacesData, isLoading } = useQuery<WorkspaceWithMeta[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data),
  });

  const workspaces = workspacesData || [];

  const avatarUrl =
    user?.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=7C3AED&color=fff&bold=true`;

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Welcome header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <Image
            src={avatarUrl}
            alt={user?.name || 'User'}
            width={48}
            height={48}
            className="avatar w-12 h-12"
          />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Good {getGreeting()},{' '}
              <span className="text-gradient">{user?.name?.split(' ')[0]}</span>{' '}
              👋
            </h1>
            <p className="text-text-secondary text-sm mt-0.5">
              Here&apos;s what&apos;s happening across your workspaces
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateWorkspace(true)}
          className="btn-primary"
          id="dashboard-create-workspace-btn"
        >
          <Plus size={16} />
          New Workspace
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          {
            icon: <Building2 size={18} className="text-primary" />,
            label: 'Workspaces',
            value: workspaces.length,
            bg: 'bg-primary/10',
          },
          {
            icon: <FolderKanban size={18} className="text-secondary" />,
            label: 'Total Projects',
            value: workspaces.reduce((acc, ws) => acc + ws._count.projects, 0),
            bg: 'bg-secondary/10',
          },
          {
            icon: <Users size={18} className="text-success" />,
            label: 'Collaborators',
            value: workspaces.reduce((acc, ws) => acc + ws._count.members, 0),
            bg: 'bg-success/10',
          },
        ].map((stat) => (
          <div key={stat.label} className="card flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center flex-shrink-0`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{stat.value}</p>
              <p className="text-xs text-text-muted">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Workspaces */}
      <div className="section-header">
        <h2 className="section-title">Your Workspaces</h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="card h-36 skeleton" />
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <EmptyState onCreateWorkspace={() => setShowCreateWorkspace(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workspaces.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}

          {/* Create new workspace card */}
          <button
            onClick={() => setShowCreateWorkspace(true)}
            className="card border-dashed border-2 flex flex-col items-center justify-center gap-2 h-36 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 cursor-pointer"
          >
            <Plus size={24} className="text-text-muted" />
            <span className="text-sm text-text-muted">Create new workspace</span>
          </button>
        </div>
      )}

      {/* Upgrade banner for free users */}
      {user?.plan === 'FREE' && (
        <div className="mt-8 card border-primary/20 bg-primary/5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Zap size={18} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">Upgrade to DevCollab Pro</p>
              <p className="text-xs text-text-muted mt-0.5">
                Unlimited workspaces, projects, members + full AI access. Only $12/month.
              </p>
            </div>
            <Link href="/dashboard/upgrade" className="btn-primary flex-shrink-0 text-xs">
              <Zap size={13} />
              Upgrade
            </Link>
          </div>
        </div>
      )}

      <CreateWorkspaceModal
        open={showCreateWorkspace}
        onClose={() => setShowCreateWorkspace(false)}
      />
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: WorkspaceWithMeta }) {
  return (
    <Link
      href={`/dashboard/${workspace.id}`}
      className="card hover-lift group block"
      id={`workspace-card-${workspace.id}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-brand flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">
              {workspace.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-text-primary group-hover:text-primary-light transition-colors">
              {workspace.name}
            </h3>
            <span className="text-xs text-text-muted capitalize">{workspace.myRole.toLowerCase()}</span>
          </div>
        </div>
        <ArrowRight
          size={16}
          className="text-text-muted opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-0 group-hover:translate-x-1"
        />
      </div>

      {workspace.description && (
        <p className="text-sm text-text-muted truncate-2 mb-4">{workspace.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <FolderKanban size={12} />
          {workspace._count.projects} project{workspace._count.projects !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <Users size={12} />
          {workspace._count.members} member{workspace._count.members !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <Clock size={12} />
          {formatRelativeTime(workspace.updatedAt)}
        </span>
      </div>
    </Link>
  );
}

function EmptyState({ onCreateWorkspace }: { onCreateWorkspace: () => void }) {
  return (
    <div className="text-center py-20 border border-dashed border-border rounded-xl">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
        <Building2 size={24} className="text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        No workspaces yet
      </h3>
      <p className="text-text-muted text-sm mb-6 max-w-xs mx-auto">
        Create your first workspace to start collaborating with your team.
      </p>
      <button onClick={onCreateWorkspace} className="btn-primary" id="empty-create-workspace-btn">
        <Plus size={16} />
        Create Workspace
      </button>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
