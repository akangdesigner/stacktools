"use client";

interface Step2PasteHtmlProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}

export function Step2PasteHtml({ value, onChange, error }: Step2PasteHtmlProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">步驟三：貼入原始 HTML</h2>
        <p className="text-gray-500 text-sm">將剛才從 Console 複製的 HTML 貼到下方的文字框</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-gray-700">原始 HTML</label>
          <span className={`text-xs ${value.length > 400000 ? "text-red-500" : "text-gray-400"}`}>
            {value.length.toLocaleString()} / 500,000 字元
          </span>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="請貼上從 Console 複製的 HTML 代碼..."
          rows={14}
          className={`w-full font-mono text-xs rounded-xl border px-4 py-3 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors ${
            error ? "border-red-400 bg-red-50" : "border-gray-300"
          }`}
        />
        {error && (
          <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
      </div>

      {value && !error && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          已偵測到 HTML 內容，可以繼續下一步
        </div>
      )}
    </div>
  );
}
