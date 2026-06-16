'use client';

export default function ScrollToTodayButton() {
  return (
    <button
      onClick={() => document.getElementById('today')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className="px-3 py-1.5 rounded-lg border border-blue-200 text-sm text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
    >
      跳至今天
    </button>
  );
}
