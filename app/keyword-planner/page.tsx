"use client";

import { useState } from "react";

// 搜尋意圖分組
interface KeywordGroup {
  intent: string;
  keywords: string[];
}

// 各意圖配色，讓卡片一眼可辨
const INTENT_STYLES: Record<string, { badge: string; dot: string }> = {
  資訊型: { badge: "bg-blue-50 text-blue-600 border-blue-200", dot: "bg-blue-400" },
  比較型: { badge: "bg-purple-50 text-purple-600 border-purple-200", dot: "bg-purple-400" },
  導購型: { badge: "bg-orange-50 text-orange-600 border-orange-200", dot: "bg-orange-400" },
  在地型: { badge: "bg-emerald-50 text-emerald-600 border-emerald-200", dot: "bg-emerald-400" },
};
const FALLBACK_STYLE = { badge: "bg-gray-50 text-gray-600 border-gray-200", dot: "bg-gray-400" };

export default function KeywordPlannerPage() {
  const [seed, setSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState<KeywordGroup[]>([]);
  const [copied, setCopied] = useState(""); // 顯示「已複製」的提示鍵

  // 所有關鍵字攤平，方便「全部複製」
  const allKeywords = groups.flatMap((g) => g.keywords);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!seed.trim()) return;
    setLoading(true);
    setError("");
    setGroups([]);

    try {
      const res = await fetch("/api/keyword-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setError("複製失敗，請手動選取");
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">關鍵字規劃工具</h1>
        <p className="text-gray-500 mt-1 text-sm">
          輸入一個種子關鍵字 → AI 參考真實搜尋結果，擴充出依搜尋意圖分類的長尾關鍵字
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
        <input
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="例：益生菌、冷氣安裝、寵物保險"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <button
          type="submit"
          disabled={loading || !seed.trim()}
          className="px-6 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "發想中…" : "擴充關鍵字"}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      {loading && (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
          正在搜尋並發想關鍵字，約需 10～20 秒…
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div className="space-y-4">
          {/* 全部複製列 */}
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-3">
            <span className="text-sm text-gray-600">
              共 <span className="font-semibold text-gray-900">{allKeywords.length}</span> 個關鍵字
            </span>
            <button
              type="button"
              onClick={() => copyText(allKeywords.join("\n"), "__all__")}
              className="text-xs font-semibold text-orange-500 hover:text-orange-600"
            >
              {copied === "__all__" ? "已複製 ✓" : "全部複製（換行）"}
            </button>
          </div>

          {groups.map((group, gi) => {
            const style = INTENT_STYLES[group.intent] ?? FALLBACK_STYLE;
            return (
              <div key={gi} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${style.badge}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {group.intent}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText(group.keywords.join("\n"), `g-${gi}`)}
                    className="text-xs font-semibold text-gray-400 hover:text-orange-500"
                  >
                    {copied === `g-${gi}` ? "已複製 ✓" : "複製本組"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.keywords.map((kw, ki) => (
                    <button
                      key={ki}
                      type="button"
                      onClick={() => copyText(kw, `g-${gi}-k-${ki}`)}
                      className="text-sm bg-gray-50 hover:bg-orange-50 hover:text-orange-600 text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1 transition-colors"
                      title="點擊複製"
                    >
                      {copied === `g-${gi}-k-${ki}` ? "已複製 ✓" : kw}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && groups.length === 0 && !error && (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 flex flex-col items-center justify-center text-center gap-3 min-h-48">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-2xl">🔍</div>
          <p className="text-sm text-gray-400">輸入種子關鍵字後<br />點擊「擴充關鍵字」</p>
        </div>
      )}
    </div>
  );
}
