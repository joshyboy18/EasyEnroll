import { useCallback, useRef, useState } from "react"

const DURATION_MS = 4500

/**
 * @returns {{ toasts: {id: string, type: 'success' | 'error', message: string}[], pushToast: (type: 'success' | 'error', message: string) => void, dismiss: (id: string) => void, ToastContainer: () => JSX.Element }}
 */
export function useToast() {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const pushToast = useCallback(
    (type, message) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setToasts((prev) => [...prev, { id, type, message }])
      const handle = setTimeout(() => {
        dismiss(id)
      }, DURATION_MS)
      timers.current.set(id, handle)
    },
    [dismiss],
  )

  const ToastContainer = useCallback(() => {
    return (
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.type}`}
            role="status"
          >
            <span className="toast__text">{t.message}</span>
            <button
              className="toast__close"
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    )
  }, [dismiss, toasts])

  return { toasts, pushToast, dismiss, ToastContainer }
}
