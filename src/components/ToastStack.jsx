// Small toast notification system (hook + container) for transient app messages
import { useCallback, useRef, useState } from "react"

const DURATION_MS = 4500

/**
 * A hook for managing toasts.
 * @returns {object} toasts, pushToast(type, message, action?), dismiss, ToastContainer
 */
export function useToast() {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  // Dismiss a toast and clear any associated timer
  const dismiss = useCallback((id) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  // Push a new toast and schedule automatic dismissal
  const pushToast = useCallback(
    (type, message, action) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setToasts((prev) => [
        ...prev,
        {
          id,
          type,
          message,
          actionLabel: action?.label,
          onAction: action?.onAction,
        },
      ])
      const handle = setTimeout(() => {
        dismiss(id)
      }, DURATION_MS)
      timers.current.set(id, handle)
    },
    [dismiss],
  )

  // Component: renders active toasts; returned by the hook as ToastContainer
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
            {t.actionLabel && t.onAction && (
              <button
                className="btn btn--subtle toast__action"
                type="button"
                onClick={() => {
                  t.onAction()
                  dismiss(t.id)
                }}
              >
                {t.actionLabel}
              </button>
            )}
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