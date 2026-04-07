"use client";

import { useWizard } from "@/hooks/useWizard";
import { useClients } from "@/hooks/useClients";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { Step1GetSnippet } from "./Step1GetSnippet";
import { Step2PasteHtml } from "./Step2PasteHtml";
import { Step3ImageReplace } from "./Step3ImageReplace";
import { Step3SelectClient } from "./Step3SelectClient";
import { Step4CopyResult } from "./Step4CopyResult";

export function WizardShell() {
  const { state, setRawHtml, setImageReplacements, setSelectedClientId, setArticleSlug, goNext, goBack, submitForCleaning, reset } = useWizard();
  const { getClient } = useClients();

  function validateStep2(): string | null {
    if (!state.rawHtml.trim()) return "請先貼入 HTML 內容";
    if (!state.rawHtml.includes("<")) return "內容看起來不像 HTML，請確認是否正確複製";
    if (state.rawHtml.length > 500000) return "HTML 內容超過 500,000 字元限制";
    return null;
  }

  function validateStep4(): string | null {
    if (!state.selectedClientId) return "請選擇客戶設定";
    if (!getClient(state.selectedClientId)) return "找不到客戶資料，請重新選擇";
    return null;
  }

  async function handleNext() {
    if (state.currentStep === 1) {
      goNext();
    } else if (state.currentStep === 2) {
      const err = validateStep2();
      if (err) return;
      goNext();
    } else if (state.currentStep === 3) {
      goNext();
    } else if (state.currentStep === 4) {
      const err = validateStep4();
      if (err) return;
      const client = getClient(state.selectedClientId!);
      if (!client) return;
      await submitForCleaning(client);
    }
  }

  const step2Error = state.currentStep === 2 && state.error ? state.error : null;
  const step4Error = state.currentStep === 4 && state.error ? state.error : null;

  function canGoNext(): boolean {
    if (state.isLoading) return false;
    if (state.currentStep === 2) return !!state.rawHtml.trim() && state.rawHtml.includes("<") && state.rawHtml.length <= 500000;
    if (state.currentStep === 4) return !!state.selectedClientId;
    return true;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-start justify-center pt-10 pb-16 px-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">文章上架工具</h1>
          <p className="text-gray-500 text-sm">將草稿文章快速整理成客戶指定樣式</p>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={state.currentStep} />

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {state.currentStep === 1 && <Step1GetSnippet />}
          {state.currentStep === 2 && (
            <Step2PasteHtml
              value={state.rawHtml}
              onChange={setRawHtml}
              error={step2Error}
            />
          )}
          {state.currentStep === 3 && (
            <Step3ImageReplace
              rawHtml={state.rawHtml}
              replacements={state.imageReplacements}
              onChange={setImageReplacements}
            />
          )}
          {state.currentStep === 4 && (
            <Step3SelectClient
              selectedClientId={state.selectedClientId}
              onSelect={setSelectedClientId}
              articleSlug={state.articleSlug}
              onArticleSlugChange={setArticleSlug}
              error={step4Error}
            />
          )}
          {state.currentStep === 5 && state.cleanedHtml && (
            <Step4CopyResult cleanedHtml={state.cleanedHtml} onReset={reset} />
          )}
        </div>

        {/* Navigation */}
        {state.currentStep >= 1 && (
          <div className="flex items-center justify-between">
            <button
              onClick={goBack}
              disabled={state.currentStep === 1}
              className="flex items-center gap-2 px-5 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              上一步
            </button>

            <button
              onClick={handleNext}
              disabled={!canGoNext() || state.currentStep === 5}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${state.currentStep === 5 ? "invisible" : ""}`}
            >
              {state.isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  處理中...
                </>
              ) : state.currentStep === 4 ? (
                <>
                  開始處理
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </>
              ) : (
                <>
                  下一步
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
