'use client';

import { useState } from 'react';

const FEATURES_LIVE = [
  {
    icon: '🎨',
    title: 'AI 長輩祝福圖',
    desc: '按麥克風說出主題（早安、生日快樂、身體健康⋯），30 秒自動生成精美祝福圖片，長輩直接轉傳就能用。',
  },
  {
    icon: '💬',
    title: 'AI 陪伴聊天',
    desc: '以溫暖孫子語氣陪長輩聊天、傾聽心情，不催促、不說教，隨時傳訊息都有人回應。',
  },
  {
    icon: '📰',
    title: '時事新聞圖卡',
    desc: '點選即取得今日 5 則精選時事，卡片式排版字體超大清晰，長輩一眼就能看懂重點。',
  },
  {
    icon: '🔔',
    title: 'AI 健康關懷提醒',
    desc: 'AI 自動從聊天記錄中辨識健康事件（受傷、吃藥），每天早上 8 點主動推送關心訊息，直到長輩說好了才停止。',
  },
];

const FEATURES_SOON = [
  '懷舊照片修復',
  '家傳食譜卡',
  '旅遊景點推薦',
];

const IMPROVEMENTS = [
  {
    tag: '圖片品質',
    title: '祝福圖視覺效果不足',
    desc: '目前使用 Gemini Flash 生成，畫面平淡缺乏亮點，長輩看了無感。已排程改用 DALL-E 3，預期視覺效果大幅提升。',
    status: '升級中',
  },
  {
    tag: 'Prompt',
    title: 'AI 圖片指令需優化',
    desc: '祝福圖的生成指令尚未精調，中文字體辨識度與構圖美感有待改善，需進一步測試最佳提示詞組合。',
    status: '待優化',
  },
  {
    tag: '體驗',
    title: '等待時間偏長',
    desc: '語音轉文字 + 圖片生成約需 30–60 秒，對長輩來說等待感明顯。評估加入進度提示或縮短生成時間。',
    status: '評估中',
  },
];

const LINE_ID = '@581wwxja';
const QR_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://line.me/R/ti/p/%40581wwxja';

export default function SilverPage() {
  const [copied, setCopied] = useState(false);

  function copyLineId() {
    navigator.clipboard.writeText(LINE_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-8 max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">銀髮陪伴機器人</h1>
        <p className="text-sm text-gray-500 mt-1">LINE 智慧陪伴服務 — 合作說明與體驗指南</p>
      </div>

      {/* QR + CTA */}
      <div className="flex flex-col sm:flex-row gap-6 items-start bg-green-50 border-2 border-green-200 rounded-2xl p-6">
        <div className="flex flex-col items-center gap-3 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={QR_URL}
            alt="銀髮陪伴機器人 QR Code"
            width={160}
            height={160}
            className="rounded-xl border border-green-200 bg-white p-2"
          />
          <span className="text-xs text-gray-500">用 LINE 掃描即可加入</span>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">LINE 帳號 ID</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-semibold text-gray-800">{LINE_ID}</span>
              <button
                onClick={copyLineId}
                className="text-xs px-3 py-1 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
              >
                {copied ? '已複製' : '複製'}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            掃描 QR Code 加入好友，即可開始體驗所有功能。
          </p>
        </div>
      </div>

      {/* Live Features */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">目前開放功能</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES_LIVE.map((f) => (
            <div key={f.title} className="bg-white border-2 border-gray-100 rounded-xl p-5 hover:border-green-200 transition-colors">
              <div className="text-2xl mb-2">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Coming Soon */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">即將上線</h2>
        <div className="flex flex-wrap gap-2">
          {FEATURES_SOON.map((f) => (
            <span key={f} className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-full">
              🔜 {f}
            </span>
          ))}
        </div>
      </div>

      {/* Improvements */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">待優化清單</h2>
        <div className="space-y-2">
          {IMPROVEMENTS.map((item) => (
            <div key={item.title} className="flex gap-4 items-start bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
              <div className="shrink-0 mt-0.5">
                <span className="text-xs font-medium text-orange-600 bg-orange-100 border border-orange-200 rounded px-1.5 py-0.5">{item.tag}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-800">{item.title}</p>
                  <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">{item.status}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How to Use */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">操作流程說明</h2>
        <ol className="space-y-3">
          {[
            '掃描 QR Code 或搜尋 LINE ID，將機器人加為好友',
            '點選畫面下方的功能選單（圖文選單）',
            '選擇「AI 長輩祝福圖」→ 機器人引導您用語音說出主題',
            '按 LINE 聊天框的麥克風，說出想要的祝福主題',
            '等待約 30 秒，精美祝福圖片自動傳送，可直接轉傳分享',
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-700">
              <span className="w-6 h-6 bg-green-500 text-white text-xs rounded-full flex items-center justify-center shrink-0 font-medium">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
