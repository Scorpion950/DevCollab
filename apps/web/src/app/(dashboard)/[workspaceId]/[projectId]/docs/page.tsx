'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { WikiPageTree } from '@/components/wiki/WikiPageTree';
import { Button } from '@/components/ui/button';
import { Plus, BookOpen } from 'lucide-react';
import { api } from '@/lib/api';

interface WikiPage {
  id: string;
  title: string;
  slug: string;
  children?: WikiPage[];
}

export default function DocsPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;

  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const response = await api.get(`/wiki?projectId=${projectId}`);
        setPages(response.data);
      } catch (error) {
        console.error('Failed to fetch wiki pages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPages();
  }, [projectId]);

  const handleNewPage = async () => {
    const title = prompt('Page title:');
    if (!title) return;

    try {
      const response = await api.post('/wiki', {
        projectId,
        title,
      });

      setPages([...pages, response.data]);
    } catch (error) {
      console.error('Failed to create page:', error);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    if (!confirm('Delete this page and all its versions?')) return;

    try {
      await api.delete(`/wiki/${pageId}`);
      setPages(pages.filter((p) => p.id !== pageId));
    } catch (error) {
      console.error('Failed to delete page:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="text-violet-400" size={32} />
          <h1 className="text-3xl font-bold text-slate-100">Documentation</h1>
        </div>
        <Button onClick={handleNewPage}>
          <Plus size={16} className="mr-1" /> New Page
        </Button>
      </div>

      <WikiPageTree
        projectId={projectId}
        workspaceId={workspaceId}
        pages={pages}
        onNewPage={handleNewPage}
        onDeletePage={handleDeletePage}
      />
    </div>
  );
}
