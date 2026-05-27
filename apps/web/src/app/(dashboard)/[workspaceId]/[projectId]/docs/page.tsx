'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { WikiPageTree } from '@/components/wiki/WikiPageTree';
import { Button } from '@/components/ui/button';
import { Plus, BookOpen, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';

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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleNewPageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPageTitle.trim()) return;

    try {
      setIsSubmitting(true);
      const response = await api.post('/wiki', {
        projectId,
        title: newPageTitle.trim(),
      });

      setPages([...pages, response.data]);
      setIsCreateModalOpen(false);
      setNewPageTitle('');
    } catch (error) {
      console.error('Failed to create page:', error);
    } finally {
      setIsSubmitting(false);
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
          <BookOpen className="text-primary" size={32} />
          <h1 className="text-3xl font-bold text-text-primary">Documentation</h1>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} className="btn-primary">
          <Plus size={16} className="mr-1" /> New Page
        </Button>
      </div>

      <WikiPageTree
        projectId={projectId}
        workspaceId={workspaceId}
        pages={pages}
        onNewPage={() => setIsCreateModalOpen(true)}
        onDeletePage={handleDeletePage}
      />

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Document</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <form onSubmit={handleNewPageSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-text-primary mb-2 block">
                Document Title
              </label>
              <Input
                value={newPageTitle}
                onChange={(e) => setNewPageTitle(e.target.value)}
                placeholder="e.g., API Architecture, Meeting Notes..."
                autoFocus
                className="bg-bg-elevated border-border"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newPageTitle.trim() || isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Document'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
