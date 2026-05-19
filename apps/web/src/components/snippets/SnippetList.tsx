'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus, Trash2 } from 'lucide-react';

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

interface SnippetListProps {
  projectId: string;
  workspaceId: string;
  snippets: Snippet[];
  onDelete: (snippetId: string) => void;
  loading?: boolean;
}

const LANGUAGE_COLORS: Record<string, string> = {
  javascript: 'bg-yellow-500/20 text-yellow-300',
  typescript: 'bg-blue-500/20 text-blue-300',
  python: 'bg-blue-600/20 text-blue-200',
  java: 'bg-orange-500/20 text-orange-300',
  cpp: 'bg-pink-500/20 text-pink-300',
  go: 'bg-cyan-500/20 text-cyan-300',
  rust: 'bg-orange-600/20 text-orange-300',
  sql: 'bg-purple-500/20 text-purple-300',
};

export function SnippetList({
  projectId,
  workspaceId,
  snippets,
  onDelete,
  loading,
}: SnippetListProps) {
  const [search, setSearch] = useState('');
  const [filteredSnippets, setFilteredSnippets] = useState(snippets);

  useEffect(() => {
    const filtered = snippets.filter(
      (s) =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.description?.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredSnippets(filtered);
  }, [search, snippets]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <Input
            placeholder="Search snippets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Link href={`/dashboard/${workspaceId}/${projectId}/snippets/new`}>
          <Button>
            <Plus size={16} className="mr-1" /> New Snippet
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center text-slate-400">Loading snippets...</div>
      ) : filteredSnippets.length === 0 ? (
        <div className="text-center text-slate-400 py-8">
          {snippets.length === 0
            ? 'No snippets yet. Create one to get started.'
            : 'No snippets match your search.'}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredSnippets.map((snippet) => (
            <div
              key={snippet.id}
              className="bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <Link
                  href={`/dashboard/${workspaceId}/${projectId}/snippets/${snippet.id}`}
                  className="flex-1"
                >
                  <h3 className="font-semibold text-slate-100 hover:text-violet-400 truncate">
                    {snippet.title}
                  </h3>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(snippet.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 size={16} />
                </Button>
              </div>

              {snippet.description && (
                <p className="text-sm text-slate-400 mb-2 line-clamp-2">
                  {snippet.description}
                </p>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                <Badge
                  className={LANGUAGE_COLORS[snippet.language] || 'bg-slate-700 text-slate-300'}
                >
                  {snippet.language}
                </Badge>
                {snippet.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              <p className="text-xs text-slate-500 mt-3">
                By {snippet.author.name} • {new Date(snippet.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
