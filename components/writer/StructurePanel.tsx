'use client';

import { parseContent, serializeContent, type ContentItem } from './SectionBlockEditor';

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

// 與 SectionBlockEditor 共用同一套 parseContent/serializeContent，
// 確保這裡顯示的結構跟編輯區實際的段落結構完全對齊，刪除也是刪同一個 item。

// ── Icons ─────────────────────────────────────────────────────────────

const ITEM_COLOR: Record<ContentItem['kind'], string> = {
  h3:    'text-blue-400',
  text:  'text-gray-300',
  image: 'text-violet-400',
  link:  'text-amber-400',
};

function ItemIcon({ kind }: { kind: ContentItem['kind'] }) {
  const cls = `text-xs font-bold shrink-0 w-4 text-center ${ITEM_COLOR[kind]}`;
  if (kind === 'h3')    return <span className={cls}>H3</span>;
  if (kind === 'text')  return <span className={cls}>¶</span>;
  if (kind === 'image') return <span className={cls}>🖼</span>;
  if (kind === 'link')  return <span className={cls}>🔗</span>;
  return null;
}

function itemLabel(item: ContentItem): string {
  if (item.kind === 'h3')    return item.heading;
  if (item.kind === 'text')  return item.body.slice(0, 45) + (item.body.length > 45 ? '…' : '');
  if (item.kind === 'image') return item.alt || '圖片';
  if (item.kind === 'link')  return item.label;
  return '';
}

// ── Component ─────────────────────────────────────────────────────────

function jumpToItem(secId: string, item: ContentItem) {
  const secEl = document.getElementById(`sec-${secId}`);
  // 搜尋文字時只在內文區域（排除 section header 的灰色小字）
  const contentEl = document.getElementById(`sec-content-${secId}`) ?? secEl;
  if (!secEl) return;

  let searchText = '';
  if (item.kind === 'h3')   searchText = item.heading;
  if (item.kind === 'text') searchText = item.body.slice(0, 20);
  if (item.kind === 'link') searchText = item.label.slice(0, 20);

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

  function deleteItem(secId: string, items: ContentItem[], itemIdx: number) {
    onUpdate(sections.map(s => {
      if (s.id !== secId) return s;
      const removed = items[itemIdx];
      const remaining = items.filter((_, idx) => idx !== itemIdx);
      const newH3s = removed.kind === 'h3'
        ? s.h3s.filter(h => h !== removed.heading)
        : s.h3s;
      return { ...s, content: serializeContent(remaining), h3s: newH3s };
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
            const items = parseContent(sec.content).items;
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

                {/* Items in order — 跟編輯區的段落結構一致 */}
                {items.length > 0 && (
                  <div className="border-t border-gray-100">
                    {items.map((item, j) => (
                      <div key={j}
                        onClick={() => jumpToItem(sec.id, item)}
                        className={`flex items-center gap-2 px-3 py-1.5 group/block hover:bg-blue-50 cursor-pointer transition-colors ${item.kind === 'h3' ? 'pl-4' : 'pl-5'}`}
                      >
                        <ItemIcon kind={item.kind} />
                        <span className={`flex-1 text-xs truncate min-w-0 ${item.kind === 'h3' ? 'text-gray-600 font-medium' : 'text-gray-400'}`}
                          title={itemLabel(item)}>
                          {itemLabel(item)}
                        </span>
                        <button type="button"
                          onClick={e => { e.stopPropagation(); deleteItem(sec.id, items, j); }}
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
