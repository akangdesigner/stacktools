"use client";

import { useState } from "react";
import { useClients } from "@/hooks/useClients";
import type { ClientProfile } from "@/types";

interface ClientListProps {
  onEdit: (client: ClientProfile) => void;
}

export function ClientList({ onEdit }: ClientListProps) {
  const { clients, deleteClient } = useClients();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (clients.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        尚無客戶資料
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {clients.map((client) => (
        <div
          key={client.id}
          className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full border border-gray-200 shrink-0"
              style={{ background: `linear-gradient(135deg, ${client.h2Color}, ${client.h3Color})` }}
            />
            <div>
              <p className="text-sm font-semibold text-gray-800">{client.name}</p>
              <p className="text-xs text-gray-400">H2: {client.h2FontSize} · H3: {client.h3FontSize} · 段落: {client.paragraphFontSize}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {confirmDeleteId === client.id ? (
              <>
                <span className="text-xs text-red-600 font-medium">確定刪除？</span>
                <button
                  onClick={() => { deleteClient(client.id); setConfirmDeleteId(null); }}
                  className="px-2.5 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  刪除
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-2.5 py-1 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onEdit(client)}
                  className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  編輯
                </button>
                <button
                  onClick={() => setConfirmDeleteId(client.id)}
                  className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  刪除
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
