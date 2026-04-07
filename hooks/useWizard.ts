"use client";

import { useState, useCallback } from "react";
import type { WizardState, ClientProfile } from "@/types";

const INITIAL_STATE: WizardState = {
  currentStep: 1,
  rawHtml: "",
  selectedClientId: null,
  cleanedHtml: null,
  isLoading: false,
  error: null,
};

export function useWizard() {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  const setRawHtml = useCallback((rawHtml: string) => {
    setState((s) => ({ ...s, rawHtml, error: null }));
  }, []);

  const setSelectedClientId = useCallback((selectedClientId: string) => {
    setState((s) => ({ ...s, selectedClientId, error: null }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState((s) => ({ ...s, currentStep: step as WizardState["currentStep"], error: null }));
  }, []);

  const goNext = useCallback(() => {
    setState((s) => {
      if (s.currentStep < 4) {
        return { ...s, currentStep: (s.currentStep + 1) as WizardState["currentStep"], error: null };
      }
      return s;
    });
  }, []);

  const goBack = useCallback(() => {
    setState((s) => {
      if (s.currentStep > 1) {
        return { ...s, currentStep: (s.currentStep - 1) as WizardState["currentStep"], error: null };
      }
      return s;
    });
  }, []);

  const submitForCleaning = useCallback(async (client: ClientProfile) => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const res = await fetch("/api/clean-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: state.rawHtml, client }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState((s) => ({ ...s, isLoading: false, error: data.error || "處理失敗" }));
        return;
      }
      setState((s) => ({
        ...s,
        isLoading: false,
        cleanedHtml: data.cleanedHtml,
        currentStep: 4,
        error: null,
      }));
    } catch {
      setState((s) => ({ ...s, isLoading: false, error: "網路錯誤，請稍後再試" }));
    }
  }, [state.rawHtml]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { state, setRawHtml, setSelectedClientId, goToStep, goNext, goBack, submitForCleaning, reset };
}
