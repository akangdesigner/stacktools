'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

interface AiEditorClient { id: number; name: string; }

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <div className="flex-none w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold flex items-center justify-center mt-0.5">{number}</div>
      <div className="flex-1 space-y-3">
        <h2 className="text-base font-bold text-gray-900 leading-snug">{title}</h2>
        <div className="space-y-2 text-sm text-gray-700">{children}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-green-400 text-xs rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{children}</pre>
      <button
        onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? '已複製' : '複製'}
      </button>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
      <span className="shrink-0 font-bold">⚠</span>
      <div>{children}</div>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
      <span className="shrink-0 font-bold">ℹ</span>
      <div>{children}</div>
    </div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
      <span className="shrink-0 font-bold">✓</span>
      <div>{children}</div>
    </div>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors">
      {children}
    </a>
  );
}

type FbPage = { id: string; name: string };

function ClientSelect({ clients, value, onChange }: { clients: AiEditorClient[]; value: string; onChange: (v: string) => void }) {
  return clients.length > 0 ? (
    <select value={value} onChange={e => onChange(e.target.value)} required
      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white">
      <option value="">選擇客戶…</option>
      {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
    </select>
  ) : (
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder="輸入客戶名稱（需完全一致）" required
      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400" />
  );
}

function FbTokenForm({ clients }: { clients: AiEditorClient[] }) {
  const [clientName, setClientName] = useState('');
  const [shortToken, setShortToken] = useState('');
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function fetchPages() {
    if (!shortToken.trim()) return;
    setFetching(true); setFetchErr(''); setPages([]); setSelectedPageId('');
    try {
      const res = await fetch(`/api/ai-editor/fb-pages?token=${encodeURIComponent(shortToken.trim())}`);
      const data = await res.json() as { pages?: FbPage[]; error?: string };
      if (!res.ok || data.error) { setFetchErr(data.error ?? '查詢失敗'); return; }
      const list = data.pages ?? [];
      setPages(list);
      if (list.length === 1) setSelectedPageId(list[0].id);
    } catch { setFetchErr('連線失敗'); }
    finally { setFetching(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPageId) return;
    setLoading(true); setResult(null);
    try {
      const res = await fetch('/api/ai-editor/register-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: clientName, fb_page_id: selectedPageId, short_token: shortToken }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; client_name?: string; page_name?: string; fb_page_id?: string };
      if (!res.ok || data.error) {
        setResult({ ok: false, message: data.error ?? '登記失敗' });
      } else {
        setResult({ ok: true, message: `✅ 登記完成！\n客戶：${data.client_name}\n粉專：${data.page_name}\nPage ID：${data.fb_page_id}` });
        setShortToken(''); setPages([]); setSelectedPageId('');
      }
    } catch { setResult({ ok: false, message: '連線失敗' }); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900">FB / Meta Token 登記</h2>
        <p className="text-xs text-gray-400 mt-0.5">貼入短效 Token，自動抓粉專清單，選擇後存入永久 Page Token</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">客戶名稱</label>
          <ClientSelect clients={clients} value={clientName} onChange={setClientName} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">FB 短效 User Token</label>
          <textarea value={shortToken}
            onChange={e => { setShortToken(e.target.value); setPages([]); setSelectedPageId(''); setFetchErr(''); }}
            placeholder="EAAxxxxx（從 Graph API Explorer 產生）" required rows={3}
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none" />
          <button type="button" onClick={fetchPages} disabled={!shortToken.trim() || fetching}
            className="mt-1.5 w-full py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            {fetching ? '查詢中…' : '查詢粉專清單'}
          </button>
          {fetchErr && <p className="mt-1 text-xs text-red-600">{fetchErr}</p>}
        </div>
        {pages.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">選擇粉專</label>
            <select value={selectedPageId} onChange={e => setSelectedPageId(e.target.value)} required
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white">
              <option value="">選擇…</option>
              {pages.map(p => <option key={p.id} value={p.id}>{p.name}（{p.id}）</option>)}
            </select>
          </div>
        )}
        <button type="submit" disabled={loading || !selectedPageId}
          className="w-full py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors">
          {loading ? '登記中…' : '登記 FB Token'}
        </button>
      </form>
      {result && (
        <div className={`rounded-lg px-4 py-3 text-xs whitespace-pre-wrap ${result.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}

function ThreadsTokenForm({ clients }: { clients: AiEditorClient[] }) {
  const [clientName, setClientName] = useState('');
  const [threadsToken, setThreadsToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const client = clients.find(c => c.name === clientName);
    if (!client) { setResult({ ok: false, message: '找不到客戶' }); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch('/api/ai-editor/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, threads_access_token: threadsToken.trim() }),
      });
      if (!res.ok) { setResult({ ok: false, message: '登記失敗' }); return; }
      setResult({ ok: true, message: `✅ Threads Token 登記完成！\n客戶：${client.name}` });
      setThreadsToken('');
    } catch { setResult({ ok: false, message: '連線失敗' }); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Threads Token 登記</h2>
        <p className="text-xs text-gray-400 mt-0.5">60 天有效，可 refresh 無限延長</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">客戶名稱</label>
          <ClientSelect clients={clients} value={clientName} onChange={setClientName} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Threads Access Token</label>
          <textarea value={threadsToken} onChange={e => setThreadsToken(e.target.value)}
            placeholder="THAAxxxxx" required rows={3}
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none" />
        </div>
        <button type="submit" disabled={loading || !threadsToken.trim() || !clientName}
          className="w-full py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors">
          {loading ? '登記中…' : '登記 Threads Token'}
        </button>
      </form>
      {result && (
        <div className={`rounded-lg px-4 py-3 text-xs whitespace-pre-wrap ${result.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}

// IG 專用 Token 登記：沒有 FB 粉專的客戶走 Instagram Login API（graph.instagram.com）
function IgTokenForm({ clients }: { clients: AiEditorClient[] }) {
  const [clientName, setClientName] = useState('');
  const [igToken, setIgToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const client = clients.find(c => c.name === clientName);
    if (!client) { setResult({ ok: false, message: '找不到客戶' }); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch('/api/ai-editor/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, ig_access_token: igToken.trim() }),
      });
      if (!res.ok) { setResult({ ok: false, message: '登記失敗' }); return; }
      setResult({ ok: true, message: `✅ IG Token 登記完成！\n客戶：${client.name}` });
      setIgToken('');
    } catch { setResult({ ok: false, message: '連線失敗' }); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900">IG Token 登記（無 FB 客戶）</h2>
        <p className="text-xs text-gray-400 mt-0.5">客戶只有 IG、沒有 FB 粉專時用，60 天有效可 refresh 延長</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">客戶名稱</label>
          <ClientSelect clients={clients} value={clientName} onChange={setClientName} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">IG Access Token</label>
          <textarea value={igToken} onChange={e => setIgToken(e.target.value)}
            placeholder="IGAAxxxxx" required rows={3}
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none" />
        </div>
        <button type="submit" disabled={loading || !igToken.trim() || !clientName}
          className="w-full py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors">
          {loading ? '登記中…' : '登記 IG Token'}
        </button>
      </form>
      {result && (
        <div className={`rounded-lg px-4 py-3 text-xs whitespace-pre-wrap ${result.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}

function AdminPanel({ clients }: { clients: AiEditorClient[] }) {
  return (
    <div className="space-y-4">
      <FbTokenForm clients={clients} />
      <ThreadsTokenForm clients={clients} />
      <IgTokenForm clients={clients} />
    </div>
  );
}

export default function SetupGuidePage() {
  const router = useRouter();
  const [clients, setClients] = useState<AiEditorClient[]>([]);

  useEffect(() => {
    fetch('/api/ai-editor/clients')
      .then(r => r.json())
      .then((list: AiEditorClient[]) => setClients(list))
      .catch(() => {});
  }, []);

  return (
    <div className="p-8 space-y-6">
      {/* 麵包屑 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => router.push('/ai-editor')} className="hover:text-gray-700 transition-colors">AI 小編</button>
        <span>/</span>
        <span className="text-gray-700 font-medium">授權設定教學</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">社群授權欄位設定教學</h1>

      {/* 兩欄主體 */}
      <div className="flex gap-6 items-start">

        {/* 左欄：教學 */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* 欄位總覽 */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">需要填入的三個欄位</h2>
            {[
              { field: 'FB Page ID', desc: '粉絲專頁數字 ID', source: 'Step 2' },
              { field: 'Meta Access Token（永久）', desc: '用於 FB 發文 + IG 發文，右側表單自動換成永久 Token', source: 'Step 2–3' },
              { field: 'Threads Access Token', desc: 'Threads 測試用戶 Token，60 天有效但可 refresh 無限延長', source: 'Step 4' },
            ].map(({ field, desc, source }) => (
              <div key={field} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-xs font-semibold text-gray-400 mt-0.5 w-14 shrink-0">{source}</span>
                <div className="flex-1">
                  <code className="text-xs font-mono font-semibold text-gray-800">{field}</code>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 步驟 */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-8">

            <Step number={1} title="確認 Meta App 已建立並設定權限">
              <p>前往 <Link href="https://developers.facebook.com/apps/">Meta for Developers</Link>，確認已建立 App 並加入以下權限：</p>
              <p className="text-xs font-semibold text-gray-500 mt-1">Facebook（FB 發文）</p>
              <div className="grid grid-cols-2 gap-1.5">
                {['pages_manage_posts', 'pages_read_engagement', 'pages_manage_metadata', 'pages_show_list', 'business_management'].map(p => (
                  <div key={p} className="flex items-center gap-1.5 bg-gray-100 rounded px-2.5 py-1.5">
                    <span className="text-green-500 text-xs font-bold">✓</span>
                    <code className="text-xs font-mono text-gray-700">{p}</code>
                  </div>
                ))}
              </div>
              <p className="text-xs font-semibold text-gray-500 mt-2">Instagram（IG 發文）</p>
              <div className="grid grid-cols-2 gap-1.5">
                {['instagram_basic', 'instagram_content_publish'].map(p => (
                  <div key={p} className="flex items-center gap-1.5 bg-purple-50 rounded px-2.5 py-1.5">
                    <span className="text-purple-500 text-xs font-bold">✓</span>
                    <code className="text-xs font-mono text-gray-700">{p}</code>
                  </div>
                ))}
              </div>
            </Step>

            <hr className="border-gray-100" />

            <Step number={2} title="取得 FB Page ID 與短效 User Token">
              <p><strong>取得短效 User Token：</strong>前往 <Link href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</Link>，選擇 App，勾選所有權限後點「Generate Access Token」。</p>
              <Note>這個 Token 約 1 小時失效，只用來查詢並填入右側表單，系統會自動換成永久 Token。</Note>
              <p className="mt-2"><strong>查詢 FB Page ID：</strong>在 Explorer 輸入以下查詢，找到 <code className="bg-gray-100 px-1 rounded text-xs">id</code> 欄位（純數字）。</p>
              <Code>{`GET /me/accounts?access_token={短效Token}`}</Code>
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{`{
  "data": [{ "name": "粉專名稱", "id": "365872423285385", ... }]
}`}</pre>
              </div>
              <SuccessBox>把 <code className="bg-green-100 px-1 rounded text-xs">id</code>（FB Page ID）和短效 Token 填入右側表單。</SuccessBox>
            </Step>

            <hr className="border-gray-100" />

            <Step number={3} title="使用右側表單登記 — 自動換成永久 Token">
              <p>在右側「快速登記 Token」表單填入：客戶名稱、FB Page ID、短效 Token，按「登記 Token」。</p>
              <p>系統會自動：</p>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>短效 Token → 長效 Token（60 天）</li>
                <li>長效 Token → <strong>永久 Page Access Token</strong></li>
                <li>自動寫入對應客戶的 Meta Access Token 欄位</li>
              </ol>
              <SuccessBox>顯示「✅ Token 登記完成」後即完成，Meta Access Token 永久有效，不需定期更換。</SuccessBox>
            </Step>

            <hr className="border-gray-100" />

            <Step number={4} title="取得 Threads Access Token（測試用戶）">
              <p>Threads 使用獨立 Token，與 Meta Page Token 無關。Token 原本 60 天有效，但可在到期前呼叫 refresh endpoint 延長，實際上可無限循環。</p>
              <p className="font-semibold mt-1">首次取得：</p>
              <ol className="list-decimal list-inside space-y-1.5 ml-1">
                <li>前往 Meta App → 左側「Threads API」→「設定」</li>
                <li>在「測試用戶」找到目標 Threads 帳號</li>
                <li>點「產生 Token」→ 勾選 <code className="bg-gray-100 px-1 rounded text-xs">threads_basic</code> 和 <code className="bg-gray-100 px-1 rounded text-xs">threads_content_publish</code></li>
                <li>點「換取長效 Token」，得到 <code className="bg-gray-100 px-1 rounded text-xs">THAA</code> 開頭的 60 天 Token</li>
              </ol>
              <p className="font-semibold mt-2">快到期時 Refresh（重置為 60 天）：</p>
              <Code>{`GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token={現有Token}`}</Code>
              <p>回傳新的 <code className="bg-gray-100 px-1 rounded text-xs">access_token</code>，把它填回右側表單重新登記即可。</p>
              <InfoBox>建議每 50 天 refresh 一次，或直接設定 n8n 排程自動 refresh。</InfoBox>
            </Step>

          </div>

          {/* 無 FB 客戶（只有 IG）的替代流程 */}
          <div className="rounded-xl border border-purple-200 bg-white p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">客戶只有 IG、沒有 FB？</h2>
              <p className="text-sm text-gray-500 mt-1">Step 1–3 的 Meta Token 需要 FB 粉專。客戶沒有 FB 時，改走「Instagram API with Instagram Login」，完全不需要 FB 帳號或粉專。</p>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 ml-1 text-sm text-gray-700">
              <li>請客戶把 IG 切換成<strong>商業帳號或創作者帳號</strong>（IG App → 設定 → 帳號類型與工具），免費、不需綁 FB</li>
              <li>前往 Meta App → 左側「Instagram」→ 選擇「<strong>Instagram 登入的 API 設定</strong>」（API setup with Instagram login）</li>
              <li>確認權限包含 <code className="bg-gray-100 px-1 rounded text-xs">instagram_business_basic</code> 和 <code className="bg-gray-100 px-1 rounded text-xs">instagram_business_content_publish</code></li>
              <li>把客戶的 IG 帳號加入「Instagram 測試人員」（App 角色 → 測試人員），客戶要在 IG App 裡接受邀請（設定 → 網站權限 → 應用程式和網站 → 測試人員邀請）</li>
              <li>回到後台按「產生權杖」，客戶登入 IG 授權後會得到 <code className="bg-gray-100 px-1 rounded text-xs">IGAA</code> 開頭的長效 Token（60 天）</li>
              <li>貼到右側「<strong>IG Token 登記（無 FB 客戶）</strong>」表單完成登記</li>
            </ol>
            <p className="font-semibold text-sm text-gray-700 mt-2">快到期時 Refresh（重置為 60 天，同 Threads 做法）：</p>
            <Code>{`GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token={現有Token}`}</Code>
            <Note>這條路只能發 IG。客戶若之後也要發 FB，還是得回到 Step 1–3 的正規流程。FB Page ID 和 Meta Access Token 欄位留空即可。</Note>
          </div>

          {/* 常見問題 */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">常見問題</h2>
            <div className="space-y-3 text-sm">
              {[
                { q: '顯示「找不到客戶」？', a: '客戶名稱需與系統完全一致（大小寫、空格），請從下拉選單選擇。' },
                { q: '顯示「找不到粉專」？', a: 'FB Page ID 需是 /me/accounts 回傳的純數字 id。' },
                { q: 'FB 發文顯示「permission denied」？', a: '產生 Token 時確認有勾選 pages_read_engagement 和 pages_manage_posts 兩個權限。' },
                { q: 'Meta Token 多久需重換？', a: '透過此表單登記的是永久 Token，無需定期更換。改密碼或撤銷 App 授權時才需重新登記。' },
                { q: 'Threads Token 多久需更新？', a: '60 天有效，但可用 refresh endpoint 延長（重置為 60 天），建議每 50 天呼叫一次或設定 n8n 排程自動 refresh。' },
                { q: '客戶沒有 FB、只有 IG 怎麼辦？', a: '改走「Instagram API with Instagram Login」，不需要 FB 帳號或粉專，見上方「客戶只有 IG、沒有 FB？」區塊。Token 60 天有效，可 refresh 延長。' },
              ].map(({ q, a }) => (
                <div key={q}>
                  <p className="font-semibold text-gray-800 mb-1">{q}</p>
                  <p className="text-gray-600 text-xs">{a}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* 右欄：Admin 表單（sticky） */}
        <div className="w-80 shrink-0 sticky top-8">
          <AdminPanel clients={clients} />

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 space-y-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">相關工具</h3>
            {[
              { label: 'Graph API Explorer', href: 'https://developers.facebook.com/tools/explorer/' },
              { label: 'Meta App 管理', href: 'https://developers.facebook.com/apps/' },
            ].map(({ label, href }) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-xs text-gray-700 group">
                <span className="flex-1">{label}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-gray-300 group-hover:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
