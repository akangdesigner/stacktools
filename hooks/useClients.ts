"use client";

import { useState, useEffect, useCallback } from "react";
import type { ClientProfile } from "@/types";

const SELECTED_KEY = "article-processor:selected-client";

export function useClients() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/article-clients')
      .then((r) => r.json())
      .then((data: ClientProfile[]) => {
        setClients(data);
        setIsLoaded(true);
      })
      .catch(() => setIsLoaded(true));
  }, []);

  const upsertClient = useCallback((profile: ClientProfile) => {
    // 樂觀更新：先更新畫面，再同步到伺服器
    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === profile.id);
      return idx === -1
        ? [...prev, profile]
        : prev.map((c) => (c.id === profile.id ? profile : c));
    });
    fetch('/api/article-clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    }).catch(console.error);
  }, []);

  const deleteClient = useCallback((id: string) => {
    // 樂觀更新：先更新畫面，再同步到伺服器
    setClients((prev) => prev.filter((c) => c.id !== id));
    if (localStorage.getItem(SELECTED_KEY) === id) {
      localStorage.removeItem(SELECTED_KEY);
    }
    fetch(`/api/article-clients/${id}`, { method: 'DELETE' }).catch(console.error);
  }, []);

  const getClient = useCallback((id: string) => {
    return clients.find((c) => c.id === id);
  }, [clients]);

  const getLastSelectedId = useCallback((): string | null => {
    return localStorage.getItem(SELECTED_KEY);
  }, []);

  const setLastSelectedId = useCallback((id: string) => {
    localStorage.setItem(SELECTED_KEY, id);
  }, []);

  return { clients, isLoaded, upsertClient, deleteClient, getClient, getLastSelectedId, setLastSelectedId };
}
