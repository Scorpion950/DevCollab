'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Plus, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WikiPage {
  id: string;
  title: string;
  slug: string;
  children?: WikiPage[];
}

interface WikiPageTreeProps {
  projectId: string;
  workspaceId: string;
  pages: WikiPage[];
  onNewPage: () => void;
  onDeletePage: (pageId: string) => void;
  currentPageId?: string;
}

export function WikiPageTree({
  projectId,
  workspaceId,
  pages,
  onNewPage,
  onDeletePage,
  currentPageId,
}: WikiPageTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (pageId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const renderPage = (page: WikiPage, depth = 0) => (
    <div key={page.id} className={`ml-${Math.min(depth * 4, 12)}`}>
      <div className="flex items-center gap-1 px-2 py-1 hover:bg-slate-800 rounded group">
        {page.children && page.children.length > 0 && (
          <button
            onClick={() => toggleExpanded(page.id)}
            className="p-1 hover:bg-slate-700 rounded"
          >
            {expanded.has(page.id) ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </button>
        )}
        {!page.children || page.children.length === 0 ? <div className="w-6" /> : null}

        <Link
          href={`/dashboard/${workspaceId}/${projectId}/docs/${page.id}`}
          className={`flex-1 text-sm text-slate-300 hover:text-slate-100 truncate ${
            currentPageId === page.id ? 'text-violet-400 font-semibold' : ''
          }`}
        >
          {page.title}
        </Link>

        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onNewPage()}
            className="h-6 w-6 p-0"
          >
            <Plus size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDeletePage(page.id)}
            className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {page.children && page.children.length > 0 && expanded.has(page.id) && (
        <div className="mt-1">
          {page.children.map((child) => renderPage(child, depth + 1))}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-slate-900 rounded-lg p-4 space-y-2">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-slate-100">Pages</h3>
        <Button size="sm" onClick={onNewPage}>
          <Plus size={16} className="mr-1" /> New
        </Button>
      </div>

      {pages.length === 0 ? (
        <p className="text-sm text-slate-500">No pages yet</p>
      ) : (
        <div className="space-y-1">{pages.map((page) => renderPage(page))}</div>
      )}
    </div>
  );
}
