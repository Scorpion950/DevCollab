'use client';

import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { FolderKanban, FileText, Code2, Cpu, LayoutGrid, List, Calendar } from 'lucide-react';
import api from '@/lib/api';
import { Project } from '@devcollab/types';
import { cn } from '@/lib/utils';

const PROJECT_TABS = [
  { id: 'board', label: 'Board', icon: LayoutGrid, href: 'board' },
  { id: 'list', label: 'List', icon: List, href: 'list' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, href: 'calendar' },
  { id: 'docs', label: 'Docs', icon: FileText, href: 'docs' },
  { id: 'snippets', label: 'Snippets', icon: Code2, href: 'snippets' },
  { id: 'ai', label: 'AI Assistant', icon: Cpu, href: 'ai' },
];

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { workspaceId: string; projectId: string };
}) {
  const pathname = usePathname();

  const { data: project } = useQuery<Project>({
    queryKey: ['project', params.projectId],
    queryFn: () =>
      api
        .get(`/workspaces/${params.workspaceId}/projects/${params.projectId}`)
        .then((r) => r.data.data),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Project sub-topbar */}
      <div className="flex items-center gap-1 px-6 border-b border-border bg-bg-surface flex-shrink-0 overflow-x-auto">
        {/* Project name */}
        <div className="flex items-center gap-2 mr-4 py-3 flex-shrink-0">
          <span className="text-lg">{project?.emoji || '📁'}</span>
          <span className="text-sm font-semibold text-text-primary">
            {project?.name || '...'}
          </span>
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Tabs */}
        {PROJECT_TABS.map((tab) => {
          const href = `/dashboard/${params.workspaceId}/${params.projectId}/${tab.href}`;
          const isActive = pathname === href || pathname.endsWith(`/${tab.href}`);
          return (
            <Link
              key={tab.id}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all duration-150 flex-shrink-0',
                isActive
                  ? 'text-primary border-b-primary'
                  : 'text-text-muted hover:text-text-primary border-b-transparent hover:border-b-border-strong',
              )}
            >
              <tab.icon size={13} />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
