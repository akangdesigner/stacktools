'use client';

import { useEffect, useState } from 'react';

type Usage = {
  totalCredits: number;
  totalUsage: number;
  remaining: number;
  usageDaily: number;
  usageWeekly: number;
  usageMonthly: number;
  daily: { date: string; total: number }[] | null;
  bigSpends: { date: string; model: string; avgPerRequest: number; requests: number }[] | null;
};

// "google/gemini-3-pro-image" -> "gemini-3-pro-image"，側欄窄，只留斜線後的部分
function shortModelName(model: string) {
  return model.split('/').pop() ?? model;
}

export default function OpenRouterUsageWidget() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/openrouter-usage')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setUsage(data))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50 text-sm text-gray-400">
        OpenRouter 用量讀取失敗
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50 text-sm text-gray-400 animate-pulse">
        載入用量中…
      </div>
    );
  }

  const dailyMax = Math.max(...(usage.daily?.map((d) => d.total) ?? [0.01]), 0.01);

  return (
    <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">OpenRouter 用量</h3>
      <div className="text-2xl font-bold mb-3 text-gray-900">
        剩 ${usage.remaining.toFixed(2)}
      </div>

      {/* 每日花費（近 7 天），直的長條圖，x 軸是日期 */}
      {usage.daily && usage.daily.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">近 7 天花費</h4>
          <div className="mb-4">
            <div className="flex items-end gap-2 h-48 border-b border-gray-300">
              {usage.daily.map((day) => {
                const pct = Math.max(2, Math.min(100, (day.total / dailyMax) * 100));
                return (
                  <div key={day.date} className="flex-1 h-full flex flex-col items-center justify-end">
                    <span className="text-xs text-gray-500 mb-1">${day.total.toFixed(2)}</span>
                    <div className="w-full bg-gray-600" style={{ height: `${pct}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-1">
              {usage.daily.map((day) => (
                <span key={day.date} className="flex-1 text-center text-xs text-gray-500">
                  {day.date.slice(5).replace('-', '/')}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 單次請求平均花費超過門檻才顯示，不是排行 */}
      {usage.bigSpends && usage.bigSpends.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-1">異常大額（單次平均 &gt; $0.5）</h4>
          {usage.bigSpends.map((b, i) => (
            <p key={`${b.date}-${b.model}-${i}`} className="text-xs text-gray-500">
              {b.date.slice(5).replace('-', '/')} {shortModelName(b.model)}：平均 ${b.avgPerRequest.toFixed(2)}／次（{b.requests} 次）
            </p>
          ))}
        </div>
      )}

      {!usage.daily && (
        <p className="text-xs text-gray-400 mt-2">尚未設定 Management Key，看不到每日／每個 model 的明細</p>
      )}
    </div>
  );
}
