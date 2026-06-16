'use client';

import { useState } from 'react';

type SectionBase = {
  id: string;
  h2: string;
  h3s: string[];
  content: string;
  generating: boolean;
};

type Props<S extends SectionBase> = {
  open: boolean;
  onClose: () => void;
  sections: S[];
  onUpdate: (sections: S[]) => void;
};

// ── Block types ────────────────────────────────────────────────────────

type Block =
  | { type: 'h3';        text: string; raw: string }
  | { type: 'paragraph'; preview: string; raw: string }
  | { type: 'image';     alt: string;  raw: string }
  | { type: 'table';     raw: string }
  | { type: 'link';      label: string; raw: string };

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split('\n');
  let tableBuf: string[] = [];
  let paraBuf: string[] = [];

  function flushPara() {
    if (!paraBuf.length) return;
    const raw = paraBuf.join('\n');
    const preview = paraBuf.find(l => l.trim())?.trim().slice(0, 45) ?? '';
    if (preview) blocks.push({ type: 'paragraph', preview, raw });
    paraBuf = [];
  }

  function flushTable() {
    if (!tableBuf.length) return;
    blocks.push({ type: 'table', raw: tableBuf.join('\n') });
    tableBuf = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip H1 / H2 (section title handled elsewhere)
    if (/^#{1,2}\s/.test(trimmed)) continue;

    // H3 heading
    if (/^###\s+/.test(trimmed)) {
      flushPara(); flushTable();
      blocks.push({ type: 'h3', text: trimmed.replace(/^###\s+/, ''), raw: line });
      continue;
    }

    // Table row
    if (/^\|.+\|/.test(trimmed)) {
      flushPara();
      tableBuf.push(line);
      continue;
    }

    // Non-table line → flush any accumulated table first
    flushTable();

    if (!trimmed) { flushPara(); continue; }

    // Image
    if (/^!\[/.test(trimmed)) {
      flushPara();
      const m = trimmed.match(/^!\[([^\]]*)\]/);
      blocks.push({ type: 'image', alt: m?.[1] || '圖片', raw: line });
      continue;
    }

    // Extended reading link
    if (/\*\*延伸閱讀/.test(trimmed)) {
      flushPara();
      const m = trimmed.match(/\[([^\]]+)\]/);
      blocks.push({ type: 'link', label: m?.[1] ?? '延伸閱讀', raw: line });
      continue;
    }

    // Regular paragraph text
    paraBuf.push(line);
  }

  flushPara();
  flushTable();
  return blocks;
}

function removeBlock(content: string, raw: string): string {
  const cleaned = raw.includes('\n')
    ? content.replace(raw, '')
    : content.split('\n').filter(l => l !== raw).join('\n');
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

// ── Icons ─────────────────────────────────────────────────────────────

const BLOCK_COLOR: Record<Block['type'], string> = {
  h3:        'text-blue-400',
  paragraph: 'text-gray-300',
  image:     'text-violet-400',
  table:     'text-emerald-400',
  link:      'text-amber-400',
};

function BlockIcon({ type }: { type: Block['type'] }) {
  const cls = `text-xs font-bold shrink-0 w-4 text-center ${BLOCK_COLOR[type]}`;
  if (type === 'h3')        return <span className={cls}>H3</span>;
  if (type === 'paragraph') return <span className={cls}>¶</span>;
  if (type === 'image')     return <span className={cls}>🖼</span>;
  if (type === 'table')     return <span className={cls}>▦</span>;
  if (type === 'link')      return <span className={cls}>🔗</span>;
  return null;
}

function blockLabel(block: Block): string {
  if (block.type === 'h3')        return block.text;
  if (block.type === 'paragraph') return block.preview + (block.preview.length >= 45 ? '…' : '');
  if (block.type === 'image')     return block.alt || '圖片';
  if (block.type === 'table')     return '表格';
  if (block.type === 'link')      return block.label;
  return '';
}

// ── Component ─────────────────────────────────────────────────────────

function jumpToBlock(secId: string, block: Block) {
  const secEl = document.getElementById(`sec-${secId}`);
  // 搜尋文字時只在內文區域（排除 section header 的灰色小字）
  const contentEl = document.getElementById(`sec-content-${secId}`) ?? secEl;
  if (!secEl) return;

  let searchText = '';
  if (block.type === 'h3')        searchText = block.text;
  if (block.type === 'paragraph') searchText = block.preview.slice(0, 20);
  if (block.type === 'link')      searchText = block.label.slice(0, 20);

  // 先捲到段落頂部
  secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!searchText || !contentEl) return;

  setTimeout(() => {
    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? '';
      const idx = text.indexOf(searchText);
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, Math.min(idx + searchText.length, text.length));
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        (node.parentElement as HTMLElement)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      node = walker.nextNode();
    }
  }, 350);
}

export default function StructurePanel<S extends SectionBase>({ open, onClose, sections, onUpdate }: Props<S>) {

  function move(idx: number, dir: -1 | 1) {
    const to = idx + dir;
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    [next[idx], next[to]] = [next[to], next[idx]];
    onUpdate(next);
  }

  function deleteSection(id: string) {
    onUpdate(sections.filter(s => s.id !== id));
  }

  function deleteBlock(secId: string, block: Block) {
    onUpdate(sections.map(s => {
      if (s.id !== secId) return s;
      const newContent = removeBlock(s.content, block.raw);
      const newH3s = block.type === 'h3'
        ? s.h3s.filter(h => h !== block.text)
        : s.h3s;
      return { ...s, content: newContent, h3s: newH3s };
    }));
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}

      <div
        className={`fixed top-0 right-0 h-full z-50 flex flex-col bg-white border-l border-gray-200 shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: '280px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          <p className="text-sm font-semibold text-gray-800">文章結構</p>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 text-lg leading-none">×</button>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {sections.map((sec, i) => {
            const blocks = parseBlocks(sec.content);
            return (
              <div key={sec.id}
                className={`rounded-xl border overflow-hidden ${sec.generating ? 'border-blue-200' : sec.content ? 'border-emerald-200 bg-emerald-50/10' : 'border-gray-200'}`}
              >
                {/* H2 row — 點標題捲到該段落 */}
                <div className="flex items-center gap-1.5 px-3 py-2 bg-white cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => document.getElementById(`sec-${sec.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sec.generating ? 'bg-blue-400 animate-pulse' : sec.content ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  <span className="w-4 text-xs text-gray-400 font-mono shrink-0 text-center">{i + 1}</span>
                  <span className="flex-1 text-xs font-semibold text-gray-800 truncate min-w-0" title={sec.h2}>{sec.h2}</span>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                      className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 15l-6-6-6 6"/></svg>
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1}
                      className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                    <button type="button" onClick={() => deleteSection(sec.id)}
                      className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors text-xs">×</button>
                  </div>
                </div>

                {/* Blocks in order */}
                {blocks.length > 0 && (
                  <div className="border-t border-gray-100">
                    {blocks.map((block, j) => (
                      <div key={j}
                        onClick={() => jumpToBlock(sec.id, block)}
                        className={`flex items-center gap-2 px-3 py-1.5 group/block hover:bg-blue-50 cursor-pointer transition-colors ${block.type === 'h3' ? 'pl-4' : 'pl-5'}`}
                      >
                        <BlockIcon type={block.type} />
                        <span className={`flex-1 text-xs truncate min-w-0 ${block.type === 'h3' ? 'text-gray-600 font-medium' : 'text-gray-400'}`}
                          title={blockLabel(block)}>
                          {blockLabel(block)}
                        </span>
                        <button type="button"
                          onClick={e => { e.stopPropagation(); deleteBlock(sec.id, block); }}
                          className="w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:text-red-400 opacity-0 group-hover/block:opacity-100 transition-all text-xs shrink-0">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 shrink-0">
          <p className="text-xs text-gray-400 text-center">↑↓ 調整段落順序 · hover × 刪除區塊</p>
        </div>
      </div>
    </>
  );
}
