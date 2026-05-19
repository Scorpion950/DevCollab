'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo } from 'react';

interface WikiEditorProps {
  content: string;
  onChange: (content: string) => void;
  isEditable?: boolean;
}

export function WikiEditor({ content, onChange, isEditable = true }: WikiEditorProps) {
  const lowlight = useMemo(() => createLowlight(common), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      Link.configure({
        openOnClick: false,
      }),
      Image,
    ],
    content,
    editable: isEditable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="space-y-2">
      {isEditable && (
        <div className="flex gap-1 flex-wrap p-2 border border-slate-700 rounded-t-lg bg-slate-900">
          <Button
            size="sm"
            variant={editor.isActive('bold') ? 'default' : 'ghost'}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className="h-8"
          >
            <strong>B</strong>
          </Button>
          <Button
            size="sm"
            variant={editor.isActive('italic') ? 'default' : 'ghost'}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className="h-8"
          >
            <i>I</i>
          </Button>
          <Button
            size="sm"
            variant={editor.isActive('codeBlock') ? 'default' : 'ghost'}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className="h-8"
          >
            &lt; &gt;
          </Button>
          <Button
            size="sm"
            variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className="h-8"
          >
            • List
          </Button>
          <Button
            size="sm"
            variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className="h-8"
          >
            1. List
          </Button>
        </div>
      )}
      <EditorContent
        editor={editor}
        className={`prose prose-invert max-w-none p-4 border border-slate-700 rounded-lg bg-slate-900 text-slate-100 min-h-96 overflow-auto ${
          isEditable ? 'rounded-t-none border-t-0' : ''
        }`}
      />
    </div>
  );
}
