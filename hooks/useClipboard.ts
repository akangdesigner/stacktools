"use client";

import { useState, useCallback } from "react";

export function useClipboard(resetAfterMs = 2000) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), resetAfterMs);
      return true;
    } catch {
      // Fallback for older browsers
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), resetAfterMs);
        return true;
      } catch {
        return false;
      }
    }
  }, [resetAfterMs]);

  return { copy, copied };
}
