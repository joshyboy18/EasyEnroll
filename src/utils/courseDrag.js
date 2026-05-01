/*
 * Course card drag: hide the native semi-transparent drag image (1×1 transparent),
 * and show a full-opacity “ghost” that follows the pointer during drag.
 */

// @type {null | (() => void)}
let activeCleanup = null

const TRANSPARENT_PX =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs="

/**
 * Attaches an opaque drag image to a course card during a drag operation.
 * @param {DragEvent} event
 * @param {{ id: string, title: string, credits: number, department?: string, professor?: string }} course
 */
export function attachOpaqueCourseDrag(event, course) {
  event.dataTransfer.setData("text/plain", course.id)
  event.dataTransfer.effectAllowed = "copy"

  // DOM element that started the drag; bail if it's not an HTMLElement
  const el = event.currentTarget
  if (!(el instanceof HTMLElement)) {
    return
  }
  if (activeCleanup) {
    activeCleanup()
    activeCleanup = null
  }

  // Attach a fully transparent drag image to suppress the native semi-transparent preview
  const img = new Image()
  img.src = TRANSPARENT_PX
  const go = () => {
    try {
      event.dataTransfer.setDragImage(img, 0, 0)
    } catch {
      // ignore
    }
  }
  if (img.complete) {
    go()
  } else {
    img.onload = go
  }

  // Compute pointer offset inside the element and clamp ghost dimensions
  const rect = el.getBoundingClientRect()
  const offX = Math.max(0, event.clientX - rect.left)
  const offY = Math.max(0, event.clientY - rect.top)
  const w = Math.max(1, Math.min(400, Math.round(rect.width)))
  const h = Math.max(1, Math.min(360, Math.round(rect.height)))

  // Create a floating ghost element to visually represent the dragged course card
  const ghost = document.createElement("div")
  ghost.className = "course-card course-card--drag-ghost"
  ghost.setAttribute("role", "presentation")
  ghost.setAttribute("aria-hidden", "true")
  const meta = [course.id, course.title, `${course.credits} cr`]
    .filter(Boolean)
    .join(" — ")
  ghost.innerHTML = `<div class="course-card--drag-ghost__inner"><strong>${escapeHtml(
    String(course.id),
  )}</strong><span>${escapeHtml(String(course.title || ""))}</span><small>${escapeHtml(meta)}</small></div>`

  // Position and style the ghost so it follows the pointer and appears above other content
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${w}px`,
    minHeight: `${h}px`,
    zIndex: "100000",
    pointerEvents: "none",
    margin: "0",
    boxSizing: "border-box",
    transform: `translate(${event.clientX - offX}px, ${event.clientY - offY}px)`,
  })
  document.body.appendChild(ghost)

  // Update ghost position while dragging based on pointer movements
  const onDrag = (e) => {
    if (!e.isTrusted) {
      return
    }
    ghost.style.transform = `translate(${e.clientX - offX}px, ${e.clientY - offY}px)`
  }

  // Cleanup handler: remove listeners and the ghost element
  const cleanup = () => {
    document.removeEventListener("drag", onDrag, true)
    el.removeEventListener("dragend", onEnd, true)
    if (ghost.parentNode) {
      ghost.remove()
    }
    if (activeCleanup === cleanup) {
      activeCleanup = null
    }
  }

  // Handler called when drag ends to run cleanup
  const onEnd = () => {
    cleanup()
  }

  // Wire listeners and keep a reference to the cleanup function for external cancelation
  document.addEventListener("drag", onDrag, true)
  el.addEventListener("dragend", onEnd, true)
  activeCleanup = cleanup
}

// Escape text before inserting into innerHTML to avoid HTML injection
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Public helper: forcibly stop any active drag ghost and cleanup listeners
export function endCourseCardDrag() {
  if (activeCleanup) {
    activeCleanup()
    activeCleanup = null
  }
}