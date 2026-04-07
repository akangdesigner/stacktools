import { useState, useCallback } from 'react'

export function useToast() {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((msg, type = 'info', duration = 4000) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
    }, duration)
  }, [])

  return { toasts, toast }
}

export function ToastContainer({ toasts }) {
  return (
    <div id="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}${t.removing ? ' removing' : ''}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
