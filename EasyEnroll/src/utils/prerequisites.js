function toCourseIdSet(courseIds) {
	if (courseIds instanceof Set) {
		return courseIds
	}
	return new Set(Array.isArray(courseIds) ? courseIds : [])
}

function normalizeYearList(suggestedYears) {
	if (!Array.isArray(suggestedYears)) {
		return []
	}
	return [...new Set(suggestedYears.filter((year) => Number.isInteger(year)))].sort((a, b) => a - b)
}

function formatCourseReference(courseId, courseMap) {
	const title = courseMap?.get(courseId)?.title
	return title ? `${courseId} (${title})` : courseId
}

function formatCourseReferenceList(courseIds, courseMap) {
	return courseIds.map((courseId) => formatCourseReference(courseId, courseMap)).join(", ")
}

export function getMissingPrerequisiteIds(course, completedCourseIds) {
	const completed = toCourseIdSet(completedCourseIds)
	if (!Array.isArray(course?.prerequisites) || course.prerequisites.length === 0) {
		return []
	}
	return course.prerequisites.filter((courseId) => !completed.has(courseId))
}

export function formatPrerequisiteList(prerequisiteIds, courseMap) {
	if (!Array.isArray(prerequisiteIds) || prerequisiteIds.length === 0) {
		return "None"
	}
	return formatCourseReferenceList(prerequisiteIds, courseMap)
}

export function formatMissingPrerequisites(course, completedCourseIds, courseMap) {
	const missing = getMissingPrerequisiteIds(course, completedCourseIds)
	if (missing.length === 0) {
		return ""
	}
	return formatCourseReferenceList(missing, courseMap)
}

export function formatSuggestedYears(suggestedYears) {
	const years = normalizeYearList(suggestedYears)
	if (years.length === 0) {
		return "Any year"
	}
	if (years.length === 1) {
		return `${years[0]}`
	}
	const contiguous = years.every((year, index) => index === 0 || year === years[index - 1] + 1)
	return contiguous ? `${years[0]}–${years[years.length - 1]}` : years.join(", ")
}