/**
 * Mock terms for Planning studio framing. Enrollment in the prototype aligns with
 * “Spring 2026”; Planning defaults to a future term so the mental model is “next term draft.”
 */
export const ENROLLMENT_TERM_LABEL = "Spring 2026"

export const PLANNING_TERM_OPTIONS = [
  {
    id: "fall-2026",
    label: "Fall 2026",
    shortLabel: "Fall ’26",
  },
  {
    id: "spring-2027",
    label: "Spring 2027",
    shortLabel: "Spring ’27",
  },
  {
    id: "spring-2026",
    label: "Spring 2026 (same as enrollment mock)",
    shortLabel: "Spring ’26",
  },
]

export const DEFAULT_PLANNING_TARGET_TERM_ID = "fall-2026"

export function getPlanningTermOption(termId) {
  return PLANNING_TERM_OPTIONS.find((t) => t.id === termId) ?? PLANNING_TERM_OPTIONS[0]
}

export function normalizePlanningContext(raw) {
  const tid = raw && typeof raw === "object" ? raw.targetTermId : null
  if (tid && PLANNING_TERM_OPTIONS.some((o) => o.id === tid)) {
    return { targetTermId: tid }
  }
  return { targetTermId: DEFAULT_PLANNING_TARGET_TERM_ID }
}
