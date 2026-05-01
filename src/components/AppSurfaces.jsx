/*
 * Contains the main application surfaces
 */

import { useEffect, useRef, useState } from "react"
import easyEnrollLoginLogo from "../../EasyEnroll.png"
import { mockUsers } from "../data/mockUsers"

// Display a time conflict card for planning results and warnings
export function PlanningConflictCard({ conflict, courses }) {
  if (conflict.type === "course") {
    const ca = courses.find((c) => c.id === conflict.a)
    const cb = courses.find((c) => c.id === conflict.b)
    return (
      <article
        className="planning-conflict-card planning-conflict-card--course"
        aria-label={`Time overlap: ${conflict.a} and ${conflict.b}`}
      >
        <span className="planning-conflict-card__kind">Class vs class</span>
        <div className="planning-conflict-card__pair">
          <div className="planning-conflict-card__side">
            <span className="planning-conflict-card__code">{conflict.a}</span>
            <span className="planning-conflict-card__title">{ca?.title ?? ""}</span>
          </div>
          <span className="planning-conflict-card__vs" aria-hidden="true">
            overlaps
          </span>
          <div className="planning-conflict-card__side">
            <span className="planning-conflict-card__code">{conflict.b}</span>
            <span className="planning-conflict-card__title">{cb?.title ?? ""}</span>
          </div>
        </div>
      </article>
    )
  }
  const ca = courses.find((c) => c.id === conflict.a)
  return (
    <article
      className="planning-conflict-card planning-conflict-card--event"
      aria-label={`Time overlap: ${conflict.a} with event ${conflict.bTitle || conflict.b}`}
    >
      <span className="planning-conflict-card__kind">Class vs event</span>
      <div className="planning-conflict-card__pair planning-conflict-card__pair--event">
        <div className="planning-conflict-card__side">
          <span className="planning-conflict-card__code">{conflict.a}</span>
          <span className="planning-conflict-card__title">{ca?.title ?? ""}</span>
        </div>
        <span className="planning-conflict-card__vs" aria-hidden="true">
          overlaps
        </span>
        <div className="planning-conflict-card__side planning-conflict-card__side--event">
          <span className="planning-conflict-card__code planning-conflict-card__code--event">
            {conflict.bTitle || conflict.b}
          </span>
          <span className="planning-conflict-card__meta">Personal weekly event</span>
        </div>
      </div>
    </article>
  )
}

// Guided tour overlay with spotlight highlighting and repositioning tooltip
export function TourOverlay({ step, stepIndex, totalSteps, onNext, onPrev, onClose }) {
  const [targetRect, setTargetRect] = useState(null)
  const [tooltipPos, setTooltipPos] = useState(() => ({
    top: typeof window !== "undefined" ? Math.max(80, window.innerHeight * 0.28) : 80,
    left: typeof window !== "undefined" ? Math.max(24, window.innerWidth * 0.5 - 160) : 24,
    placement: "center",
  }))
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (!step) {
      return
    }
    let activeTarget = null
    let rafId = 0
    let observer = null
    let released = false
    let stopListening = () => {}

    const rectChanged = (a, b) => {
      if (!a || !b) {
        return true
      }
      const threshold = 1
      return (
        Math.abs(a.top - b.top) > threshold ||
        Math.abs(a.left - b.left) > threshold ||
        Math.abs(a.width - b.width) > threshold ||
        Math.abs(a.height - b.height) > threshold
      )
    }

    const setRectIfChanged = (nextRect) => {
      if (!nextRect || nextRect.width < 6 || nextRect.height < 6) {
        return
      }
      setTargetRect((prev) => {
        return rectChanged(prev, nextRect) ? nextRect : prev
      })
    }

    const bindTarget = (target) => {
      activeTarget = target
      const update = () => {
        if (!activeTarget) {
          return
        }
        setRectIfChanged(activeTarget.getBoundingClientRect())
      }
      update()
      if (typeof target.scrollIntoView === "function") {
        // Use instant scroll for tour targeting so overlay moves once to final position.
        target.scrollIntoView({ behavior: "auto", block: "center", inline: "center" })
      }
      window.addEventListener("resize", update)
      window.addEventListener("scroll", update, true)
      stopListening = () => {
        window.removeEventListener("resize", update)
        window.removeEventListener("scroll", update, true)
      }
    }

    const resolveTarget = () => {
      const nextTarget = document.querySelector(step.target)
      if (!nextTarget) {
        return false
      }
      if (nextTarget !== activeTarget) {
        stopListening()
        bindTarget(nextTarget)
      } else {
        setRectIfChanged(nextTarget.getBoundingClientRect())
      }
      return true
    }

    const startedAt = performance.now()
    const pollForTarget = () => {
      if (released) {
        return
      }
      if (resolveTarget()) {
        return
      }
      if (performance.now() - startedAt > 1400) {
        return
      }
      rafId = window.requestAnimationFrame(pollForTarget)
    }

    if (!resolveTarget()) {
      rafId = window.requestAnimationFrame(pollForTarget)
      observer = new MutationObserver(() => {
        resolveTarget()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      released = true
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      if (observer) {
        observer.disconnect()
      }
      stopListening()
    }
  }, [step])

  useEffect(() => {
    const tooltip = tooltipRef.current
    if (!tooltip) {
      return
    }
    if (!targetRect) {
      return
    }
    const tooltipRect = tooltip.getBoundingClientRect()
    const spacing = 16
    const vw = window.innerWidth
    const vh = window.innerHeight
    const preferred = step?.placement || "bottom"

    const fits = {
      top: targetRect.top >= tooltipRect.height + spacing,
      bottom: vh - targetRect.bottom >= tooltipRect.height + spacing,
      left: targetRect.left >= tooltipRect.width + spacing,
      right: vw - targetRect.right >= tooltipRect.width + spacing,
    }

    const available = {
      top: targetRect.top,
      bottom: vh - targetRect.bottom,
      left: targetRect.left,
      right: vw - targetRect.right,
    }

    let placement = preferred
    if (!fits[placement]) {
      const ordered = ["bottom", "right", "left", "top"]
      placement = ordered.find((p) => fits[p]) || ordered.sort((a, b) => available[b] - available[a])[0]
    }

    let top = targetRect.bottom + spacing
    let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2

    if (placement === "top") {
      top = targetRect.top - spacing - tooltipRect.height
    }
    if (placement === "left") {
      left = targetRect.left - spacing - tooltipRect.width
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2
    }
    if (placement === "right") {
      left = targetRect.right + spacing
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2
    }

    top = Math.min(Math.max(top, spacing), vh - tooltipRect.height - spacing)
    left = Math.min(Math.max(left, spacing), vw - tooltipRect.width - spacing)
    setTooltipPos({ top, left, placement })
  }, [step, targetRect])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  if (!step) {
    return null
  }

  const progress = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 0
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0
  const spotlightRect = targetRect
    ? {
        top: Math.max(0, targetRect.top - 8),
        left: Math.max(0, targetRect.left - 8),
        width: Math.max(0, targetRect.width + 16),
        height: Math.max(0, targetRect.height + 16),
      }
    : null

  const overlayMasks = spotlightRect
    ? [
        { top: 0, left: 0, width: viewportWidth, height: spotlightRect.top },
        { top: spotlightRect.top, left: 0, width: spotlightRect.left, height: spotlightRect.height },
        {
          top: spotlightRect.top,
          left: spotlightRect.left + spotlightRect.width,
          width: Math.max(0, viewportWidth - (spotlightRect.left + spotlightRect.width)),
          height: spotlightRect.height,
        },
        {
          top: spotlightRect.top + spotlightRect.height,
          left: 0,
          width: viewportWidth,
          height: Math.max(0, viewportHeight - (spotlightRect.top + spotlightRect.height)),
        },
      ]
    : [{ top: 0, left: 0, width: viewportWidth, height: viewportHeight }]

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label={step.title}>
      {overlayMasks.map((mask, index) => (
        <div
          key={`mask-${index}`}
          className="tour-overlay__mask"
          style={{ top: mask.top, left: mask.left, width: mask.width, height: mask.height }}
        />
      ))}
      {spotlightRect && <div className="tour-highlight" style={spotlightRect} />}
      <div
        ref={tooltipRef}
        className={`tour-tooltip tour-tooltip--${tooltipPos.placement}`}
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div className="tour-progress">
          <div className="tour-progress__header">
            <span>
              Step {stepIndex + 1} of {totalSteps}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="tour-progress__bar" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
        <h3 className="tour-tooltip__title">{step.title}</h3>
        <p className="tour-tooltip__body">{step.body}</p>
        <div className="tour-tooltip__actions">
          <button className="btn btn--subtle" type="button" onClick={onClose}>
            Skip tour
          </button>
          <div className="tour-tooltip__nav">
            <button className="btn btn--subtle" type="button" onClick={onPrev} disabled={stepIndex === 0}>
              Back
            </button>
            <button className="btn btn--primary" type="button" onClick={onNext}>
              {stepIndex + 1 === totalSteps ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Small reusable help panel for Settings shortcuts and usage tips
export function HelpTipsList() {
  return (
    <ul className="help-tips">
      <li>
        Open <strong>Settings</strong> for this list anytime; the right column is dedicated to keyboard and tips.
      </li>
      <li>
        Press <kbd>Esc</kbd> to close any dialog, including course details and import summary.
      </li>
      <li>
        Use the top navigation: <strong>Enrollment</strong> to search and enroll, <strong>Planning</strong> to try
        alternate course sets, <strong>Settings</strong> for the calendar view and high contrast.
      </li>
      <li>
        Download a <strong>week</strong> file (Enrollment → weekly calendar) to check your plan on a phone or desktop
        calendar app.
      </li>
    </ul>
  )
}

// Accessible modal shell with focus trapping and restore-on-close behavior
export function Modal({ title, children, onClose, actions }) {
  const panelRef = useRef(null)
  const prevActiveRef = useRef(null)

  useEffect(() => {
    prevActiveRef.current = document.activeElement
    const root = panelRef.current
    const t = setTimeout(() => {
      if (!root) {
        return
      }
      const first = root.querySelector(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (first instanceof HTMLElement) {
        first.focus()
      }
    }, 0)

    const onKey = (e) => {
      if (e.key !== "Tab" || !root) {
        return
      }
      const list = [
        ...root.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null)
      if (list.length === 0) {
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKey, true)
    return () => {
      clearTimeout(t)
      document.removeEventListener("keydown", onKey, true)
      if (typeof prevActiveRef.current?.focus === "function") {
        prevActiveRef.current.focus()
      }
    }
  }, [title])

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h3>{title}</h3>
          <button className="btn btn--subtle" type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {actions && <footer className="modal__actions">{actions}</footer>}
      </section>
    </div>
  )
}

// Mock login page that lets users pick one of the seeded demo accounts
export function LoginPage({ ssoUserId, setSsoUserId, onSsoLogin, error }) {
  return (
    <main className="login-page">
      <section className="login-card">
        <img className="login-logo" src={easyEnrollLoginLogo} alt="Easy Enroll" />
        <p align="center" style={{ color: "#333", fontSize: "1.25em", margin: "0em 0em 0em 0em", fontWeight: "bold" }}>
          Welcome!
        </p>
        <label>
          <p align="center" style={{ color: "#949494", fontStyle: "italic", margin: "0em 0em 3em 0em" }}>
            Login to Your University Account to Enroll
          </p>
          <select value={ssoUserId} onChange={(event) => setSsoUserId(event.target.value)}>
            {mockUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--primary" type="button" onClick={onSsoLogin}>
          Sign In With University SSO
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  )
}