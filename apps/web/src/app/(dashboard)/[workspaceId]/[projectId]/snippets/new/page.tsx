'use client';

import { useParams, useRouter } from 'next/navigation';
import { SnippetEditor } from '@/components/snippets/SnippetEditor';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useState } from 'react';

export default function CreateSnippetPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;

  const [saving, setSaving] = useState(false);

  const handleSave = async (data: {
    title: string;
    description: string;
    language: string;
    code: string;
    tags: string[];
  }) => {
    try {
      setSaving(true);
      const response = await api.post('/snippets', {
        projectId,
        ...data,
      });

      router.push(
        `/dashboard/${workspaceId}/${projectId}/snippets/${response.data.id}`
      );
    } catch (error) {
      console.error('Failed to create snippet:', error);
      alert('Failed to create snippet');
    } finally {
      setSaving(false);
    }
  };

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
        <h1 className="text-2xl font-bold text-slate-100">Create Snippet</h1>
      </div>

      <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
        <SnippetEditor onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}
