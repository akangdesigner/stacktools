'use client';

import { useState, useEffect, useRef } from 'react';
import RichEditor from './RichEditor';

function uid() { return Math.random().toString(36).slice(2); }

// ── ContentItem types ─────────────────────────────────────────────────

type H3Item    = { kind: 'h3';    id: string; heading: string; body: string };
type ImageItem = { kind: 'image'; id: string; alt: string; src: string; raw: string };
type LinkItem  = { kind: 'link';  id: string; label: string; url: string; raw: string };
type TextItem  = { kind: 'text';  id: string; body: string };
type ContentItem = H3Item | ImageItem | LinkItem | TextItem;

function parseContent(md: string): { items: ContentItem[] } {
  const lines = md.split('\n');
  const items: ContentItem[] = [];
  let h3Heading: string | null = null;
  let h3BodyLines: string[] = [];
  let textLines: string[] = [];

  function pushH3() {
    if (h3Heading === null) return;
    items.push({ kind: 'h3', id: uid(), heading: h3Heading, body: h3BodyLines.join('\n').trimEnd() });
    h3Heading = null;
    h3BodyLines = [];
  }

  function pushText() {
    const body = textLines.join('\n').trim();
    textLines = [];
    if (body) items.push({ kind: 'text', id: uid(), body });
  }

  // 在開始新項目（H3／圖片／連結）前，把目前累積的內容收尾成一個項目
  function flush() {
    if (h3Heading !== null) pushH3();
    else pushText();
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (h3Heading !== null) h3BodyLines.push(line);
      else textLines.push(line);
      continue;
    }

    // H1/H2: stays in current context
    if (/^#{1,2}\s/.test(trimmed)) {
      if (h3Heading !== null) h3BodyLines.push(line);
      else textLines.push(line);
      continue;
    }

    // H3: flush previous, start new
    if (/^###\s+/.test(trimmed)) {
      flush();
      h3Heading = trimmed.replace(/^###\s+/, '').trim();
      continue;
    }

    // Image: always standalone
    if (/^!\[/.test(trimmed)) {
      flush();
      const m = trimmed.match(/^!\[([^\]]*)\]\(([^)]*)\)/);
      items.push({ kind: 'image', id: uid(), alt: m?.[1] ?? '圖片', src: m?.[2] ?? '', raw: line });
      continue;
    }

    // Extended reading link: always standalone
    if (/\*\*延伸閱讀/.test(trimmed)) {
      flush();
      const m = trimmed.match(/\[([^\]]+)\]\(([^)]+)\)/);
      items.push({ kind: 'link', id: uid(), label: m?.[1] ?? '延伸閱讀', url: m?.[2] ?? '', raw: line });
      continue;
    }

    // Regular content
    if (h3Heading !== null) h3BodyLines.push(line);
    else textLines.push(line);
  }

  flush();
  return { items };
}

function serializeContent(items: ContentItem[]): string {
  const parts: string[] = [];
  for (const item of items) {
    if (item.kind === 'h3') {
      parts.push(`### ${item.heading}${item.body.trim() ? '\n\n' + item.body.trim() : ''}`);
    } else if (item.kind === 'text') {
      parts.push(item.body.trim());
    } else {
      parts.push(item.raw);
    }
  }
  return parts.join('\n\n');
}

// Parse a freshly-inserted snippet into ContentItem(s)
function parseInserted(md: string): ContentItem[] {
  const trimmed = md.trim();
  if (!trimmed) return [];
  if (/^###\s+/.test(trimmed)) {
    const m = trimmed.match(/^###\s+([^\n]+)/);
    const heading = m?.[1]?.trim() ?? '新小節';
    const body = trimmed.includes('\n') ? trimmed.slice(trimmed.indexOf('\n') + 1).trim() : '';
    return [{ kind: 'h3', id: uid(), heading, body }];
  }
  if (/^!\[/.test(trimmed)) {
    const m = trimmed.match(/^!\[([^\]]*)\]\(([^)]*)\)/);
    return [{ kind: 'image', id: uid(), alt: m?.[1] ?? '圖片', src: m?.[2] ?? '', raw: trimmed }];
  }
  if (/\*\*延伸閱讀/.test(trimmed)) {
    const m = trimmed.match(/\[([^\]]+)\]\(([^)]+)\)/);
    return [{ kind: 'link', id: uid(), label: m?.[1] ?? '延伸閱讀', url: m?.[2] ?? '', raw: trimmed }];
  }
  return [{ kind: 'text', id: uid(), body: trimmed }];
}

// ── ImageCard ─────────────────────────────────────────────────────────

function ImageCard({ item, onReplace, onDelete }: {
  item: ImageItem;
  onReplace: (raw: string) => void;
  onDelete: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        onReplace(`![${item.alt}](${canvas.toDataURL('image/jpeg', 0.85)})`);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="px-4 py-3 group/img">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div className="relative rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
        {item.src
          ? <img src={item.src} alt={item.alt} className="max-w-full h-auto block mx-auto" style={{ maxHeight: '320px', objectFit: 'contain' }} />
          : <p className="text-xs text-gray-400 px-3 py-2">🖼️ {item.alt}</p>
        }
        {item.alt && item.alt !== '圖片' && item.src && (
          <p className="text-xs text-gray-400 text-center py-1.5 border-t border-gray-100">{item.alt}</p>
        )}
        {/* hover 控制列 */}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="h-6 px-2 flex items-center rounded-full bg-black/40 text-white text-xs hover:bg-black/70 transition-colors">
            換圖
          </button>
          <button type="button" onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-black/40 text-white text-xs hover:bg-red-500/80 transition-colors">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LinkCard ──────────────────────────────────────────────────────────

function LinkCard({ item, onUpdate, onDelete }: {
  item: LinkItem;
  onUpdate: (raw: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [url, setUrl]   = useState(item.url);

  function confirm() {
    if (!url.trim()) return;
    onUpdate(`**延伸閱讀：**[${label || url}](${url})`);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="px-4 py-2.5">
        <div className="flex flex-col gap-2 px-3.5 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-semibold text-amber-700">編輯延伸閱讀</p>
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="連結標題"
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            onKeyDown={e => e.key === 'Enter' && confirm()}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          />
          <div className="flex gap-2">
            <button type="button" onClick={confirm} disabled={!url.trim()}
              className="flex-1 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
              儲存
            </button>
            <button type="button" onClick={() => { setLabel(item.label); setUrl(item.url); setEditing(false); }}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 group/link">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
        <span className="text-sm shrink-0">🔗</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-amber-700 mb-0.5">延伸閱讀</p>
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 underline block truncate">{item.label}</a>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0">
          <button type="button" onClick={() => setEditing(true)}
            className="h-5 px-2 text-xs text-amber-600 hover:text-amber-900 hover:bg-amber-100 rounded-full transition-colors">
            編輯
          </button>
          <button type="button" onClick={onDelete}
            className="w-5 h-5 flex items-center justify-center rounded-full text-amber-300 hover:text-red-400 hover:bg-red-50 transition-colors text-sm">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

// ── InsertDivider ─────────────────────────────────────────────────────

function InsertDivider({ onInsert, onInsertH2 }: { onInsert: (md: string) => void; onInsertH2?: () => void }) {
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
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        onInsert(`![圖片](${canvas.toDataURL('image/jpeg', 0.85)})`);
        setOpen(false);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div ref={containerRef} className="relative flex items-center justify-center py-2 group/divider">
      <div className="absolute left-4 right-4 top-1/2 h-px bg-gray-200 transition-colors" />
      {/* file input 常駐 DOM，確保 ref 穩定可重複選檔 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFile}
      />
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
            <>
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
              </div>
              <div className="flex p-1.5 pt-0 gap-1 border-t border-gray-100 mt-0">
                <button type="button"
                  onClick={() => { onInsert('（請在這裡輸入文字段落，放在 H2 標題正下方時可作為這個小節的導言）'); setOpen(false); }}
                  className="flex-1 px-2 py-2.5 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <span className="px-1 py-0.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded shrink-0">Aa</span>
                  文字段落
                </button>
                <button type="button"
                  onClick={() => { onInsert('### 新小節\n\n'); setOpen(false); }}
                  className="flex-1 px-2 py-2.5 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <span className="px-1 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded shrink-0">H3</span>
                  新增小節
                </button>
                {onInsertH2 && (
                  <button type="button"
                    onClick={() => { onInsertH2(); setOpen(false); }}
                    className="flex-1 px-2 py-2.5 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <span className="px-1 py-0.5 bg-blue-50 text-blue-600 text-xs font-bold rounded shrink-0">H2</span>
                    新增段落
                  </button>
                )}
              </div>
            </>
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

export default function SectionBlockEditor({ value, onChange, editable = false, onInsertH2 }: {
  value: string;
  onChange: (v: string) => void;
  editable?: boolean;
  onInsertH2?: () => void;
}) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const lastSer = useRef<string | null>(null);

  useEffect(() => {
    if (value !== lastSer.current) {
      const parsed = parseContent(value);
      setItems(parsed.items);
      lastSer.current = value;
    }
  }, [value]);

  function applyChange(newItems: ContentItem[]) {
    const serialized = serializeContent(newItems);
    lastSer.current = serialized;
    setItems(newItems);
    onChange(serialized);
  }

  function deleteItem(itemId: string) {
    applyChange(items.filter(it => it.id !== itemId));
  }

  function updateItem(itemId: string, raw: string) {
    const parsed = parseInserted(raw);
    if (!parsed.length) return;
    applyChange(items.map(it => it.id === itemId ? { ...parsed[0], id: itemId } : it));
  }

  function insertAfterItem(itemId: string | null, md: string) {
    const newItems = parseInserted(md);
    if (!newItems.length) return;
    if (itemId === null) {
      // 插入到所有 items 之前（緊接在 H2 標題下方）
      applyChange([...newItems, ...items]);
    } else {
      const idx = items.findIndex(it => it.id === itemId);
      const next = [...items];
      next.splice(idx + 1, 0, ...newItems);
      applyChange(next);
    }
  }

  // 編輯模式 → 單一完整 RichEditor
  if (editable) {
    return (
      <RichEditor
        value={value}
        onChange={onChange}
        placeholder="開始編輯…"
        minHeight="140px"
        editable={true}
      />
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* H2 下方 InsertDivider */}
      <InsertDivider onInsert={md => insertAfterItem(null, md)} onInsertH2={onInsertH2} />

      {items.map(item => (
        <div key={item.id} className="border-b border-gray-100 last:border-b-0">

          {item.kind === 'text' && (
            <div className="px-4 py-3">
              <RichEditor value={item.body} onChange={() => {}} editable={false} minHeight="auto" />
            </div>
          )}

          {item.kind === 'h3' && (
            <div className="px-4 pt-3 pb-1">
              <RichEditor
                value={`### ${item.heading}\n\n${item.body}`}
                onChange={() => {}}
                editable={false}
                minHeight="60px"
              />
            </div>
          )}

          {item.kind === 'image' && (
            <ImageCard
              item={item}
              onReplace={raw => updateItem(item.id, raw)}
              onDelete={() => deleteItem(item.id)}
            />
          )}

          {item.kind === 'link' && (
            <LinkCard
              item={item}
              onUpdate={raw => updateItem(item.id, raw)}
              onDelete={() => deleteItem(item.id)}
            />
          )}

          <InsertDivider onInsert={md => insertAfterItem(item.id, md)} onInsertH2={onInsertH2} />
        </div>
      ))}

      {items.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-gray-300">尚無內容</div>
      )}
    </div>
  );
}
