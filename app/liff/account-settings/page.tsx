'use client';

import { useEffect, useRef, useState } from 'react';
import type { Liff } from '@line/liff';

// 客戶資料設定 LIFF：合併原本「客戶資料建立／查詢／修改」三條路成一個表單。
// 一開頁用 line_uid 查現有資料：沒有 → 建立模式（空白表單）；有 → 查詢/修改模式（現值＋可編輯）。
// 社群授權狀態／帳務資訊唯讀顯示，不在此頁處理（授權走 OAuth、扣款走綠界，各自獨立流程）。

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_ACCOUNT_SETTINGS || '';

type Phase = 'init' | 'ready' | 'error';

type Connections = { fb: boolean; threads: boolean; ig: boolean };
type Billing = { status: string; amount: number; next_charge_date: string };

const BILLING_LABEL: Record<string, string> = {
  none: '尚未設定',
  pending: '審核中',
  active: '訂閱中',
  failed: '扣款失敗',
  cancelled: '已取消',
};

export default function AccountSettingsLiffPage() {
  const [phase, setPhase] = useState<Phase>('init');
  const [isEdit, setIsEdit] = useState(false); // true=已有資料(查詢/修改)，false=首次建立
  const [uid, setUid] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const liffRef = useRef<Liff | null>(null);

  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [persona, setPersona] = useState('');
  const [clientInfo, setClientInfo] = useState('');
  const [activities, setActivities] = useState('');
  const [fbGroupUrl, setFbGroupUrl] = useState('');

  const [fbUser, setFbUser] = useState('');
  const [fbPass, setFbPass] = useState('');
  const [thUser, setThUser] = useState('');
  const [thPass, setThPass] = useState('');
  const [igUser, setIgUser] = useState('');
  const [igPass, setIgPass] = useState('');

  const [connections, setConnections] = useState<Connections | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [legacyRaw, setLegacyRaw] = useState('');

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qsUid = new URLSearchParams(window.location.search).get('uid');
        let resolvedUid = qsUid || '';
        if (!resolvedUid) {
          if (!LIFF_ID) throw new Error('尚未設定 NEXT_PUBLIC_LIFF_ID_ACCOUNT_SETTINGS 環境變數');
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

        const res = await fetch(`/api/liff-account-settings/profile?line_uid=${encodeURIComponent(resolvedUid)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        if (data.exists) {
          setIsEdit(true);
          setName(data.name || '');
          setKeywords(data.keywords || '');
          setPersona(data.persona || '');
          setClientInfo(data.client_info || '');
          setActivities(data.recent_activities || '');
          setFbGroupUrl(data.fb_group_url || '');
          setFbUser(data.fbUser || '');
          setFbPass(data.fbPass || '');
          setThUser(data.thUser || '');
          setThPass(data.thPass || '');
          setIgUser(data.igUser || '');
          setIgPass(data.igPass || '');
          setConnections(data.connections || null);
          setBilling(data.billing || null);
          setLegacyRaw(data.legacyRaw || '');
        } else {
          setIsEdit(false);
        }
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

  const hasAnyPlatform = (fbUser.trim() && fbPass.trim()) || (thUser.trim() && thPass.trim()) || (igUser.trim() && igPass.trim());

  async function save() {
    setError('');
    if (!name.trim() || !keywords.trim() || !persona.trim()) {
      setError('客戶名稱、產業關鍵字、品牌小編人設為必填');
      return;
    }
    if (!isEdit && !hasAnyPlatform) {
      setError('請至少填寫一種社群平台的帳號密碼');
      return;
    }
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await fetch('/api/liff-account-settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_uid: uid,
          name,
          keywords,
          persona,
          client_info: clientInfo,
          recent_activities: activities,
          fb_group_url: fbGroupUrl,
          fb_user: fbUser, fb_pass: fbPass,
          th_user: thUser, th_pass: thPass,
          ig_user: igUser, ig_pass: igPass,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.action === 'created') {
        setIsEdit(true);
        setSavedMsg('資料已建立完成，需等待一個工作日將帳戶加入系統。');
      } else {
        setSavedMsg('資料已更新完成。');
      }
    } catch (e) {
      setError(`儲存失敗：${msg(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (phase === 'init') {
    return (
      <Shell center>
        <section className="card">
          <div className="card-pad loading-card">
            <div className="mark">👤</div>
            <div className="eyebrow eyebrow-muted">Connecting</div>
            <h2 className="loading-h">正在載入你的客戶資料</h2>
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
        <div className="mark">{isEdit ? '👤' : '🆕'}</div>
        <div className="eyebrow">{isEdit ? 'Account Studio' : 'Welcome'}</div>
        <h1 className="title">{isEdit ? '客戶資料設定' : '建立客戶資料'}</h1>
        <p className="sub">{isEdit ? '檢視並更新你的品牌資料' : '第一次使用，先填寫你的品牌資料'}</p>
      </header>

      {error && <div className="err">{error}</div>}
      {savedMsg && <div className="ok">{savedMsg}</div>}

      <section className="card">
        <div className="card-pad">
          <div className="sec-eyebrow"><span className="zh">基本資料</span><span className="en">Profile</span></div>
          <div className="field-row">
            <label>客戶名稱 <span className="req">必填</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：暖窩咖啡" />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-pad">
          <div className="sec-eyebrow"><span className="zh">社群帳號密碼</span><span className="en">Accounts</span></div>

          <div className="plat-field">
            <span className="ic" style={{ background: '#1877F2' }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" /></svg>
            </span>
            <div className="col">
              <div className="plat-name">Facebook <span className="opt">選填</span></div>
              <div className="pair">
                <div className="sub"><label>帳號</label><input value={fbUser} onChange={(e) => setFbUser(e.target.value)} placeholder="帳號" /></div>
                <div className="sub"><label>密碼</label><input type="password" value={fbPass} onChange={(e) => setFbPass(e.target.value)} placeholder="密碼" /></div>
              </div>
            </div>
          </div>

          <div className="plat-field">
            <span className="ic" style={{ background: '#000' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="#fff"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z" /></svg>
            </span>
            <div className="col">
              <div className="plat-name">Threads <span className="opt">選填</span></div>
              <div className="pair">
                <div className="sub"><label>帳號</label><input value={thUser} onChange={(e) => setThUser(e.target.value)} placeholder="帳號" /></div>
                <div className="sub"><label>密碼</label><input type="password" value={thPass} onChange={(e) => setThPass(e.target.value)} placeholder="密碼" /></div>
              </div>
            </div>
          </div>

          <div className="plat-field">
            <span className="ic" style={{ background: 'linear-gradient(45deg,#F58529,#DD2A7B,#8134AF,#515BD4)' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="#fff"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.15-3.23 1.67-4.77 4.92-4.92 1.27-.06 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07c-4.35.2-6.78 2.62-6.98 6.98C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0Zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84Zm0 10.16A4 4 0 1 1 16 12a4 4 0 0 1-4 4Zm6.41-10.4a1.44 1.44 0 1 1-1.44-1.44 1.44 1.44 0 0 1 1.44 1.44Z" /></svg>
            </span>
            <div className="col">
              <div className="plat-name">Instagram <span className="opt">選填</span></div>
              <div className="pair">
                <div className="sub"><label>帳號</label><input value={igUser} onChange={(e) => setIgUser(e.target.value)} placeholder="帳號" /></div>
                <div className="sub"><label>密碼</label><input type="password" value={igPass} onChange={(e) => setIgPass(e.target.value)} placeholder="密碼" /></div>
              </div>
            </div>
          </div>
          <p className="field-hint">{'// 三個平台至少填寫一種，僅供小編後台設定使用，請小心保管'}</p>

          {legacyRaw && (
            <div className="legacy-box">
              <p className="legacy-title">⚠️ 偵測到舊格式資料，無法自動拆分到上面欄位</p>
              <pre className="legacy-text">{legacyRaw}</pre>
              <p className="legacy-hint">請對照上面原文，手動填入正確的平台帳號密碼欄位後存檔，之後就會存成新格式。</p>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-pad">
          <div className="sec-eyebrow"><span className="zh">品牌內容</span><span className="en">Brand</span></div>
          <div className="field-row">
            <label>產業關鍵字 <span className="req">必填</span> <span className="opt">半形逗號分隔</span></label>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="例：手沖咖啡,內湖咖啡廳,辦公空間" />
          </div>
          <div className="field-row">
            <label>品牌小編人設 <span className="req">必填</span></label>
            <textarea rows={2} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="例：溫暖、親切，喜歡分享生活中的小確幸，口吻像鄰家姊姊" />
          </div>
          <div className="field-row">
            <label>品牌相關資訊 <span className="opt">選填</span></label>
            <textarea rows={2} value={clientInfo} onChange={(e) => setClientInfo(e.target.value)} placeholder="例：內湖巷弄的手沖咖啡專賣店，主打溫和烘焙、安靜辦公空間" />
          </div>
          <div className="field-row">
            <label>近期活動 <span className="opt">選填</span></label>
            <textarea rows={2} value={activities} onChange={(e) => setActivities(e.target.value)} placeholder="例：8月中旬父親節限定套餐上市" />
          </div>
          <div className="field-row">
            <label>FB 海巡社團網址 <span className="opt">選填，多個逗號分隔</span></label>
            <input value={fbGroupUrl} onChange={(e) => setFbGroupUrl(e.target.value)} placeholder="例：https://facebook.com/groups/xxx" />
          </div>
        </div>
      </section>

      {isEdit && connections && (
        <section className="card">
          <div className="card-pad">
            <div className="sec-eyebrow"><span className="zh">社群授權狀態</span><span className="en">Connections</span></div>
            <div className="conn-row">
              <div className={`conn-pill${connections.fb ? ' on' : ''}`}>
                <span className="ic2" style={{ background: connections.fb ? '#1877F2' : '#E4E9F5' }}>{connections.fb ? '✓' : '–'}</span>
                <span className="lbl">Facebook</span><span className="st">{connections.fb ? '已連結' : '未連結'}</span>
              </div>
              <div className={`conn-pill${connections.threads ? ' on' : ''}`}>
                <span className="ic2" style={{ background: connections.threads ? '#000' : '#E4E9F5' }}>{connections.threads ? '✓' : '–'}</span>
                <span className="lbl">Threads</span><span className="st">{connections.threads ? '已連結' : '未連結'}</span>
              </div>
              <div className={`conn-pill${connections.ig ? ' on' : ''}`}>
                <span className="ic2" style={{ background: connections.ig ? '#DD2A7B' : '#E4E9F5' }}>{connections.ig ? '✓' : '–'}</span>
                <span className="lbl">Instagram</span><span className="st">{connections.ig ? '已連結' : '未連結'}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {isEdit && billing && (
        <section className="card">
          <div className="card-pad">
            <div className="sec-eyebrow"><span className="zh">帳務資訊</span><span className="en">Billing</span></div>
            <div className="bill-row"><div className="bill-card"><span className="l">扣款狀態</span><span className="bill-badge">● {BILLING_LABEL[billing.status] || billing.status}</span></div></div>
            {billing.amount > 0 && (
              <div className="bill-row"><div className="bill-card"><span className="l">每月扣款金額</span><span className="v">NT$ {billing.amount.toLocaleString()}</span></div></div>
            )}
            {billing.next_charge_date && (
              <div className="bill-row"><div className="bill-card"><span className="l">下次扣款日</span><span className="v">{billing.next_charge_date}</span></div></div>
            )}
          </div>
        </section>
      )}

      <button className="confirm" onClick={save} disabled={saving}>
        {saving ? '儲存中…' : isEdit ? '儲存變更' : '建立資料'}
      </button>
    </Shell>
  );
}

function Shell({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className="fp">
      <style>{FP_CSS}</style>
      <div className="fx" aria-hidden="true"><div className="grid" /></div>
      <div className={center ? 'wrap wrap-center' : 'wrap'}>{children}</div>
    </div>
  );
}

const FP_CSS = `
.fp {
  --card: #FFFFFF; --line: rgba(43,92,230,.14); --line-2: rgba(43,92,230,.24);
  --ink: #1D2942; --ink-2: #5C6A85; --ink-3: #94A0B8;
  --blue: #2B5CE6; --blue-deep: #1E48C8; --blue-soft: #EAF0FE;
  --green: #23AE6E; --green-soft: #E9F7F0; --amber: #E79A3E; --amber-soft: #FDF2E3;
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
.fp .fx { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.fp .fx .grid {
  position: absolute; inset: 0;
  background-image: radial-gradient(rgba(43,92,230,.12) 1px, transparent 1px);
  background-size: 24px 24px;
  -webkit-mask-image: radial-gradient(circle at 50% 10%, #000 0%, transparent 62%);
          mask-image: radial-gradient(circle at 50% 10%, #000 0%, transparent 62%);
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

.fp .field-row { margin-bottom: 12px; }
.fp .field-row label { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--ink-2); margin-bottom: 5px; }
.fp .field-row label .req { color: var(--amber); font-size: 10px; }
.fp .field-row label .opt { font-family: var(--mono); font-size: 9px; color: var(--ink-3); font-weight: 500; }
.fp .field-row input, .fp .field-row textarea {
  width: 100%; border: 1px solid var(--line); background: var(--field); border-radius: 10px;
  padding: 9px 11px; font-family: var(--sans); font-size: 13px; color: var(--ink); outline: none;
  transition: border-color .2s, box-shadow .2s; resize: none;
}
.fp .field-row input:focus, .fp .field-row textarea:focus { border-color: rgba(43,92,230,.5); box-shadow: 0 0 0 3px rgba(43,92,230,.12); background: #fff; }
.fp .field-row input::placeholder, .fp .field-row textarea::placeholder { color: var(--ink-3); }
.fp .field-hint { font-family: var(--mono); font-size: 9px; color: var(--ink-3); margin: 5px 2px 0; line-height: 1.5; }

.fp .legacy-box { margin-top: 12px; padding: 11px 12px; border-radius: 10px; background: var(--amber-soft); border: 1px solid rgba(231,154,62,.35); }
.fp .legacy-title { font-size: 11px; font-weight: 800; color: var(--amber); margin: 0 0 7px; }
.fp .legacy-text {
  font-family: var(--mono); font-size: 11px; color: var(--ink); background: #fff; border: 1px solid var(--line);
  border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; word-break: break-all; margin: 0 0 7px;
}
.fp .legacy-hint { font-size: 10.5px; color: var(--ink-2); line-height: 1.6; margin: 0; }

.fp .plat-field { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 13px; }
.fp .plat-field .ic { width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
.fp .plat-field .col { flex: 1; }
.fp .plat-field .plat-name { font-size: 11.5px; font-weight: 800; color: var(--ink); margin-bottom: 6px; }
.fp .plat-field .pair { display: flex; flex-direction: column; gap: 7px; }
.fp .plat-field .sub label { display: block; font-family: var(--mono); font-size: 9px; font-weight: 600; color: var(--ink-3); letter-spacing: .04em; margin-bottom: 4px; }
.fp .plat-field input {
  width: 100%; border: 1px solid var(--line); background: var(--field); border-radius: 10px;
  padding: 8px 10px; font-family: var(--sans); font-size: 12.5px; color: var(--ink); outline: none;
}
.fp .plat-field input:focus { border-color: rgba(43,92,230,.5); box-shadow: 0 0 0 3px rgba(43,92,230,.12); background: #fff; }

.fp .conn-row { display: flex; gap: 8px; }
.fp .conn-pill {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
  border: 1px solid var(--line); border-radius: 12px; padding: 10px 6px; background: var(--field);
}
.fp .conn-pill.on { background: var(--green-soft); border-color: rgba(35,174,110,.3); }
.fp .conn-pill .ic2 { width: 22px; height: 22px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; }
.fp .conn-pill .lbl { font-size: 10px; font-weight: 700; color: var(--ink-2); }
.fp .conn-pill.on .lbl { color: var(--green); }
.fp .conn-pill .st { font-family: var(--mono); font-size: 8.5px; color: var(--ink-3); letter-spacing: .04em; }
.fp .conn-pill.on .st { color: var(--green); }

.fp .bill-card { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.fp .bill-card .l { font-size: 11px; color: var(--ink-2); }
.fp .bill-card .v { font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--ink); }
.fp .bill-badge {
  display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700;
  padding: 4px 10px; border-radius: 999px; background: var(--green-soft); color: var(--green);
}
.fp .bill-row + .bill-row { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--line); }

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
`;
