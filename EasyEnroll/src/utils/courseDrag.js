/**
 * Custom drag image for course cards. DOM-based setDragImage() is still drawn with reduced
 * opacity in many browsers. A solid canvas (2D, no alpha) reads as a normal bitmap to the
 * drag pipeline and typically stays full-strength.
 */

/** @type {HTMLCanvasElement | null} Remains in DOM only until drag ends (or is replaced by next drag). */
let activeDragNode = null

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y0
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @returns {number} bottom y of last line
 */
function drawWrappedText(ctx, text, x, y0, maxWidth, lineHeight) {
  if (!text) {
    return y0
  }
  const words = String(text).split(/\s+/).filter(Boolean)
  let y = y0
  let line = ""
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth) {
      if (line) {
        ctx.fillText(line, x, y)
        y += lineHeight
        line = word
      } else {
        ctx.fillText(word, x, y)
        y += lineHeight
        line = ""
      }
    } else {
      line = test
    }
  }
  if (line) {
    ctx.fillText(line, x, y)
    y += lineHeight
  }
  return y
}

/**
 * @param {DragEvent} event
 * @param {{ id: string, title: string, credits: number, department?: string, professor?: string }} course
 */
export function attachOpaqueCourseDrag(event, course) {
  event.dataTransfer.setData("text/plain", course.id)
  event.dataTransfer.effectAllowed = "copy"
  const el = event.currentTarget
  if (!(el instanceof HTMLElement)) {
    return
  }

  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) {
    return
  }

  const maxW = 400
  const maxH = 360
  const w = Math.max(1, Math.min(maxW, Math.round(rect.width)))
  const h = Math.max(1, Math.min(maxH, Math.round(rect.height)))
  const sx = w / rect.width
  const sy = h / rect.height

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  let ctx = canvas.getContext("2d", { alpha: false })
  if (!ctx) {
    ctx = canvas.getContext("2d")
  }
  if (!ctx) {
    return
  }

  ctx.fillStyle = "#fbfffb"
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = "#cce4d0"
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()

  const pad = 8
  let y = pad + 4

  ctx.fillStyle = "#123321"
  ctx.font = "800 16px 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif"
  ctx.textBaseline = "top"
  ctx.fillText(String(course.id), pad, y)
  y += 22

  ctx.fillStyle = "#14361e"
  ctx.font = "700 13px 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif"
  y = drawWrappedText(ctx, String(course.title || ""), pad, y, w - pad * 2, 17) + 2

  ctx.fillStyle = "#52715f"
  ctx.font = "11px 'Segoe UI', system-ui, sans-serif"
  const dept = course.department ? ` · ${course.department}` : ""
  const prof = course.professor ? ` — ${course.professor}` : ""
  const meta = `${String(course.credits)} cr${dept}${prof}`
  y = drawWrappedText(ctx, meta, pad, y, w - pad * 2, 14) + 4
  ctx.restore()

  const ox = Math.max(0, (event.clientX - rect.left) * sx)
  const oy = Math.max(0, (event.clientY - rect.top) * sy)

  if (activeDragNode?.parentNode) {
    activeDragNode.remove()
  }

  // Keep the bitmap in the document briefly — some engines snapshot DOM-backed nodes
  // at full opacity; detached canvases are sometimes composited with extra transparency.
  canvas.setAttribute("aria-hidden", "true")
  Object.assign(canvas.style, {
    position: "absolute",
    left: "-10000px",
    top: "0",
    width: `${w}px`,
    height: `${h}px`,
    opacity: "1",
  })
  document.body.appendChild(canvas)
  activeDragNode = canvas

  try {
    // Inline PNG data URLs often decode in the same turn; a decoded Image is more reliably opaque.
    const dataUrl = canvas.toDataURL("image/png")
    const img = new Image()
    img.src = dataUrl
    if (img.complete && img.naturalWidth > 0) {
      event.dataTransfer.setDragImage(img, ox, oy)
      canvas.remove()
      activeDragNode = null
    } else {
      event.dataTransfer.setDragImage(canvas, ox, oy)
    }
  } catch {
    try {
      event.dataTransfer.setDragImage(canvas, ox, oy)
    } catch {
      if (canvas.parentNode) {
        canvas.remove()
      }
      activeDragNode = null
    }
  }
}

export function endCourseCardDrag() {
  if (activeDragNode?.parentNode) {
    activeDragNode.remove()
  }
  activeDragNode = null
}
