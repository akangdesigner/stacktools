'use client';

import { useState, useEffect, useRef } from 'react';
import RichEditor from './RichEditor';

function uid() { return Math.random().toString(36).slice(2); }

type H3Block = { id: string; heading: string; body: string };
type InsertType = 'link' | 'image';

function parseBlocks(md: string): { preamble: string; blocks: H3Block[] } {
  const lines = md.split('\n');
  const preambleLines: string[] = [];
  const blocks: H3Block[] = [];
  let cur: { heading: string; bodyLines: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^###\s+(.+)/);
    if (m) {
      if (cur) blocks.push({ id: uid(), heading: cur.heading, body: cur.bodyLines.join('\n').trimEnd() });
      cur = { heading: m[1].trim(), bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  if (cur) blocks.push({ id: uid(), heading: cur.heading, body: cur.bodyLines.join('\n').trimEnd() });
  return { preamble: preambleLines.join('\n').trimEnd(), blocks };
}

function serializeBlocks(preamble: string, blocks: H3Block[]): string {
  const parts: string[] = [];
  if (preamble.trim()) parts.push(preamble.trim());
  for (const b of blocks) {
    parts.push(`### ${b.heading}${b.body.trim() ? '\n\n' + b.body.trim() : ''}`);
  }
  return parts.join('\n\n');
}

// ── InsertDivider ─────────────────────────────────────────────────────

function InsertDivider({ onInsert }: { onInsert: (md: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'pick' | 'link'>('pick');
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function toggle() {
    if (!open) { setStep('pick'); setLinkText(''); setLinkUrl(''); }
    setOpen(v => !v);
  }

  function confirmLink() {
    if (!linkUrl.trim()) return;
    onInsert(`**延伸閱讀：**[${linkText || linkUrl}](${linkUrl})`);
    setOpen(false);
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onInsert(`![圖片](${url})`);
    setOpen(false);
    // reset input so the same file can be re-selected
    e.target.value = '';
  }

  return (
    <div ref={containerRef} className="relative flex items-center justify-center py-2 group/divider">
      <div className="absolute inset-x-0 top-1/2 h-px bg-gray-100 group-hover/divider:bg-blue-100 transition-colors" />
      <button
        type="button"
        onClick={toggle}
        className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border shadow-sm transition-all duration-150 ${
          open
            ? 'bg-blue-500 text-white border-blue-500 opacity-100'
            : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300 hover:text-blue-500 opacity-0 group-hover/divider:opacity-100'
        }`}
      >+</button>

      {open && (
        <div className="absolute top-7 left-1/2 -translate-x-1/2 z-30 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden w-60">
          {step === 'pick' && (
            <div className="flex p-1.5 gap-1">
              <button type="button"
                onClick={() => setStep('link')}
                className="flex-1 px-2 py-3 text-xs text-gray-700 hover:bg-blue-50 rounded-lg flex flex-col items-center gap-1 transition-colors"
              >
                <span className="text-base">🔗</span>
                <span className="font-medium">延伸閱讀連結</span>
              </button>
              <button type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-2 py-3 text-xs text-gray-700 hover:bg-blue-50 rounded-lg flex flex-col items-center gap-1 transition-colors"
              >
                <span className="text-base">🖼️</span>
                <span className="font-medium">上傳圖片</span>
              </button>
              {/* hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFile}
              />
            </div>
          )}

          {step === 'link' && (
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <button type="button" onClick={() => setStep('pick')}
                  className="text-gray-400 hover:text-gray-600 text-sm leading-none">←</button>
                <p className="text-xs font-semibold text-gray-800">延伸閱讀連結</p>
              </div>
              <input
                autoFocus
                value={linkText}
                onChange={e => setLinkText(e.target.value)}
                placeholder="連結標題"
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <input
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={e => e.key === 'Enter' && confirmLink()}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <div className="flex gap-2 pt-0.5">
                <button type="button" onClick={confirmLink} disabled={!linkUrl.trim()}
                  className="flex-1 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
                  插入
                </button>
                <button type="button" onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SectionBlockEditor ────────────────────────────────────────────────

export default function SectionBlockEditor({ value, onChange, editable = false }: {
  value: string;
  onChange: (v: string) => void;
  editable?: boolean;
}) {
  const [preamble, setPreamble] = useState('');
  const [blocks, setBlocks] = useState<H3Block[]>([]);
  const lastSer = useRef<string | null>(null);

  useEffect(() => {
    if (value !== lastSer.current) {
      const { preamble: p, blocks: b } = parseBlocks(value);
      setPreamble(p);
      setBlocks(b);
      lastSer.current = value;
    }
  }, [value]);

  function insertAfter(blockId: string, md: string) {
    // Compute next blocks outside of setState to avoid calling onChange during render
    const next = blocks.map(b =>
      b.id === blockId ? { ...b, body: b.body.trim() + '\n\n' + md } : b
    );
    const serialized = serializeBlocks(preamble, next);
    lastSer.current = serialized;
    setBlocks(next);
    onChange(serialized);
  }

  // editable mode or no H3 blocks → single full RichEditor
  if (editable || blocks.length === 0) {
    return (
      <RichEditor
        value={value}
        onChange={onChange}
        placeholder="開始編輯…"
        minHeight="140px"
        editable={editable}
      />
    );
  }

  // Strip ## heading lines from preamble (already shown in card header)
  const displayPreamble = preamble.split('\n').filter(l => !/^##\s/.test(l)).join('\n').trim();

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {displayPreamble && (
        <div className="px-4 py-3 border-b border-gray-100">
          <RichEditor value={displayPreamble} onChange={() => {}} editable={false} minHeight="auto" />
        </div>
      )}
      {blocks.map(block => (
        <div key={block.id} className="border-b border-gray-100 last:border-b-0">
          <div className="px-4 pt-3 pb-1">
            <RichEditor
              value={`### ${block.heading}\n\n${block.body}`}
              onChange={() => {}}
              editable={false}
              minHeight="60px"
            />
          </div>
          <InsertDivider onInsert={md => insertAfter(block.id, md)} />
        </div>
      ))}
    </div>
  );
}
