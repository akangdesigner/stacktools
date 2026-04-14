const products = [
  // ── 在這裡新增產品 ──────────────────────────────────────────
  // {
  //   name: '產品名稱',
  //   description: '一段說明文字。',
  //   url: 'https://...',
  //   icon: '🛍',
  //   tag: '分類',   // 可省略
  //   color: 'bg-orange-50 border-orange-200 hover:border-orange-400',
  //   iconBg: 'bg-orange-100',
  // },
  // ────────────────────────────────────────────────────────────
  {
    name: '美妝競品監控台',
    description: '追蹤屈臣氏、康是美、寶雅各平台商品價格與庫存，支援降價警示與 LINE 通知。',
    url: 'https://productmonitor.zeabur.app',
    icon: '💄',
    tag: '監控',
    color: 'bg-pink-50 border-pink-200 hover:border-pink-400',
    iconBg: 'bg-pink-100',
  },
];

export default function ProductsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">外部產品</h1>
        <p className="text-gray-500 mt-1">我們對外提供的產品與服務</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {products.map((product) => (
          <a
            key={product.url}
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`block p-5 rounded-xl border-2 transition-all ${product.color}`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg ${product.iconBg} flex items-center justify-center text-xl shrink-0`}>
                {product.icon}
              </div>
              {product.tag && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/70 text-gray-500 border border-gray-200">
                  {product.tag}
                </span>
              )}
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">{product.name}</h2>
            <p className="text-sm text-gray-500 leading-relaxed">{product.description}</p>
            <p className="mt-3 text-xs text-gray-400">前往 ↗</p>
          </a>
        ))}
      </div>
    </div>
  );
}
