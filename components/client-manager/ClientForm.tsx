"use client";

import { useState } from "react";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { useClients } from "@/hooks/useClients";
import { createDefaultClient } from "@/lib/client-defaults";
import type { ClientProfile } from "@/types";

interface ClientFormProps {
  initial?: ClientProfile;
  onDone: () => void;
  onCancel: () => void;
}

type FormData = Omit<ClientProfile, "id" | "name" | "createdAt" | "updatedAt">;

function toFormData(p: ClientProfile): FormData {
  const { id, name: _name, createdAt, updatedAt, ...rest } = p;
  void id; void _name; void createdAt; void updatedAt;
  return rest;
}

function SizeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const num = value.replace("px", "");
  return (
    <label className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-32 shrink-0">{label}</span>
      <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
        <input
          type="number"
          value={num}
          min={8}
          max={128}
          onChange={(e) => onChange(`${e.target.value}px`)}
          className="w-16 px-3 py-1.5 text-sm text-center bg-white focus:outline-none"
        />
        <span className="px-2 py-1.5 bg-gray-100 text-gray-500 text-sm border-l border-gray-300">px</span>
      </div>
    </label>
  );
}

export function ClientForm({ initial, onDone, onCancel }: ClientFormProps) {
  const { upsertClient } = useClients();
  const isEdit = !!initial;

  const [form, setForm] = useState<FormData>(() => {
    const defaults = toFormData(createDefaultClient(""));
    return initial ? { ...defaults, ...toFormData(initial) } : defaults;
  });
  const [name, setName] = useState(initial?.name ?? "");
  const [nameError, setNameError] = useState("");

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    if (!name.trim()) {
      setNameError("請輸入客戶名稱");
      return;
    }
    const now = new Date().toISOString();
    const profile: ClientProfile = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      ...form,
    };
    upsertClient(profile);
    onDone();
  }

  return (
    <div className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">客戶名稱</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError(""); }}
          placeholder="例如：ABC 電商"
          className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            nameError ? "border-red-400 bg-red-50" : "border-gray-300"
          }`}
        />
        {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
      </div>

      {/* Headings */}
      <section>
        <p className="text-sm font-semibold text-gray-800 mb-3 pb-1 border-b border-gray-100">標題樣式</p>
        <div className="space-y-3">
          <ColorPicker label="H2 顏色" value={form.h2Color} onChange={(v) => set("h2Color", v)} />
          <SizeInput label="H2 大小" value={form.h2FontSize} onChange={(v) => set("h2FontSize", v)} />
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm text-gray-600 w-32 shrink-0">H2 粗體</span>
            <input type="checkbox" checked={form.h2Bold ?? true} onChange={(e) => set("h2Bold", e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
          </label>
          <ColorPicker label="H3 顏色" value={form.h3Color} onChange={(v) => set("h3Color", v)} />
          <SizeInput label="H3 大小" value={form.h3FontSize} onChange={(v) => set("h3FontSize", v)} />
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm text-gray-600 w-32 shrink-0">H3 粗體</span>
            <input type="checkbox" checked={form.h3Bold ?? true} onChange={(e) => set("h3Bold", e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm text-gray-600 w-32 shrink-0">FAQ 模式</span>
            <input type="checkbox" checked={form.faqEnabled ?? false} onChange={(e) => set("faqEnabled", e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
            <span className="text-xs text-gray-400">套用於含「FAQ」的 H2 之後的 H3</span>
          </label>
          {form.faqEnabled && (
            <>
              <ColorPicker label="FAQ H3 顏色" value={form.faqH3Color || form.h3Color} onChange={(v) => set("faqH3Color", v)} />
              <SizeInput label="FAQ H3 大小" value={form.faqH3FontSize || form.h3FontSize} onChange={(v) => set("faqH3FontSize", v)} />
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-sm text-gray-600 w-32 shrink-0">FAQ H3 粗體</span>
                <input type="checkbox" checked={form.faqH3Bold ?? true} onChange={(e) => set("faqH3Bold", e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-sm text-gray-600 w-32 shrink-0">加 Q 前綴</span>
                <input type="checkbox" checked={form.faqLabelEnabled ?? false} onChange={(e) => set("faqLabelEnabled", e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-xs text-gray-400">H3 自動加 Q1：Q2：</span>
              </label>
              {form.faqLabelEnabled && (
                <>
                  <ColorPicker label="Q 標籤顏色" value={form.faqLabelColor || form.faqH3Color || form.h3Color} onChange={(v) => set("faqLabelColor", v)} />
                  <SizeInput label="Q 標籤大小" value={form.faqLabelFontSize || form.faqH3FontSize || form.h3FontSize} onChange={(v) => set("faqLabelFontSize", v)} />
                </>
              )}
            </>
          )}
        </div>
      </section>

      {/* Paragraph */}
      <section>
        <p className="text-sm font-semibold text-gray-800 mb-3 pb-1 border-b border-gray-100">段落與列表</p>
        <div className="space-y-3">
          <ColorPicker label="段落顏色" value={form.paragraphColor} onChange={(v) => set("paragraphColor", v)} />
          <SizeInput label="段落大小" value={form.paragraphFontSize} onChange={(v) => set("paragraphFontSize", v)} />
          <label className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0">行高</span>
            <input
              type="number"
              step="0.1"
              min="1"
              max="3"
              value={form.paragraphLineHeight}
              onChange={(e) => set("paragraphLineHeight", e.target.value)}
              className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <ColorPicker label="列表顏色" value={form.listItemColor} onChange={(v) => set("listItemColor", v)} />
          <SizeInput label="列表大小" value={form.listItemFontSize} onChange={(v) => set("listItemFontSize", v)} />
        </div>
      </section>

      {/* Links */}
      <section>
        <p className="text-sm font-semibold text-gray-800 mb-3 pb-1 border-b border-gray-100">連結樣式</p>
        <div className="space-y-3">
          <ColorPicker label="連結顏色" value={form.linkColor} onChange={(v) => set("linkColor", v)} />
          <label className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0">底線</span>
            <select
              value={form.linkTextDecoration}
              onChange={(e) => set("linkTextDecoration", e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">無底線</option>
              <option value="underline">有底線</option>
            </select>
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0">字重</span>
            <select
              value={form.linkFontWeight}
              onChange={(e) => set("linkFontWeight", e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="400">一般</option>
              <option value="bold">粗體</option>
            </select>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm text-gray-600 w-32 shrink-0">移除連結粗體</span>
            <input
              type="checkbox"
              checked={form.stripLinkBold}
              onChange={(e) => set("stripLinkBold", e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-xs text-gray-400">移除連結內的 &lt;strong&gt;/&lt;b&gt;</span>
          </label>
        </div>
      </section>

      {/* CTA Links */}
      <section>
        <p className="text-sm font-semibold text-gray-800 mb-3 pb-1 border-b border-gray-100">CTA 文字連結</p>
        <div className="space-y-2">
          {(form.ctaLinks ?? []).map((cta, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="連結文字"
                value={cta.text}
                onChange={(e) => {
                  const updated = [...(form.ctaLinks ?? [])];
                  updated[idx] = { ...updated[idx], text: e.target.value };
                  set("ctaLinks", updated);
                }}
                className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="https://..."
                value={cta.url}
                onChange={(e) => {
                  const updated = [...(form.ctaLinks ?? [])];
                  updated[idx] = { ...updated[idx], url: e.target.value };
                  set("ctaLinks", updated);
                }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => set("ctaLinks", (form.ctaLinks ?? []).filter((_, i) => i !== idx))}
                className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("ctaLinks", [...(form.ctaLinks ?? []), { text: "", url: "" }])}
            className="mt-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            ＋ 新增連結
          </button>
          <p className="text-xs text-gray-400">有填寫的連結會附加在文章末尾</p>
        </div>
      </section>

      {/* Images */}
      <section>
        <p className="text-sm font-semibold text-gray-800 mb-3 pb-1 border-b border-gray-100">圖片樣式</p>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0">最大寬度</span>
            <input
              type="text"
              value={form.imageMaxWidth}
              onChange={(e) => set("imageMaxWidth", e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0">圓角</span>
            <input
              type="text"
              value={form.imageBorderRadius}
              onChange={(e) => set("imageBorderRadius", e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
      </section>

      {/* Extra transformations */}
      <section>
        <p className="text-sm font-semibold text-gray-800 mb-3 pb-1 border-b border-gray-100">進階轉換</p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0">斜體轉換</span>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={form.emBold ? "bold" : form.emColor ? "color" : "off"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "bold")  { set("emBold", true);  set("emColor", ""); }
                  if (v === "color") { set("emBold", false); set("emColor", form.emColor || "#ff0000"); }
                  if (v === "off")   { set("emBold", false); set("emColor", ""); }
                }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="off">關閉（保留斜體）</option>
                <option value="color">轉色</option>
                <option value="bold">轉粗體（黑色不變）</option>
              </select>
              {!form.emBold && form.emColor && (
                <ColorPicker label="" value={form.emColor} onChange={(v) => set("emColor", v)} />
              )}
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm text-gray-600 w-32 shrink-0">生成目錄</span>
            <input
              type="checkbox"
              checked={form.generateToc}
              onChange={(e) => set("generateToc", e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-xs text-gray-400">自動從 H2 生成文章目錄</span>
          </label>
          {form.generateToc && (
            <>
              <label className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-32 shrink-0">目錄標題</span>
                <input
                  type="text"
                  value={form.tocTitle}
                  onChange={(e) => set("tocTitle", e.target.value)}
                  className="w-36 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-32 shrink-0">目錄背景色</span>
                <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!form.tocBgColor}
                    onChange={(e) => {
                      if (e.target.checked) {
                        set("tocBgColor", "");
                        set("tocBgOpacity", 100);
                      } else {
                        set("tocBgColor", "#f9f9f9");
                      }
                    }}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  透明
                </label>
                {form.tocBgColor && (
                  <ColorPicker label="" value={form.tocBgColor} onChange={(v) => set("tocBgColor", v)} />
                )}
              </div>
              {form.tocBgColor && (
                <label className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-32 shrink-0">背景透明度</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={form.tocBgOpacity ?? 100}
                    onChange={(e) => set("tocBgOpacity", Number(e.target.value))}
                    className="w-44"
                  />
                  <span className="text-sm text-gray-500 w-12">{form.tocBgOpacity ?? 100}%</span>
                </label>
              )}
            </>
          )}
          <div className="flex items-start gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0 pt-2">文章網址前綴</span>
            <div className="flex-1 space-y-1">
              <input
                type="url"
                value={form.blogBaseUrl}
                onChange={(e) => set("blogBaseUrl", e.target.value)}
                placeholder="https://www.tantanwow.com/blog/posts/"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400">上架時只需填入文章 slug，系統自動補全目錄連結網址</p>
            </div>
          </div>
        </div>
      </section>

      {/* Special notes */}
      <section>
        <p className="text-sm font-semibold text-gray-800 mb-3 pb-1 border-b border-gray-100">特殊設定</p>
        <div className="space-y-1.5">
          <textarea
            value={form.specialNotes}
            onChange={(e) => set("specialNotes", e.target.value)}
            rows={3}
            placeholder="例：購買按鈕需手動替換連結、第三段需插入圖片…&#10;每行一條，完成後顯示於結果頁提醒"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white placeholder-gray-400 resize-none"
          />
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          {isEdit ? "儲存變更" : "新增客戶"}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
