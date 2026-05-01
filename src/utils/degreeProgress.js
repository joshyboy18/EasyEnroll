import { degreeSheets } from "../data/degreeSheets"

export function getProgramNames(programIds) {
  return programIds.map((id) => degreeSheets[id]?.name).filter(Boolean)
}

export function getCourseDegreeMatches(courseId, programIds) {
  const labels = []

  for (const id of programIds) {
    const sheet = degreeSheets[id]
    if (!sheet) {
      continue
    }

    if (sheet.requiredCourseIds.includes(courseId)) {
      labels.push(`Required for ${sheet.name}`)
      continue
    }

    if (sheet.electiveCourseIds.includes(courseId)) {
      labels.push(`Elective option for ${sheet.name}`)
    }
  }

  return labels
}

/**
 * @param {number} classYear 1–4 (freshman–senior)
 */
export function getYearAwareRecommendations(allCourses, enrolledCourses, programIds, classYear) {
  const base = getRecommendations(allCourses, enrolledCourses, programIds)
  const year = classYear > 0 && classYear < 5 ? classYear : 1

  const withYear = base.filter((item) => {
    if (item.priority === 0) {
      return true
    }
    const y = item.course.suggestedYears
    if (Array.isArray(y) && y.length > 0) {
      return y.includes(year)
    }
    return true
  })

  if (year >= 4) {
    return withYear.filter((item) => {
      if (item.priority === 0) {
        return true
      }
      const m = String(item.course.id).match(/-(\d{3,4})/)
      const num = m ? parseInt(m[1], 10) : 0
      if (num < 200 && item.priority > 0) {
        return item.course.suggestedYears?.includes(4)
      }
      return true
    })
  }

  if (year === 1) {
    return [...withYear].sort((a, b) => {
      const ag = a.course.isGenEd ? 0 : 1
      const bg = b.course.isGenEd ? 0 : 1
      if (ag !== bg) {
        return ag - bg
      }
      return a.priority - b.priority
    })
  }

  return withYear
}

export function getRecommendations(allCourses, enrolledCourses, programIds) {
  const enrolledIds = new Set(enrolledCourses.map((course) => course.id))
  const courseMap = new Map(allCourses.map((course) => [course.id, course]))

  const required = []
  const electives = []

  for (const programId of programIds) {
    const sheet = degreeSheets[programId]
    if (!sheet) {
      continue
    }

    for (const courseId of sheet.requiredCourseIds) {
      if (!enrolledIds.has(courseId) && courseMap.has(courseId)) {
        required.push({
          course: courseMap.get(courseId),
          reason: `Unmet requirement in ${sheet.name}`,
          priority: 0,
        })
      }
    }

    for (const courseId of sheet.electiveCourseIds) {
      if (!enrolledIds.has(courseId) && courseMap.has(courseId)) {
        electives.push({
          course: courseMap.get(courseId),
          reason: `Elective recommendation for ${sheet.name}`,
          priority: 1,
        })
      }
    }
  }

  const seen = new Set()
  const combined = [...required, ...electives].filter((item) => {
    if (seen.has(item.course.id)) {
      return false
    }
    seen.add(item.course.id)
    return true
  })

  return combined.sort((a, b) => a.priority - b.priority)
}
