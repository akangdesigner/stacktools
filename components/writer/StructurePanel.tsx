'use client';

import { useState, useEffect, useRef } from 'react';

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

type EditTarget = { secId: string; h3Idx: number | null };

export default function StructurePanel<S extends SectionBase>({ open, onClose, sections, onUpdate }: Props<S>) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(sections.map(s => s.id)));
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editTarget) editInputRef.current?.focus();
  }, [editTarget]);

  // Auto-expand new sections
  useEffect(() => {
    setExpanded(prev => {
      const next = new Set(prev);
      sections.forEach(s => next.add(s.id));
      return next;
    });
  }, [sections.length]);

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

  function startEdit(secId: string, h3Idx: number | null, value: string) {
    setEditTarget({ secId, h3Idx });
    setEditValue(value);
  }

  function commitEdit() {
    if (!editTarget) return;
    const { secId, h3Idx } = editTarget;
    onUpdate(sections.map(s => {
      if (s.id !== secId) return s;
      if (h3Idx === null) return { ...s, h2: editValue.trim() || s.h2 };
      return { ...s, h3s: s.h3s.map((h, i) => i === h3Idx ? (editValue.trim() || h) : h) };
    }));
    setEditTarget(null);
  }

  function cancelEdit() {
    setEditTarget(null);
  }

  function deleteH3(secId: string, h3Idx: number) {
    onUpdate(sections.map(s => s.id === secId
      ? { ...s, h3s: s.h3s.filter((_, i) => i !== h3Idx) }
      : s));
  }

  function addH3(secId: string) {
    const sec = sections.find(s => s.id === secId);
    if (!sec) return;
    const newIdx = sec.h3s.length;
    onUpdate(sections.map(s => s.id === secId
      ? { ...s, h3s: [...s.h3s, '新小節'] }
      : s));
    // start editing the newly added h3 after state updates
    setTimeout(() => startEdit(secId, newIdx, '新小節'), 0);
  }

  function isEditing(secId: string, h3Idx: number | null) {
    return editTarget?.secId === secId && editTarget?.h3Idx === h3Idx;
  }

  return (
    <>
      {/* Overlay */}
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full z-50 flex flex-col bg-white border-l border-gray-200 shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: '300px' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            <p className="text-sm font-semibold text-gray-800">文章結構</p>
            <span className="text-xs text-gray-400">{sections.length} 段</span>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 text-lg leading-none">×</button>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {sections.map((sec, i) => (
            <div key={sec.id}
              className={`rounded-xl border transition-colors ${sec.generating ? 'border-blue-200 bg-blue-50/30' : sec.content ? 'border-emerald-200 bg-emerald-50/20' : 'border-gray-200 bg-white'}`}>

              {/* H2 row */}
              <div className="flex items-center gap-1.5 px-3 py-2">
                {/* Status dot */}
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sec.generating ? 'bg-blue-400 animate-pulse' : sec.content ? 'bg-emerald-400' : 'bg-gray-300'}`} />

                {/* Index */}
                <span className="w-4 text-xs text-gray-400 font-mono shrink-0 text-center">{i + 1}</span>

                {/* H2 title */}
                {isEditing(sec.id, null) ? (
                  <input
                    ref={editInputRef}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                    onBlur={commitEdit}
                    className="flex-1 text-xs font-semibold px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white min-w-0"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(sec.id, null, sec.h2)}
                    className="flex-1 text-left text-xs font-semibold text-gray-800 hover:text-blue-600 truncate transition-colors min-w-0"
                    title={sec.h2}
                  >{sec.h2}</button>
                )}

                {/* Controls */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Expand/collapse */}
                  {sec.h3s.length > 0 && (
                    <button type="button"
                      onClick={() => setExpanded(prev => { const next = new Set(prev); if (next.has(sec.id)) next.delete(sec.id); else next.add(sec.id); return next; })}
                      className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-xs">
                      {expanded.has(sec.id) ? '▾' : '▸'}
                    </button>
                  )}
                  {/* Move up */}
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                    className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 15l-6-6-6 6"/></svg>
                  </button>
                  {/* Move down */}
                  <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1}
                    className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
                  </button>
                  {/* Delete */}
                  <button type="button" onClick={() => deleteSection(sec.id)}
                    className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors text-xs">×</button>
                </div>
              </div>

              {/* H3 list */}
              {sec.h3s.length > 0 && expanded.has(sec.id) && (
                <div className="pb-2 px-3 space-y-0.5">
                  {sec.h3s.map((h3, j) => (
                    <div key={j} className="flex items-center gap-1.5 pl-5 group/h3">
                      <div className="w-px h-3 bg-gray-200 shrink-0" />
                      {isEditing(sec.id, j) ? (
                        <input
                          ref={editInputRef}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          onBlur={commitEdit}
                          className="flex-1 text-xs px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white min-w-0"
                        />
                      ) : (
                        <button type="button"
                          onClick={() => startEdit(sec.id, j, h3)}
                          className="flex-1 text-left text-xs text-gray-500 hover:text-gray-800 truncate transition-colors min-w-0"
                          title={h3}>{h3}</button>
                      )}
                      <button type="button" onClick={() => deleteH3(sec.id, j)}
                        className="w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:text-red-400 opacity-0 group-hover/h3:opacity-100 transition-all text-xs shrink-0">×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addH3(sec.id)}
                    className="flex items-center gap-1 pl-6 mt-1 text-xs text-gray-400 hover:text-blue-500 transition-colors">
                    <span className="text-xs">＋</span> 新增 H3
                  </button>
                </div>
              )}
              {sec.h3s.length === 0 && (
                <div className="pb-2 px-3">
                  <button type="button" onClick={() => addH3(sec.id)}
                    className="flex items-center gap-1 pl-5 text-xs text-gray-400 hover:text-blue-500 transition-colors">
                    <span className="text-xs">＋</span> 新增 H3
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 shrink-0">
          <p className="text-xs text-gray-400 text-center">點標題直接編輯 · ↑↓ 調整順序</p>
        </div>
      </div>
    </>
  );
}
