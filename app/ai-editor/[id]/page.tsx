'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { parseSocialAccount } from '@/lib/socialAccount';

interface AiEditorClient {
  id: number;
  name: string;
  site_url: string;
  social_account: string;  // 舊格式備份，新資料一律讀寫下面 6 個真欄位
  fb_user: string;
  fb_pass: string;
  th_user: string;
  th_pass: string;
  ig_user: string;
  ig_pass: string;
  line_uid: string;
  keywords: string;
  persona: string;
  client_info: string;
  recent_activities: string;
  fb_group_url: string;
  fb_page_id: string;
  meta_access_token: string;
  threads_access_token: string;
  ig_access_token: string;  // IG 專用 Token（無 FB 客戶走 Instagram Login API）
  // 金流
  billing_status: 'none' | 'pending' | 'active' | 'failed' | 'cancelled';
  billing_amount: number;
  card_last4: string;
  next_charge_date: string;
  last_charge_at: string;
}

export default function AiEditorClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<AiEditorClient | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFbUser, setEditFbUser] = useState('');
  const [editFbPass, setEditFbPass] = useState('');
  const [editThUser, setEditThUser] = useState('');
  const [editThPass, setEditThPass] = useState('');
  const [editIgUser, setEditIgUser] = useState('');
  const [editIgPass, setEditIgPass] = useState('');
  const [editLegacyRaw, setEditLegacyRaw] = useState('');
  const [editLineUid, setEditLineUid] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editPersona, setEditPersona] = useState('');
  const [editClientInfo, setEditClientInfo] = useState('');
  const [editRecentActivities, setEditRecentActivities] = useState('');
  const [editFbGroupUrl, setEditFbGroupUrl] = useState('');
  const [editFbPageId, setEditFbPageId] = useState('');
  const [editMetaAccessToken, setEditMetaAccessToken] = useState('');
  const [editThreadsAccessToken, setEditThreadsAccessToken] = useState('');
  const [editIgAccessToken, setEditIgAccessToken] = useState('');
  const [saving, setSaving] = useState(false);

  function loadClient() {
    fetch('/api/ai-editor/clients')
      .then(r => r.json())
      .then((list: AiEditorClient[]) => {
        const found = list.find(c => String(c.id) === id);
        setClient(found ?? null);
      });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadClient(); }, [id]);

  async function handleSave() {
    if (!client) return;
    setSaving(true);
    await fetch('/api/ai-editor/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: client.id, name: editName,
        fb_user: editFbUser, fb_pass: editFbPass,
        th_user: editThUser, th_pass: editThPass,
        ig_user: editIgUser, ig_pass: editIgPass,
        line_uid: editLineUid, keywords: editKeywords, persona: editPersona, client_info: editClientInfo, recent_activities: editRecentActivities, fb_group_url: editFbGroupUrl, fb_page_id: editFbPageId, meta_access_token: editMetaAccessToken, threads_access_token: editThreadsAccessToken, ig_access_token: editIgAccessToken,
      }),
    });
    setSaving(false);
    setEditing(false);
    loadClient();
  }

  async function handleDelete() {
    if (!client || !confirm('確定刪除此客戶？')) return;
    const res = await fetch('/api/ai-editor/clients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id }),
    });
    if (!res.ok) { alert('刪除失敗，請再試一次'); return; }
    window.location.href = '/ai-editor';
  }

  if (!client) return <div className="p-8 text-sm text-gray-400">載入中…</div>;


  return (
    <div className="p-8 space-y-6">
      {/* 麵包屑 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => router.push('/ai-editor')} className="hover:text-gray-700 transition-colors">AI 小編</button>
        <span>/</span>
        <span className="text-gray-700 font-medium">{client.name}</span>
      </div>

      {/* 客戶資訊 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        {/* 標題列 */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">{client.name}</h1>
          {!editing && (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const accounts = getAccounts(client);
                  setEditName(client.name);
                  setEditFbUser(accounts.fbUser); setEditFbPass(accounts.fbPass);
                  setEditThUser(accounts.thUser); setEditThPass(accounts.thPass);
                  setEditIgUser(accounts.igUser); setEditIgPass(accounts.igPass);
                  setEditLegacyRaw(accounts.legacyRaw);
                  setEditLineUid(client.line_uid); setEditKeywords(client.keywords ?? ''); setEditPersona(client.persona ?? ''); setEditClientInfo(client.client_info ?? ''); setEditRecentActivities(client.recent_activities ?? ''); setEditFbGroupUrl(client.fb_group_url ?? ''); setEditFbPageId(client.fb_page_id ?? ''); setEditMetaAccessToken(client.meta_access_token ?? ''); setEditThreadsAccessToken(client.threads_access_token ?? ''); setEditIgAccessToken(client.ig_access_token ?? ''); setEditing(true);
                }}
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
              >編輯</button>
              <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 transition-colors">刪除</button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <FieldCard label="客戶名稱" className="col-span-2">
              <AutoTextarea value={editName} onChange={e => setEditName(e.target.value)} placeholder="客戶名稱" className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="LINE UID">
              <AutoTextarea value={editLineUid} onChange={e => setEditLineUid(e.target.value)} placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="w-full bg-transparent text-xs font-mono text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="Facebook 帳號密碼">
              <div className="flex gap-2">
                <input value={editFbUser} onChange={e => setEditFbUser(e.target.value)} placeholder="帳號" className="w-1/2 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none placeholder:text-gray-300" />
                <input value={editFbPass} onChange={e => setEditFbPass(e.target.value)} placeholder="密碼" className="w-1/2 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none placeholder:text-gray-300" />
              </div>
            </FieldCard>
            <FieldCard label="Threads 帳號密碼">
              <div className="flex gap-2">
                <input value={editThUser} onChange={e => setEditThUser(e.target.value)} placeholder="帳號" className="w-1/2 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none placeholder:text-gray-300" />
                <input value={editThPass} onChange={e => setEditThPass(e.target.value)} placeholder="密碼" className="w-1/2 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none placeholder:text-gray-300" />
              </div>
            </FieldCard>
            <FieldCard label="Instagram 帳號密碼">
              <div className="flex gap-2">
                <input value={editIgUser} onChange={e => setEditIgUser(e.target.value)} placeholder="帳號" className="w-1/2 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none placeholder:text-gray-300" />
                <input value={editIgPass} onChange={e => setEditIgPass(e.target.value)} placeholder="密碼" className="w-1/2 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none placeholder:text-gray-300" />
              </div>
            </FieldCard>
            {editLegacyRaw && (
              <FieldCard label="舊格式原文（僅供對照，請自行拆填到上面 FB/Threads/IG 欄位後存檔即可轉正）" className="col-span-2">
                <p className="text-xs text-gray-700 whitespace-pre-line">{editLegacyRaw}</p>
              </FieldCard>
            )}
            <FieldCard label="產業關鍵字">
              <AutoTextarea value={editKeywords} onChange={e => setEditKeywords(e.target.value)} placeholder="植牙, 牙齒美白, 隱形矯正" className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="客戶資訊">
              <AutoTextarea value={editClientInfo} onChange={e => setEditClientInfo(e.target.value)} placeholder="台北植牙診所，目標受眾 30-50 歲上班族，主打無痛療程" className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="小編人設">
              <AutoTextarea value={editPersona} onChange={e => setEditPersona(e.target.value)} placeholder="溫暖親切的醫美診所小編，說話口吻輕鬆但專業" className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="近期活動" className="col-span-2">
              <AutoTextarea value={editRecentActivities} onChange={e => setEditRecentActivities(e.target.value)} placeholder={`5/10 母親節 8 折優惠\n5/20 院長健康講座（免費報名）`} className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="FB 公開社團網址" className="col-span-2">
              <AutoTextarea value={editFbGroupUrl} onChange={e => setEditFbGroupUrl(e.target.value)} placeholder="https://www.facebook.com/groups/xxxxxxxx" className="w-full bg-transparent text-xs font-mono text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="FB Page ID">
              <AutoTextarea value={editFbPageId} onChange={e => setEditFbPageId(e.target.value)} placeholder="123456789012345" className="w-full bg-transparent text-xs font-mono text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="Meta Access Token（永久）" className="col-span-2">
              <AutoTextarea value={editMetaAccessToken} onChange={e => setEditMetaAccessToken(e.target.value)} placeholder="EAAbe..." className="w-full bg-transparent text-xs font-mono text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="Threads Access Token" className="col-span-2">
              <AutoTextarea value={editThreadsAccessToken} onChange={e => setEditThreadsAccessToken(e.target.value)} placeholder="THAA..." className="w-full bg-transparent text-xs font-mono text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="IG 專用 Token（無 FB 客戶用）" className="col-span-2">
              <AutoTextarea value={editIgAccessToken} onChange={e => setEditIgAccessToken(e.target.value)} placeholder="IGAA..." className="w-full bg-transparent text-xs font-mono text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <div className="col-span-2 flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
                {saving ? '儲存中…' : '儲存'}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FieldCard label="LINE ID">
              {client.line_uid
                ? <span className="text-xs font-mono text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded">{client.line_uid}</span>
                : <span className="text-xs text-gray-300 italic">尚未設定</span>}
            </FieldCard>
            <FieldCard label="社群帳號" className="col-span-2">
              <SocialAccountView client={client} />
            </FieldCard>
            <FieldCard label="產業關鍵字">
              <p className="text-xs text-gray-700">{client.keywords || '—'}</p>
            </FieldCard>
            <FieldCard label="客戶資訊">
              <p className="text-xs text-gray-700 whitespace-pre-line">{client.client_info || '—'}</p>
            </FieldCard>
            <FieldCard label="小編人設">
              <p className="text-xs text-gray-700 whitespace-pre-line">{client.persona || '—'}</p>
            </FieldCard>
            <FieldCard label="近期活動" className="col-span-2">
              <p className="text-xs text-gray-700 whitespace-pre-line">{client.recent_activities || '—'}</p>
            </FieldCard>
            <FieldCard label="FB 公開社團網址" className="col-span-2">
              {client.fb_group_url
                ? <span className="text-xs font-mono text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded">{client.fb_group_url}</span>
                : <span className="text-xs text-gray-300 italic">尚未設定</span>}
            </FieldCard>
            <FieldCard label="FB Page ID">
              {client.fb_page_id
                ? <span className="text-xs font-mono text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded">{client.fb_page_id}</span>
                : <span className="text-xs text-gray-300 italic">尚未設定</span>}
            </FieldCard>
            <FieldCard label="Meta Access Token（永久）" className="col-span-2">
              {client.meta_access_token
                ? <span className="text-xs font-mono text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded truncate block max-w-full">{client.meta_access_token.slice(0, 20)}…</span>
                : <span className="text-xs text-gray-300 italic">尚未設定</span>}
            </FieldCard>
            <FieldCard label="Threads Access Token" className="col-span-2">
              {client.threads_access_token
                ? <span className="text-xs font-mono text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded truncate block max-w-full">{client.threads_access_token.slice(0, 20)}…</span>
                : <span className="text-xs text-gray-300 italic">尚未設定</span>}
            </FieldCard>
            <FieldCard label="IG 專用 Token（無 FB 客戶用）" className="col-span-2">
              {client.ig_access_token
                ? <span className="text-xs font-mono text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded truncate block max-w-full">{client.ig_access_token.slice(0, 20)}…</span>
                : <span className="text-xs text-gray-300 italic">尚未設定</span>}
            </FieldCard>
          </div>
        )}
      </div>

      {/* 自動扣款（綠界定期定額） */}
      <BillingSection client={client} />
    </div>
  );
}

// 金流區塊：給公司內部看狀態、產生要傳給客戶（在 LINE）的授權連結
function BillingSection({ client }: { client: AiEditorClient }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const link = origin ? `${origin}/api/ai-editor/billing/create?clientId=${client.id}` : '';
  const amount = client.billing_amount || 3000;

  const statusMap: Record<AiEditorClient['billing_status'], { label: string; cls: string }> = {
    none: { label: '未設定', cls: 'bg-gray-100 text-gray-500' },
    pending: { label: '待授權', cls: 'bg-amber-100 text-amber-700' },
    active: { label: '扣款中', cls: 'bg-green-100 text-green-700' },
    failed: { label: '扣款失敗', cls: 'bg-red-100 text-red-700' },
    cancelled: { label: '已取消', cls: 'bg-gray-100 text-gray-500' },
  };
  const status = statusMap[client.billing_status] ?? statusMap.none;

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-gray-900">自動扣款</h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
        <span className="ml-auto text-sm text-gray-500">每月 NT$ {amount.toLocaleString()}</span>
      </div>

      {/* 目前扣款資訊 */}
      <div className="grid grid-cols-3 gap-3">
        <FieldCard label="信用卡末四碼">
          {client.card_last4
            ? <span className="text-xs font-mono text-gray-800">**** {client.card_last4}</span>
            : <span className="text-xs text-gray-300 italic">—</span>}
        </FieldCard>
        <FieldCard label="最近扣款">
          {client.last_charge_at
            ? <span className="text-xs text-gray-700">{client.last_charge_at}</span>
            : <span className="text-xs text-gray-300 italic">—</span>}
        </FieldCard>
        <FieldCard label="下次扣款（估）">
          {client.next_charge_date
            ? <span className="text-xs text-gray-700">{client.next_charge_date}</span>
            : <span className="text-xs text-gray-300 italic">—</span>}
        </FieldCard>
      </div>

      {/* 授權連結：複製後貼到 LINE 傳給客戶 */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
        <p className="text-sm font-semibold text-gray-500">授權連結（複製後透過 LINE 傳給客戶）</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={link}
            onFocus={e => e.currentTarget.select()}
            className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs font-mono text-gray-700 focus:outline-none"
          />
          <button
            onClick={copyLink}
            className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors shrink-0"
          >
            {copied ? '已複製 ✓' : '複製'}
          </button>
        </div>
        <p className="text-xs text-gray-400">客戶點開連結 → 綠界刷卡授權一次 → 之後每月自動扣款。授權結果會自動回填此頁狀態。</p>
      </div>
    </div>
  );
}

// 帳號密碼一律以 fb_user/fb_pass/th_user/th_pass/ig_user/ig_pass 真欄位為準；
// 只有這 6 欄全空、social_account 還留著舊資料時，才暫時解析舊格式給顯示用。
function getAccounts(client: AiEditorClient) {
  const hasRealColumns = client.fb_user || client.fb_pass || client.th_user || client.th_pass || client.ig_user || client.ig_pass;
  if (hasRealColumns) {
    return { fbUser: client.fb_user, fbPass: client.fb_pass, thUser: client.th_user, thPass: client.th_pass, igUser: client.ig_user, igPass: client.ig_pass, legacyRaw: '' };
  }
  return parseSocialAccount(client.social_account ?? '');
}

function SocialAccountView({ client }: { client: AiEditorClient }) {
  const accounts = getAccounts(client);
  if (accounts.legacyRaw) {
    return <p className="text-xs text-gray-700 whitespace-pre-line">{accounts.legacyRaw}</p>;
  }
  const rows: { label: string; user: string; pass: string }[] = [
    { label: 'Facebook', user: accounts.fbUser, pass: accounts.fbPass },
    { label: 'Threads', user: accounts.thUser, pass: accounts.thPass },
    { label: 'Instagram', user: accounts.igUser, pass: accounts.igPass },
  ].filter(r => r.user || r.pass);
  if (rows.length === 0) return <p className="text-xs text-gray-300 italic">—</p>;
  return (
    <div className="space-y-1">
      {rows.map(r => (
        <p key={r.label} className="text-xs text-gray-700">
          <span className="font-medium text-gray-500">{r.label}：</span>{r.user || '—'} / {r.pass || '—'}
        </p>
      ))}
    </div>
  );
}

function FieldCard({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5 ${className ?? ''}`}>
      <p className="text-sm font-semibold text-gray-500">{label}</p>
      {children}
    </div>
  );
}

function AutoTextarea({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = ref.current.scrollHeight + 'px';
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={1}
      className={className}
      style={{ overflow: 'hidden' }}
    />
  );
}
