"use client";

import { getConsoleSnippet } from "@/lib/snippet-generator";
import { CopyButton } from "@/components/ui/CopyButton";

export function Step1GetSnippet() {
  const snippet = getConsoleSnippet();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">步驟一：取得文章 HTML</h2>
        <p className="text-gray-500 text-sm">先複製下方的程式碼，再前往草稿文章頁面執行</p>
      </div>

      {/* Instruction Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            num: "1",
            icon: "📋",
            title: "複製程式碼",
            desc: '點擊下方「複製程式碼」按鈕',
          },
          {
            num: "2",
            icon: "🖥️",
            title: "開啟開發者工具",
            desc: "前往草稿文章頁面，按 F12 開啟開發者工具，切換到 Console 頁籤",
          },
          {
            num: "3",
            icon: "⏎",
            title: "貼上並執行",
            desc: "貼上程式碼並按 Enter，等候「✔ 完成」訊息出現",
          },
        ].map((item) => (
          <div key={item.num} className="flex gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <span className="text-2xl">{item.icon}</span>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{item.title}</p>
              <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Snippet Box */}
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Console 程式碼</span>
          <CopyButton text={snippet} label="複製程式碼" copiedLabel="已複製！" />
        </div>
        <pre className="bg-gray-900 text-green-400 text-xs rounded-xl p-4 overflow-x-auto max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap">
          {snippet}
        </pre>
      </div>

      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <span className="text-base mt-0.5">💡</span>
        <p>執行後，圖片會自動下載到你的電腦，HTML 已複製到剪貼簿。接著回到這個頁面繼續下一步。</p>
      </div>
    </div>
  );
}
