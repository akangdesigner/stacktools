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

  const [form, setForm] = useState<FormData>(() =>
    initial ? toFormData(initial) : toFormData(createDefaultClient(""))
  );
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
          <ColorPicker label="H3 顏色" value={form.h3Color} onChange={(v) => set("h3Color", v)} />
          <SizeInput label="H3 大小" value={form.h3FontSize} onChange={(v) => set("h3FontSize", v)} />
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

      {/* Button */}
      <section>
        <p className="text-sm font-semibold text-gray-800 mb-3 pb-1 border-b border-gray-100">按鈕（CTA）樣式</p>
        <div className="space-y-3">
          <ColorPicker label="按鈕背景色" value={form.buttonBgColor} onChange={(v) => set("buttonBgColor", v)} />
          <ColorPicker label="按鈕文字色" value={form.buttonTextColor} onChange={(v) => set("buttonTextColor", v)} />
          <label className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0">圓角</span>
            <input
              type="text"
              value={form.buttonBorderRadius}
              onChange={(e) => set("buttonBorderRadius", e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0">內距</span>
            <input
              type="text"
              value={form.buttonPadding}
              onChange={(e) => set("buttonPadding", e.target.value)}
              className="w-36 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <div className="mt-2">
            <p className="text-xs text-gray-400 mb-1">預覽</p>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              style={{
                backgroundColor: form.buttonBgColor,
                color: form.buttonTextColor,
                padding: form.buttonPadding,
                borderRadius: form.buttonBorderRadius,
                textDecoration: "none",
                fontWeight: "bold",
                display: "inline-block",
                fontSize: 14,
              }}
            >
              立即購買
            </a>
          </div>
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
          <label className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-32 shrink-0">斜體轉色</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.emColor}
                onChange={(e) => set("emColor", e.target.checked ? "#ff0000" : "")}
                className="w-4 h-4 rounded accent-blue-600"
              />
              {form.emColor && (
                <ColorPicker label="" value={form.emColor} onChange={(v) => set("emColor", v)} />
              )}
              {!form.emColor && <span className="text-xs text-gray-400">將 &lt;em&gt; 轉為指定顏色（關閉=保留原樣）</span>}
            </div>
          </label>
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
            <label className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-32 shrink-0">目錄標題</span>
              <input
                type="text"
                value={form.tocTitle}
                onChange={(e) => set("tocTitle", e.target.value)}
                className="w-36 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          )}
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm text-gray-600 w-32 shrink-0">去重列表項</span>
            <input
              type="checkbox"
              checked={form.deduplicateLi}
              onChange={(e) => set("deduplicateLi", e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-xs text-gray-400">移除重複的 &lt;li&gt; 項目</span>
          </label>
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
