import { formatTimeRange12h } from "./timeFormat.js"

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function toMinutes(time) {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

export { toMinutes }

/** Mon–Fri columns in schedule grids (typical class week). */
export const scheduleColumnDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

export function meetingLabel(meetings) {
  return meetings
    .map((m) => {
      const range = formatTimeRange12h(m.start, m.end)
      const lab = m.label ? ` (${m.label})` : ""
      return `${m.day} ${range}${lab}`
    })
    .join(" | ")
}

export function hasCourseConflict(candidate, existingCourses) {
  for (const existing of existingCourses) {
    for (const cm of candidate.meetingTimes) {
      for (const em of existing.meetingTimes) {
        if (cm.day !== em.day) {
          continue
        }
        if (overlaps(toMinutes(cm.start), toMinutes(cm.end), toMinutes(em.start), toMinutes(em.end))) {
          return existing
        }
      }
    }
  }
  return null
}

export function getEventConflicts(candidate, events) {
  const conflicts = []
  for (const event of events) {
    for (const cm of candidate.meetingTimes) {
      if (!event.days.includes(cm.day)) {
        continue
      }
      if (
        overlaps(
          toMinutes(cm.start),
          toMinutes(cm.end),
          toMinutes(event.start),
          toMinutes(event.end),
        )
      ) {
        conflicts.push(event)
      }
    }
  }
  return conflicts
}

export function detectPlanConflicts(planCourses, events) {
  const conflicts = []
  for (let i = 0; i < planCourses.length; i += 1) {
    for (let j = i + 1; j < planCourses.length; j += 1) {
      const a = planCourses[i]
      const b = planCourses[j]
      const hit = hasCourseConflict(a, [b])
      if (hit) {
        conflicts.push({ type: "course", a: a.id, b: b.id })
      }
    }
    const eventHits = getEventConflicts(planCourses[i], events)
    for (const event of eventHits) {
      conflicts.push({ type: "event", a: planCourses[i].id, b: event.id, bTitle: event.title })
    }
  }
  return conflicts
}

export function groupScheduleByDay(courses, events) {
  const grouped = Object.fromEntries(days.map((day) => [day, []]))

  for (const course of courses) {
    for (const meeting of course.meetingTimes) {
      grouped[meeting.day].push({
        kind: "course",
        id: `${course.id}-${meeting.day}`,
        title: `${course.id}: ${course.title}`,
        start: meeting.start,
        end: meeting.end,
      })
    }
  }

  for (const event of events) {
    for (const day of event.days) {
      grouped[day].push({
        kind: "event",
        id: `${event.id}-${day}`,
        title: event.title,
        start: event.start,
        end: event.end,
      })
    }
  }

  for (const day of days) {
    grouped[day].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  }

  return grouped
}

export const weekDays = days
