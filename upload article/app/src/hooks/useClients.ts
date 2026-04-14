"use client";

import { useState, useEffect, useCallback } from "react";
import type { ClientProfile } from "@/types";

const STORAGE_KEY = "article-processor:clients";
const SELECTED_KEY = "article-processor:selected-client";
const CHANGE_EVENT = "article-processor:clients-changed";

function broadcast() {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function readFromStorage(): ClientProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useClients() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setClients(readFromStorage());
    setIsLoaded(true);

    const handleChange = () => setClients(readFromStorage());
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  }, []);

  const upsertClient = useCallback((profile: ClientProfile) => {
    const prev = readFromStorage();
    const idx = prev.findIndex((c) => c.id === profile.id);
    const updated = idx === -1
      ? [...prev, profile]
      : prev.map((c) => (c.id === profile.id ? profile : c));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    broadcast();
  }, []);

  const deleteClient = useCallback((id: string) => {
    const prev = readFromStorage();
    const updated = prev.filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (localStorage.getItem(SELECTED_KEY) === id) {
      localStorage.removeItem(SELECTED_KEY);
    }
    broadcast();
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
