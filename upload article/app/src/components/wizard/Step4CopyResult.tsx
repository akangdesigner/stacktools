"use client";

import { useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { HtmlPreview } from "@/components/ui/HtmlPreview";

interface Step4CopyResultProps {
  cleanedHtml: string;
  onReset: () => void;
}

export function Step4CopyResult({ cleanedHtml, onReset }: Step4CopyResultProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">步驟四：複製處理結果</h2>
        <p className="text-gray-500 text-sm">點擊「複製 HTML」後，貼到 CMS 的 HTML 編輯器中</p>
      </div>

      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
        <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-green-800 font-medium">HTML 清洗完成！已套用客戶樣式設定。</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">清洗後 HTML</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {showPreview ? "隱藏預覽" : "預覽效果"}
            </button>
            <CopyButton text={cleanedHtml} label="複製 HTML" copiedLabel="已複製！" className="px-4" />
          </div>
        </div>
        <textarea
          readOnly
          value={cleanedHtml}
          rows={10}
          className="w-full font-mono text-xs rounded-xl border border-gray-300 px-4 py-3 bg-gray-50 focus:outline-none resize-none"
        />
      </div>

      {showPreview && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">網頁預覽</p>
          <HtmlPreview html={cleanedHtml} />
        </div>
      )}

      <div className="pt-2 flex justify-center">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          處理下一篇文章
        </button>
      </div>
    </div>
  );
}
