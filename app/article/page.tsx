"use client";

import { useState, useEffect } from "react";
import { WizardShell } from "@/components/wizard/WizardShell";
import { CopyButton } from "@/components/ui/CopyButton";

// ── Elementor 客戶資料 ─────────────────────────────────────────────────────────

interface ElementorClient {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
}

const ELEMENTOR_KEY = "elementor:clients";
const emptyForm = { name: "", url: "", username: "", password: "" };

function ElementorClientDashboard({
  onBack,
  onGuide,
}: {
  onBack: () => void;
  onGuide: () => void;
}) {
  const [clients, setClients] = useState<ElementorClient[]>([]);
  const [toast, setToast] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ElementorClient | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ELEMENTOR_KEY);
      if (raw) setClients(JSON.parse(raw));
    } catch {}
  }, []);

  function persist(list: ElementorClient[]) {
    setClients(list);
    localStorage.setItem(ELEMENTOR_KEY, JSON.stringify(list));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  function handleCardClick(c: ElementorClient) {
    window.open(c.url, "_blank", "noopener,noreferrer");
    navigator.clipboard.writeText(c.password).then(() =>
      showToast(`「${c.name}」密碼已複製`)
    );
  }

  function copyField(text: string, label: string, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => showToast(`${label}已複製`));
  }

  function openAdd() {
    setForm({ ...emptyForm });
    setEditTarget(null);
    setShowModal(true);
  }

  function openEdit(c: ElementorClient, e: React.MouseEvent) {
    e.stopPropagation();
    setForm({ name: c.name, url: c.url, username: c.username, password: c.password });
    setEditTarget(c);
    setShowModal(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.url.trim()) return;
    if (editTarget) {
      persist(clients.map((c) => (c.id === editTarget.id ? { ...editTarget, ...form } : c)));
    } else {
      persist([...clients, { id: Date.now().toString(), ...form }]);
    }
    setShowModal(false);
  }

  function handleDelete() {
    if (!editTarget) return;
    persist(clients.filter((c) => c.id !== editTarget.id));
    setShowModal(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 px-4 py-10">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-xl shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← 返回
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Elementor 編輯器</h1>
              <p className="text-xs text-gray-400 mt-0.5">點擊客戶卡片，自動開啟後台並複製密碼</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新增客戶
          </button>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all group relative flex flex-col"
            >
              {/* Edit icon */}
              <button
                onClick={(e) => openEdit(c, e)}
                className="absolute top-3 right-3 text-gray-300 hover:text-gray-500 transition-colors opacity-0 group-hover:opacity-100"
                title="編輯"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>

              {/* Clickable main area */}
              <button
                onClick={() => handleCardClick(c)}
                className="flex-1 p-5 text-left w-full"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-3 group-hover:bg-purple-200 transition-colors">
                  <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{c.name}</h3>
                <p className="text-xs text-gray-400 truncate">{c.url}</p>
              </button>

              {/* Copy buttons */}
              <div className="px-5 pb-4 flex gap-2">
                <button
                  onClick={(e) => copyField(c.username, "帳號", e)}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors truncate"
                  title={c.username}
                >
                  帳號 {c.username || "—"}
                </button>
                <button
                  onClick={(e) => copyField(c.password, "密碼", e)}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  複製密碼
                </button>
              </div>
            </div>
          ))}

          {/* Empty state placeholder */}
          {clients.length === 0 && (
            <button
              onClick={openAdd}
              className="border-2 border-dashed border-gray-200 rounded-2xl p-5 hover:border-purple-300 hover:bg-purple-50/30 transition-all flex flex-col items-center justify-center gap-2 min-h-[160px]"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className="text-sm text-gray-400">新增第一個客戶</span>
            </button>
          )}

          {/* Tutorial card */}
          <button
            onClick={onGuide}
            className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-5 hover:border-blue-400 hover:shadow-md transition-all text-left flex flex-col"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.753 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">使用教學</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Elementor 排版匯出／匯入步驟，以及螢光筆 CSS 設定說明。
            </p>
          </button>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editTarget ? "編輯客戶" : "新增客戶"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">客戶名稱 *</label>
                <input
                  type="text"
                  placeholder="例：ABC 公司"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">後台網址 *</label>
                <input
                  type="url"
                  placeholder="https://client.com/wp-admin/"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">帳號</label>
                <input
                  type="text"
                  placeholder="admin"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">密碼</label>
                <input
                  type="text"
                  placeholder="password123"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-4">
              {editTarget && (
                <button
                  onClick={handleDelete}
                  className="px-3 py-2 text-sm text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                >
                  刪除
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.url.trim()}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Elementor 教學內容（原本的 ElementorGuide）──────────────────────────────────

function Step({ index, text, image }: { index: number; text: string; image?: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {index}
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
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

  type CssMode = "red" | "bold";
  const [cssMode, setCssMode] = useState<CssMode>("red");

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

        {/* CSS 設定 */}
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

            <div className="flex gap-2">
              <button
                onClick={() => setCssMode("red")}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${cssMode === "red" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
              >
                螢光筆改紅色
              </button>
              <button
                onClick={() => setCssMode("bold")}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${cssMode === "bold" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
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

// ── 格式選擇畫面 ──────────────────────────────────────────────────────────────

type Mode = null | "classic" | "elementor" | "elementor-guide";

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

// ── 主元件 ────────────────────────────────────────────────────────────────────

export default function ArticlePage() {
  const [mode, setMode] = useState<Mode>(null);

  if (mode === "classic") return <WizardShell />;
  if (mode === "elementor")
    return (
      <ElementorClientDashboard
        onBack={() => setMode(null)}
        onGuide={() => setMode("elementor-guide")}
      />
    );
  if (mode === "elementor-guide")
    return <ElementorGuide onBack={() => setMode("elementor")} />;

  return <FormatSelector onSelect={setMode} />;
}
