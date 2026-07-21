'use client';

import { useEffect, useRef, useState } from 'react';
import type { Liff } from '@line/liff';

// 客戶資料文件導入 LIFF：列出已匯入的 PDF 文件（可刪除）＋上傳新文件。
// 上傳/刪除都轉呼叫 n8n webhook，實際的 PDF 抽取/embedding/向量庫存取留在 n8n（沿用既有邏輯與憑證）。

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_DOCIMPORT || '';

type Phase = 'init' | 'ready' | 'error';

export default function DocImportLiffPage() {
  const [phase, setPhase] = useState<Phase>('init');
  const [uid, setUid] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [documents, setDocuments] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingTitle, setDeletingTitle] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const liffRef = useRef<Liff | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  async function loadList(lineUid: string) {
    const res = await fetch('/api/liff-docimport/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_uid: lineUid }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setDocuments(data.documents || []);
    setCustomerName(data.customerName || '');
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qsUid = new URLSearchParams(window.location.search).get('uid');
        let resolvedUid = qsUid || '';
        if (!resolvedUid) {
          if (!LIFF_ID) throw new Error('尚未設定 NEXT_PUBLIC_LIFF_ID_DOCIMPORT 環境變數');
          const liff = (await import('@line/liff')).default;
          liffRef.current = liff;
          await liff.init({ liffId: LIFF_ID });
          if (!liff.isLoggedIn()) {
            liff.login();
            return;
          }
          const profile = await liff.getProfile();
          resolvedUid = profile.userId;
        }
        if (cancelled) return;
        setUid(resolvedUid);
        await loadList(resolvedUid);
        if (cancelled) return;
        setPhase('ready');
      } catch (e) {
        if (!cancelled) {
          setError(`初始化失敗：${msg(e)}`);
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload() {
    if (!file) return;
    setError('');
    setNotice('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('line_uid', uid);
      form.append('file', file);
      const res = await fetch('/api/liff-docimport/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(`已將《${data.title}》存入知識庫`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadList(uid);
    } catch (e) {
      setError(`導入失敗：${msg(e)}`);
    } finally {
      setUploading(false);
    }
  }

  async function remove(title: string) {
    if (!confirm(`確定刪除《${title}》？`)) return;
    setError('');
    setNotice('');
    setDeletingTitle(title);
    try {
      const res = await fetch('/api/liff-docimport/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_uid: uid, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(`已刪除《${title}》`);
      await loadList(uid);
    } catch (e) {
      setError(`刪除失敗：${msg(e)}`);
    } finally {
      setDeletingTitle('');
    }
  }

  if (phase === 'init') {
    return (
      <Shell center>
        <section className="card">
          <div className="card-pad loading-card">
            <div className="mark">📂</div>
            <div className="eyebrow eyebrow-muted">Connecting</div>
            <h2 className="loading-h">正在載入你的文件清單</h2>
          </div>
        </section>
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell center>
        <div className="err">{error}</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="head">
        <div className="mark">📂</div>
        <div className="eyebrow">Document Studio</div>
        <h1 className="title">客戶資料文件導入</h1>
        <p className="sub">上傳品牌規範 PDF，AI 生成內容時會參考</p>
        {customerName && (
          <div className="tab">
            <span className="dot" />
            <span className="zh">{customerName}</span>
            <span className="en">Doc Import</span>
          </div>
        )}
      </header>

      {error && <div className="err">{error}</div>}
      {notice && <div className="ok">{notice}</div>}

      <section className="card">
        <div className="card-pad">
          <div className="sec-eyebrow"><span className="zh">已匯入文件</span><span className="en">Documents</span></div>
          {documents.length === 0 ? (
            <p className="empty-hint">尚未匯入任何文件</p>
          ) : (
            <div className="doc-list">
              {documents.map((title) => (
                <div className="doc-row" key={title}>
                  <span className="doc-ic">📄</span>
                  <span className="doc-title">{title}</span>
                  <button
                    className="doc-del"
                    onClick={() => remove(title)}
                    disabled={deletingTitle === title}
                  >
                    {deletingTitle === title ? '刪除中…' : '刪除'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-pad">
          <div className="sec-eyebrow"><span className="zh">上傳新文件</span><span className="en">Upload</span></div>
          <label className="filepick">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <span className="fp-ic">📎</span>
            <span className="fp-txt">{file ? file.name : '點此選擇 PDF 檔案'}</span>
          </label>
          <p className="hint">{'// 可導入品牌禁詞、口吻規範、發言格式等資料，僅支援 PDF'}</p>
        </div>
      </section>

      <button className="confirm" onClick={upload} disabled={!file || uploading}>
        {uploading ? '導入中…' : '上傳並導入'}
      </button>
    </Shell>
  );
}

function Shell({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className="fp">
      <style>{FP_CSS}</style>
      <div className="fx" aria-hidden="true">
        {/* 掃描線＋紙張紋：呼應「文件導入／掃描」主題（壓在毛玻璃卡後不擋字）*/}
        <div className="paper" />
        <div className="scanline" />
      </div>
      <div className={center ? 'wrap wrap-center' : 'wrap'}>{children}</div>
    </div>
  );
}

const FP_CSS = `
.fp {
  --card: #FFFFFF; --line: rgba(43,92,230,.14); --line-2: rgba(43,92,230,.24);
  --ink: #1D2942; --ink-2: #5C6A85; --ink-3: #94A0B8;
  --blue: #2B5CE6; --blue-deep: #1E48C8; --blue-soft: #EAF0FE;
  --green: #23AE6E; --green-soft: #E9F7F0; --red: #E5484D; --red-soft: #FDEBEC;
  --glow: rgba(43,92,230,.38); --field: #F2F5FC;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  --mono: "SF Mono", "JetBrains Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace;
  --chamfer: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  position: relative; min-height: 100vh; overflow: hidden;
  font-family: var(--sans); color: var(--ink); -webkit-font-smoothing: antialiased;
  padding: 22px 0 44px;
  background:
    radial-gradient(680px 340px at 86% -6%, rgba(43,92,230,.16) 0%, transparent 60%),
    radial-gradient(560px 360px at -10% 14%, rgba(35,174,110,.10) 0%, transparent 58%),
    linear-gradient(180deg, #EEF3FD 0%, #D9E4F7 100%);
}
.fp * { box-sizing: border-box; }
/* fixed：鎖住視窗，掃描線捲動時維持定位（沿用海巡做法）*/
.fp .fx { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
/* 紙張橫紋：淡淡的文件行距線，中央清楚往邊緣淡出 */
.fp .fx .paper {
  position: absolute; inset: 0;
  background-image: repeating-linear-gradient(180deg, transparent, transparent 22px, rgba(43,92,230,.06) 22px, rgba(43,92,230,.06) 23px);
  -webkit-mask-image: radial-gradient(circle at 50% 38%, #000 20%, transparent 78%);
          mask-image: radial-gradient(circle at 50% 38%, #000 20%, transparent 78%);
}
/* 掃描線：一條發光橫線上下來回掃，像掃描器/影印機 */
.fp .fx .scanline {
  position: absolute; left: 0; right: 0; top: 8%; height: 2px;
  background: linear-gradient(90deg, transparent, var(--blue), transparent);
  box-shadow: 0 0 14px 2px var(--glow); animation: fp-scan 4.5s ease-in-out infinite;
}
.fp .wrap { position: relative; z-index: 1; width: 100%; max-width: 420px; margin: 0 auto; padding: 0 16px; }
.fp .wrap-center { min-height: 82vh; display: flex; flex-direction: column; justify-content: center; }

.fp .head { text-align: center; margin: 6px 0 18px; }
.fp .mark {
  width: 56px; height: 56px; margin: 0 auto 13px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center; font-size: 26px;
  background: linear-gradient(150deg, #FFFFFF, #E7EEFE);
  border: 1px solid rgba(43,92,230,.28);
  box-shadow: 0 10px 24px -8px var(--glow), inset 0 1px 0 rgba(255,255,255,.9);
}
.fp .eyebrow { font-family: var(--mono); font-size: 10.5px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: var(--blue); }
.fp .eyebrow-muted { color: var(--ink-3); }
.fp .title { font-size: 24px; font-weight: 900; letter-spacing: .04em; margin: 7px 0 0; color: var(--ink); }
.fp .sub { font-size: 11.5px; color: var(--ink-2); margin-top: 7px; letter-spacing: .02em; }

.fp .tab {
  display: inline-flex; align-items: center; gap: 7px; clip-path: var(--chamfer);
  background: rgba(255,255,255,.72); border: 1px solid var(--line-2);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  padding: 6px 14px; margin-top: 12px;
}
.fp .tab .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--green); box-shadow: 0 0 8px 1px rgba(35,174,110,.55); }
.fp .tab .zh { font-size: 11px; font-weight: 800; color: var(--ink); letter-spacing: .02em; }
.fp .tab .en { font-family: var(--mono); font-size: 9px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--blue); }

.fp .card {
  position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 18px; margin-bottom: 14px;
  box-shadow: 0 1px 0 rgba(255,255,255,.85) inset, 0 22px 44px -28px rgba(30,60,120,.45);
}
.fp .card-pad { padding: 16px; }
.fp .loading-card { text-align: center; }
.fp .loading-h { font-size: 16px; font-weight: 900; color: var(--ink); margin: 5px 0 0; letter-spacing: .02em; }

.fp .sec-eyebrow {
  display: inline-flex; align-items: center; gap: 7px; clip-path: var(--chamfer);
  background: var(--blue-soft); padding: 5px 12px; margin: 0 0 12px;
}
.fp .sec-eyebrow .zh { font-size: 11px; font-weight: 800; color: var(--ink); }
.fp .sec-eyebrow .en { font-family: var(--mono); font-size: 9px; font-weight: 600; letter-spacing: .1em; color: var(--blue); }

.fp .empty-hint { font-size: 12.5px; color: var(--ink-3); text-align: center; padding: 10px 0; }

.fp .doc-list { display: flex; flex-direction: column; gap: 8px; }
.fp .doc-row {
  display: flex; align-items: center; gap: 9px; background: var(--field);
  border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px;
}
.fp .doc-ic { font-size: 14px; flex-shrink: 0; }
.fp .doc-title { flex: 1; min-width: 0; font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp .doc-del {
  flex-shrink: 0; border: 1px solid rgba(229,72,77,.35); background: var(--red-soft); color: var(--red);
  font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 8px; cursor: pointer;
}
.fp .doc-del:disabled { opacity: .5; cursor: default; }

.fp .filepick {
  display: flex; align-items: center; gap: 10px; cursor: pointer;
  border: 1px dashed var(--line-2); background: var(--field); border-radius: 12px; padding: 14px 16px;
}
.fp .filepick input { display: none; }
.fp .filepick .fp-ic { font-size: 18px; }
.fp .filepick .fp-txt { font-size: 13px; color: var(--ink-2); }
.fp .hint { font-family: var(--mono); font-size: 9.5px; color: var(--ink-3); margin: 8px 2px 0; letter-spacing: .03em; line-height: 1.5; }

.fp .confirm {
  position: relative; width: 100%; border: 0; cursor: pointer; color: #FFFFFF;
  font-family: var(--sans); font-size: 15px; font-weight: 800; letter-spacing: .04em;
  padding: 15px; border-radius: 14px; margin-top: 2px;
  background: linear-gradient(135deg, var(--blue), var(--blue-deep));
  box-shadow: 0 14px 28px -12px var(--glow), inset 0 1px 0 rgba(255,255,255,.3);
}
.fp .confirm:disabled { opacity: .5; cursor: default; }

.fp .err {
  margin-bottom: 14px; border-radius: 12px; background: #FEF2F2; border: 1px solid #FBD5D5;
  padding: 12px 14px; font-size: 13px; color: #B42318; line-height: 1.6;
}
.fp .ok {
  margin-bottom: 14px; border-radius: 12px; background: var(--green-soft); border: 1px solid rgba(35,174,110,.3);
  padding: 12px 14px; font-size: 13px; color: var(--green); line-height: 1.6;
}
@keyframes fp-scan { 0%, 100% { top: 8%; } 50% { top: 90%; } }
@media (prefers-reduced-motion: reduce) {
  /* 沿用海巡經驗：不關掃描線（多數手機預設開減少動態，關了就看不到）。紙張紋本來就是靜態 */
}
`;
