'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  Zap,
  Hash,
  Building2,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { Workspace, Project } from '@devcollab/types';
import { CreateWorkspaceModal } from '@/components/workspace/create-workspace-modal';
import { CreateProjectModal } from '@/components/project/create-project-modal';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSidebarOpen } = useUIStore();
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [createProjectFor, setCreateProjectFor] = useState<string | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data),
  });

  const workspaces: (Workspace & { myRole: string })[] = workspacesData || [];

  const { data: projectsData } = useQuery({
    queryKey: ['projects', Array.from(expandedWorkspaces)],
    queryFn: async () => {
      const results: Record<string, Project[]> = {};
      for (const wsId of Array.from(expandedWorkspaces)) {
        const r = await api.get(`/workspaces/${wsId}/projects`);
        results[wsId] = r.data.data;
      }
      return results;
    },
    enabled: expandedWorkspaces.size > 0,
  });

  const { mutate: renameProject } = useMutation({
    mutationFn: ({ workspaceId, projectId, name }: { workspaceId: string; projectId: string; name: string }) =>
      api.put(`/workspaces/${workspaceId}/projects/${projectId}`, { name }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setRenamingProjectId(null);
    },
  });

  const { mutate: deleteProject } = useMutation({
    mutationFn: ({ workspaceId, projectId }: { workspaceId: string; projectId: string }) =>
      api.delete(`/workspaces/${workspaceId}/projects/${projectId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      router.push('/dashboard');
    },
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
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-30" 
          onClick={useUIStore.getState().toggleSidebar}
        />
      )}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-bg-surface transition-all duration-300 overflow-hidden",
          "absolute md:relative z-40 h-full", // Overlay on mobile
          !isSidebarOpen && "border-r-0 opacity-0 -translate-x-full md:translate-x-0" // Hide completely on mobile if closed
        )}
        style={{ 
          width: isSidebarOpen ? 'var(--sidebar-width)' : '0px', 
          minWidth: isSidebarOpen ? 'var(--sidebar-width)' : '0px' 
        }}
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
                      const isActive = pathname.includes(`/${ws.id}/${project.id}`);
                      const isRenaming = renamingProjectId === project.id;

                      return (
                        <div key={project.id} className="relative group/project">
                          {isRenaming ? (
                            <div className="flex items-center gap-1 px-2 py-1">
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && renameValue.trim()) {
                                    renameProject({ workspaceId: ws.id, projectId: project.id, name: renameValue.trim() });
                                  }
                                  if (e.key === 'Escape') setRenamingProjectId(null);
                                }}
                                className="flex-1 text-xs bg-bg-elevated border border-primary/40 rounded px-1.5 py-1 outline-none text-text-primary"
                              />
                              <button
                                onClick={() => renameProject({ workspaceId: ws.id, projectId: project.id, name: renameValue.trim() })}
                                className="text-success hover:text-success"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                onClick={() => setRenamingProjectId(null)}
                                className="text-text-muted hover:text-danger"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <Link
                              href={href}
                              className={cn(
                                'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-150 pr-6',
                                isActive && 'text-primary-light bg-primary/10'
                              )}
                              id={`project-nav-${project.id}`}
                            >
                              <span style={{ color: project.color }}>
                                {project.emoji || <Hash size={10} />}
                              </span>
                              <span className="truncate">{project.name}</span>
                            </Link>
                          )}

                          {/* Project context menu button */}
                          {!isRenaming && (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/project:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setProjectMenuId(projectMenuId === project.id ? null : project.id);
                                }}
                                className="btn-icon w-5 h-5"
                              >
                                <MoreHorizontal size={10} />
                              </button>

                              {projectMenuId === project.id && (
                                <div className="absolute left-0 top-full mt-1 w-36 card-elevated z-50 p-1 animate-scale-in">
                                  <button
                                    onClick={() => {
                                      setRenameValue(project.name);
                                      setRenamingProjectId(project.id);
                                      setProjectMenuId(null);
                                    }}
                                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary rounded transition-colors"
                                  >
                                    <Pencil size={11} />
                                    Rename
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
                                        deleteProject({ workspaceId: ws.id, projectId: project.id });
                                      }
                                      setProjectMenuId(null);
                                    }}
                                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-danger hover:bg-danger/10 rounded transition-colors"
                                  >
                                    <Trash2 size={11} />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
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
          <Link href="/dashboard/upgrade" className={cn('nav-item text-xs', pathname.includes('upgrade') && 'active')}>
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
