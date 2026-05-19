'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WikiVersionHistory } from '@/components/wiki/WikiVersionHistory';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';

interface WikiVersion {
  id: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
  };
}

export default function WikiHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;
  const pageId = params.pageId as string;

  const [versions, setVersions] = useState<WikiVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        const response = await api.get(`/wiki/${pageId}/versions`);
        setVersions(response.data);
      } catch (error) {
        console.error('Failed to fetch versions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVersions();
  }, [pageId]);

  const handleRestore = async (versionId: string) => {
    if (!confirm('Restore this version?')) return;

    try {
      await api.post(`/wiki/${pageId}/restore`, { versionId });
      router.push(`/dashboard/${workspaceId}/${projectId}/docs/${pageId}`);
    } catch (error) {
      console.error('Failed to restore version:', error);
    }
  };

  const handleViewDiff = (versionId: string) => {
    router.push(
      `/dashboard/${workspaceId}/${projectId}/docs/${pageId}/diff?v1=${versionId}`
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-400">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="p-2 h-auto"
        >
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-2xl font-bold text-slate-100">Version History</h1>
      </div>

      <WikiVersionHistory
        pageId={pageId}
        versions={versions}
        onRestore={handleRestore}
        onViewDiff={handleViewDiff}
      />
    </div>
  );
}
