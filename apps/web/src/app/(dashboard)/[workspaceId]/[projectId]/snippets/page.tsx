'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SnippetList } from '@/components/snippets/SnippetList';
import { Code2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Snippet {
  id: string;
  title: string;
  description?: string;
  language: string;
  tags: string[];
  createdAt: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
}

export default function SnippetsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;

  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSnippets = async () => {
      try {
        const response = await api.get(`/snippets?projectId=${projectId}`);
        setSnippets(response.data);
      } catch (error) {
        console.error('Failed to fetch snippets:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSnippets();
  }, [projectId]);

  const handleDelete = async (snippetId: string) => {
    if (!confirm('Delete this snippet?')) return;

    try {
      await api.delete(`/snippets/${snippetId}`);
      setSnippets(snippets.filter((s) => s.id !== snippetId));
    } catch (error) {
      console.error('Failed to delete snippet:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Code2 className="text-violet-400" size={32} />
        <h1 className="text-3xl font-bold text-slate-100">Code Snippets</h1>
      </div>

      <SnippetList
        projectId={projectId}
        workspaceId={workspaceId}
        snippets={snippets}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  );
}
