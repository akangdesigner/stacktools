"use client";

import { useState, useRef } from "react";
import { ClientList } from "./ClientList";
import { ClientForm } from "./ClientForm";
import { useClients } from "@/hooks/useClients";
import type { ClientProfile } from "@/types";

interface ClientManagerModalProps {
  onClose: () => void;
}

type View = { type: "list" } | { type: "form"; client?: ClientProfile };

export function ClientManagerModal({ onClose }: ClientManagerModalProps) {
  const [view, setView] = useState<View>({ type: "list" });
  const { clients, upsertClient } = useClients();
  const importRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const json = JSON.stringify(clients, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clients.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as ClientProfile[];
        if (!Array.isArray(data)) throw new Error();
        data.forEach((c) => upsertClient(c));
        alert(`已匯入 ${data.length} 個客戶`);
      } catch {
        alert("檔案格式錯誤，請選擇正確的 clients.json");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {view.type === "form" && (
              <button
                onClick={() => setView({ type: "list" })}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h3 className="text-base font-bold text-gray-900">
              {view.type === "list"
                ? "管理客戶"
                : view.type === "form" && view.client
                ? `編輯：${view.client.name}`
                : "新增客戶"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {view.type === "list" ? (
            <div className="space-y-4">
              <ClientList onEdit={(client) => setView({ type: "form", client })} />
              <button
                onClick={() => setView({ type: "form" })}
                className="w-full py-2.5 border-2 border-dashed border-blue-300 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors"
              >
                + 新增客戶
              </button>

              {/* 匯出 / 匯入 */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleExport}
                  disabled={clients.length === 0}
                  className="flex-1 py-2 text-xs border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  匯出 JSON
                </button>
                <button
                  onClick={() => importRef.current?.click()}
                  className="flex-1 py-2 text-xs border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  匯入 JSON
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImport}
                />
              </div>
            </div>
          ) : (
            <ClientForm
              initial={view.type === "form" ? view.client : undefined}
              onDone={() => setView({ type: "list" })}
              onCancel={() => setView({ type: "list" })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
