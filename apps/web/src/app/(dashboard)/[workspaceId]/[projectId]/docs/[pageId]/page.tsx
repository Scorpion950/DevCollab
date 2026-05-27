'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WikiEditor } from '@/components/wiki/WikiEditor';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Edit2, MoreVertical } from 'lucide-react';
import { api } from '@/lib/api';

interface WikiPage {
  id: string;
  title: string;
  content: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
  };
}

export default function WikiPageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;
  const pageId = params.pageId as string;

  const [page, setPage] = useState<WikiPage | null>(null);
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPage = async () => {
      try {
        const response = await api.get(`/wiki/${pageId}`);
        setPage(response.data);
        setContent(response.data.content);
      } catch (error) {
        console.error('Failed to fetch page:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [pageId]);

  const handleSave = async () => {
    if (!page) return;

    try {
      setSaving(true);
      const response = await api.put(`/wiki/${pageId}`, {
        content,
      });
      setPage(response.data);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save page:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-400">Loading...</div>;
  }

  if (!page) {
    return <div className="text-center py-8 text-slate-400">Page not found</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="p-2 h-auto"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{page.title}</h1>
            <p className="text-sm text-slate-500">
              By {page.author.name} • Last updated {new Date(page.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                onClick={() => setIsEditing(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save size={16} className="mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
              >
                <Edit2 size={16} className="mr-1" /> Edit
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push(
                  `/dashboard/${workspaceId}/${projectId}/docs/${pageId}/history`
                )}
              >
                History
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {isEditing ? (
        <WikiEditor
          content={content}
          onChange={setContent}
          isEditable={true}
        />
      ) : (
        <div className="bg-bg-surface rounded-lg p-6 border border-border shadow-sm">
          <div
            className="prose prose-invert max-w-none text-text-primary"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      )}
    </div>
  );
}
