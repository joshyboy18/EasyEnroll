import { colorForCourseId } from "./courseColors.js"
import { toMinutes } from "./conflicts.js"
import { formatTimeRange12h } from "./timeFormat.js"

/** Default vertical scale for the week time grid (px per 1h). */
export const PX_PER_HOUR = 48

const MIN_IN_DAY = 24 * 60
const DEFAULT_FOCAL_START = 7 * 60
const DEFAULT_FOCAL_END = 19 * 60
const SCHEDULE_BUFFER_MIN = 60

/**
 * When "compact" (focus) mode is on, show only the time span from the earliest
 * block to the latest (all days), with a 1h buffer, snapped to whole hours.
 * When off, show the full 0:00–24:00 day.
 * @param {Array<{ startMin: number, endMin: number }> | null | undefined} blocks
 * @param {boolean} compact
 * @returns {{ viewStartMin: number, viewEndMin: number }}
 */
export function getViewWindowFromBlocks(blocks, compact) {
  if (!compact) {
    return { viewStartMin: 0, viewEndMin: MIN_IN_DAY }
  }
  if (!blocks || blocks.length === 0) {
    return { viewStartMin: DEFAULT_FOCAL_START, viewEndMin: DEFAULT_FOCAL_END }
  }
  let minS = MIN_IN_DAY
  let maxE = 0
  for (const b of blocks) {
    if (b.startMin < minS) {
      minS = b.startMin
    }
    if (b.endMin > maxE) {
      maxE = b.endMin
    }
  }
  if (minS > maxE) {
    return { viewStartMin: DEFAULT_FOCAL_START, viewEndMin: DEFAULT_FOCAL_END }
  }
  const rawStart = minS - SCHEDULE_BUFFER_MIN
  const rawEnd = maxE + SCHEDULE_BUFFER_MIN
  const viewStartMin = Math.max(0, Math.floor(rawStart / 60) * 60)
  const viewEndMin = Math.min(MIN_IN_DAY, Math.ceil(rawEnd / 60) * 60)
  if (viewEndMin <= viewStartMin) {
    return { viewStartMin: DEFAULT_FOCAL_START, viewEndMin: DEFAULT_FOCAL_END }
  }
  return { viewStartMin, viewEndMin }
}

export function buildTimeGridBlocks({ enrolledCourses, events, plannedOnly = [] }) {
  const blocks = []

  for (const course of enrolledCourses) {
    for (const m of course.meetingTimes) {
      blocks.push({
        columnDay: m.day,
        startMin: toMinutes(m.start),
        endMin: toMinutes(m.end),
        kind: "course",
        id: `enr-${course.id}-${m.day}-${m.start}`,
        courseId: course.id,
        label: course.id,
        sub: course.title,
        blockTitle: course.title,
        timeLine: formatTimeRange12h(m.start, m.end),
        blockCode: course.id,
        color: colorForCourseId(course.id),
        stripe: false,
        data: { type: "course", course, meeting: m, layer: "enrolled" },
      })
    }
  }

  for (const course of plannedOnly) {
    for (const m of course.meetingTimes) {
      blocks.push({
        columnDay: m.day,
        startMin: toMinutes(m.start),
        endMin: toMinutes(m.end),
        kind: "course",
        id: `pln-${course.id}-${m.day}-${m.start}`,
        courseId: course.id,
        label: course.id,
        sub: course.title,
        blockTitle: course.title,
        timeLine: formatTimeRange12h(m.start, m.end),
        blockCode: course.id,
        color: colorForCourseId(course.id),
        stripe: true,
        data: { type: "course", course, meeting: m, layer: "plan" },
      })
    }
  }

  for (const event of events) {
    for (const day of event.days) {
      blocks.push({
        columnDay: day,
        startMin: toMinutes(event.start),
        endMin: toMinutes(event.end),
        kind: "event",
        id: `ev-${event.id}-${day}`,
        eventId: event.id,
        label: event.title,
        sub: event.description || "Personal event",
        blockTitle: event.title,
        timeLine: formatTimeRange12h(event.start, event.end),
        blockCode: "",
        color: event.color || "#b8e1ff",
        stripe: false,
        data: { type: "event", event, day },
      })
    }
  }

  return blocks
}

/** True if two blocks overlap in time on the same weekday column. */
export function intervalsOverlap(a, b) {
  if (a.columnDay !== b.columnDay) {
    return false
  }
  return a.startMin < b.endMin && b.startMin < a.endMin
}

/**
 * Group blocks into clusters where overlaps are transitive (A overlaps B, B overlaps C ⇒ one cluster).
 * @param {Array<Record<string, unknown>>} blocks Same columnDay
 * @returns {Array<Array<Record<string, unknown>>>}
 */
export function clusterBlocksByOverlap(blocks) {
  const n = blocks.length
  if (n === 0) {
    return []
  }
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (i, j) => {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) {
      parent[ri] = rj
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (intervalsOverlap(blocks[i], blocks[j])) {
        union(i, j)
      }
    }
  }
  const buckets = new Map()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!buckets.has(r)) {
      buckets.set(r, [])
    }
    buckets.get(r).push(blocks[i])
  }
  return [...buckets.values()]
}

/**
 * Within one overlap cluster, assign non-overlapping lanes (columns) so all items remain visible.
 * @returns {Map<string, { lane: number, totalLanes: number }>}
 */
export function assignLanesInCluster(clusterBlocks) {
  const layout = new Map()
  if (clusterBlocks.length === 0) {
    return layout
  }
  const sorted = [...clusterBlocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const laneEnd = []
  for (const b of sorted) {
    let L = 0
    while (L < laneEnd.length && laneEnd[L] > b.startMin) {
      L++
    }
    if (L === laneEnd.length) {
      laneEnd.push(b.endMin)
    } else {
      laneEnd[L] = Math.max(laneEnd[L], b.endMin)
    }
    layout.set(b.id, { lane: L, totalLanes: 0 })
  }
  const totalLanes = laneEnd.length
  for (const b of sorted) {
    layout.get(b.id).totalLanes = totalLanes
  }
  return layout
}

/**
 * @param {Array<Record<string, unknown>>} dayBlocks Blocks for a single day column
 * @returns {Map<string, { lane: number, totalLanes: number }>}
 */
export function layoutOverlappingDayBlocks(dayBlocks) {
  const out = new Map()
  for (const cluster of clusterBlocksByOverlap(dayBlocks)) {
    const m = assignLanesInCluster(cluster)
    m.forEach((v, k) => out.set(k, v))
  }
  return out
}

export function formatHourGutterLabel(h) {
  return h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`
}

export function popoutHtmlForGrid(
  userName,
  blocks,
  days,
  viewStartMin = 0,
  viewEndMin = MIN_IN_DAY,
  caption = "Read-only pop-out. Same schedule as the main app.",
) {
  const pxPerHour = PX_PER_HOUR
  const totalH = ((viewEndMin - viewStartMin) / 60) * pxPerHour
  const colStyle = (b) => {
    const top = ((b.startMin - viewStartMin) / 60) * pxPerHour
    const h = ((b.endMin - b.startMin) / 60) * pxPerHour
    const base = b.color
    const bg = b.stripe
      ? `repeating-linear-gradient(45deg, ${base}99, ${base}99 4px, ${base}55 4px, ${base}55 8px), ${base}`
      : base
    return `top:${top}px;height:${Math.max(h, 20)}px;background:${bg};color:#fff;border-radius:6px;padding:3px 4px;font-size:11px;line-height:1.25;overflow:hidden;position:absolute;left:1px;right:1px;box-sizing:border-box;`
  }

  const cols = days
    .map((day) => {
      const dayBlocks = blocks
        .filter((x) => x.columnDay === day)
        .filter((b) => b.endMin > viewStartMin && b.startMin < viewEndMin)
      const inner = dayBlocks
        .map(
          (b) =>
            `<div style="${colStyle(b)}"><strong style="font-size:12px;">${escapeHtml(
              b.blockTitle || b.label,
            )}</strong><br/><span style="font-size:10px;opacity:0.95;">${escapeHtml(
              b.timeLine || "",
            )}</span>${
              b.blockCode
                ? `<br/><span style="font-size:9px;opacity:0.9;">${escapeHtml(b.blockCode)}</span>`
                : ""
            }</div>`,
        )
        .join("")
      return `<div style="flex:1;min-width:100px;border-left:1px solid #c8d8c8;">
        <h3 style="margin:0 0 4px 4px;font-size:12px;">${escapeHtml(day)}</h3>
        <div style="position:relative;overflow:hidden;height:${totalH}px;background-image:repeating-linear-gradient(to bottom, #e0ebe2 0, #e0ebe2 1px, transparent 1px, transparent ${pxPerHour}px);background-size:100% ${pxPerHour}px;">${inner}</div>
      </div>`
    })
    .join("")

  const timeAxisParts = []
  for (let t = viewStartMin; t < viewEndMin; t += 60) {
    const h = t / 60
    timeAxisParts.push(
      `<div style="height:${pxPerHour}px;border-bottom:1px solid #e8f0e8;font-size:11px;color:#4a5c4a;padding-right:4px;text-align:right;">${formatHourGutterLabel(
        h,
      )}</div>`,
    )
  }
  const timeAxis = timeAxisParts.join("")

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Easy Enroll — ${escapeHtml(
    userName,
  )}</title></head>
  <body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f4faf4;color:#14361e;padding:12px;">
  <h1 style="font-size:18px;">${escapeHtml(userName)} — week view</h1>
  <p style="font-size:12px;">${escapeHtml(caption)}</p>
  <div style="display:flex;gap:6px;align-items:flex-start;max-width:100%;overflow-x:auto;">
  <div style="width:48px;flex-shrink:0;">${timeAxis}</div>
  <div style="display:flex;flex:1;min-width:520px;gap:0;">${cols}</div>
  </div>
  </body></html>`
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
