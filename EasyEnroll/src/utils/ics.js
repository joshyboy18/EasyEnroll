import { scheduleColumnDays } from "./conflicts.js"

const ICAL_DOW = {
  Monday: "MO",
  Tuesday: "TU",
  Wednesday: "WE",
  Thursday: "TH",
  Friday: "FR",
  Saturday: "SA",
  Sunday: "SU",
}

function escapeIcsText(s) {
  if (s == null) {
    return ""
  }
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}

/** Monday 00:00 local time of the week containing `d`. */
function startOfWeekMonday(d) {
  const x = new Date(d)
  const jsDay = x.getDay()
  const fromMon = (jsDay + 6) % 7
  x.setDate(x.getDate() - fromMon)
  x.setHours(0, 0, 0, 0)
  return x
}

function pad2(n) {
  return String(n).padStart(2, "0")
}

/** Local `YYYYMMDDTHHmmss` (floating time) for iCalendar. */
function formatIcsDateTime(d) {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  )
}

/**
 * @param {Array<Record<string, unknown>>} blocks
 * @param {string} [calName]
 * @param {number} [weekCount] recurring count
 */
export function buildWeekScheduleIcs(blocks, calName = "My week", weekCount = 16) {
  if (!blocks || blocks.length === 0) {
    return null
  }

  const seen = new Set()
  const monday = startOfWeekMonday(new Date())
  const eventLines = []

  for (const b of blocks) {
    if (seen.has(b.id)) {
      continue
    }
    const dayName = b.columnDay
    const byday = ICAL_DOW[dayName]
    if (!byday) {
      continue
    }
    const col = scheduleColumnDays.indexOf(dayName)
    if (col < 0) {
      continue
    }
    seen.add(b.id)
    const start = new Date(monday)
    start.setDate(start.getDate() + col)
    const sh = Math.floor(b.startMin / 60)
    const sm = b.startMin % 60
    start.setHours(sh, sm, 0, 0)
    const end = new Date(monday)
    end.setDate(end.getDate() + col)
    const eh = Math.floor(b.endMin / 60)
    const em = b.endMin % 60
    end.setHours(eh, em, 0, 0)

    const title =
      b.kind === "course"
        ? `${b.blockCode || b.label} — ${b.blockTitle || b.sub}`.trim()
        : b.blockTitle || b.label
    const desc = [b.sub, b.timeLine].filter(Boolean).join(" · ")

    const uid = `${String(b.id).replace(/@/g, "-at-")}@easyenroll.local`
    eventLines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${formatIcsDateTime(new Date())}`,
      `DTSTART:${formatIcsDateTime(start)}`,
      `DTEND:${formatIcsDateTime(end)}`,
      `SUMMARY:${escapeIcsText(title)}`,
      ...(desc ? [`DESCRIPTION:${escapeIcsText(desc)}`] : []),
      `RRULE:FREQ=WEEKLY;BYDAY=${byday};COUNT=${Math.max(1, weekCount)}`,
      "END:VEVENT",
    )
  }

  if (eventLines.length === 0) {
    return null
  }

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EasyEnroll//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
  ]
  return [...header, ...eventLines, "END:VCALENDAR"].join("\r\n")
}

export function downloadIcsFile(icsString, filename = "schedule.ics") {
  if (!icsString) {
    return
  }
  const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  a.click()
  URL.revokeObjectURL(url)
}
