'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

export default function ChatBot() {
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.error || '發生錯誤' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '連線失敗，請稍後再試' }]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-5 z-50 flex flex-col items-end gap-3">
      {/* 聊天面板 */}
      {showChat && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ height: '420px' }}>
          {/* 標題列 */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-900 text-white shrink-0">
            <img src="/robot.svg" alt="小棧" className="w-7 h-7 rounded-full object-cover shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold leading-none">小棧</p>
              <p className="text-xs text-gray-400 mt-0.5">工具箱小幫手</p>
            </div>
            <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white transition-colors p-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* 訊息區 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div className="flex gap-2 items-start">
              <img src="/robot.svg" alt="小棧" className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-700 max-w-[220px]">
                嗨！我是小棧，有任何關於工具箱的問題都可以問我 😊
              </div>
            </div>

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'assistant' && (
                  <img src="/robot.svg" alt="小棧" className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
                )}
                <div className={`rounded-2xl px-3 py-2 text-sm max-w-[220px] whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-gray-900 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-700 rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="flex gap-2 items-start">
                <img src="/robot.svg" alt="小棧" className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 輸入列 */}
          <form onSubmit={sendMessage} className="px-3 py-2.5 border-t border-gray-100 flex gap-2 shrink-0">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="輸入問題..."
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatLoading}
              className="w-8 h-8 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-700 disabled:opacity-40 transition-colors shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* 機器人按鈕 */}
      <button
        onClick={() => setShowChat(v => !v)}
        className="w-14 h-14 rounded-full shadow-xl hover:scale-105 transition-transform overflow-hidden border-2 border-white"
        title="工具箱小幫手"
      >
        <img src="/robot.svg" alt="小棧" className="w-full h-full object-cover" />
      </button>
    </div>
  );
}
