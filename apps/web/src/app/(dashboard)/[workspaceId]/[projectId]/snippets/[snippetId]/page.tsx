'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SnippetViewer } from '@/components/snippets/SnippetViewer';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';

interface Snippet {
  id: string;
  title: string;
  description?: string;
  language: string;
  code: string;
  tags: string[];
  createdAt: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
}

export default function SnippetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;
  const snippetId = params.snippetId as string;

  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSnippet = async () => {
      try {
        const response = await api.get(`/snippets/${snippetId}`);
        setSnippet(response.data);
      } catch (error) {
        console.error('Failed to fetch snippet:', error);
      } finally {
        setLoading(false);
      }
    };

    if (snippetId) {
      fetchSnippet();
    }
  }, [snippetId]);

  const handleDelete = async () => {
    if (!confirm('Delete this snippet?')) return;

    try {
      await api.delete(`/snippets/${snippetId}`);
      router.push(`/dashboard/${workspaceId}/${projectId}/snippets`);
    } catch (error) {
      console.error('Failed to delete snippet:', error);
      alert('Failed to delete snippet');
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-400">Loading snippet...</div>;
  }

  if (!snippet) {
    return <div className="text-center py-8 text-slate-400">Snippet not found</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.back()} className="gap-2">
        <ArrowLeft size={16} />
        Back
      </Button>
      <SnippetViewer {...snippet} onDelete={handleDelete} />
    </div>
  );
}
