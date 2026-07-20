'use client';

import { useEffect, useState } from 'react';

// 使用說明 LIFF：純靜態說明文件，不需要查客戶資料，開頁即顯示、不擋載入。
// 依這次 LIFF 改版分三組：全新 LIFF 體驗（節慶/時事/部落格改寫/社群海巡留言）／
// 帳號與內容管理／其他功能；內容已更新反映「頁面上直接改文/改圖」而非舊的打字對話流程。

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_HELP || '';

export default function HelpLiffPage() {
  const [openKey, setOpenKey] = useState<string | null>('festival');

  useEffect(() => {
    // 純說明文件，不需要登入或客戶資料；liff.init 只是讓頁面在 LINE 內正常顯示，失敗也不擋畫面
    (async () => {
      try {
        if (!LIFF_ID) return;
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId: LIFF_ID });
      } catch {
        // 忽略，仍然顯示內容
      }
    })();
  }, []);

  function toggle(key: string) {
    setOpenKey((k) => (k === key ? null : key));
  }

  return (
    <Shell>
      <header className="head">
        <div className="mark">📘</div>
        <div className="eyebrow">User Guide</div>
        <h1 className="title">使用說明</h1>
        <p className="sub">點選主題展開詳細說明</p>
      </header>

      <div className="cta-card">
        <div className="eb">Start Here</div>
        <h3>🆕 第一次使用？</h3>
        <p>先完成客戶資料設定，AI 才知道你的品牌怎麼寫、怎麼配圖。之後每個功能生成內容都會依這份資料調整。</p>
        <a className="cta-btn" href="/liff/account-settings">前往設定 →</a>
      </div>

      <div className="tip-card">
        <div className="eb tip">Pro Tip</div>
        <h3>💡 想讓貼文更符合你的期望？</h3>
        <p>AI 寫出來的東西跟想像有落差，通常是因為它不知道你心中的標準長怎樣。去「客戶資料文件導入」上傳兩種文件，之後每次生成都會參考：</p>
        <div className="step"><span className="n">1</span><span><b>寫文規範</b>：品牌口吻、禁詞、必用語、排版格式等具體規則</span></div>
        <div className="step"><span className="n">2</span><span><b>發文格式範例</b>：幾篇你覺得寫得好的貼文，讓 AI 照著抓感覺</span></div>
        <a className="cta-btn tip" href="/liff/doc-import">前往上傳 →</a>
      </div>

      <div className="sec-title hi"><span className="badge">✨ 全新 LIFF 體驗</span><span className="ln" /></div>

      <FaqItem hi id="festival" icon="🎨" title="節慶主題規劃" sub="生成貼文＋配圖，頁面直接改" open={openKey === 'festival'} onToggle={toggle}>
        點擊按鈕直接開啟頁面，AI 自動生成節慶貼文文案＋配圖。喜歡的話可以在頁面上直接調整文字或改圖，不用再打字說明；滿意後存檔，LINE 會收到「確認發佈」卡片。
      </FaqItem>

      <FaqItem hi id="news" icon="🔥" title="時事互動貼文" sub="蹭熱門話題不失焦" open={openKey === 'news'} onToggle={toggle}>
        AI 掃描 Threads 熱門話題，挑出跟你品牌相關的內容改寫成貼文＋配圖。頁面上一樣可直接調整文字或圖片，存檔後回 LINE 確認發佈。
      </FaqItem>

      <FaqItem hi id="blogrewrite" icon="📝" title="部落格文章改寫" sub="舊文章變新貼文" open={openKey === 'blogrewrite'} onToggle={toggle}>
        AI 自動抓你網站最新一篇文章，依品牌語氣改寫成社群貼文，圖片沿用原文配圖。頁面上可直接調整文字，存檔後回 LINE 確認發佈。
      </FaqItem>

      <FaqItem hi id="social" icon="📌" title="社群海巡留言" sub="候選貼文清單，複製留言就能用" open={openKey === 'social'} onToggle={toggle}>
        <p style={{ margin: '0 0 8px' }}>
          點擊開啟頁面，AI 同時掃描 Threads 話題與你設定的 FB 社團熱門貼文，整理成候選清單並附上建議留言。
        </p>
        <div className="note">看到喜歡的直接複製留言，點連結去原文回覆即可，這個功能不需要確認發佈這一步。</div>
      </FaqItem>

      <FaqItem hi id="video" icon="🎬" title="短影音轉貼文生成" sub="上傳影片，頁面直接改" open={openKey === 'video'} onToggle={toggle}>
        點擊按鈕開啟頁面，上傳短影音影片（3 分鐘內），AI 自動轉逐字稿並依品牌人設寫成貼文＋配圖。頁面上可直接調整文字或圖片，存檔後回 LINE 確認發佈。
      </FaqItem>

      <FaqItem hi id="fileimport" icon="📂" title="客戶資料文件導入" sub="上傳/刪除 PDF，頁面直接管理" open={openKey === 'fileimport'} onToggle={toggle}>
        點擊按鈕開啟頁面，直接看到已匯入的文件清單，上傳新 PDF 或刪除舊文件都在頁面上點一點完成，不用再打字下指令。AI 生成內容時會參考裡面的品牌禁詞、口吻規範等資料（僅支援 PDF）。
      </FaqItem>

      <div className="sec-title"><span className="badge">⚙️ 帳號與內容管理</span><span className="ln" /></div>

      <FaqItem id="account" icon="👤" title="客戶資料設定" sub="初次使用請先完成這步" open={openKey === 'account'} onToggle={toggle}>
        <div className="step"><span className="n">1</span><span>點擊圖文選單「客戶資料管理」開啟設定頁</span></div>
        <div className="step"><span className="n">2</span><span>第一次是空白表單，填寫品牌人設、關鍵字等資料後建立；之後點進去會直接看到現有資料，改完存檔即可</span></div>
        <div className="note">建立完成後需等待一個工作日將帳戶加入系統，才能開始使用其他功能。</div>
      </FaqItem>

      <div className="sec-title"><span className="badge">🛠️ 其他功能</span><span className="ln" /></div>

      <FaqItem id="publish" icon="🛠️" title="貼文確認與微調" sub="存檔後回 LINE 要做什麼" open={openKey === 'publish'} onToggle={toggle}>
        節慶／時事／部落格改寫／短影音轉貼文在頁面存檔後，LINE 會收到「確認發佈／丟棄」卡片：按確認發佈會排程上架，丟棄則作廢草稿。（社群海巡留言不需要這一步）
      </FaqItem>

      <FaqItem id="faq" icon="❓" title="常見問題 FAQ" sub="其他問題快速解答" open={openKey === 'faq'} onToggle={toggle}>
        節慶／時事／部落格改寫／短影音轉貼文都能在頁面上直接調整文字或圖片，改到滿意再存檔；社群海巡留言則是直接複製建議留言去回覆——都不需要再另外打字說明修改需求。若遇到生成失敗可重試一次，持續發生請聯繫小編後台協助排查。
      </FaqItem>
    </Shell>
  );
}

function FaqItem({
  id, icon, title, sub, open, onToggle, hi, children,
}: {
  id: string; icon: string; title: string; sub: string; open: boolean; onToggle: (id: string) => void; hi?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`faq-item${hi ? ' hi' : ''}${open ? ' open' : ''}`}>
      <div className="faq-head" onClick={() => onToggle(id)}>
        <span className="ic">{icon}</span>
        <span className="txt">
          <span className="t-row">
            <span className="t">{title}</span>
            {hi && <span className="new-chip">NEW</span>}
          </span>
          <span className="s">{sub}</span>
        </span>
        <span className="chev">▾</span>
      </div>
      {open && <div className="faq-body">{children}</div>}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fp">
      <style>{FP_CSS}</style>
      <div className="fx" aria-hidden="true"><div className="grid" /></div>
      <div className="wrap">{children}</div>
    </div>
  );
}

const FP_CSS = `
.fp {
  --card: #FFFFFF; --line: rgba(43,92,230,.14); --line-2: rgba(43,92,230,.24);
  --ink: #1D2942; --ink-2: #5C6A85; --ink-3: #94A0B8;
  --blue: #2B5CE6; --blue-deep: #1E48C8; --blue-soft: #EAF0FE;
  --green: #23AE6E; --amber: #E79A3E; --amber-soft: #FDF2E3;
  --glow: rgba(43,92,230,.38); --field: #F2F5FC;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  --mono: "SF Mono", "JetBrains Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace;
  position: relative; min-height: 100vh; overflow: hidden;
  font-family: var(--sans); color: var(--ink); -webkit-font-smoothing: antialiased;
  padding: 22px 0 44px;
  background:
    radial-gradient(680px 340px at 86% -6%, rgba(43,92,230,.16) 0%, transparent 60%),
    radial-gradient(560px 360px at -10% 14%, rgba(35,174,110,.10) 0%, transparent 58%),
    linear-gradient(180deg, #EEF3FD 0%, #D9E4F7 100%);
}
.fp * { box-sizing: border-box; }
.fp .fx { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.fp .fx .grid {
  position: absolute; inset: 0;
  background-image: radial-gradient(rgba(43,92,230,.12) 1px, transparent 1px);
  background-size: 24px 24px;
  -webkit-mask-image: radial-gradient(circle at 50% 10%, #000 0%, transparent 62%);
          mask-image: radial-gradient(circle at 50% 10%, #000 0%, transparent 62%);
}
.fp .wrap { position: relative; z-index: 1; width: 100%; max-width: 420px; margin: 0 auto; padding: 0 16px; }

.fp .head { text-align: center; margin: 6px 0 18px; }
.fp .mark {
  width: 56px; height: 56px; margin: 0 auto 13px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center; font-size: 26px;
  background: linear-gradient(150deg, #FFFFFF, #E7EEFE);
  border: 1px solid rgba(43,92,230,.28);
  box-shadow: 0 10px 24px -8px var(--glow), inset 0 1px 0 rgba(255,255,255,.9);
}
.fp .eyebrow { font-family: var(--mono); font-size: 10.5px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: var(--blue); }
.fp .title { font-size: 24px; font-weight: 900; letter-spacing: .04em; margin: 7px 0 0; color: var(--ink); }
.fp .sub { font-size: 11.5px; color: var(--ink-2); margin-top: 7px; letter-spacing: .02em; }

.fp .cta-card {
  position: relative; border-radius: 18px; margin-bottom: 20px; padding: 18px;
  background: linear-gradient(150deg, #FFFFFF 0%, var(--blue-soft) 130%);
  border: 1px solid rgba(43,92,230,.3);
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 22px 44px -26px rgba(30,60,120,.5);
}
.fp .cta-card .eb { font-family: var(--mono); font-size: 9.5px; font-weight: 700; letter-spacing: .12em; color: var(--blue); text-transform: uppercase; }
.fp .cta-card h3 { font-size: 15px; font-weight: 900; margin: 6px 0 6px; color: var(--ink); }
.fp .cta-card p { font-size: 12px; line-height: 1.7; color: var(--ink-2); margin: 0 0 12px; }
.fp .cta-btn {
  display: inline-flex; align-items: center; gap: 6px; border: 0; cursor: pointer; color: #fff; text-decoration: none;
  font-size: 12.5px; font-weight: 700; padding: 9px 16px; border-radius: 10px;
  background: linear-gradient(135deg, var(--blue), var(--blue-deep)); box-shadow: 0 8px 18px -8px var(--glow);
}

.fp .tip-card {
  position: relative; border-radius: 18px; margin-bottom: 20px; padding: 18px;
  background: linear-gradient(150deg, #FFFFFF 0%, var(--amber-soft) 130%);
  border: 1px solid rgba(231,154,62,.35);
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 22px 44px -26px rgba(30,60,120,.35);
}
.fp .tip-card .eb.tip { font-family: var(--mono); font-size: 9.5px; font-weight: 700; letter-spacing: .12em; color: var(--amber); text-transform: uppercase; }
.fp .tip-card h3 { font-size: 15px; font-weight: 900; margin: 6px 0 6px; color: var(--ink); }
.fp .tip-card p { font-size: 12px; line-height: 1.7; color: var(--ink-2); margin: 0 0 10px; }
.fp .tip-card .step { display: flex; gap: 8px; margin-bottom: 6px; font-size: 12px; line-height: 1.7; color: #4E5568; }
.fp .tip-card .step .n {
  flex-shrink: 0; width: 17px; height: 17px; border-radius: 999px; background: #fff; color: var(--amber);
  font-family: var(--mono); font-size: 9.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 2px;
  border: 1px solid rgba(231,154,62,.4);
}
.fp .cta-btn.tip { background: linear-gradient(135deg, var(--amber), #C97F1F); box-shadow: 0 8px 18px -8px rgba(231,154,62,.5); margin-top: 4px; }

.fp .sec-title { display: flex; align-items: center; gap: 9px; margin: 22px 2px 11px; }
.fp .sec-title .badge {
  font-family: var(--mono); font-size: 9.5px; font-weight: 700; letter-spacing: .08em; color: var(--ink);
  background: var(--field); border: 1px solid var(--line); padding: 3px 9px; border-radius: 999px;
}
.fp .sec-title.hi .badge { color: var(--blue-deep); background: var(--blue-soft); border-color: rgba(43,92,230,.3); }
.fp .sec-title .ln { flex: 1; height: 1px; background: var(--line); }

.fp .faq-item {
  background: var(--card); border: 1px solid var(--line); border-radius: 14px; margin-bottom: 10px; overflow: hidden;
  box-shadow: 0 1px 0 rgba(255,255,255,.85) inset, 0 14px 28px -22px rgba(30,60,120,.4);
}
.fp .faq-item.hi { border-color: rgba(43,92,230,.28); }
.fp .faq-head { display: flex; align-items: center; gap: 11px; padding: 13px 14px; cursor: pointer; }
.fp .faq-head .ic {
  width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  font-size: 15px; background: var(--blue-soft);
}
.fp .faq-item.hi .faq-head .ic { background: linear-gradient(135deg, var(--blue-soft), #DCE7FE); }
.fp .faq-head .txt { flex: 1; }
.fp .faq-head .t-row { display: flex; align-items: center; gap: 6px; }
.fp .faq-head .t { font-size: 13px; font-weight: 800; color: var(--ink); }
.fp .new-chip {
  font-family: var(--mono); font-size: 8px; font-weight: 800; letter-spacing: .06em; color: #fff;
  background: linear-gradient(135deg, var(--green), #1B9760); padding: 2px 6px; border-radius: 5px;
}
.fp .faq-head .s { font-size: 10.5px; color: var(--ink-3); margin-top: 1px; }
.fp .faq-head .chev { font-family: var(--mono); font-size: 12px; color: var(--blue); transition: transform .2s; }
.fp .faq-item.open .faq-head .chev { transform: rotate(180deg); }
.fp .faq-body { padding: 0 14px 15px 57px; font-size: 12.5px; line-height: 1.8; color: #4E5568; }
.fp .faq-body .step { display: flex; gap: 8px; margin-bottom: 6px; }
.fp .faq-body .step .n {
  flex-shrink: 0; width: 17px; height: 17px; border-radius: 999px; background: var(--blue-soft); color: var(--blue-deep);
  font-family: var(--mono); font-size: 9.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 2px;
}
.fp .faq-body .note {
  margin-top: 8px; font-size: 11px; color: var(--amber); background: var(--amber-soft);
  border-radius: 8px; padding: 7px 10px; line-height: 1.6;
}
`;
