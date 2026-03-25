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
