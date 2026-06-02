"use client";

import { useState } from "react";
import { useClients } from "@/hooks/useClients";
import { ClientManagerModal } from "@/components/client-manager/ClientManagerModal";
import type { ClientProfile } from "@/types";

interface Step3SelectClientProps {
  selectedClientId: string | null;
  onSelect: (id: string) => void;
  articleSlug: string;
  onArticleSlugChange: (slug: string) => void;
  error: string | null;
}

export function Step3SelectClient({ selectedClientId, onSelect, articleSlug, onArticleSlugChange, error }: Step3SelectClientProps) {
  const { clients, isLoaded, refetch, upsertClient } = useClients();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  const selected = clients.find((c) => c.id === selectedClientId);

  function openNotes(client: ClientProfile) {
    setNotesValue(client.notes ?? "");
    setEditingNotes(true);
  }

  function saveNotes(client: ClientProfile) {
    upsertClient({ ...client, notes: notesValue, updatedAt: new Date().toISOString() });
    setEditingNotes(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">步驟一：選擇客戶設定</h2>
        <p className="text-gray-500 text-sm">選擇要套用的客戶樣式設定</p>
      </div>

      {!isLoaded ? (
        <div className="text-gray-400 text-sm">載入中...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-gray-500 mb-3">尚未建立任何客戶設定</p>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + 新增第一個客戶
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <select
              value={selectedClientId || ""}
              onChange={(e) => onSelect(e.target.value)}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="" disabled>請選擇客戶...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              管理客戶
            </button>
          </div>

          {selected && (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              <p className="text-sm font-semibold text-gray-800">已選擇：{selected.name}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>H2：<span style={{ color: selected.h2Color }} className="font-medium">{selected.h2Color}</span> / {selected.h2FontSize}</span>
                <span>H3：<span style={{ color: selected.h3Color }} className="font-medium">{selected.h3Color}</span> / {selected.h3FontSize}</span>
                <span>段落：{selected.paragraphFontSize} / <span style={{ color: selected.paragraphColor }} className="font-medium">{selected.paragraphColor}</span></span>
                <span>連結：<span style={{ color: selected.linkColor }} className="font-medium">{selected.linkColor}</span></span>
                <span>按鈕：{selected.stripButtonStyle ? "拔除格式" : <span style={{ background: selected.buttonBgColor, color: selected.buttonTextColor, padding: "1px 6px", borderRadius: 3 }}>{selected.buttonBgColor}</span>}</span>
              </div>

              {/* 備註 */}
              <div className="pt-1 border-t border-gray-200">
                {editingNotes ? (
                  <div className="space-y-1.5">
                    <textarea
                      autoFocus
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      rows={2}
                      placeholder="輸入備註…"
                      className="w-full px-3 py-2 text-xs border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveNotes(selected)}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => setEditingNotes(false)}
                        className="px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => openNotes(selected)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {selected.notes ? selected.notes : "新增備註"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Article slug for TOC anchors */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          文章 Slug <span className="text-gray-400 font-normal">（選填，用於目錄錨點連結）</span>
        </label>
        {selected?.blogBaseUrl ? (
          <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 bg-white">
            <span className="px-3 py-2 text-sm text-gray-400 bg-gray-50 border-r border-gray-300 whitespace-nowrap">
              {selected.blogBaseUrl.replace(/\/$/, "")}/
            </span>
            <input
              type="text"
              value={articleSlug}
              onChange={(e) => onArticleSlugChange(e.target.value)}
              placeholder="分泌物顏色怎麼看"
              className="flex-1 px-3 py-2 text-sm focus:outline-none bg-white placeholder-gray-400"
            />
          </div>
        ) : (
          <input
            type="url"
            value={articleSlug}
            onChange={(e) => onArticleSlugChange(e.target.value)}
            placeholder="https://example.com/blog/posts/文章標題（或至客戶設定填入網址前綴）"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white placeholder-gray-400"
          />
        )}
        <p className="text-xs text-gray-400">填入後目錄連結將使用完整網址，避免 Shopline 跳回首頁</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}

      {modalOpen && <ClientManagerModal onClose={() => { setModalOpen(false); refetch(); }} />}
    </div>
  );
}
