'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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

function AdminPanel({ clients }: { clients: AiEditorClient[] }) {
  const [clientName, setClientName] = useState('');
  const [fbPageId, setFbPageId] = useState('');
  const [shortToken, setShortToken] = useState('');
  const [threadsToken, setThreadsToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai-editor/register-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: clientName, fb_page_id: fbPageId, short_token: shortToken, threads_access_token: threadsToken }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; client_name?: string; page_name?: string; fb_page_id?: string };
      if (!res.ok || data.error) {
        setResult({ ok: false, message: data.error ?? '登記失敗，請再試一次' });
      } else {
        setResult({ ok: true, message: `✅ Token 登記完成！\n客戶：${data.client_name}\n粉專：${data.page_name}\nPage ID：${data.fb_page_id}` });
        setShortToken('');
      }
    } catch {
      setResult({ ok: false, message: '連線失敗，請稍後再試' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900">快速登記 Token</h2>
        <p className="text-xs text-gray-400 mt-0.5">填入欄位後系統自動換成永久 Token 並寫入客戶資料</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">客戶名稱</label>
          {clients.length > 0 ? (
            <select
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              required
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
            >
              <option value="">選擇客戶…</option>
              {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="輸入客戶名稱（需完全一致）"
              required
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">FB Page ID</label>
          <input
            type="text"
            value={fbPageId}
            onChange={e => setFbPageId(e.target.value)}
            placeholder="365872423285385"
            required
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">FB 短效 User Token</label>
          <textarea
            value={shortToken}
            onChange={e => setShortToken(e.target.value)}
            placeholder="EAAxxxxx（從 Graph API Explorer 產生）"
            required
            rows={3}
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Threads Access Token
            <span className="text-gray-300 font-normal ml-1">（選填）</span>
          </label>
          <textarea
            value={threadsToken}
            onChange={e => setThreadsToken(e.target.value)}
            placeholder="THAAxxxxx"
            rows={2}
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {loading ? '登記中…' : '登記 Token'}
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
              { field: 'Threads Access Token', desc: 'Threads 測試用戶 Token（60 天），獨立申請', source: 'Step 4' },
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
              <div className="grid grid-cols-2 gap-1.5">
                {['pages_manage_posts', 'pages_read_engagement', 'pages_manage_metadata', 'pages_show_list', 'business_management'].map(p => (
                  <div key={p} className="flex items-center gap-1.5 bg-gray-100 rounded px-2.5 py-1.5">
                    <span className="text-green-500 text-xs font-bold">✓</span>
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
              <p>Threads 使用獨立 Token，與 Meta Page Token 無關。</p>
              <ol className="list-decimal list-inside space-y-1.5 ml-1">
                <li>前往 Meta App → 左側「Threads API」→「設定」</li>
                <li>在「測試用戶」找到目標 Threads 帳號</li>
                <li>點「產生 Token」→ 勾選 <code className="bg-gray-100 px-1 rounded text-xs">threads_basic</code> 和 <code className="bg-gray-100 px-1 rounded text-xs">threads_content_publish</code></li>
                <li>點「換取長效 Token」，得到 <code className="bg-gray-100 px-1 rounded text-xs">THAA</code> 開頭的 60 天 Token</li>
              </ol>
              <InfoBox>Threads Token 約 60 天到期，到期時需重新產生並更新客戶資料。</InfoBox>
            </Step>

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
