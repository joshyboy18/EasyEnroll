// Ensure the provided courseIds value is returned as a Set
function toCourseIdSet(courseIds) {
	if (courseIds instanceof Set) {
		return courseIds
	}
	return new Set(Array.isArray(courseIds) ? courseIds : [])
}


// Normalize an array of suggested years to a sorted, unique list of integers
function normalizeYearList(suggestedYears) {
	if (!Array.isArray(suggestedYears)) {
		return []
	}
	return [...new Set(suggestedYears.filter((year) => Number.isInteger(year)))].sort((a, b) => a - b)
}


// Format a single course reference as "ID (Title)" if title is available
function formatCourseReference(courseId, courseMap) {
	const title = courseMap?.get(courseId)?.title
	return title ? `${courseId} (${title})` : courseId
}


// Format a list of course ids into a comma-separated, human-readable string
function formatCourseReferenceList(courseIds, courseMap) {
	return courseIds.map((courseId) => formatCourseReference(courseId, courseMap)).join(", ")
}

// Return the prerequisite ids that are not present in completedCourseIds
export function getMissingPrerequisiteIds(course, completedCourseIds) {
	const completed = toCourseIdSet(completedCourseIds)
	if (!Array.isArray(course?.prerequisites) || course.prerequisites.length === 0) {
		return []
	}
	return course.prerequisites.filter((courseId) => !completed.has(courseId))
}

// Return a human-friendly string for a list of prerequisite ids
export function formatPrerequisiteList(prerequisiteIds, courseMap) {
	if (!Array.isArray(prerequisiteIds) || prerequisiteIds.length === 0) {
		return "None"
	}
	return formatCourseReferenceList(prerequisiteIds, courseMap)
}

// Format the missing prerequisites for a course based on completed courses
export function formatMissingPrerequisites(course, completedCourseIds, courseMap) {
	const missing = getMissingPrerequisiteIds(course, completedCourseIds)
	if (missing.length === 0) {
		return ""
	}
	return formatCourseReferenceList(missing, courseMap)
}

// Convert suggestedYears into a compact string (e.g., "1–2" or "Any year")
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