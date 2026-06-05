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

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
      <span className="shrink-0 font-bold">✓</span>
      <div>{children}</div>
    </div>
  );
}

function FieldTag({ children }: { children: string }) {
  return <code className="bg-gray-100 border border-gray-200 text-gray-700 text-xs font-mono px-2 py-0.5 rounded">{children}</code>;
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">社群授權欄位設定教學</h1>
        <p className="text-sm text-gray-500">說明如何取得客戶資料中三個授權欄位的值。</p>
      </div>

      {/* 欄位總覽 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">需要填入的三個欄位</h2>
        <div className="space-y-3">
          {[
            { field: 'FB Page ID', desc: 'Facebook 粉絲專頁的數字 ID', source: 'Step 2' },
            { field: 'Meta Access Token（永久）', desc: '用於 FB 發文 + IG 發文，透過 LINE 機器人自動換成永久 Token', source: 'Step 3' },
            { field: 'Threads Access Token', desc: 'Threads 測試用戶專屬 Token，獨立申請', source: 'Step 4' },
          ].map(({ field, desc, source }) => (
            <div key={field} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <span className="text-xs font-semibold text-gray-400 mt-0.5 w-12 shrink-0">{source}</span>
              <div className="flex-1">
                <code className="text-xs font-mono font-semibold text-gray-800">{field}</code>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 步驟 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-8">

        <Step number={1} title="確認 Meta App 已建立並設定權限">
          <p>前往 <Link href="https://developers.facebook.com/apps/">Meta for Developers</Link>，確認已有一個 App 並加入以下使用案例與權限：</p>
          <div className="grid grid-cols-2 gap-1.5">
            {['pages_manage_posts', 'pages_read_engagement', 'pages_manage_metadata', 'pages_show_list', 'business_management'].map(p => (
              <div key={p} className="flex items-center gap-1.5 bg-gray-100 rounded px-2.5 py-1.5">
                <span className="text-green-500 text-xs font-bold">✓</span>
                <code className="text-xs font-mono text-gray-700">{p}</code>
              </div>
            ))}
          </div>
          <InfoBox>已有 Meta App 可直接跳到 Step 2。</InfoBox>
        </Step>

        <hr className="border-gray-100" />

        <Step number={2} title="取得 FB Page ID 與短效 User Token">
          <p><strong>Step 2-1：取得短效 User Token</strong></p>
          <p>前往 <Link href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</Link>，選擇你的 App，勾選上方所有權限後點「Generate Access Token」。</p>
          <Note>這個 token 約 1 小時失效，只用來查詢粉專 ID，不需要存入系統。</Note>

          <p className="mt-2"><strong>Step 2-2：查詢 FB Page ID</strong></p>
          <p>在 Graph API Explorer 的查詢欄輸入：</p>
          <Code>{`GET /me/accounts?access_token={剛才取得的短效Token}`}</Code>
          <p>回傳結果範例：</p>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{`{
  "data": [
    {
      "name": "粉專名稱",
      "id": "365872423285385",   ← 這就是 FB Page ID
      "access_token": "EAA..."
    }
  ]
}`}</pre>
          </div>
          <SuccessBox>
            記下 <FieldTag>id</FieldTag> 的值（純數字），這就是 <FieldTag>FB Page ID</FieldTag>，填入客戶資料。
          </SuccessBox>
        </Step>

        <hr className="border-gray-100" />

        <Step number={3} title="透過 LINE 機器人自動換成永久 Meta Access Token">
          <p>不需要手動換 Token，直接傳一則 LINE 訊息給 AI 小編機器人，系統會自動：</p>
          <ol className="list-decimal list-inside space-y-1 ml-1">
            <li>把短效 User Token 換成長效 Token</li>
            <li>再換成<strong>永久 Page Access Token</strong></li>
            <li>自動寫入對應客戶的 <FieldTag>Meta Access Token（永久）</FieldTag> 欄位</li>
          </ol>

          <p className="mt-2"><strong>LINE 訊息格式（直接複製貼上修改）：</strong></p>
          <Code>{`登記Token
客戶：客戶名稱（需與系統中完全一致）
粉專ID：365872423285385
FB短Token：EAAxxxxx（Step 2-1 取得的短效Token）
Threads：THAAxxxxx（Step 4 取得的Threads Token）`}</Code>

          <SuccessBox>
            機器人回傳「✅ Token 登記完成」後，<FieldTag>Meta Access Token（永久）</FieldTag> 即自動更新。此 Token 永久有效，不需定期重換。
          </SuccessBox>
          <Note>客戶名稱需與系統中完全一致（大小寫、空格都要相同），否則會找不到客戶。</Note>
        </Step>

        <hr className="border-gray-100" />

        <Step number={4} title="取得 Threads Access Token（測試用戶）">
          <p>Threads 發文使用獨立的測試用戶 Token，與 FB/IG 的 Page Token 無關。</p>

          <p><strong>取得步驟：</strong></p>
          <ol className="list-decimal list-inside space-y-1.5 ml-1">
            <li>前往 <Link href="https://developers.facebook.com/apps/">Meta for Developers</Link>，進入你的 App</li>
            <li>左側選單找「Threads API」→「設定」</li>
            <li>在「測試用戶」區塊，找到要發文的 Threads 帳號</li>
            <li>點「產生 Token」→ 選擇 <code className="bg-gray-100 px-1 rounded text-xs">threads_basic</code> 和 <code className="bg-gray-100 px-1 rounded text-xs">threads_content_publish</code> 權限</li>
            <li>點「換取長效 Token」，得到一個以 <code className="bg-gray-100 px-1 rounded text-xs">THAA</code> 開頭的 60 天 Token</li>
          </ol>

          <InfoBox>
            Threads 長效 Token 有效期約 60 天。到期前可在 Meta Developer 相同位置重新產生並更新。
          </InfoBox>

          <SuccessBox>
            把這個 Token 填入客戶資料的 <FieldTag>Threads Access Token</FieldTag> 欄位，或在 Step 3 的 LINE 訊息 <code className="bg-gray-100 px-1 rounded text-xs">Threads：</code> 欄位一起帶入。
          </SuccessBox>
        </Step>

      </div>

      {/* 常見問題 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">常見問題</h2>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold text-gray-800 mb-1">LINE 機器人回傳「找不到客戶」？</p>
            <p className="text-gray-600">訊息中的「客戶：」名稱需與系統完全一致，請到 AI 小編列表確認客戶名稱後再試。</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">LINE 機器人回傳「找不到粉專」？</p>
            <p className="text-gray-600">「粉專ID：」需與 Step 2 查到的 id 完全一致（純數字）。</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">FB 發文顯示「permission denied」？</p>
            <p className="text-gray-600">請確認 Step 2-1 產生 Token 時有勾選 <code className="bg-gray-100 px-1 rounded text-xs">pages_read_engagement</code> 和 <code className="bg-gray-100 px-1 rounded text-xs">pages_manage_posts</code> 兩個權限。</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">Meta Access Token 多久需要更換一次？</p>
            <p className="text-gray-600">透過 LINE 機器人登記的 Token 是<strong>永久有效</strong>的，不需定期更換。只有當帳號改密碼或撤銷 App 授權時才需重新登記。</p>
          </div>
        </div>
      </div>

      {/* 相關連結 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">相關工具連結</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {[
            { label: 'Graph API Explorer', href: 'https://developers.facebook.com/tools/explorer/' },
            { label: 'Meta for Developers', href: 'https://developers.facebook.com/' },
            { label: 'Meta App 管理', href: 'https://developers.facebook.com/apps/' },
            { label: 'Facebook Pages API 文件', href: 'https://developers.facebook.com/docs/pages-api' },
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
