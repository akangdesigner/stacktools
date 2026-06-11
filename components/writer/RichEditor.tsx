'use client';

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import { Markdown } from 'tiptap-markdown';

type Props = {
  value: string;
  onChange: (md: string) => void;
  placeholder?: string;
  minHeight?: string;
  editable?: boolean;
};

function ToolbarBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={`px-2 py-1 text-xs rounded transition-colors ${active ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  );
}

export default function RichEditor({ value, onChange, placeholder, minHeight = '140px', editable = true }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Markdown.configure({ transformPastedText: true }),
    ],
    content: value,
    editable,
    editorProps: {
      attributes: {
        class: 'outline-none prose prose-sm max-w-none',
        style: `min-height: ${minHeight}; padding: 12px 16px;`,
      },
    },
    onUpdate({ editor }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (editor.storage as any).markdown.getMarkdown() as string;
      onChangeRef.current(md);
    },
  });

  // editable 切換時同步
  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // 外部 value 改變時同步（例如重新產生）
  const lastValueRef = useRef(value);
  useEffect(() => {
    if (!editor) return;
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      const pos = editor.state.selection.anchor;
      editor.commands.setContent(value);
      try { editor.commands.setTextSelection(Math.min(pos, editor.state.doc.content.size)); } catch { /* ignore */ }
    }
  }, [editor, value]);

  if (!editor) return null;

  const can = editor.can().chain().focus();

  return (
    <div className={editable ? 'border border-gray-200 rounded-xl bg-white overflow-hidden' : 'border border-gray-100 rounded-xl bg-white overflow-hidden'}>
      {/* Toolbar */}
      {editable && <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-100 bg-gray-50/60 flex-wrap">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="粗體 (Ctrl+B)">
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜體 (Ctrl+I)">
          <em>I</em>
        </ToolbarBtn>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2 標題">
          H2
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3 小標">
          H3
        </ToolbarBtn>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="項目清單">
          ≡
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="編號清單">
          1≡
        </ToolbarBtn>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn
          onClick={() => {
            const prev = can.undo().run();
            if (prev) editor.chain().focus().undo().run();
          }}
          title="復原 (Ctrl+Z)"
        >↩</ToolbarBtn>
        <ToolbarBtn
          onClick={() => {
            const next = can.redo().run();
            if (next) editor.chain().focus().redo().run();
          }}
          title="重做 (Ctrl+Y)"
        >↪</ToolbarBtn>
      </div>}

      {/* Editor area */}
      <div className="relative">
        {editor.isEmpty && placeholder && (
          <p className="absolute top-3 left-4 text-sm text-gray-300 pointer-events-none select-none">{placeholder}</p>
        )}
        <style>{`
          .tiptap-writer h2 { font-size: 1rem; font-weight: 700; margin: 1rem 0 0.25rem; padding-bottom: 0.25rem; border-bottom: 1px solid #e5e7eb; }
          .tiptap-writer h3 { font-size: 0.875rem; font-weight: 600; margin: 0.75rem 0 0.15rem; }
          .tiptap-writer p { font-size: 0.875rem; color: #374151; margin-bottom: 0.5rem; line-height: 1.6; }
          .tiptap-writer ul { list-style: disc; padding-left: 1.25rem; margin-bottom: 0.5rem; }
          .tiptap-writer ol { list-style: decimal; padding-left: 1.25rem; margin-bottom: 0.5rem; }
          .tiptap-writer li { font-size: 0.875rem; color: #374151; line-height: 1.6; }
          .tiptap-writer strong { font-weight: 600; color: #111827; }
          .tiptap-writer table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.75rem; }
          .tiptap-writer th, .tiptap-writer td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
          .tiptap-writer th { background: #f9fafb; font-weight: 600; }
          .tiptap-writer .outline-none:focus { outline: none; }
          .tiptap-writer img { max-width: 100%; height: auto; border-radius: 6px; margin: 0.5rem 0; display: block; }
        `}</style>
        <div className="tiptap-writer">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
