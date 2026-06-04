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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Meta 授權設定教學</h1>
        <p className="text-sm text-gray-500">從客戶的 Facebook 帳號取得永久 Token，設定好 IG、FB、Threads 三平台自動發文所需的資料。</p>
      </div>

      {/* 前置條件 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">開始前請確認</h2>
        <ul className="space-y-1.5 text-sm text-gray-700 list-none">
          {[
            '客戶有 Facebook 粉絲專頁（Fan Page）',
            '粉絲專頁已與 Instagram 商業帳號連結',
            '你有 Meta for Developers 的 App（App ID + App Secret）',
            '你有 Meta Business Manager 帳號',
          ].map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-green-500 font-bold shrink-0">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <InfoBox>
          還沒有 Meta App？前往 <Link href="https://developers.facebook.com/apps/creation/">developers.facebook.com → 建立 App</Link>，類型選「其他 → 商業」。
        </InfoBox>
      </div>

      {/* 步驟 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-8">

        <Step number={1} title="請客戶將你加入 Business Manager">
          <p>請客戶前往 <Link href="https://business.facebook.com/settings/people">business.facebook.com → 設定 → 用戶</Link>，點「新增」，輸入你的 Facebook 信箱，角色選 <strong>管理員</strong>。</p>
          <p>接受邀請後，你就能在他的 Business Manager 中操作。</p>
          <Note>如果客戶沒有 Business Manager，請他前往 <Link href="https://business.facebook.com/overview">business.facebook.com</Link> 建立一個，整個流程約 5 分鐘。</Note>
        </Step>

        <hr className="border-gray-100" />

        <Step number={2} title="建立 System User（系統使用者）">
          <p>前往 <Link href="https://business.facebook.com/settings/system-users">business.facebook.com → 設定 → 系統使用者</Link>。</p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 ml-1">
            <li>點「新增」</li>
            <li>名稱填 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">客戶名稱-bot</code>（例：栗子診所-bot）</li>
            <li>角色選 <strong>管理員</strong></li>
            <li>點「建立系統使用者」</li>
          </ol>
          <InfoBox>System User 不是真人帳號，它的 Token 不會因為真人登出或換密碼而失效，是自動化的最佳選擇。</InfoBox>
        </Step>

        <hr className="border-gray-100" />

        <Step number={3} title="指派資產給 System User">
          <p>新版 Meta Business Manager 的指派方式是<strong>從各資產頁面反向指派</strong>，不是在 System User 頁面操作。請依序完成以下三項：</p>
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-1.5">
              <p className="font-semibold text-gray-800 text-xs uppercase tracking-wide">① 指派 Instagram 帳號</p>
              <p>左側選單 → <strong>帳號 → Instagram 帳號</strong> → 選客戶的 IG 帳號 → 右側點「在資產中指派」或找到「指派合作夥伴/系統使用者」→ 選剛建立的 System User → 權限選<strong>完整控制</strong>→ 儲存</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-1.5">
              <p className="font-semibold text-gray-800 text-xs uppercase tracking-wide">② 指派 Facebook 粉絲專頁</p>
              <p>左側選單 → <strong>帳號 → 粉絲專頁</strong> → 選客戶的 FB 粉專 → 同上，指派給 System User → 權限選<strong>完整控制</strong>→ 儲存</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-1.5">
              <p className="font-semibold text-gray-800 text-xs uppercase tracking-wide">③ 指派 App（若尚未指派）</p>
              <p>左側選單 → <strong>帳號 → 應用程式</strong> → 選你的 Meta App → 指派給 System User → 權限選<strong>完整控制</strong>→ 儲存</p>
            </div>
          </div>
          <InfoBox>
            指派完成後，回到「系統工作人員」頁面，點 System User 進入詳細頁，切換到「已指派的資產」分頁確認三項資產都出現在清單中，才算完成。
          </InfoBox>
          <Note>
            如果左側選單找不到「Instagram 帳號」或「粉絲專頁」，代表該資產尚未加入此 Business Manager。請先至對應資產頁面點「新增」→「聲明資產所有權」或「要求存取權」，把客戶資產加入後再指派。
          </Note>
        </Step>

        <hr className="border-gray-100" />

        <Step number={4} title="產生永久 Meta Access Token">
          <p>在 System User 頁面，點「<strong>產生新 token</strong>」：</p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 ml-1">
            <li>選你的 Meta App</li>
            <li>Token 到期時間選「<strong>永不</strong>」</li>
            <li>勾選以下權限：</li>
          </ol>
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {[
              'instagram_basic',
              'instagram_content_publish',
              'pages_show_list',
              'pages_read_engagement',
              'pages_manage_posts',
              'threads_basic',
              'threads_content_publish',
              'business_management',
            ].map(p => (
              <div key={p} className="flex items-center gap-1.5 bg-gray-100 rounded px-2.5 py-1.5">
                <span className="text-green-500 text-xs font-bold">✓</span>
                <code className="text-xs font-mono text-gray-700">{p}</code>
              </div>
            ))}
          </div>
          <p className="mt-2">點「產生 token」→ <strong>立即複製保存</strong>（只顯示一次！）</p>
          <p>這個 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">EAA...</code> 開頭的 token 就是填入 AI 小編的 <strong>Meta Access Token</strong>。</p>
        </Step>

        <hr className="border-gray-100" />

        <Step number={5} title="取得 FB Page ID（粉絲專頁 ID）">
          <p>把下方的 URL 中 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{'{YOUR_TOKEN}'}</code> 換成剛才複製的 token，在瀏覽器開啟或用 curl 執行：</p>
          <Code>{`https://graph.facebook.com/v25.0/me/accounts?access_token={YOUR_TOKEN}`}</Code>
          <p>回傳的 JSON 中，<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">data</code> 陣列每個物件代表一個粉絲專頁，其中的 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">id</code> 就是 <strong>FB Page ID</strong>，<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">name</code> 是粉專名稱方便確認。</p>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-xs text-gray-500 mb-1.5">回傳範例：</p>
            <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{`{
  "data": [
    {
      "name": "栗子診所",
      "id": "123456789012345",   ← 這就是 FB Page ID
      "tasks": [...]
    }
  ]
}`}</pre>
          </div>
        </Step>

        <hr className="border-gray-100" />

        <Step number={6} title="取得 IG User ID（Instagram 商業帳號 ID）">
          <p>把 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{'{FB_PAGE_ID}'}</code> 換成上一步取得的 FB Page ID，<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{'{YOUR_TOKEN}'}</code> 換成 token：</p>
          <Code>{`https://graph.facebook.com/v25.0/{FB_PAGE_ID}?fields=instagram_business_account&access_token={YOUR_TOKEN}`}</Code>
          <p>回傳中的 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">instagram_business_account.id</code> 就是 <strong>IG User ID</strong>（17~18 位數字）。</p>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-xs text-gray-500 mb-1.5">回傳範例：</p>
            <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{`{
  "instagram_business_account": {
    "id": "17841451402248785"   ← 這就是 IG User ID
  },
  "id": "123456789012345"
}`}</pre>
          </div>
          <Note>如果沒有 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">instagram_business_account</code> 欄位，代表粉專尚未與 IG 商業帳號連結。請客戶到 IG App → 設定 → 帳號類型 → 切換成「商業帳號」，再到 FB 粉專設定連結 IG。</Note>
        </Step>

        <hr className="border-gray-100" />

        <Step number={7} title="取得 Threads User ID">
          <p>Threads 的 User ID 與 IG User ID <strong>完全相同</strong>，直接填入上一步取得的 17~18 位數字即可，不需要額外查詢。</p>
          <InfoBox>Threads 帳號是從 Instagram 帳號建立的，所以兩者共用同一個 User ID。</InfoBox>
        </Step>

        <hr className="border-gray-100" />

        <Step number={8} title="填入 AI 小編客戶資料">
          <p>前往 <button onClick={() => router.push('/ai-editor')} className="text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors">AI 小編列表</button>，進入對應客戶的編輯頁，點「編輯」，填入以下四個欄位：</p>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold">
                <tr>
                  <th className="text-left px-4 py-2.5 w-40">欄位</th>
                  <th className="text-left px-4 py-2.5">填入內容</th>
                  <th className="text-left px-4 py-2.5">範例</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">IG User ID</td>
                  <td className="px-4 py-2.5">Step 6 取得的 17~18 位數字</td>
                  <td className="px-4 py-2.5 font-mono text-gray-500">17841451402248785</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">FB Page ID</td>
                  <td className="px-4 py-2.5">Step 5 取得的粉專 ID</td>
                  <td className="px-4 py-2.5 font-mono text-gray-500">123456789012345</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">Threads User ID</td>
                  <td className="px-4 py-2.5">與 IG User ID 相同</td>
                  <td className="px-4 py-2.5 font-mono text-gray-500">17841451402248785</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono font-semibold">Meta Access Token</td>
                  <td className="px-4 py-2.5">Step 4 複製的 EAA... token</td>
                  <td className="px-4 py-2.5 font-mono text-gray-500">EAAbe…（永不過期）</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>儲存後，n8n workflow 就會自動讀取這些資料來發文，不需要再手動填寫 token。</p>
        </Step>

      </div>

      {/* 常見問題 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">常見問題</h2>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold text-gray-800 mb-1">Token 顯示「Invalid OAuth access token」？</p>
            <p className="text-gray-600">通常是 token 格式錯誤（複製時多了空格或 <code className="bg-gray-100 px-1 rounded text-xs">{'&oq=...'}</code> 之類的內容）。請重新到 Business Manager 產生 token，複製時注意只取 <code className="bg-gray-100 px-1 rounded text-xs">EAA...</code> 到結尾的部分。</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">呼叫 API 時顯示「permission denied」？</p>
            <p className="text-gray-600">System User 缺少某個資產的存取權。回到 Step 3 確認 IG 帳號、FB 粉專、App 三者都有指派給 System User，且權限為完整控制。</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">找不到 instagram_business_account 欄位？</p>
            <p className="text-gray-600">IG 帳號必須是<strong>商業帳號或創作者帳號</strong>，且已在 FB 粉絲專頁設定中連結。個人帳號無法使用 Graph API 發文。</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">Token 多久後失效？</p>
            <p className="text-gray-600">在 Step 4 選「永不」到期的 System User Token 不會過期，除非你主動在 Business Manager 撤銷它。</p>
          </div>
        </div>
      </div>

      {/* 相關連結 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">相關工具連結</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {[
            { label: 'Meta Business Manager', href: 'https://business.facebook.com/settings' },
            { label: 'System User 管理', href: 'https://business.facebook.com/settings/system-users' },
            { label: 'Meta for Developers', href: 'https://developers.facebook.com/' },
            { label: 'Graph API Explorer', href: 'https://developers.facebook.com/tools/explorer/' },
            { label: 'IG Graph API 文件', href: 'https://developers.facebook.com/docs/instagram-api/guides/content-publishing' },
            { label: 'Threads API 文件', href: 'https://developers.facebook.com/docs/threads/posts' },
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
