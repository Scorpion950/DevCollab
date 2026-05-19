'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check } from 'lucide-react';

interface SnippetViewerProps {
  title: string;
  description?: string;
  language: string;
  code: string;
  tags: string[];
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  createdAt: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function SnippetViewer({
  title,
  description,
  language,
  code,
  tags,
  author,
  createdAt,
  onEdit,
  onDelete,
}: SnippetViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 mb-2">{title}</h1>
          {description && (
            <p className="text-slate-400">{description}</p>
          )}
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-sm">
              <p className="font-medium text-slate-100">{author.name}</p>
              <p className="text-slate-400">
                {new Date(createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {onEdit && (
              <Button onClick={onEdit} variant="outline">
                Edit
              </Button>
            )}
            {onDelete && (
              <Button onClick={onDelete} variant="outline" className="text-red-400 hover:text-red-300">
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Tags & Language */}
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-blue-500/20 text-blue-300">{language}</Badge>
          {tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Code */}
      <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
        <div className="flex justify-between items-center px-4 py-2 border-b border-slate-700 bg-slate-800">
          <p className="text-xs text-slate-400">{language}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="gap-1"
          >
            {copied ? (
              <>
                <Check size={14} /> Copied
              </>
            ) : (
              <>
                <Copy size={14} /> Copy
              </>
            )}
          </Button>
        </div>
        <pre className="p-4 overflow-auto max-h-96 text-sm font-mono text-slate-300">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
