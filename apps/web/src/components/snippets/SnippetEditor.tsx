'use client';

import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface SnippetEditorProps {
  initialTitle?: string;
  initialDescription?: string;
  initialLanguage?: string;
  initialCode?: string;
  initialTags?: string[];
  onSave: (data: {
    title: string;
    description: string;
    language: string;
    code: string;
    tags: string[];
  }) => Promise<void>;
  saving?: boolean;
}

const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'cpp',
  'go',
  'rust',
  'sql',
  'html',
  'css',
  'json',
  'yaml',
  'bash',
];

export function SnippetEditor({
  initialTitle = '',
  initialDescription = '',
  initialLanguage = 'javascript',
  initialCode = '',
  initialTags = [],
  onSave,
  saving = false,
}: SnippetEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [language, setLanguage] = useState(initialLanguage);
  const [code, setCode] = useState(initialCode);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = (tag: string) => {
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Title is required');
      return;
    }
    if (!code.trim()) {
      alert('Code is required');
      return;
    }

    await onSave({
      title,
      description,
      language,
      code,
      tags,
    });
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className="text-sm font-medium text-slate-300">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Custom React Hook"
          className="mt-1"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium text-slate-300">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional: Brief description of the snippet"
          className="mt-1 h-24"
        />
      </div>

      {/* Language & Tags */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-300">Language</label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300">Tags</label>
          <div className="flex gap-1 mt-1">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag(tagInput);
                }
              }}
              placeholder="Add tag..."
              className="text-xs"
            />
            <Button
              size="sm"
              onClick={() => handleAddTag(tagInput)}
              disabled={!tagInput}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:text-red-400"
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Code Editor */}
      <div>
        <label className="text-sm font-medium text-slate-300">Code</label>
        <Editor
          height="400px"
          language={language}
          value={code}
          onChange={(value) => setCode(value || '')}
          theme="vs-dark"
          className="mt-1 rounded-lg border border-slate-700"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: 'on',
          }}
        />
      </div>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? 'Saving...' : 'Save Snippet'}
      </Button>
    </div>
  );
}
