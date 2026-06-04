'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors">
      {children}
    </a>
  );
}

export default function SetupGuidePage() {
  const router = useRouter();

  return (
    <div className="p-8 max-w-3xl space-y-8">
      {/* 麵包屑 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => router.push('/ai-editor')} className="hover:text-gray-700 transition-colors">AI 小編</button>
        <span>/</span>
        <span className="text-gray-700 font-medium">授權設定教學</span>
      </div>

      {/* 標題 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Facebook 粉專授權設定教學</h1>
        <p className="text-sm text-gray-500">透過 Meta Graph API 取得 Access Token，讓 AI 小編能自動發文到 Facebook 粉絲專頁。</p>
      </div>

      {/* 前置條件 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">開始前請確認</h2>
        <ul className="space-y-1.5 text-sm text-gray-700 list-none">
          {[
            '已建立 Meta App',
            'App 已加入 Facebook Pages API 相關使用案例',
            '使用者對粉絲專頁具有完整管理權限',
          ].map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-green-500 font-bold shrink-0">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">需要的權限：</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              'pages_manage_posts',
              'pages_read_engagement',
              'pages_manage_metadata',
              'pages_show_list',
              'business_management',
            ].map(p => (
              <div key={p} className="flex items-center gap-1.5 bg-gray-100 rounded px-2.5 py-1.5">
                <span className="text-green-500 text-xs font-bold">✓</span>
                <code className="text-xs font-mono text-gray-700">{p}</code>
              </div>
            ))}
          </div>
        </div>
        <InfoBox>
          還沒有 Meta App？前往 <Link href="https://developers.facebook.com/apps/creation/">developers.facebook.com → 建立 App</Link>，加入 Facebook Login 與 Pages API 相關使用案例。
        </InfoBox>
      </div>

      {/* 步驟 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-8">

        <Step number={1} title="建立 Meta App">
          <p>前往 <Link href="https://developers.facebook.com/apps/creation/">Meta for Developers</Link> 建立 App。</p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 ml-1">
            <li>點「建立應用程式」</li>
            <li>選擇使用案例：加入 <strong>Facebook Login</strong> 與 <strong>Pages API</strong> 相關使用案例</li>
            <li>完成建立後記下 <strong>App ID</strong> 與 <strong>App Secret</strong></li>
          </ol>
          <InfoBox>已有 Meta App 可直接跳到 Step 2。</InfoBox>
        </Step>

        <hr className="border-gray-100" />

        <Step number={2} title="取得 Access Token">
          <p>前往 <Link href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</Link>：</p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 ml-1">
            <li>右上角「Meta App」選擇你的 App</li>
            <li>勾選以下所有權限：
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {[
                  'pages_manage_posts',
                  'pages_read_engagement',
                  'pages_manage_metadata',
                  'pages_show_list',
                  'business_management',
                ].map(p => (
                  <div key={p} className="flex items-center gap-1.5 bg-gray-100 rounded px-2.5 py-1.5">
                    <span className="text-green-500 text-xs font-bold">✓</span>
                    <code className="text-xs font-mono text-gray-700">{p}</code>
                  </div>
                ))}
              </div>
            </li>
            <li className="mt-2">點「Generate Access Token」</li>
            <li>Facebook 會要求你登入並授權，完成後即可取得 token</li>
          </ol>
          <Note>這個 token 是短效的用戶 token（約 1 小時），後續步驟可換成長效 token（60 天）。如需永久 token 請聯絡管理員改用 System User 流程。</Note>
        </Step>

        <hr className="border-gray-100" />

        <Step number={3} title="確認粉專權限">
          <p>在 Graph API Explorer 或瀏覽器中執行以下查詢，把 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{'{YOUR_TOKEN}'}</code> 換成剛取得的 token：</p>
          <Code>{`GET /me/accounts?access_token={YOUR_TOKEN}`}</Code>
          <p>成功後應取得類似以下的回傳：</p>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{`{
  "data": [
    {
      "name": "粉專名稱",
      "id": "粉專ID",           ← 這就是 FB Page ID
      "access_token": "TOKEN"   ← 這是粉專專屬 token
    }
  ]
}`}</pre>
          </div>
          <p>確認回傳資料中包含：</p>
          <ul className="space-y-1 ml-1">
            {[
              '粉專名稱（name）',
              '粉專 ID（id）— 記下來，後面會用到',
              'access_token — 這個 token 可用來對粉專發文',
              'tasks 包含 CREATE_CONTENT 與 MANAGE',
            ].map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-green-500 font-bold shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Note>如果 data 是空陣列，代表這個帳號沒有管理任何粉絲專頁，或權限不足。請確認帳號對粉專有完整管理權限。</Note>
        </Step>

        <hr className="border-gray-100" />

        <Step number={4} title="n8n 發文測試（驗證用）">
          <p>在 n8n 新增 <strong>HTTP Request</strong> 節點，設定如下：</p>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold">
                <tr>
                  <th className="text-left px-4 py-2.5 w-40">欄位</th>
                  <th className="text-left px-4 py-2.5">設定值</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">Method</td>
                  <td className="px-4 py-2.5">POST</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">URL</td>
                  <td className="px-4 py-2.5 font-mono text-gray-600">{'https://graph.facebook.com/v23.0/{PAGE_ID}/feed'}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">Send Body</td>
                  <td className="px-4 py-2.5">ON</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">Body Content Type</td>
                  <td className="px-4 py-2.5">Form Urlencoded</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">Body Parameters</td>
                  <td className="px-4 py-2.5 font-mono">message=測試發文成功<br />access_token={'TOKEN'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>成功回傳如下，代表貼文已建立：</p>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{`{
  "id": "{PAGE_ID}_{POST_ID}"
}`}</pre>
          </div>
          <InfoBox>測試完成後記得到 Facebook 粉專確認測試貼文有出現，並手動刪除測試貼文。</InfoBox>
        </Step>

        <hr className="border-gray-100" />

        <Step number={5} title="填入 AI 小編客戶資料">
          <p>前往 <button onClick={() => router.push('/ai-editor')} className="text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors">AI 小編列表</button>，進入對應客戶的編輯頁，點「編輯」，填入以下欄位：</p>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold">
                <tr>
                  <th className="text-left px-4 py-2.5 w-44">欄位名稱</th>
                  <th className="text-left px-4 py-2.5">填入內容</th>
                  <th className="text-left px-4 py-2.5">來源</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">fb_id</td>
                  <td className="px-4 py-2.5">粉絲專頁 ID</td>
                  <td className="px-4 py-2.5 text-gray-500">Step 3 回傳的 <code className="bg-gray-100 px-1 rounded">id</code></td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">access_token</td>
                  <td className="px-4 py-2.5">粉專專屬 Token</td>
                  <td className="px-4 py-2.5 text-gray-500">Step 3 回傳的 <code className="bg-gray-100 px-1 rounded">access_token</code></td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">threads_access_token</td>
                  <td className="px-4 py-2.5 text-gray-400">Threads 專屬 Token（待補）</td>
                  <td className="px-4 py-2.5 text-gray-400">IG/Threads 流程補充後說明</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>儲存後，n8n workflow 就會用這組資料自動發文到 Facebook 粉絲專頁。</p>
          <InfoBox>
            AI 自動發文流程：AI Agent 產生貼文內容 → n8n HTTP Request POST 到 {'/{PAGE_ID}/feed'} → 發布至粉絲專頁。
          </InfoBox>
        </Step>

      </div>

      {/* 常見問題 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">常見問題</h2>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold text-gray-800 mb-1">Token 顯示「Invalid OAuth access token」？</p>
            <p className="text-gray-600">通常是 token 格式錯誤（複製時多了空格）。請重新到 Graph API Explorer 產生 token，確認只複製完整的 token 字串。</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">/me/accounts 回傳空的 data 陣列？</p>
            <p className="text-gray-600">代表這個 Facebook 帳號沒有管理任何粉絲專頁，或 <code className="bg-gray-100 px-1 rounded text-xs">pages_show_list</code> 權限未正確授權。請重新在 Graph API Explorer 確認勾選所有必要權限。</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">發文時顯示「permission denied」？</p>
            <p className="text-gray-600">確認使用的是 <strong>粉專專屬 token</strong>（從 /me/accounts 回傳的 access_token），而不是用戶 token。粉專 token 才有 <code className="bg-gray-100 px-1 rounded text-xs">pages_manage_posts</code> 的實際操作權。</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">Token 多久後失效？</p>
            <p className="text-gray-600">Graph API Explorer 產生的用戶 token 約 1 小時失效，從 /me/accounts 取得的粉專 token 約 60 天。如需永久 token，請改用 Business Manager 的 System User 流程。</p>
          </div>
        </div>
      </div>

      {/* 相關連結 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">相關工具連結</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {[
            { label: 'Meta for Developers', href: 'https://developers.facebook.com/' },
            { label: 'Graph API Explorer', href: 'https://developers.facebook.com/tools/explorer/' },
            { label: 'Facebook Pages API 文件', href: 'https://developers.facebook.com/docs/pages-api' },
            { label: 'Meta App 建立', href: 'https://developers.facebook.com/apps/creation/' },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-700 group"
            >
              <span className="flex-1">{label}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          ))}
        </div>
      </div>

    </div>
  );
}
