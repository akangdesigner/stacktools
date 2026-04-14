"use client";

import { useState } from "react";
import { WizardShell } from "@/components/wizard/WizardShell";
import { CopyButton } from "@/components/ui/CopyButton";

function Step({ index, text, image }: { index: number; text: string; image?: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {index}
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
        {image && (
          <img
            src={image}
            alt={`步驟 ${index} 示意圖`}
            className="w-full rounded-xl border border-gray-200 mt-3 shadow-sm"
          />
        )}
      </div>
    </div>
  );
}

function ElementorGuide({ onBack }: { onBack: () => void }) {
  const exportSteps = [
    { text: "進入草稿文章，輸入文章內容並輸入密碼。" },
    { text: "點擊上方「使用 Elementor 編輯」按鈕進入編輯器。", image: "/elementor-1.png" },
    { text: "點擊左下角的 ˄ 符號，選擇「另存為範本」。" },
    { text: "輸入版型名稱並按下「儲存」。" },
    { text: "點擊中間最下方的資料夾圖樣，找到剛剛儲存的頁面。", image: "/elementor-2.png" },
    { text: "點擊右方 ⋯ 選擇「匯出範本」，即可下載 JSON 檔案。" },
  ];

  const importSteps = [
    { text: "進入 WordPress 新增文章，點擊「使用 Elementor 編輯」。" },
    { text: "點擊中間最下方的資料夾圖樣開啟範本庫。", image: "/elementor-3.png" },
    { text: "點擊向上箭頭（↑），選取剛剛下載的 JSON 檔案上傳。", image: "/elementor-4.png" },
    { text: "點擊「插入」，即可一鍵複製 Elementor 排版至新文章。" },
  ];

  type CssMode = 'red' | 'bold';
  const [cssMode, setCssMode] = useState<CssMode>('red');

  const cssSnippets: Record<CssMode, string> = {
    red: `/* 全域設定：針對文章內容與 Elementor 文字框中的 em 標籤 */
.entry-content em, .elementor-widget-text-editor em {
    font-style: normal !important;    /* 強制取消斜體 */
    color: #ff0000 !important;       /* 強制文字顏色改為紅色 */
}`,
    bold: `/* 全域設定：針對文章內容與 Elementor 文字框中的 em 標籤 */
.entry-content em, .elementor-widget-text-editor em {
    font-style: normal !important;    /* 強制取消斜體 */
    font-weight: bold !important;    /* 強制加粗 */
}`,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-10">
      <div className="w-full max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            ← 返回
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Elementor 區塊編輯器匯入教學</h1>
            <p className="text-xs text-gray-400 mt-0.5">依照步驟操作，即可將草稿版面複製到目標網站</p>
          </div>
        </div>

        {/* 上半：兩階段並排 */}
        <div className="flex gap-6 items-start">
          {/* 左欄：第一階段 */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">第一階段</span>
                <span className="text-sm font-semibold text-gray-800">從草稿網站匯出排版</span>
              </div>
              <div className="space-y-4">
                {exportSteps.map((s, i) => (
                  <Step key={i} index={i + 1} text={s.text} image={s.image} />
                ))}
              </div>
            </div>
          </div>

          {/* 右欄：第二階段 */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">第二階段</span>
                <span className="text-sm font-semibold text-gray-800">匯入至目標網站</span>
              </div>
              <div className="space-y-4">
                {importSteps.map((s, i) => (
                  <Step key={i} index={i + 1} text={s.text} image={s.image} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 分隔線 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400 shrink-0 px-1">樣式設定</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* 下半：CSS 設定（置中，有背景板塊） */}
        <div className="flex justify-center">
          <div className="w-full max-w-2xl bg-blue-50/60 rounded-2xl border border-blue-100 shadow-sm p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-500">CSS 設定</span>
              </div>
              <h2 className="text-sm font-semibold text-gray-800">螢光筆樣式設定</h2>
              <p className="text-xs text-gray-400 mt-0.5">選擇樣式後將程式碼貼入 WordPress</p>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">⚠ 匯入範本後螢光筆部分不會直接顯示，需透過以下代碼將螢光筆轉換成所需要的樣式。</p>
            </div>

            {/* 切換 */}
            <div className="flex gap-2">
              <button
                onClick={() => setCssMode('red')}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${cssMode === 'red' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                螢光筆改紅色
              </button>
              <button
                onClick={() => setCssMode('bold')}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${cssMode === 'bold' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                <strong>加粗</strong>不變紅
              </button>
            </div>

            <div className="space-y-3">
              <Step index={1} text='在 WordPress 後台點擊「外觀」→「自訂」→「附加的 CSS」' />
              <div className="flex gap-3">
                <div className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-700">貼上以下程式碼</p>
                    <CopyButton text={cssSnippets[cssMode]} label="複製" copiedLabel="已複製" className="!px-2 !py-1 !text-xs" />
                  </div>
                  <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 leading-relaxed overflow-x-auto whitespace-pre-wrap">{cssSnippets[cssMode]}</pre>
                </div>
              </div>
              <Step index={3} text='點擊上方「發佈」即完成套用' />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Mode = null | "classic" | "elementor";

function FormatSelector({ onSelect }: { onSelect: (mode: "classic" | "elementor") => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-6">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">文章上架工具</h1>
          <p className="text-gray-400 text-sm">請選擇匯入格式</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Elementor */}
          <button
            onClick={() => onSelect("elementor")}
            className="group bg-white rounded-2xl border border-gray-200 p-10 text-left hover:border-purple-300 hover:shadow-lg transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mb-6 group-hover:bg-purple-200 transition-colors">
              <svg className="w-7 h-7 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
              </svg>
            </div>
            <div className="font-semibold text-gray-900 text-base mb-2">Elementor 區塊編輯器</div>
            <div className="text-sm text-gray-400 leading-relaxed">適用於使用 Elementor 頁面建構器的網站</div>
          </button>

          {/* 傳統編輯器 */}
          <button
            onClick={() => onSelect("classic")}
            className="group bg-white rounded-2xl border border-gray-200 p-10 text-left hover:border-blue-300 hover:shadow-lg transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mb-6 group-hover:bg-blue-200 transition-colors">
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="font-semibold text-gray-900 text-base mb-2">傳統編輯器</div>
            <div className="text-sm text-gray-400 leading-relaxed">適用於 WordPress 傳統編輯器或一般 HTML 匯入</div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ArticlePage() {
  const [mode, setMode] = useState<Mode>(null);

  if (mode === "classic") return <WizardShell />;

  if (mode === "elementor") return <ElementorGuide onBack={() => setMode(null)} />;

  return <FormatSelector onSelect={setMode} />;
}
