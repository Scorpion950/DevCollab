'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  FolderKanban,
  Users,
  Settings,
  ArrowRight,
  Clock,
  CheckSquare,
  FileText,
  Code2,
} from 'lucide-react';
import api from '@/lib/api';
import { Project, WorkspaceWithMembers } from '@devcollab/types';
import { CreateProjectModal } from '@/components/project/create-project-modal';
import { formatRelativeTime } from '@/lib/utils';

interface ProjectWithCounts extends Project {
  _count: { tasks: number; snippets: number; wikiPages: number };
  members: { user: { id: string; name: string; avatar: string | null } }[];
}

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [showCreateProject, setShowCreateProject] = useState(false);

  const { data: workspace, isLoading: wsLoading } = useQuery<WorkspaceWithMembers>({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}`).then((r) => r.data.data),
  });

  const { data: projects, isLoading: projLoading } = useQuery<ProjectWithCounts[]>({
    queryKey: ['projects', workspaceId],
    queryFn: () =>
      api.get(`/workspaces/${workspaceId}/projects`).then((r) => r.data.data),
  });

  const isLoading = wsLoading || projLoading;

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          {isLoading ? (
            <div className="space-y-2">
              <div className="skeleton h-7 w-48 rounded" />
              <div className="skeleton h-4 w-72 rounded" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {workspace?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-text-primary">{workspace?.name}</h1>
              </div>
              {workspace?.description && (
                <p className="text-text-secondary text-sm ml-12">{workspace.description}</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/${workspaceId}/settings`}
            className="btn-secondary text-sm"
          >
            <Settings size={14} />
            Settings
          </Link>
          <button
            onClick={() => setShowCreateProject(true)}
            className="btn-primary text-sm"
            id="workspace-create-project-btn"
          >
            <Plus size={14} />
            New Project
          </button>
        </div>
      </div>

      {/* Members row */}
      {workspace && (
        <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border">
          <div className="flex -space-x-2">
            {workspace.members.slice(0, 6).map((m) => {
              const avatar =
                m.user.avatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user.name)}&background=7C3AED&color=fff&bold=true&size=32`;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.userId}
                  src={avatar}
                  alt={m.user.name}
                  className="avatar w-7 h-7 border-2 border-bg-surface text-xs"
                  title={m.user.name}
                />
              );
            })}
            {workspace.members.length > 6 && (
              <div className="w-7 h-7 rounded-full bg-bg-elevated border-2 border-bg-surface flex items-center justify-center text-[10px] text-text-muted font-medium">
                +{workspace.members.length - 6}
              </div>
            )}
          </div>
          <span className="text-xs text-text-muted">
            {workspace.members.length} member{workspace.members.length !== 1 ? 's' : ''}
          </span>
          <Link
            href={`/dashboard/${workspaceId}/members`}
            className="text-xs text-primary hover:text-primary-light transition-colors flex items-center gap-1"
          >
            <Users size={12} />
            Manage members
          </Link>
        </div>
      )}

      {/* Projects grid */}
      <div className="section-header">
        <h2 className="section-title">Projects</h2>
        <span className="text-sm text-text-muted">{projects?.length || 0} total</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-44 skeleton" />
          ))}
        </div>
      ) : !projects || projects.length === 0 ? (
        <EmptyProjects onCreateProject={() => setShowCreateProject(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              workspaceId={workspaceId}
            />
          ))}
          <button
            onClick={() => setShowCreateProject(true)}
            className="card border-dashed border-2 flex flex-col items-center justify-center gap-2 h-44 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 cursor-pointer"
          >
            <Plus size={20} className="text-text-muted" />
            <span className="text-sm text-text-muted">New project</span>
          </button>
        </div>
      )}

      <CreateProjectModal
        workspaceId={workspaceId}
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
      />
    </div>
  );
}

function ProjectCard({
  project,
  workspaceId,
}: {
  project: ProjectWithCounts;
  workspaceId: string;
}) {
  return (
    <Link
      href={`/dashboard/${workspaceId}/${project.id}/board`}
      className="card hover-lift group flex flex-col"
      id={`project-card-${project.id}`}
    >
      {/* Color strip */}
      <div
        className="h-1.5 rounded-t-lg -mx-4 -mt-4 mb-4 rounded-lg"
        style={{ backgroundColor: project.color }}
      />

      {/* Title */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{project.emoji || '📁'}</span>
          <h3 className="font-semibold text-text-primary group-hover:text-primary-light transition-colors leading-tight">
            {project.name}
          </h3>
        </div>
        <ArrowRight
          size={14}
          className="text-text-muted opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5 flex-shrink-0 mt-0.5"
        />
      </div>

      {project.description && (
        <p className="text-xs text-text-muted truncate-2 mb-3 flex-1">
          {project.description}
        </p>
      )}

      {/* Member avatars */}
      {project.members.length > 0 && (
        <div className="flex -space-x-1.5 mb-3">
          {project.members.slice(0, 5).map((m) => {
            const avatar =
              m.user.avatar ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user.name)}&background=7C3AED&color=fff&bold=true&size=24`;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.user.id}
                src={avatar}
                alt={m.user.name}
                className="avatar w-5 h-5 border border-bg-surface text-[9px]"
              />
            );
          })}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-text-muted mt-auto">
        <span className="flex items-center gap-1">
          <CheckSquare size={11} />
          {project._count.tasks}
        </span>
        <span className="flex items-center gap-1">
          <Code2 size={11} />
          {project._count.snippets}
        </span>
        <span className="flex items-center gap-1">
          <FileText size={11} />
          {project._count.wikiPages}
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <Clock size={11} />
          {formatRelativeTime(project.updatedAt)}
        </span>
      </div>
    </Link>
  );
}

function EmptyProjects({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <div className="text-center py-20 border border-dashed border-border rounded-xl">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
        <FolderKanban size={24} className="text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        No projects yet
      </h3>
      <p className="text-text-muted text-sm mb-6 max-w-xs mx-auto">
        Create your first project and start building with your team.
      </p>
      <button onClick={onCreateProject} className="btn-primary" id="empty-create-project-btn">
        <Plus size={16} />
        Create Project
      </button>
    </div>
  );
}
