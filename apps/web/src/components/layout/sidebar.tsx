'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  Zap,
  Hash,
  Building2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Workspace, Project } from '@devcollab/types';
import { CreateWorkspaceModal } from '@/components/workspace/create-workspace-modal';
import { CreateProjectModal } from '@/components/project/create-project-modal';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [createProjectFor, setCreateProjectFor] = useState<string | null>(null);

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data),
  });

  const workspaces: (Workspace & { myRole: string })[] = workspacesData || [];

  const { data: projectsData } = useQuery({
    queryKey: ['projects', [...expandedWorkspaces]],
    queryFn: async () => {
      const results: Record<string, Project[]> = {};
      for (const wsId of expandedWorkspaces) {
        const r = await api.get(`/workspaces/${wsId}/projects`);
        results[wsId] = r.data.data;
      }
      return results;
    },
    enabled: expandedWorkspaces.size > 0,
  });

  const toggleWorkspace = (id: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <aside
        className="flex flex-col border-r border-border bg-bg-surface"
        style={{ width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">D</span>
          </div>
          <span className="font-semibold text-text-primary text-sm">DevCollab</span>
          <div className="ml-auto">
            <span className="badge badge-violet text-[10px]">Beta</span>
          </div>
        </div>

        {/* Main nav */}
        <nav className="px-2 py-3 border-b border-border">
          <Link
            href="/dashboard"
            className={cn('nav-item', pathname === '/dashboard' && 'active')}
            id="nav-dashboard"
          >
            <LayoutDashboard size={15} />
            <span>Dashboard</span>
          </Link>
        </nav>

        {/* Workspaces */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Workspaces
            </span>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              className="btn-icon w-5 h-5"
              title="New workspace"
              id="create-workspace-btn"
            >
              <Plus size={12} />
            </button>
          </div>

          {workspaces.length === 0 && (
            <button
              onClick={() => setShowCreateWorkspace(true)}
              className="w-full px-2 py-3 rounded-lg border border-dashed border-border text-xs text-text-muted hover:border-primary/40 hover:text-primary transition-all duration-200 mt-1"
            >
              + Create your first workspace
            </button>
          )}

          {workspaces.map((ws) => {
            const isExpanded = expandedWorkspaces.has(ws.id);
            const projects: Project[] = projectsData?.[ws.id] || [];

            return (
              <div key={ws.id} className="mt-0.5">
                {/* Workspace row */}
                <div className="flex items-center group">
                  <button
                    onClick={() => toggleWorkspace(ws.id)}
                    className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-150"
                    id={`workspace-toggle-${ws.id}`}
                  >
                    {isExpanded ? (
                      <ChevronDown size={12} className="flex-shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="flex-shrink-0" />
                    )}
                    <Building2 size={12} className="flex-shrink-0 text-text-muted" />
                    <span className="truncate font-medium">{ws.name}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (!isExpanded) toggleWorkspace(ws.id);
                      setCreateProjectFor(ws.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 btn-icon w-5 h-5 mr-1 transition-opacity"
                    title="New project"
                  >
                    <Plus size={10} />
                  </button>
                </div>

                {/* Projects */}
                {isExpanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5 animate-slide-in">
                    {projects.map((project) => {
                      const href = `/dashboard/${ws.id}/${project.id}/board`;
                      const isActive = pathname.startsWith(`/dashboard/${ws.id}/${project.id}`);
                      return (
                        <Link
                          key={project.id}
                          href={href}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-150',
                            isActive && 'text-primary-light bg-primary/10'
                          )}
                          id={`project-nav-${project.id}`}
                        >
                          <span style={{ color: project.color }}>
                            {project.emoji || <Hash size={10} />}
                          </span>
                          <span className="truncate">{project.name}</span>
                        </Link>
                      );
                    })}

                    <button
                      onClick={() => setCreateProjectFor(ws.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-text-muted hover:text-primary transition-colors w-full"
                    >
                      <Plus size={10} />
                      <span>New project</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom nav */}
        <div className="px-2 py-2 border-t border-border space-y-0.5">
          <Link
            href="/dashboard/settings"
            className={cn('nav-item text-xs', pathname.includes('settings') && 'active')}
          >
            <Settings size={14} />
            <span>Settings</span>
          </Link>
          <Link href="/dashboard/upgrade" className="nav-item text-xs">
            <Zap size={14} className="text-warning" />
            <span>Upgrade to Pro</span>
          </Link>
        </div>
      </aside>

      {/* Modals */}
      <CreateWorkspaceModal
        open={showCreateWorkspace}
        onClose={() => setShowCreateWorkspace(false)}
      />
      {createProjectFor && (
        <CreateProjectModal
          workspaceId={createProjectFor}
          open={!!createProjectFor}
          onClose={() => setCreateProjectFor(null)}
        />
      )}
    </>
  );
}
