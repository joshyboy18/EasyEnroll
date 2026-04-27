import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "./App.css"
import { TimeGridCalendar } from "./components/TimeGridCalendar.jsx"
import { useToast } from "./components/ToastStack.jsx"
import { loginWithPassword, loginWithSso } from "./utils/auth"
import { buildTimeGridBlocks, getViewWindowFromBlocks, popoutHtmlForGrid } from "./utils/calendarLayout.js"
import { courses } from "./data/courses"
import {
  DEFAULT_PLANNING_TARGET_TERM_ID,
  ENROLLMENT_TERM_LABEL,
  getPlanningTermOption,
  normalizePlanningContext,
  PLANNING_TERM_OPTIONS,
} from "./data/planningTerms.js"
import { mockUsers } from "./data/mockUsers"
import {
  detectPlanConflicts,
  getEventConflicts,
  hasCourseConflict,
  meetingLabel,
  scheduleColumnDays,
} from "./utils/conflicts"
import {
  getCourseDegreeMatches,
  getProgramNames,
  getYearAwareRecommendations,
} from "./utils/degreeProgress"
import {
  clearAuthSession,
  loadAuthSession,
  loadUserBucket,
  saveAuthSession,
  saveUserBucket,
} from "./utils/storage"
import { attachOpaqueCourseDrag, endCourseCardDrag } from "./utils/courseDrag.js"
import { buildSemesterScheduleIcs, buildSingleCourseIcs, buildWeekScheduleIcs, downloadIcsFile } from "./utils/ics.js"

const MAX_CREDITS = 19
/** Shown when a planning add would exceed the credit cap (mirrors enrollment policy). */
const PLANNING_CREDIT_CAP_MESSAGE = `Plans are limited to ${MAX_CREDITS} credit hours without academic advisor approval. To take more, speak with your advisor.`
const PLANNING_CONFLICTS_INITIAL = 8
const SCHOOL_EMAIL_DOMAIN = "@school.edu"

const VIEW_WAYFINDING = {
  dashboard: "Enrollment — search the catalog, manage your term, and see your week.",
  planning:
    "Planning — draft a future-term schedule (mock); enrolled blocks on the grid are this term for comparison only.",
  profile: "Profile — identity fields and how this mock handles university policy.",
  settings: "Settings — display, alerts, and accessibility for the planner.",
}

const LS_ONBOARD_ENROLLMENT = "easyenroll.dismissOnboarding.enrollment"
const LS_ONBOARD_PLANNING = "easyenroll.dismissOnboarding.planning"
/** @deprecated kept in sync when enrollment onboarding is dismissed */
const LS_DISMISS_WELCOME_LEGACY = "easyenroll.dismissWelcome"

function enrollmentOnboardingInitiallyDismissed() {
  if (typeof localStorage === "undefined") {
    return false
  }
  if (localStorage.getItem(LS_ONBOARD_ENROLLMENT) === "1") {
    return true
  }
  return localStorage.getItem(LS_DISMISS_WELCOME_LEGACY) === "1"
}

function persistEnrollmentOnboardingDismissed() {
  try {
    localStorage.setItem(LS_ONBOARD_ENROLLMENT, "1")
    localStorage.setItem(LS_DISMISS_WELCOME_LEGACY, "1")
  } catch {
    /* ignore */
  }
}

function planningOnboardingInitiallyDismissed() {
  return typeof localStorage !== "undefined" && localStorage.getItem(LS_ONBOARD_PLANNING) === "1"
}

function persistPlanningOnboardingDismissed() {
  try {
    localStorage.setItem(LS_ONBOARD_PLANNING, "1")
  } catch {
    /* ignore */
  }
}

const EVENT_COLOR_PRESETS = ["#1f8f4c", "#2f6fcb", "#7a3d8c", "#b85c0a", "#0d4a4a", "#6b1d3d"]

const defaultSettings = {
  compactCalendar: false,
  showConflictAlerts: true,
  showReminderAlerts: true,
  /** Extra soft UI when the OS does not already request reduce (stack with prefers-reduced-motion). */
  reduceInterfaceMotion: false,
  /** High-contrast theme for readability (also helps in bright light). */
  highContrast: false,
  /** Tighter course cards in catalog lists. */
  compactCatalog: false,
  /** In-memory only: count UI actions and show in Settings. */
  trackSessionStats: true,
}

function mergeSettingsWithDefaults(stored) {
  if (!stored || typeof stored !== "object") {
    return { ...defaultSettings }
  }
  return { ...defaultSettings, ...stored }
}

const defaultEvents = [
  {
    id: "ev-work",
    title: "Campus Job",
    days: ["Monday", "Wednesday"],
    start: "14:30",
    end: "16:30",
    color: "#3d6b8f",
    description: "Evening shift on campus.",
  },
]
/* eventForm.details maps to Event.description in storage */

function normalizeEventEntry(event) {
  return {
    ...event,
    color: event.color || "#2f6fcb",
    description: event.description ?? "",
  }
}

function defaultProfileFromUser(user) {
  const local = user.email.split("@")[0] || "student"
  return { name: user.name, emailLocal: local, avatarDataUrl: "" }
}

function formatCourseMeta(course) {
  const seatText =
    course.seatsAvailable > 0
      ? `${course.seatsAvailable} seats open`
      : course.waitlistOpen
        ? "No seats: waitlist available"
        : "No seats: waitlist unavailable"
  return `${course.id} | ${course.professor} | ${course.credits} credits | ${seatText}`
}

function CourseCard({
  course,
  degreeLabels,
  onOpen,
  onAdd,
  addLabel,
  draggable,
  actionVariant = "primary",
  actionDisabled = false,
  actionTitle,
  compact = false,
}) {
  return (
    <article
      className={`course-card${compact ? " course-card--compact" : ""}`}
      draggable={draggable}
      onDragStart={(event) => {
        if (draggable) {
          attachOpaqueCourseDrag(event, course)
        }
      }}
      onDragEnd={() => {
        if (draggable) {
          endCourseCardDrag()
        }
      }}
      onClick={() => onOpen(course)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen(course)
        }
      }}
    >
      <header className="course-card__header">
        <h3>{course.id}</h3>
        <span>{course.department}</span>
      </header>
      <p className="course-card__title">{course.title}</p>
      <p className="course-card__meta">{formatCourseMeta(course)}</p>
      {!compact && (
        <>
          <p className="course-card__meta">Class Time: {meetingLabel(course.meetingTimes)}</p>
          <p className="course-card__meta">Exam: {course.examTime}</p>
        </>
      )}
      {compact && (
        <p className="course-card__meta course-card__meta--compact">
          {meetingLabel(course.meetingTimes)} · Exam: {course.examTime}
        </p>
      )}
      {degreeLabels.length > 0 && (
        <div className="chip-row">
          {degreeLabels.map((label) => (
            <span key={label} className="chip">
              {label}
            </span>
          ))}
        </div>
      )}
      <button
        className={`btn btn--${actionVariant}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onAdd(course)
        }}
        disabled={actionDisabled}
        title={actionTitle || undefined}
      >
        {addLabel}
      </button>
    </article>
  )
}

function PlanningConflictCard({ conflict, courses }) {
  if (conflict.type === "course") {
    const ca = courses.find((c) => c.id === conflict.a)
    const cb = courses.find((c) => c.id === conflict.b)
    return (
      <article
        className="planning-conflict-card planning-conflict-card--course"
        aria-label={`Time overlap: ${conflict.a} and ${conflict.b}`}
      >
        <span className="planning-conflict-card__kind">Class vs class</span>
        <div className="planning-conflict-card__pair">
          <div className="planning-conflict-card__side">
            <span className="planning-conflict-card__code">{conflict.a}</span>
            <span className="planning-conflict-card__title">{ca?.title ?? ""}</span>
          </div>
          <span className="planning-conflict-card__vs" aria-hidden="true">
            overlaps
          </span>
          <div className="planning-conflict-card__side">
            <span className="planning-conflict-card__code">{conflict.b}</span>
            <span className="planning-conflict-card__title">{cb?.title ?? ""}</span>
          </div>
        </div>
      </article>
    )
  }
  const ca = courses.find((c) => c.id === conflict.a)
  return (
    <article
      className="planning-conflict-card planning-conflict-card--event"
      aria-label={`Time overlap: ${conflict.a} with event ${conflict.bTitle || conflict.b}`}
    >
      <span className="planning-conflict-card__kind">Class vs event</span>
      <div className="planning-conflict-card__pair planning-conflict-card__pair--event">
        <div className="planning-conflict-card__side">
          <span className="planning-conflict-card__code">{conflict.a}</span>
          <span className="planning-conflict-card__title">{ca?.title ?? ""}</span>
        </div>
        <span className="planning-conflict-card__vs" aria-hidden="true">
          overlaps
        </span>
        <div className="planning-conflict-card__side planning-conflict-card__side--event">
          <span className="planning-conflict-card__code planning-conflict-card__code--event">
            {conflict.bTitle || conflict.b}
          </span>
          <span className="planning-conflict-card__meta">Personal weekly event</span>
        </div>
      </div>
    </article>
  )
}

function HelpTipsList() {
  return (
    <ul className="help-tips">
      <li>
        Open <strong>Settings</strong> for this list anytime; the right column is dedicated to keyboard and tips.
      </li>
      <li>
        Press <kbd>Esc</kbd> to close any dialog, including course details and import summary.
      </li>
      <li>
        Use the top navigation: <strong>Enrollment</strong> to search and enroll, <strong>Planning</strong> to try
        alternate course sets, <strong>Settings</strong> for the calendar view and high contrast.
      </li>
      <li>
        Download a <strong>week</strong> file (Enrollment → weekly calendar) to check your plan on a phone or desktop
        calendar app.
      </li>
    </ul>
  )
}

function Modal({ title, children, onClose, actions }) {
  const panelRef = useRef(null)
  const prevActiveRef = useRef(null)
  useEffect(() => {
    prevActiveRef.current = document.activeElement
    const root = panelRef.current
    const t = setTimeout(() => {
      if (!root) {
        return
      }
      const first = root.querySelector(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (first instanceof HTMLElement) {
        first.focus()
      }
    }, 0)
    const onKey = (e) => {
      if (e.key !== "Tab" || !root) {
        return
      }
      const list = [
        ...root.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null)
      if (list.length === 0) {
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => {
      clearTimeout(t)
      document.removeEventListener("keydown", onKey, true)
      if (typeof prevActiveRef.current?.focus === "function") {
        prevActiveRef.current.focus()
      }
    }
  }, [title])
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h3>{title}</h3>
          <button className="btn btn--subtle" type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {actions && <footer className="modal__actions">{actions}</footer>}
      </section>
    </div>
  )
}

function LoginPage({
  localEmail,
  setLocalEmail,
  localPassword,
  setLocalPassword,
  ssoUserId,
  setSsoUserId,
  onPasswordLogin,
  onSsoLogin,
  error,
}) {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Easy Enroll</h1>
        <p>Sign in to access your enrollment dashboard and saved plans.</p>
        <div className="form-grid">
          <label>
            University Email
            <input
              value={localEmail}
              onChange={(event) => setLocalEmail(event.target.value)}
              type="email"
              placeholder="student@easyenroll.edu"
            />
          </label>
          <label>
            Password
            <input
              value={localPassword}
              onChange={(event) => setLocalPassword(event.target.value)}
              type="password"
              placeholder="demo123"
            />
          </label>
        </div>
        <button className="btn btn--primary" type="button" onClick={onPasswordLogin}>
          Log In
        </button>
        <div className="divider">or</div>
        <label>
          Pretend SSO Identity
          <select value={ssoUserId} onChange={(event) => setSsoUserId(event.target.value)}>
            {mockUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--secondary" type="button" onClick={onSsoLogin}>
          Sign In With University SSO
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  )
}

function App() {
  const initialSession = loadAuthSession()
  const initialUser = mockUsers.find((entry) => entry.id === initialSession?.userId) || null
  const { pushToast, ToastContainer } = useToast()

  const [session, setSession] = useState(() => initialSession)
  const [activeView, setActiveView] = useState("dashboard")

  const [localEmail, setLocalEmail] = useState("jlee@easyenroll.edu")
  const [localPassword, setLocalPassword] = useState("demo123")
  const [ssoUserId, setSsoUserId] = useState(mockUsers[0].id)
  const [loginError, setLoginError] = useState("")

  const [searchText, setSearchText] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("All")
  const [seatFilter, setSeatFilter] = useState("all")
  const [programOnly, setProgramOnly] = useState(false)
  const [enrollmentUndoCourse, setEnrollmentUndoCourse] = useState(null)
  const enrollmentUndoTimerRef = useRef(null)

  const [selectedCourse, setSelectedCourse] = useState(null)
  const [confirmState, setConfirmState] = useState(null)

  const [enrolledIds, setEnrolledIds] = useState(() =>
    initialUser ? loadUserBucket(initialUser.id, "enrolled", []) : [],
  )
  const [events, setEvents] = useState(() =>
    initialUser
      ? loadUserBucket(initialUser.id, "events", defaultEvents).map(normalizeEventEntry)
      : defaultEvents.map(normalizeEventEntry),
  )
  const [settings, setSettings] = useState(() =>
    initialUser
      ? mergeSettingsWithDefaults(loadUserBucket(initialUser.id, "settings", {}))
      : { ...defaultSettings },
  )
  const [profile, setProfile] = useState(() =>
    initialUser
      ? (() => {
          const raw = loadUserBucket(initialUser.id, "profile", null)
          if (raw && raw.emailLocal) {
            return { name: raw.name, emailLocal: raw.emailLocal, avatarDataUrl: raw.avatarDataUrl || "" }
          }
          if (raw && raw.email) {
            return {
              name: raw.name,
              emailLocal: String(raw.email).split("@")[0] || "student",
              avatarDataUrl: raw.avatarDataUrl || "",
            }
          }
          return defaultProfileFromUser(initialUser)
        })()
      : { name: "", emailLocal: "", avatarDataUrl: "" },
  )
  const [plans, setPlans] = useState(() =>
    initialUser ? loadUserBucket(initialUser.id, "plans", []) : [],
  )
  const [activePlanId, setActivePlanId] = useState(() => {
    if (!initialUser) {
      return null
    }
    const loaded = loadUserBucket(initialUser.id, "plans", [])
    return loaded[0]?.id ?? null
  })

  const [lastSavedPlansJson, setLastSavedPlansJson] = useState(() =>
    initialUser ? JSON.stringify(loadUserBucket(initialUser.id, "plans", [])) : "[]",
  )
  const [eventModal, setEventModal] = useState(null)
  const [planPickerOpen, setPlanPickerOpen] = useState(false)
  const [uniRequest, setUniRequest] = useState(null)
  const [uniRequestNote, setUniRequestNote] = useState("")

  const [importSummaryModal, setImportSummaryModal] = useState(null)
  const [comparePlanAId, setComparePlanAId] = useState(null)
  const [comparePlanBId, setComparePlanBId] = useState(null)
  const [comparePlansOpen, setComparePlansOpen] = useState(false)
  const [planningConflictsExpanded, setPlanningConflictsExpanded] = useState(false)
  const [enrollmentOnboardingDismissed, setEnrollmentOnboardingDismissed] = useState(
    enrollmentOnboardingInitiallyDismissed,
  )
  const [planningOnboardingDismissed, setPlanningOnboardingDismissed] = useState(
    planningOnboardingInitiallyDismissed,
  )
  const [planningContext, setPlanningContext] = useState(() =>
    initialUser
      ? normalizePlanningContext(loadUserBucket(initialUser.id, "planningContext", null))
      : { targetTermId: DEFAULT_PLANNING_TARGET_TERM_ID },
  )

  const [eventForm, setEventForm] = useState({
    title: "",
    details: "",
    days: /** @type {string[]} */ (["Monday"]),
    start: "13:00",
    end: "14:00",
    color: EVENT_COLOR_PRESETS[0],
    useCustomColor: false,
  })

  const popupRef = useRef(null)
  /** @type {React.MutableRefObject<"enrollment" | "planning">} */
  const calendarPopoutSourceRef = useRef("enrollment")
  const keyboardLayerRef = useRef({})
  const sessionStatsRef = useRef({
    filterClears: 0,
    filterPresets: 0,
    enrollSuccess: 0,
    planImports: 0,
    planExportDownloads: 0,
    planImportUploads: 0,
  })
  const [, setSessionStatsRender] = useState(0)
  const bumpSession = useCallback(
    (key) => {
      sessionStatsRef.current[key] += 1
      if (settings.trackSessionStats) {
        setSessionStatsRender((n) => n + 1)
      }
    },
    [settings.trackSessionStats],
  )

  const currentUser = useMemo(
    () => mockUsers.find((entry) => entry.id === session?.userId) || null,
    [session],
  )

  const classYear = currentUser?.classYear ?? 1

  const planningTermOption = useMemo(
    () => getPlanningTermOption(planningContext.targetTermId),
    [planningContext.targetTermId],
  )

  const plansDirty = useMemo(
    () => JSON.stringify(plans) !== lastSavedPlansJson,
    [plans, lastSavedPlansJson],
  )

  const goToView = useCallback(
    (view) => {
      if (activeView === "planning" && view !== "planning" && plansDirty) {
        // eslint-disable-next-line no-alert
        if (!window.confirm("You have unsaved plan changes. Leave the Planning page?")) {
          return
        }
      }
      setActiveView(view)
    },
    [activeView, plansDirty],
  )

  const hydrateUserState = (user) => {
    const nextEnrolled = loadUserBucket(user.id, "enrolled", [])
    const nextEvents = loadUserBucket(user.id, "events", defaultEvents).map(normalizeEventEntry)
    const nextSettings = mergeSettingsWithDefaults(loadUserBucket(user.id, "settings", {}))
    const rawProfile = loadUserBucket(user.id, "profile", null)
    const nextProfile = rawProfile?.emailLocal
      ? { name: rawProfile.name, emailLocal: rawProfile.emailLocal, avatarDataUrl: rawProfile.avatarDataUrl || "" }
      : rawProfile?.email
        ? {
            name: rawProfile.name,
            emailLocal: String(rawProfile.email).split("@")[0] || "student",
            avatarDataUrl: rawProfile.avatarDataUrl || "",
          }
        : defaultProfileFromUser(user)
    const nextPlans = loadUserBucket(user.id, "plans", [])

    setEnrolledIds(nextEnrolled)
    setEvents(nextEvents)
    setSettings(nextSettings)
    setProfile(nextProfile)
    setPlans(nextPlans)
    setLastSavedPlansJson(JSON.stringify(nextPlans))
    setActivePlanId(nextPlans[0]?.id ?? null)
    setPlanningContext(normalizePlanningContext(loadUserBucket(user.id, "planningContext", null)))
  }

  useEffect(() => {
    if (!currentUser) {
      return
    }
    saveUserBucket(currentUser.id, "planningContext", planningContext)
  }, [currentUser, planningContext])

  useEffect(() => {
    if (!currentUser) {
      return
    }
    saveUserBucket(currentUser.id, "enrolled", enrolledIds)
  }, [currentUser, enrolledIds])

  useEffect(() => {
    if (!currentUser) {
      return
    }
    saveUserBucket(currentUser.id, "events", events)
  }, [currentUser, events])

  useEffect(() => {
    if (!currentUser) {
      return
    }
    saveUserBucket(currentUser.id, "settings", settings)
  }, [currentUser, settings])

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handler = () => setPrefersReducedMotion(mq.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const reduceMotionActive = prefersReducedMotion || settings.reduceInterfaceMotion
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotionActive)
  }, [reduceMotionActive])

  const clearEnrollmentUndo = useCallback(() => {
    if (enrollmentUndoTimerRef.current) {
      clearTimeout(enrollmentUndoTimerRef.current)
      enrollmentUndoTimerRef.current = null
    }
    setEnrollmentUndoCourse(null)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", Boolean(settings.highContrast))
    return () => {
      document.documentElement.classList.remove("high-contrast")
    }
  }, [settings.highContrast])

  useEffect(() => {
    if (!enrollmentUndoCourse) {
      return
    }
    if (enrolledIds.includes(enrollmentUndoCourse.id)) {
      clearEnrollmentUndo()
    }
  }, [enrolledIds, enrollmentUndoCourse, clearEnrollmentUndo])

  keyboardLayerRef.current = {
    importSummaryModal,
    eventModal,
    planPickerOpen,
    uniRequest,
    selectedCourse,
    confirmState,
  }

  useEffect(() => {
    if (!session) {
      return
    }
    const onKey = (e) => {
      const s = keyboardLayerRef.current
      if (e.key === "Escape") {
        if (s.importSummaryModal) {
          e.preventDefault()
          setImportSummaryModal(null)
          return
        }
        if (s.eventModal) {
          e.preventDefault()
          setEventModal(null)
          return
        }
        if (s.planPickerOpen) {
          e.preventDefault()
          setPlanPickerOpen(false)
          return
        }
        if (s.uniRequest) {
          e.preventDefault()
          setUniRequest(null)
          setUniRequestNote("")
          return
        }
        if (s.selectedCourse) {
          e.preventDefault()
          setSelectedCourse(null)
          return
        }
        if (s.confirmState) {
          e.preventDefault()
          setConfirmState(null)
        }
        return
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [session])

  useEffect(() => {
    if (!currentUser) {
      return
    }
    saveUserBucket(currentUser.id, "profile", profile)
  }, [currentUser, profile])

  useEffect(() => {
    if (!currentUser) {
      return
    }
    saveUserBucket(currentUser.id, "plans", plans)
  }, [currentUser, plans])

  const enrolledCourses = useMemo(
    () => courses.filter((course) => enrolledIds.includes(course.id)),
    [enrolledIds],
  )

  const enrolledCredits = useMemo(
    () => enrolledCourses.reduce((sum, course) => sum + course.credits, 0),
    [enrolledCourses],
  )

  const recommendations = useMemo(() => {
    if (!currentUser) {
      return []
    }
    return getYearAwareRecommendations(
      courses,
      enrolledCourses,
      currentUser.programs,
      classYear,
    ).slice(0, 8)
  }, [currentUser, enrolledCourses, classYear])

  const availableCourses = useMemo(() => {
    if (!currentUser) {
      return []
    }
    return courses.filter((course) => {
      const textHit = `${course.id} ${course.title} ${course.professor}`
        .toLowerCase()
        .includes(searchText.toLowerCase())
      const departmentHit = departmentFilter === "All" || departmentFilter === course.department
      const seatHit =
        seatFilter === "all" ||
        (seatFilter === "open" && course.seatsAvailable > 0) ||
        (seatFilter === "waitlist" && course.seatsAvailable === 0 && course.waitlistOpen)
      if (
        programOnly &&
        getCourseDegreeMatches(course.id, currentUser.programs).length === 0
      ) {
        return false
      }
      return textHit && departmentHit && seatHit
    })
  }, [searchText, departmentFilter, seatFilter, programOnly, currentUser])

  const sortedAvailableCourses = useMemo(
    () =>
      [...availableCourses].sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [availableCourses],
  )

  const availableCatalogCredits = useMemo(
    () => sortedAvailableCourses.reduce((sum, c) => sum + c.credits, 0),
    [sortedAvailableCourses],
  )

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) || null,
    [plans, activePlanId],
  )

  useEffect(() => {
    if (plans.length === 0) {
      if (activePlanId !== null) {
        setActivePlanId(null)
      }
      return
    }
    if (!plans.some((p) => p.id === activePlanId)) {
      setActivePlanId(plans[0].id)
    }
  }, [plans, activePlanId])

  const plannedCourses = useMemo(() => {
    if (!activePlan) {
      return []
    }
    return courses.filter((course) => activePlan.courseIds.includes(course.id))
  }, [activePlan])

  const plannedCredits = useMemo(
    () => plannedCourses.reduce((sum, c) => sum + c.credits, 0),
    [plannedCourses],
  )

  /** Courses whose meetings appear on the Planning calendar (enrolled + plan-only stripes). */
  const planningGridCourses = useMemo(() => {
    if (!activePlan) {
      return enrolledCourses
    }
    const enr = new Set(enrolledIds)
    const plannedOnly = plannedCourses.filter((c) => !enr.has(c.id))
    return [...enrolledCourses, ...plannedOnly]
  }, [activePlan, enrolledCourses, enrolledIds, plannedCourses])

  const dashboardBlocks = useMemo(
    () => buildTimeGridBlocks({ enrolledCourses, events, plannedOnly: [] }),
    [enrolledCourses, events],
  )

  const planningCalendarBlocks = useMemo(() => {
    if (!activePlan) {
      return buildTimeGridBlocks({ enrolledCourses, events, plannedOnly: [] })
    }
    const enr = new Set(enrolledIds)
    const plannedOnly = plannedCourses.filter((c) => !enr.has(c.id))
    return buildTimeGridBlocks({ enrolledCourses, events, plannedOnly })
  }, [enrolledCourses, events, activePlan, plannedCourses, enrolledIds])

  const dashboardViewWindow = useMemo(
    () => getViewWindowFromBlocks(dashboardBlocks, settings.compactCalendar),
    [dashboardBlocks, settings.compactCalendar],
  )
  const planningViewWindow = useMemo(
    () => getViewWindowFromBlocks(planningCalendarBlocks, settings.compactCalendar),
    [planningCalendarBlocks, settings.compactCalendar],
  )

  useEffect(() => {
    const pop = popupRef.current
    if (!pop || pop.closed || !currentUser) {
      return
    }
    const src = calendarPopoutSourceRef.current
    const blocks = src === "planning" ? planningCalendarBlocks : dashboardBlocks
    const vw = src === "planning" ? planningViewWindow : dashboardViewWindow
    const termOpt = getPlanningTermOption(planningContext.targetTermId)
    const caption =
      src === "planning"
        ? `Read-only. Planning draft for ${termOpt.label}. Solid blocks: enrolled (${ENROLLMENT_TERM_LABEL} mock) + personal weekly events; striped: courses only in the active plan.`
        : `Read-only. Enrollment week (${ENROLLMENT_TERM_LABEL} mock) — matches the main Enrollment calendar.`
    const html = popoutHtmlForGrid(
      currentUser.name,
      blocks,
      scheduleColumnDays,
      vw.viewStartMin,
      vw.viewEndMin,
      caption,
    )
    pop.document.open()
    pop.document.write(html)
    pop.document.close()
  }, [
    dashboardBlocks,
    planningCalendarBlocks,
    currentUser,
    dashboardViewWindow,
    planningViewWindow,
    settings.compactCalendar,
    planningContext.targetTermId,
  ])

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (plansDirty && activeView === "planning") {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [plansDirty, activeView])

  const clearFilters = () => {
    bumpSession("filterClears")
    setSearchText("")
    setDepartmentFilter("All")
    setSeatFilter("all")
    setProgramOnly(false)
  }

  const applyFilterPreset = (preset) => {
    if (preset === "all") {
      clearFilters()
      return
    }
    bumpSession("filterPresets")
    if (preset === "open") {
      setSeatFilter("open")
      setProgramOnly(false)
    }
    if (preset === "programs") {
      setProgramOnly(true)
      setSeatFilter("all")
    }
  }

  const downloadEnrollmentWeekIcs = () => {
    if (!currentUser) {
      return
    }
    const ics = buildWeekScheduleIcs(dashboardBlocks, `Easy Enroll — ${currentUser.name} (this week, mock)`)
    if (!ics) {
      pushToast("error", "Nothing on your calendar to export yet.")
      return
    }
    downloadIcsFile(ics, "easyenroll-week.ics")
    pushToast("success", "Downloaded a weekly schedule file (.ics).")
  }

  const downloadSemesterIcs = () => {
    if (!currentUser) {
      return
    }
    const ics = buildSemesterScheduleIcs(dashboardBlocks, `Easy Enroll — ${currentUser.name} (mock Spring ’26 dates)`)
    if (!ics) {
      pushToast("error", "Nothing on your calendar to export yet.")
      return
    }
    downloadIcsFile(ics, "easyenroll-semester.ics")
    pushToast("success", "Downloaded a semester-anchored .ics (mock start Jan 12, 2026; not from registrar).")
  }

  const downloadPlanningWeekIcs = () => {
    if (!currentUser) {
      return
    }
    const label = planningTermOption.label
    const ics = buildWeekScheduleIcs(
      planningCalendarBlocks,
      `Easy Enroll — ${currentUser.name} (planning draft: ${label}; mock week export)`,
    )
    if (!ics) {
      pushToast("error", "Nothing on this planning grid to export yet.")
      return
    }
    downloadIcsFile(ics, `easyenroll-planning-${planningTermOption.id}-week.ics`)
    pushToast(
      "success",
      `Downloaded week .ics for planning target “${label}” (mock recurring week; not registrar data).`,
    )
  }

  const downloadPlanningSemesterIcs = () => {
    if (!currentUser) {
      return
    }
    const label = planningTermOption.label
    const ics = buildSemesterScheduleIcs(
      planningCalendarBlocks,
      `Easy Enroll — ${currentUser.name} (planning draft ${label}; mock semester anchor)`,
    )
    if (!ics) {
      pushToast("error", "Nothing on this planning grid to export yet.")
      return
    }
    downloadIcsFile(ics, `easyenroll-planning-${planningTermOption.id}-semester.ics`)
    pushToast(
      "success",
      `Downloaded semester .ics for planning target “${label}” (mock Jan 12, 2026 anchor; not registrar).`,
    )
  }

  const downloadCourseIcs = (course) => {
    const ics = buildSingleCourseIcs(course)
    if (!ics) {
      pushToast("error", "Could not build a file for that course.")
      return
    }
    downloadIcsFile(ics, `${course.id.replace(/[^a-zA-Z0-9-_]/g, "_")}-mock.ics`)
    pushToast("success", "Downloaded a mock semester file for this course only.")
  }

  const addCourseToEnrollment = (course, options = { ignoreEventConflicts: false }) => {
    if (enrolledIds.includes(course.id)) {
      pushToast("error", `${course.id} is already in your schedule.`)
      return { added: false, reason: "duplicate" }
    }

    if (course.seatsAvailable === 0 && !course.waitlistOpen) {
      pushToast("error", `${course.id} has no open seats and the waitlist is closed.`)
      return { added: false, reason: "seat_rule" }
    }

    if (enrolledCredits + course.credits > MAX_CREDITS) {
      pushToast("error", `Adding ${course.id} would go over the ${MAX_CREDITS} credit cap.`)
      return { added: false, reason: "credit_limit" }
    }

    const courseConflict = hasCourseConflict(course, enrolledCourses)
    if (courseConflict) {
      if (settings.showConflictAlerts) {
        pushToast("error", `${course.id} overlaps with ${courseConflict.id} on your schedule.`)
      }
      return { added: false, reason: "course_conflict" }
    }

    const eventConflicts = getEventConflicts(course, events)
    if (eventConflicts.length > 0 && !options.ignoreEventConflicts) {
      setConfirmState({
        type: "event-conflict",
        title: "Event Conflict Warning",
        message: `${course.id} overlaps with ${eventConflicts.map((event) => event.title).join(", ")}. Add anyway?`,
        onConfirm: () => {
          setConfirmState(null)
          addCourseToEnrollment(course, { ignoreEventConflicts: true })
        },
      })
      return { added: false, reason: "event_conflict" }
    }

    setEnrolledIds((prev) => [...prev, course.id])
    bumpSession("enrollSuccess")
    pushToast("success", `${course.id} was added to your enrollment.`, {
      label: "View week calendar",
      onAction: () => setActiveView("dashboard"),
    })
    return { added: true }
  }

  const removeEnrolledCourse = (course) => {
    setConfirmState({
      type: "remove",
      title: "Confirm Removal",
      message: `Remove ${course.id} from enrolled classes?`,
      onConfirm: () => {
        setEnrolledIds((prev) => prev.filter((id) => id !== course.id))
        setConfirmState(null)
        if (enrollmentUndoTimerRef.current) {
          clearTimeout(enrollmentUndoTimerRef.current)
        }
        setEnrollmentUndoCourse(course)
        enrollmentUndoTimerRef.current = setTimeout(() => {
          enrollmentUndoTimerRef.current = null
          setEnrollmentUndoCourse(null)
        }, 5000)
        pushToast("success", `${course.id} was removed. You can undo for a few seconds.`)
      },
    })
  }

  const saveEventFromForm = (mode, editId) => {
    if (!eventForm.title.trim()) {
      pushToast("error", "Event name is required.")
      return
    }
    if (eventForm.days.length === 0) {
      pushToast("error", "Select at least one day for the event.")
      return
    }
    const color =
      eventForm.useCustomColor && eventForm.color ? eventForm.color : eventForm.color || EVENT_COLOR_PRESETS[0]
    if (mode === "add") {
      setEvents((prev) => [
        ...prev,
        normalizeEventEntry({
          id: `ev-${Date.now()}`,
          title: eventForm.title.trim(),
          description: eventForm.details.trim(),
          days: eventForm.days,
          start: eventForm.start,
          end: eventForm.end,
          color,
        }),
      ])
      if (settings.showReminderAlerts) {
        pushToast("success", "Event added to your calendar.")
      }
    } else if (editId) {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === editId
            ? normalizeEventEntry({
                ...ev,
                title: eventForm.title.trim(),
                description: eventForm.details.trim(),
                days: eventForm.days,
                start: eventForm.start,
                end: eventForm.end,
                color,
              })
            : ev,
        ),
      )
      if (settings.showReminderAlerts) {
        pushToast("success", "Event updated.")
      }
    }
    setEventModal(null)
    setEventForm({
      title: "",
      details: "",
      days: ["Monday"],
      start: "13:00",
      end: "14:00",
      color: EVENT_COLOR_PRESETS[0],
      useCustomColor: false,
    })
  }

  const removeEventById = (eventId) => {
    const ev = events.find((e) => e.id === eventId)
    setEvents((prev) => prev.filter((event) => event.id !== eventId))
    setEventModal(null)
    if (settings.showReminderAlerts) {
      pushToast("success", ev ? `"${ev.title}" removed from your calendar.` : "Event removed from your calendar.")
    }
  }

  const onDropToEnroll = (event) => {
    event.preventDefault()
    const courseId = event.dataTransfer.getData("text/plain")
    const course = courses.find((item) => item.id === courseId)
    if (course) {
      addCourseToEnrollment(course)
    }
  }

  const addToPlan = (course) => {
    if (!activePlan) {
      pushToast("error", "Select or create a plan first.")
      return
    }
    if (activePlan.courseIds.includes(course.id)) {
      pushToast("error", `${course.id} is already in this plan.`)
      return
    }
    if (plannedCredits + course.credits > MAX_CREDITS) {
      pushToast("error", PLANNING_CREDIT_CAP_MESSAGE)
      return
    }

    const other = plannedCourses
    const classHit = hasCourseConflict(course, other)
    const evHits = getEventConflicts(course, events)
    if (classHit || evHits.length > 0) {
      const parts = []
      if (classHit) {
        parts.push(`overlaps with ${classHit.id}`)
      }
      if (evHits.length > 0) {
        parts.push(`overlaps with ${evHits.map((e) => `"${e.title}"`).join(", ")}`)
      }
      if (settings.showConflictAlerts) {
        pushToast(
          "error",
          `${course.id} overlaps on this grid (enrolled ${ENROLLMENT_TERM_LABEL}, personal events, or other plan courses): ${parts.join(" and ")}.`,
        )
      }
    }

    setPlans((prev) =>
      prev.map((plan) =>
        plan.id === activePlan.id ? { ...plan, courseIds: [...plan.courseIds, course.id] } : plan,
      ),
    )
  }

  const removeFromPlan = (courseId) => {
    if (!activePlan) {
      return
    }
    setPlans((prev) =>
      prev.map((plan) =>
        plan.id === activePlan.id
          ? { ...plan, courseIds: plan.courseIds.filter((id) => id !== courseId) }
          : plan,
      ),
    )
  }

  const onDropToPlan = (event) => {
    event.preventDefault()
    const courseId = event.dataTransfer.getData("text/plain")
    const course = courses.find((item) => item.id === courseId)
    if (course) {
      addToPlan(course)
    }
  }

  const createPlan = (name) => {
    const planName = (name && name.trim()) || `Plan ${plans.length + 1}`
    const newPlan = { id: `plan-${Date.now()}`, name: planName, courseIds: [] }
    setPlans((prev) => [...prev, newPlan])
    setActivePlanId(newPlan.id)
    pushToast("success", `Created "${planName}". Add courses in the studio.`)
  }

  const importPlanToEnrollment = () => {
    if (!activePlan || activePlan.courseIds.length === 0) {
      pushToast("error", "No courses in the selected plan to import.")
      return
    }

    const tableRows = []
    let addedCount = 0
    let workingIds = [...enrolledIds]
    let workingCredits = enrolledCredits

    for (const courseId of activePlan.courseIds) {
      const course = courses.find((item) => item.id === courseId)
      if (!course) {
        tableRows.push({ id: courseId, title: "—", result: "skipped", reason: "Unknown course id" })
        continue
      }

      const duplicate = workingIds.includes(course.id)
      const seatBlocked = course.seatsAvailable === 0 && !course.waitlistOpen
      const creditBlocked = workingCredits + course.credits > MAX_CREDITS
      const classConflict = hasCourseConflict(
        course,
        courses.filter((entry) => workingIds.includes(entry.id)),
      )
      const eventConflict = getEventConflicts(course, events).length > 0

      if (duplicate || seatBlocked || creditBlocked || classConflict || eventConflict) {
        const reason = duplicate
          ? "Already enrolled"
          : seatBlocked
            ? "Seat / waitlist unavailable"
            : creditBlocked
              ? "Would exceed credit limit"
              : classConflict
                ? `Time overlap with ${classConflict.id}`
                : "Overlap with a personal event"
        tableRows.push({ id: course.id, title: course.title, result: "skipped", reason })
        continue
      }

      workingIds = [...workingIds, course.id]
      workingCredits += course.credits
      addedCount += 1
      tableRows.push({ id: course.id, title: course.title, result: "enrolled", reason: "—" })
    }

    setEnrolledIds(workingIds)
    bumpSession("planImports")

    if (addedCount > 0) {
      pushToast(
        "success",
        tableRows.filter((r) => r.result === "skipped").length === 0
          ? `Imported ${addedCount} course(s) into current-term enrollment (${ENROLLMENT_TERM_LABEL} mock).`
          : `Imported ${addedCount} course(s) into enrollment (${ENROLLMENT_TERM_LABEL} mock). Open the table for skip reasons.`,
        {
          label: "View week calendar",
          onAction: () => setActiveView("dashboard"),
        },
      )
    } else {
      pushToast("error", "No courses could be imported. See the summary table for reasons.")
    }

    setImportSummaryModal({ planName: activePlan.name, addedCount, rows: tableRows })
  }

  const savePlansSnapshot = () => {
    setLastSavedPlansJson(JSON.stringify(plans))
    pushToast("success", "Plan changes saved locally.")
  }

  const plansFileInputRef = useRef(null)

  const downloadPlansJson = () => {
    const blob = new Blob([JSON.stringify(plans, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "easyenroll-plans.json"
    a.click()
    URL.revokeObjectURL(url)
    bumpSession("planExportDownloads")
    pushToast("success", "Downloaded a JSON backup of your plans (mock local storage only).")
  }

  const onPlansFileSelected = (event) => {
    const f = event.target.files?.[0]
    if (!f) {
      return
    }
    const r = new FileReader()
    r.onload = () => {
      try {
        const data = JSON.parse(/** @type {string} */ (r.result))
        if (!Array.isArray(data)) {
          throw new Error("not array")
        }
        for (const p of data) {
          if (typeof p?.id !== "string" || typeof p?.name !== "string" || !Array.isArray(p?.courseIds)) {
            throw new Error("invalid plan")
          }
        }
        setPlans(data)
        setLastSavedPlansJson(JSON.stringify(data))
        setActivePlanId(data[0]?.id ?? null)
        if (currentUser) {
          saveUserBucket(currentUser.id, "plans", data)
        }
        bumpSession("planImportUploads")
        pushToast("success", "Imported plans from JSON. Your previous in-browser plan list was replaced.")
      } catch {
        pushToast("error", "That file is not valid Easy Enroll plan JSON.")
      }
    }
    r.readAsText(f)
    event.target.value = ""
  }

  const planningConflicts = useMemo(
    () => detectPlanConflicts(planningGridCourses, events),
    [planningGridCourses, events],
  )

  const sortedPlanningConflicts = useMemo(() => {
    const courseCourse = planningConflicts.filter((c) => c.type === "course")
    const courseEvent = planningConflicts.filter((c) => c.type === "event")
    return [...courseCourse, ...courseEvent]
  }, [planningConflicts])

  const planningConflictCounts = useMemo(
    () => ({
      course: planningConflicts.filter((c) => c.type === "course").length,
      event: planningConflicts.filter((c) => c.type === "event").length,
    }),
    [planningConflicts],
  )

  const planningConflictsVisible = useMemo(() => {
    if (planningConflictsExpanded || sortedPlanningConflicts.length <= PLANNING_CONFLICTS_INITIAL) {
      return sortedPlanningConflicts
    }
    return sortedPlanningConflicts.slice(0, PLANNING_CONFLICTS_INITIAL)
  }, [planningConflictsExpanded, sortedPlanningConflicts])

  const planningConflictsHiddenCount = sortedPlanningConflicts.length - planningConflictsVisible.length

  useEffect(() => {
    if (sortedPlanningConflicts.length <= PLANNING_CONFLICTS_INITIAL) {
      setPlanningConflictsExpanded(false)
    }
  }, [sortedPlanningConflicts.length])

  const planCompare = useMemo(() => {
    if (plans.length < 1) {
      return null
    }
    const aId = comparePlanAId || plans[0].id
    const bId = comparePlanBId || plans[Math.min(1, plans.length - 1)].id
    const a = plans.find((p) => p.id === aId)
    const b = plans.find((p) => p.id === bId)
    if (!a || !b) {
      return null
    }
    if (a.id === b.id) {
      return {
        a,
        b,
        onlyA: [],
        onlyB: [],
        both: [...a.courseIds],
        samePlan: true,
      }
    }
    const as = new Set(a.courseIds)
    const bs = new Set(b.courseIds)
    return {
      a,
      b,
      onlyA: a.courseIds.filter((id) => !bs.has(id)),
      onlyB: b.courseIds.filter((id) => !as.has(id)),
      both: a.courseIds.filter((id) => bs.has(id)),
      samePlan: false,
    }
  }, [plans, comparePlanAId, comparePlanBId])

  useEffect(() => {
    if (plans.length < 2) {
      setComparePlansOpen(false)
    }
  }, [plans.length])

  useEffect(() => {
    if (activeView !== "planning") {
      setComparePlansOpen(false)
    }
  }, [activeView])

  const toggleEventDay = (day) => {
    setEventForm((prev) => {
      const has = prev.days.includes(day)
      const next = has ? prev.days.filter((d) => d !== day) : [...prev.days, day]
      const order = (d) => scheduleColumnDays.indexOf(d)
      if (next.length === 0) {
        return { ...prev, days: [day] }
      }
      return { ...prev, days: next.sort((a, b) => order(a) - order(b)) }
    })
  }

  const handlePasswordLogin = () => {
    const user = loginWithPassword(localEmail, localPassword)
    if (!user) {
      setLoginError("Invalid email or password. Use demo123 for listed accounts.")
      return
    }
    const nextSession = { userId: user.id, method: "password" }
    hydrateUserState(user)
    saveAuthSession(nextSession)
    setSession(nextSession)
    setLoginError("")
  }

  const handleSsoLogin = () => {
    const user = loginWithSso(ssoUserId)
    if (!user) {
      setLoginError("Could not start SSO session.")
      return
    }
    const nextSession = { userId: user.id, method: "sso" }
    hydrateUserState(user)
    saveAuthSession(nextSession)
    setSession(nextSession)
    setLoginError("")
  }

  const handleLogout = () => {
    if (enrollmentUndoTimerRef.current) {
      clearTimeout(enrollmentUndoTimerRef.current)
      enrollmentUndoTimerRef.current = null
    }
    setEnrollmentUndoCourse(null)
    clearAuthSession()
    setSession(null)
    setEnrolledIds([])
    setEvents(defaultEvents.map(normalizeEventEntry))
    setSettings(defaultSettings)
    setProfile({ name: "", emailLocal: "", avatarDataUrl: "" })
    setPlans([])
    setActivePlanId(null)
    setLastSavedPlansJson("[]")
    setActiveView("dashboard")
    setPlanningContext({ targetTermId: DEFAULT_PLANNING_TARGET_TERM_ID })
    calendarPopoutSourceRef.current = "enrollment"
  }

  const openCalendarPopout = (source = "enrollment") => {
    if (!currentUser) {
      return
    }
    calendarPopoutSourceRef.current = source
    const popup = window.open("about:blank", "easy-enroll-calendar", "width=1100,height=800")
    if (!popup) {
      pushToast("error", "Pop-up was blocked. Allow pop-ups to see the calendar window.")
      return
    }
    popupRef.current = popup
    const blocks = source === "planning" ? planningCalendarBlocks : dashboardBlocks
    const vw = source === "planning" ? planningViewWindow : dashboardViewWindow
    const termOpt = getPlanningTermOption(planningContext.targetTermId)
    const caption =
      source === "planning"
        ? `Read-only. Planning draft for ${termOpt.label}. Solid blocks: enrolled (${ENROLLMENT_TERM_LABEL} mock) + personal weekly events; striped: courses only in the active plan.`
        : `Read-only. Enrollment week (${ENROLLMENT_TERM_LABEL} mock) — matches the main Enrollment calendar.`
    const html = popoutHtmlForGrid(
      currentUser.name,
      blocks,
      scheduleColumnDays,
      vw.viewStartMin,
      vw.viewEndMin,
      caption,
    )
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    pushToast("success", source === "planning" ? "Planning calendar pop-out opened." : "Calendar pop-out opened.")
  }

  if (!session || !currentUser) {
    return (
      <LoginPage
        localEmail={localEmail}
        setLocalEmail={setLocalEmail}
        localPassword={localPassword}
        setLocalPassword={setLocalPassword}
        ssoUserId={ssoUserId}
        setSsoUserId={setSsoUserId}
        onPasswordLogin={handlePasswordLogin}
        onSsoLogin={handleSsoLogin}
        error={loginError}
      />
    )
  }

  return (
    <>
      <a className="skip-link" href="#page-main">
        Skip to main content
      </a>
      <main className="app-shell" id="page-main" tabIndex={-1}>
        <header className="app-topbar">
        <div>
          <h1>Easy Enroll</h1>
          <p className="app-wayfinding muted">
            {activeView === "planning"
              ? `Planning — target ${planningTermOption.shortLabel} (mock). Not registered until you import on Enrollment (${ENROLLMENT_TERM_LABEL} mock). Solid = this term + events; striped = plan-only.`
              : VIEW_WAYFINDING[activeView]}
          </p>
          <p>
            {profile.name || currentUser.name} | {profile.emailLocal || "student"}
            {SCHOOL_EMAIL_DOMAIN}
          </p>
          <p className="muted">Programs: {getProgramNames(currentUser.programs).join("; ")}</p>
        </div>
        <nav className="nav-row">
          <button
            className={`btn ${activeView === "dashboard" ? "btn--primary" : "btn--subtle"}`}
            type="button"
            onClick={() => goToView("dashboard")}
          >
            Enrollment
          </button>
          <button
            className={`btn ${activeView === "planning" ? "btn--primary" : "btn--subtle"}`}
            type="button"
            onClick={() => goToView("planning")}
          >
            Planning
          </button>
          <button
            className={`btn ${activeView === "profile" ? "btn--primary" : "btn--subtle"}`}
            type="button"
            onClick={() => goToView("profile")}
          >
            Profile
          </button>
          <button
            className={`btn ${activeView === "settings" ? "btn--primary" : "btn--subtle"}`}
            type="button"
            onClick={() => goToView("settings")}
          >
            Settings
          </button>
          <button className="btn btn--danger" type="button" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      </header>

      <ToastContainer />

      {!enrollmentOnboardingDismissed && activeView === "dashboard" && (
        <div className="onboarding-notice" role="region" aria-label="Getting started with enrollment">
          <div className="onboarding-notice__body">
            <p className="onboarding-notice__title">
              <strong>Quick tips</strong> <span className="muted">(one-time coach marks — mock prototype)</span>
            </p>
            <ul className="onboarding-notice__list">
              <li>
                <strong>Drag</strong> from <em>Available Courses</em> to the <em>Enrolled Courses</em> drop zone, or use{" "}
                <strong>Add</strong> on a card.
              </li>
              <li>
                <strong>Click</strong> a course card to open details, syllabus (mock link), and calendar export.
              </li>
              <li>
                Use <strong>Recommended</strong> above for year-aware suggestions; chips and search refine the catalog.
              </li>
              <li>
                Open <strong>Planning</strong> to draft alternate schedules without changing enrollment;{" "}
                <strong>Settings</strong> has calendar focus, contrast, and keyboard tips.
              </li>
            </ul>
          </div>
          <button
            className="btn btn--subtle"
            type="button"
            onClick={() => {
              persistEnrollmentOnboardingDismissed()
              setEnrollmentOnboardingDismissed(true)
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {enrollmentUndoCourse && (
        <div className="enrollment-undo-bar" role="status" aria-live="polite">
          <span>
            Removed <strong>{enrollmentUndoCourse.id}</strong> from this term. Undo within a few seconds.
          </span>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => {
              const c = enrollmentUndoCourse
              clearEnrollmentUndo()
              addCourseToEnrollment(c)
            }}
          >
            Undo
          </button>
        </div>
      )}

      {activeView === "dashboard" && (
        <>
          <section className="recommendation-panel">
            <h2>Recommended (next semester — year {classYear} focus)</h2>
            <div className="recommendation-grid">
              {recommendations.map((item) => (
                <button key={item.course.id} className="recommendation" onClick={() => addCourseToEnrollment(item.course)}>
                  <strong>{item.course.id}</strong>
                  <span>{item.course.title}</span>
                  <small>{item.reason}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="search-bar">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              type="text"
              placeholder="Search by course code, title, or professor"
            />
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="All">All Departments</option>
              {[...new Set(courses.map((course) => course.department))].map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <select value={seatFilter} onChange={(event) => setSeatFilter(event.target.value)}>
              <option value="all">All seat statuses</option>
              <option value="open">Open seats only</option>
              <option value="waitlist">Waitlist only</option>
            </select>
            <button className="btn btn--subtle" type="button" onClick={clearFilters}>
              Clear Filters
            </button>
          </section>

          <div className="filter-preset-bar" role="group" aria-label="Quick filter presets">
            <span className="filter-preset-bar__label muted">Presets</span>
            <button
              className="btn btn--chip"
              type="button"
              aria-pressed={
                !programOnly && seatFilter === "all" && !searchText && departmentFilter === "All"
              }
              onClick={() => applyFilterPreset("all")}
            >
              All courses
            </button>
            <button
              className={`btn btn--chip${seatFilter === "open" && !programOnly ? " btn--chip-on" : ""}`}
              type="button"
              aria-pressed={seatFilter === "open" && !programOnly}
              onClick={() => applyFilterPreset("open")}
            >
              Open seats
            </button>
            <button
              className={`btn btn--chip${programOnly ? " btn--chip-on" : ""}`}
              type="button"
              aria-pressed={programOnly}
              onClick={() => applyFilterPreset("programs")}
            >
              My programs
            </button>
          </div>

          <div className="enrollment-summary" aria-live="polite">
            <span>
              <strong>Enrolled:</strong> {enrolledCredits} / {MAX_CREDITS} credits
            </span>
            <span>
              <strong>Catalog (filtered):</strong> {sortedAvailableCourses.length} course
              {sortedAvailableCourses.length === 1 ? "" : "s"} · {availableCatalogCredits} credits
            </span>
          </div>

          <section className="pane-grid">
            <article className="pane">
              <header>
                <h2>Available Courses</h2>
                <p>Click for details. Drag to enroll.</p>
              </header>
              <div
                className={`scroll-list${settings.compactCatalog ? " scroll-list--compact-grid" : ""}`}
              >
                {sortedAvailableCourses.length === 0 && (
                  <p className="muted" role="status">
                    No courses match your filters. Try{" "}
                    <button className="btn btn--link" type="button" onClick={clearFilters}>
                      clearing filters
                    </button>{" "}
                    or changing department and seat options.
                  </p>
                )}
                {sortedAvailableCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    degreeLabels={getCourseDegreeMatches(course.id, currentUser.programs)}
                    onOpen={setSelectedCourse}
                    onAdd={addCourseToEnrollment}
                    addLabel="Add"
                    compact={settings.compactCatalog}
                    draggable
                  />
                ))}
              </div>
            </article>

            <article className="pane" onDragOver={(event) => event.preventDefault()} onDrop={onDropToEnroll}>
              <header>
                <h2>Enrolled Courses</h2>
                <p>Drop here to enroll. Remove with confirmation.</p>
              </header>
              <div
                className={`scroll-list${settings.compactCatalog ? " scroll-list--compact-grid" : ""}`}
              >
                {enrolledCourses.length === 0 && <p className="muted">No enrolled classes yet.</p>}
                {enrolledCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    degreeLabels={getCourseDegreeMatches(course.id, currentUser.programs)}
                    onOpen={setSelectedCourse}
                    onAdd={removeEnrolledCourse}
                    addLabel="Remove"
                    compact={settings.compactCatalog}
                    actionVariant="danger"
                  />
                ))}
              </div>
              <footer className="pane-footer">
                <strong>
                  Credits: {enrolledCredits}/{MAX_CREDITS}
                </strong>
              </footer>
            </article>
          </section>

          <section className="calendar-section">
            <header className="calendar-header">
              <h2>Weekly calendar</h2>
              <div className="calendar-header__actions">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => {
                    setEventForm({
                      title: "",
                      details: "",
                      days: ["Monday"],
                      start: "13:00",
                      end: "14:00",
                      color: EVENT_COLOR_PRESETS[0],
                      useCustomColor: false,
                    })
                    setEventModal({ mode: "add" })
                  }}
                >
                  Add weekly event
                </button>
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => openCalendarPopout("enrollment")}
                >
                  Open pop-out calendar
                </button>
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={downloadEnrollmentWeekIcs}
                  title="Download .ics for Apple, Google, or Outlook"
                >
                  Download week (.ics)
                </button>
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={downloadSemesterIcs}
                  title="Mock Spring 2026 anchor (Jan 12); not from registrar"
                >
                  Download semester (.ics)
                </button>
              </div>
            </header>
            <p className="muted calendar-hint">
              Enrolled courses use solid colors. Click a block for course details or to edit a personal event. When two
              blocks overlap in time, they split into <strong>side-by-side columns</strong> so you can see both. Week and
              semester .ics files use <strong>mock</strong> dates (see toast after download).
            </p>
            <TimeGridCalendar
              blocks={dashboardBlocks}
              days={scheduleColumnDays}
              viewStartMin={dashboardViewWindow.viewStartMin}
              viewEndMin={dashboardViewWindow.viewEndMin}
              initialScrollHour={0}
              onBlockClick={(block) => {
                if (block.data.type === "course") {
                  setSelectedCourse(block.data.course)
                } else {
                  const ev = block.data.event
                  setEventForm({
                    title: ev.title,
                    details: ev.description || "",
                    days: [...ev.days],
                    start: ev.start,
                    end: ev.end,
                    color: ev.color || "#2f6fcb",
                    useCustomColor: true,
                  })
                  setEventModal({ mode: "edit", id: ev.id })
                }
              }}
            />
          </section>
        </>
      )}

      {activeView === "planning" && (
        <section className="planning-section">
          <div className="planning-term-banner" role="region" aria-label="Planning target term">
            <div className="planning-term-banner__row">
              <label className="planning-term-banner__label">
                <span className="planning-term-banner__label-text">Planning draft for</span>
                <select
                  value={planningContext.targetTermId}
                  onChange={(ev) =>
                    setPlanningContext((prev) => ({ ...prev, targetTermId: ev.target.value }))
                  }
                  aria-label="Mock target term for this planning session"
                >
                  {PLANNING_TERM_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="planning-term-banner__note muted">
                This is a <strong>what-if</strong> label only (not registrar data). The week grid still shows your{" "}
                <strong>enrolled</strong> courses from <strong>{ENROLLMENT_TERM_LABEL}</strong> plus{" "}
                <strong>personal events</strong> so you can spot conflicts while drafting for{" "}
                <strong>{planningTermOption.label}</strong>.
              </p>
            </div>
          </div>
          {!planningOnboardingDismissed && (
            <div
              className="onboarding-notice onboarding-notice--planning"
              role="region"
              aria-label="Planning studio introduction"
            >
              <div className="onboarding-notice__body">
                <p className="onboarding-notice__title">
                  <strong>Planning vs Enrollment</strong>{" "}
                  <span className="muted">(one-time — mock prototype)</span>
                </p>
                <ul className="onboarding-notice__list">
                  <li>
                    <strong>Enrollment</strong> is your mock registered schedule for this term. <strong>Planning</strong>{" "}
                    is for what-if sets before you commit.
                  </li>
                  <li>
                    On the calendar, <strong>solid</strong> blocks are enrolled courses; <strong>striped</strong> blocks
                    are only in the active plan.
                  </li>
                  <li>
                    Pick a <strong>planning target term</strong> in the banner (mock label). Import adds to{" "}
                    <strong>{ENROLLMENT_TERM_LABEL}</strong> enrollment, not that future term’s registration.
                  </li>
                  <li>
                    Use the same <strong>search and filter</strong> controls as Enrollment (below when you have a plan).
                    Use <strong>Save plan</strong> above the weekly calendar, then <strong>Import to enrollment</strong>{" "}
                    at the bottom when you like the result.
                  </li>
                  <li>
                    Overlaps are allowed here; check the conflict list and toasts. Compare two plans with the button
                    when you have at least two saved plans.
                  </li>
                  <li>
                    Active plans are limited to <strong>{MAX_CREDITS} credits</strong> like enrollment; talk to your
                    advisor if you need a heavier load.
                  </li>
                </ul>
              </div>
              <button
                className="btn btn--subtle"
                type="button"
                onClick={() => {
                  persistPlanningOnboardingDismissed()
                  setPlanningOnboardingDismissed(true)
                }}
              >
                Dismiss
              </button>
            </div>
          )}
          {plans.length === 0 ? (
            <>
              <div className="planning-empty planning-empty--with-filters">
                <h2>No plans yet</h2>
                <p>
                  Create a plan to draft courses for <strong>{planningTermOption.label}</strong>. Search and filters match
                  the <strong>Enrollment</strong> page (shared settings). After you create a plan, the catalog and calendar
                  layout mirror Enrollment: lists first, then your week.
                </p>
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => {
                    // eslint-disable-next-line no-alert
                    const n = window.prompt("Plan name?", "My plan")
                    if (n !== null) {
                      createPlan(n)
                    }
                  }}
                >
                  Create your first plan
                </button>
              </div>

              <section className="search-bar search-bar--planning" aria-label="Catalog search and filters">
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  type="text"
                  placeholder="Search by course code, title, or professor"
                />
                <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                  <option value="All">All Departments</option>
                  {[...new Set(courses.map((course) => course.department))].map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                <select value={seatFilter} onChange={(event) => setSeatFilter(event.target.value)}>
                  <option value="all">All seat statuses</option>
                  <option value="open">Open seats only</option>
                  <option value="waitlist">Waitlist only</option>
                </select>
                <button className="btn btn--subtle" type="button" onClick={clearFilters}>
                  Clear Filters
                </button>
              </section>

              <div className="filter-preset-bar" role="group" aria-label="Quick filter presets">
                <span className="filter-preset-bar__label muted">Presets</span>
                <button
                  className="btn btn--chip"
                  type="button"
                  aria-pressed={
                    !programOnly && seatFilter === "all" && !searchText && departmentFilter === "All"
                  }
                  onClick={() => applyFilterPreset("all")}
                >
                  All courses
                </button>
                <button
                  className={`btn btn--chip${seatFilter === "open" && !programOnly ? " btn--chip-on" : ""}`}
                  type="button"
                  aria-pressed={seatFilter === "open" && !programOnly}
                  onClick={() => applyFilterPreset("open")}
                >
                  Open seats
                </button>
                <button
                  className={`btn btn--chip${programOnly ? " btn--chip-on" : ""}`}
                  type="button"
                  aria-pressed={programOnly}
                  onClick={() => applyFilterPreset("programs")}
                >
                  My programs
                </button>
              </div>

              <div className="enrollment-summary enrollment-summary--planning" aria-live="polite">
                <span>
                  <strong>Enrolled ({ENROLLMENT_TERM_LABEL}):</strong> {enrolledCredits} / {MAX_CREDITS} credits
                </span>
                <span>
                  <strong>Catalog (filtered):</strong> {sortedAvailableCourses.length} course
                  {sortedAvailableCourses.length === 1 ? "" : "s"} · {availableCatalogCredits} credits
                </span>
              </div>
              <p className="muted planning-filter-hint">
                Filters apply when you add courses to a plan. Switch to <button className="btn btn--link" type="button" onClick={() => goToView("dashboard")}>Enrollment</button> to change your registered classes.
              </p>
            </>
          ) : (
            <>
              <header className="planning-header">
                <div>
                  <h2>Planning studio</h2>
                  <p className="muted">
                    Drafting for <strong>{planningTermOption.label}</strong> — not registration until you{" "}
                    <strong>Import to enrollment</strong> on <strong>{ENROLLMENT_TERM_LABEL}</strong> (mock). Solid
                    blocks: this term’s enrolled courses and your weekly personal events. Striped: courses only in the
                    active plan. Each plan is capped at <strong>{MAX_CREDITS} credits</strong> (advisor approval to
                    overload). Time overlaps are allowed; we toast and list them below.
                  </p>
                </div>
                <div className="planning-tools">
                  <span className="planning-active-label">
                    Active: <strong>{activePlan?.name || "—"}</strong>
                  </span>
                  <button className="btn btn--subtle" type="button" onClick={() => setPlanPickerOpen(true)}>
                    Select plan…
                  </button>
                  <button
                    className="btn btn--subtle"
                    type="button"
                    onClick={() => {
                      // eslint-disable-next-line no-alert
                      const n = window.prompt("New plan name?", `Plan ${plans.length + 1}`)
                      if (n !== null) {
                        createPlan(n)
                      }
                    }}
                  >
                    New plan
                  </button>
                </div>
              </header>

              {activePlan && (
                <div className="planning-summary-strip" role="status" aria-live="polite">
                  <span>
                    <strong>{activePlan.courseIds.length}</strong> course{activePlan.courseIds.length === 1 ? "" : "s"} in
                    plan “{activePlan.name}” (target {planningTermOption.shortLabel})
                  </span>
                  <span
                    className={
                      plannedCredits > MAX_CREDITS
                        ? "planning-summary-strip__credits planning-summary-strip__credits--over"
                        : plannedCredits >= MAX_CREDITS
                          ? "planning-summary-strip__credits planning-summary-strip__credits--full"
                          : "planning-summary-strip__credits"
                    }
                  >
                    <strong>{plannedCredits}</strong> / {MAX_CREDITS} planned credits
                  </span>
                  <span>
                    <strong>{planningConflicts.length}</strong> time conflict{planningConflicts.length === 1 ? "" : "s"}{" "}
                    on this grid (plan + enrolled + events)
                  </span>
                  <span className="planning-summary-strip__context muted">
                    Enrolled courses shown are <strong>{ENROLLMENT_TERM_LABEL}</strong> (mock), not the plan’s target term.
                  </span>
                </div>
              )}

              {activePlan && plannedCredits > MAX_CREDITS && (
                <p className="planning-advisor-banner" role="alert">
                  This plan is over the <strong>{MAX_CREDITS} credit</strong> mock limit (likely from an older save).
                  Remove courses until you are at or under {MAX_CREDITS}, or work with your advisor if you need an
                  overload.
                </p>
              )}

              {plans.length < 2 && (
                <p className="muted plan-compare-hint" role="note">
                  Add a second plan to <strong>compare</strong> course sets side by side (only in A, only in B, shared). Use
                  the button when you have two or more plans.
                </p>
              )}

              {plans.length >= 2 && planCompare && (
                <div className="plan-compare-disclosure">
                  <div className="plan-compare-disclosure__bar">
                    <button
                      className={comparePlansOpen ? "btn btn--subtle" : "btn btn--secondary"}
                      type="button"
                      id="plan-compare-toggle"
                      aria-expanded={comparePlansOpen}
                      aria-controls="plan-compare-panel"
                      onClick={() => setComparePlansOpen((o) => !o)}
                    >
                      {comparePlansOpen ? "Hide plan comparison" : "Compare two plans…"}
                    </button>
                    {!comparePlansOpen && (
                      <span className="muted plan-compare-disclosure__hint">
                        Open to diff two saved plans: only in A, only in B, or shared.
                      </span>
                    )}
                  </div>
                  {comparePlansOpen && (
                    <section
                      id="plan-compare-panel"
                      className="plan-compare"
                      aria-label="Compare two plans"
                      role="region"
                      aria-labelledby="plan-compare-toggle"
                    >
                      <h3>Compare two plans</h3>
                      <p className="muted">Pick which saved plans to diff. Course IDs are from the mock catalog.</p>
                      <div className="plan-compare__pickers">
                        <label>
                          Plan A
                          <select
                            value={planCompare.a.id}
                            onChange={(ev) => setComparePlanAId(ev.target.value)}
                            aria-label="First plan to compare"
                          >
                            {plans.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.courseIds.length} courses)
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Plan B
                          <select
                            value={planCompare.b.id}
                            onChange={(ev) => setComparePlanBId(ev.target.value)}
                            aria-label="Second plan to compare"
                          >
                            {plans.map((p) => (
                              <option key={`b-${p.id}`} value={p.id}>
                                {p.name} ({p.courseIds.length} courses)
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {planCompare.samePlan && (
                        <p className="muted">
                          Select two <strong>different</strong> plans in the lists above to see a diff.
                        </p>
                      )}
                      {!planCompare.samePlan && (
                        <div className="plan-compare__grid">
                          <div>
                            <h4>Only in “{planCompare.a.name}”</h4>
                            {planCompare.onlyA.length === 0 ? (
                              <p className="muted">—</p>
                            ) : (
                              <ul>
                                {planCompare.onlyA.map((id) => {
                                  const c = courses.find((x) => x.id === id)
                                  return <li key={id}>{c ? `${c.id} — ${c.title}` : id}</li>
                                })}
                              </ul>
                            )}
                          </div>
                          <div>
                            <h4>Only in “{planCompare.b.name}”</h4>
                            {planCompare.onlyB.length === 0 ? (
                              <p className="muted">—</p>
                            ) : (
                              <ul>
                                {planCompare.onlyB.map((id) => {
                                  const c = courses.find((x) => x.id === id)
                                  return <li key={id}>{c ? `${c.id} — ${c.title}` : id}</li>
                                })}
                              </ul>
                            )}
                          </div>
                          <div>
                            <h4>In both</h4>
                            {planCompare.both.length === 0 ? (
                              <p className="muted">—</p>
                            ) : (
                              <ul>
                                {planCompare.both.map((id) => {
                                  const c = courses.find((x) => x.id === id)
                                  return <li key={id}>{c ? `${c.id} — ${c.title}` : id}</li>
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}

              <section className="search-bar search-bar--planning" aria-label="Catalog search and filters">
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  type="text"
                  placeholder="Search by course code, title, or professor"
                />
                <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                  <option value="All">All Departments</option>
                  {[...new Set(courses.map((course) => course.department))].map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                <select value={seatFilter} onChange={(event) => setSeatFilter(event.target.value)}>
                  <option value="all">All seat statuses</option>
                  <option value="open">Open seats only</option>
                  <option value="waitlist">Waitlist only</option>
                </select>
                <button className="btn btn--subtle" type="button" onClick={clearFilters}>
                  Clear Filters
                </button>
              </section>

              <div className="filter-preset-bar" role="group" aria-label="Quick filter presets">
                <span className="filter-preset-bar__label muted">Presets</span>
                <button
                  className="btn btn--chip"
                  type="button"
                  aria-pressed={
                    !programOnly && seatFilter === "all" && !searchText && departmentFilter === "All"
                  }
                  onClick={() => applyFilterPreset("all")}
                >
                  All courses
                </button>
                <button
                  className={`btn btn--chip${seatFilter === "open" && !programOnly ? " btn--chip-on" : ""}`}
                  type="button"
                  aria-pressed={seatFilter === "open" && !programOnly}
                  onClick={() => applyFilterPreset("open")}
                >
                  Open seats
                </button>
                <button
                  className={`btn btn--chip${programOnly ? " btn--chip-on" : ""}`}
                  type="button"
                  aria-pressed={programOnly}
                  onClick={() => applyFilterPreset("programs")}
                >
                  My programs
                </button>
              </div>

              <div className="enrollment-summary enrollment-summary--planning" aria-live="polite">
                <span>
                  <strong>Enrolled ({ENROLLMENT_TERM_LABEL}):</strong> {enrolledCredits} / {MAX_CREDITS} credits
                </span>
                <span>
                  <strong>Catalog (filtered):</strong> {sortedAvailableCourses.length} course
                  {sortedAvailableCourses.length === 1 ? "" : "s"} · {availableCatalogCredits} credits
                </span>
                {activePlan && (
                  <span>
                    <strong>Active plan:</strong> {activePlan.courseIds.length} course
                    {activePlan.courseIds.length === 1 ? "" : "s"} · {plannedCredits} / {MAX_CREDITS} planned credits (
                    {planningTermOption.shortLabel})
                  </span>
                )}
              </div>

              <p className="muted planning-studio-familiarity-hint">
                Same controls as <strong>Enrollment</strong> — lists first, then the week grid.{" "}
                <button className="btn btn--link" type="button" onClick={() => goToView("dashboard")}>
                  Open Enrollment
                </button>{" "}
                to edit registration.
              </p>

              <section className="pane-grid">
                <article className="pane">
                  <header>
                    <h2>Available Courses</h2>
                    <p>Click for details. Drag to the plan or use Add to plan.</p>
                  </header>
                  <div
                    className={`scroll-list${settings.compactCatalog ? " scroll-list--compact-grid" : ""}`}
                  >
                    {sortedAvailableCourses.length === 0 && (
                      <p className="muted" role="status">
                        No courses match your filters. Try{" "}
                        <button className="btn btn--link" type="button" onClick={clearFilters}>
                          clearing filters
                        </button>{" "}
                        or changing department and seat options.
                      </p>
                    )}
                    {sortedAvailableCourses.map((course) => {
                      const inPlan = Boolean(activePlan?.courseIds.includes(course.id))
                      const blockedByCap = Boolean(
                        activePlan && !inPlan && plannedCredits + course.credits > MAX_CREDITS,
                      )
                      return (
                        <CourseCard
                          key={`${course.id}-planner`}
                          course={course}
                          degreeLabels={getCourseDegreeMatches(course.id, currentUser.programs)}
                          onOpen={setSelectedCourse}
                          onAdd={addToPlan}
                          addLabel="Add to plan"
                          compact={settings.compactCatalog}
                          actionVariant="secondary"
                          actionDisabled={!activePlan || inPlan || blockedByCap}
                          actionTitle={
                            blockedByCap
                              ? PLANNING_CREDIT_CAP_MESSAGE
                              : !activePlan
                                ? "Select or create a plan first."
                                : inPlan
                                  ? "Already in this plan."
                                  : undefined
                          }
                          draggable
                        />
                      )
                    })}
                  </div>
                </article>

                <article className="pane" onDragOver={(event) => event.preventDefault()} onDrop={onDropToPlan}>
                  <header>
                    <h2>Plan courses</h2>
                    <p>
                      Drop here to add to “{activePlan?.name || "plan"}”. Remove with confirmation.
                      {activePlan && (
                        <span className="muted">
                          {" "}
                          · {plannedCredits} / {MAX_CREDITS} planned credits
                        </span>
                      )}
                    </p>
                  </header>
                  <div
                    className={`scroll-list${settings.compactCatalog ? " scroll-list--compact-grid" : ""}`}
                  >
                    {activePlan && plannedCourses.length === 0 && <p className="muted">Drag or add classes here.</p>}
                    {plannedCourses.map((course) => (
                      <CourseCard
                        key={`${course.id}-planned`}
                        course={course}
                        degreeLabels={getCourseDegreeMatches(course.id, currentUser.programs)}
                        onOpen={setSelectedCourse}
                        onAdd={() => removeFromPlan(course.id)}
                        addLabel="Remove"
                        compact={settings.compactCatalog}
                        actionVariant="danger"
                      />
                    ))}
                  </div>
                  {activePlan && (
                    <footer className="pane-footer pane-footer--plan-credits">
                      <strong>
                        Plan credits: {plannedCredits} / {MAX_CREDITS} (target {planningTermOption.shortLabel})
                      </strong>
                      {plannedCredits >= MAX_CREDITS && (
                        <span className="pane-footer__hint muted">
                          {plannedCredits > MAX_CREDITS
                            ? "Over limit — remove courses or see your advisor."
                            : "At cap — advisor approval needed to add more."}
                        </span>
                      )}
                    </footer>
                  )}
                </article>
              </section>

              <section className="calendar-section planning-calendar-section">
                <header className="calendar-header planning-calendar-header">
                  <h2 className="planning-cal-title planning-cal-title--section">
                    Weekly calendar — enrolled ({ENROLLMENT_TERM_LABEL}) + plan ({planningTermOption.shortLabel})
                  </h2>
                  <div className="calendar-header__actions planning-calendar-header__actions">
                    <div
                      className="planning-calendar-save-group"
                      role="group"
                      aria-label="Save plan to browser storage"
                    >
                      {plansDirty && (
                        <span className="planning-unsaved" role="status">
                          Unsaved plan changes
                        </span>
                      )}
                      <button className="btn btn--secondary" type="button" onClick={savePlansSnapshot}>
                        Save plan
                      </button>
                    </div>
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={() => {
                        setEventForm({
                          title: "",
                          details: "",
                          days: ["Monday"],
                          start: "13:00",
                          end: "14:00",
                          color: EVENT_COLOR_PRESETS[0],
                          useCustomColor: false,
                        })
                        setEventModal({ mode: "add" })
                      }}
                    >
                      Add weekly event
                    </button>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => openCalendarPopout("planning")}
                    >
                      Open pop-out calendar
                    </button>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={downloadPlanningWeekIcs}
                      title={`Mock week .ics for planning target: ${planningTermOption.label}`}
                    >
                      Download week (.ics)
                    </button>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={downloadPlanningSemesterIcs}
                      title={`Mock semester .ics; labeled for ${planningTermOption.label}`}
                    >
                      Download semester (.ics)
                    </button>
                  </div>
                </header>
                <p className="muted calendar-hint">
                  Same personal weekly events as Enrollment (shared mock data). Striped blocks are plan-only for{" "}
                  <strong>{planningTermOption.label}</strong>. Overlaps split into <strong>columns</strong> so enrolled,
                  plan, and events stay visible. Exports name that planning target; dates are still mock.
                </p>
                <TimeGridCalendar
                  blocks={planningCalendarBlocks}
                  days={scheduleColumnDays}
                  viewStartMin={planningViewWindow.viewStartMin}
                  viewEndMin={planningViewWindow.viewEndMin}
                  initialScrollHour={0}
                  onBlockClick={(block) => {
                    if (block.data.type === "course") {
                      setSelectedCourse(block.data.course)
                    } else {
                      const ev = block.data.event
                      setEventForm({
                        title: ev.title,
                        details: ev.description || "",
                        days: [...ev.days],
                        start: ev.start,
                        end: ev.end,
                        color: ev.color || "#2f6fcb",
                        useCustomColor: true,
                      })
                      setEventModal({ mode: "edit", id: ev.id })
                    }
                  }}
                />
              </section>

              <section className="planning-conflicts" aria-labelledby="planning-conflicts-heading">
                <div className="planning-conflicts__head">
                  <div>
                    <h3 id="planning-conflicts-heading">Time conflicts on this grid</h3>
                    <p className="muted planning-conflicts__lead">
                      Same-time meetings among <strong>plan courses</strong>,{" "}
                      <strong>{ENROLLMENT_TERM_LABEL}</strong> enrollment, and <strong>personal weekly events</strong>.
                    </p>
                  </div>
                  {planningConflicts.length > 0 && (
                    <div className="planning-conflicts__badges" aria-label="Conflict counts">
                      {planningConflictCounts.course > 0 && (
                        <span className="planning-conflict-badge planning-conflict-badge--course">
                          {planningConflictCounts.course} class vs class
                        </span>
                      )}
                      {planningConflictCounts.event > 0 && (
                        <span className="planning-conflict-badge planning-conflict-badge--event">
                          {planningConflictCounts.event} vs event
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {planningConflicts.length === 0 && (
                  <div className="planning-conflicts__empty">
                    <p className="planning-conflicts__empty-title">No time overlaps right now</p>
                    <p className="muted planning-conflicts__empty-note">
                      Your plan, enrolled classes, and events do not share the same meeting times on any day.
                    </p>
                  </div>
                )}

                {planningConflictsVisible.length > 0 && (
                  <div className="planning-conflicts__grid">
                    {planningConflictsVisible.map((conflict, index) => (
                      <PlanningConflictCard
                        key={
                          conflict.type === "course"
                            ? `c-${conflict.a}-${conflict.b}-${index}`
                            : `e-${conflict.a}-${conflict.b}-${index}`
                        }
                        conflict={conflict}
                        courses={courses}
                      />
                    ))}
                  </div>
                )}

                {planningConflictsHiddenCount > 0 && (
                  <div className="planning-conflicts__expand-wrap">
                    <button
                      className="btn btn--subtle planning-conflicts__expand"
                      type="button"
                      onClick={() => setPlanningConflictsExpanded(true)}
                    >
                      Show all {sortedPlanningConflicts.length} conflicts ({planningConflictsHiddenCount} more)
                    </button>
                  </div>
                )}

                {planningConflictsExpanded && sortedPlanningConflicts.length > PLANNING_CONFLICTS_INITIAL && (
                  <div className="planning-conflicts__expand-wrap">
                    <button
                      className="btn btn--subtle planning-conflicts__expand"
                      type="button"
                      onClick={() => setPlanningConflictsExpanded(false)}
                    >
                      Show fewer
                    </button>
                  </div>
                )}
              </section>

              <footer className="planning-footer-bar">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={importPlanToEnrollment}
                  disabled={!activePlan || activePlan.courseIds.length === 0}
                  title={`Adds plan courses to current-term enrollment (${ENROLLMENT_TERM_LABEL} mock), not to ${planningTermOption.label} registration.`}
                >
                  Import to enrollment ({ENROLLMENT_TERM_LABEL})
                </button>
              </footer>
            </>
          )}

          {planPickerOpen && (
            <Modal
              title="Select a plan"
              onClose={() => setPlanPickerOpen(false)}
              actions={
                <button className="btn btn--primary" type="button" onClick={() => setPlanPickerOpen(false)}>
                  Done
                </button>
              }
            >
              <ul className="plan-card-list">
                {[...plans]
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
                  .map((plan) => (
                    <li key={plan.id}>
                      <div className="plan-card">
                        <button
                          className="plan-card__main"
                          type="button"
                          onClick={() => {
                            setActivePlanId(plan.id)
                            setPlanPickerOpen(false)
                          }}
                        >
                          <div className="plan-card__title">{plan.name}</div>
                          <div className="plan-card__meta">
                            {plan.courseIds.length
                              ? plan.courseIds.map((id) => {
                                  const c = courses.find((x) => x.id === id)
                                  const line = c ? `${c.id} — ${c.title}` : id
                                  return (
                                    <span
                                      key={id}
                                      className="plan-chip plan-chip--rich"
                                      title={c ? `${c.id}: ${c.title} (${c.credits} cr)` : id}
                                    >
                                      {line}
                                    </span>
                                  )
                                })
                              : "No courses yet"}
                          </div>
                        </button>
                        <div className="plan-card__actions">
                          <button
                            className="btn btn--subtle"
                            type="button"
                            onClick={() => {
                              // eslint-disable-next-line no-alert
                              const n = window.prompt("Rename plan", plan.name)
                              if (n && n.trim()) {
                                setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, name: n.trim() } : p)))
                              }
                            }}
                          >
                            Edit name
                          </button>
                          <button
                            className="btn btn--danger"
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Delete “${plan.name}”?`)) {
                                setPlans((prev) => {
                                  const next = prev.filter((p) => p.id !== plan.id)
                                  if (activePlanId === plan.id) {
                                    setActivePlanId(next[0]?.id ?? null)
                                  }
                                  return next
                                })
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            </Modal>
          )}

        </section>
      )}

      {activeView === "profile" && (
        <section className="profile-section">
          <h2>Profile</h2>
          <p>Identity fields follow university policy. This is a front-end mock only.</p>

          <div className="profile-wide-card">
            <div className="profile-group" aria-labelledby="profile-group-photo-heading">
              <h3 className="profile-group__title" id="profile-group-photo-heading">
                Photo
              </h3>
              <p className="muted profile-group__lead">You can change your picture anytime; it stays in this browser only.</p>
              <div className="profile-avatar-block">
                {profile.avatarDataUrl ? (
                  <img src={profile.avatarDataUrl} alt="" className="profile-avatar" width={96} height={96} />
                ) : (
                  <div className="profile-avatar profile-avatar--ph" aria-hidden>
                    {(profile.name || currentUser.name)
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}
                <label className="profile-file">
                  Update photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0]
                      if (!f) {
                        return
                      }
                      const r = new FileReader()
                      r.onload = () => {
                        setProfile((prev) => ({ ...prev, avatarDataUrl: r.result }))
                        pushToast("success", "Profile picture updated (stored locally in this browser).")
                      }
                      r.readAsDataURL(f)
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="profile-group profile-group--locked" aria-labelledby="profile-group-identity-heading">
              <h3 className="profile-group__title" id="profile-group-identity-heading">
                Identity (read-only in this mock)
              </h3>
              <p className="muted profile-group__lead">
                Public / legal identity can’t be changed here — requests go through the university. No real submission;
                the modal is a stand-in flow.
              </p>
              <div className="profile-locked">
                <p>
                  <strong>Display name (read-only):</strong> {profile.name || currentUser.name}
                </p>
                <p className="muted">Legal name and password are managed by the university directory.</p>
                <div className="profile-request-row">
                  <button className="btn btn--subtle" type="button" onClick={() => setUniRequest({ type: "name" })}>
                    Request name change
                  </button>
                  <button className="btn btn--subtle" type="button" onClick={() => setUniRequest({ type: "password" })}>
                    Request password change
                  </button>
                </div>
              </div>
            </div>

            <div className="profile-group" aria-labelledby="profile-group-contact-heading">
              <h3 className="profile-group__title" id="profile-group-contact-heading">
                School email (editable local part)
              </h3>
              <p className="muted profile-group__lead">
                How a classmate or instructor might see your campus address. “Public preview” = this email line only — no
                live directory.
              </p>
              <div className="profile-public-preview" aria-label="Mock public email preview">
                <span className="muted">Preview:</span>{" "}
                <strong>
                  {(profile.emailLocal || "username").trim() || "username"}
                  {SCHOOL_EMAIL_DOMAIN}
                </strong>
              </div>
              <label>
                Edit local part
                <div className="email-split">
                  <input
                    value={profile.emailLocal}
                    onChange={(event) => {
                      const t = event.target.value.replace(/[^a-zA-Z0-9._-]/g, "")
                      setProfile((prev) => ({ ...prev, emailLocal: t }))
                    }}
                    type="text"
                    autoComplete="off"
                    placeholder="username"
                    aria-label="Email local part (before @)"
                  />
                  <span className="email-split__domain" aria-hidden>
                    {SCHOOL_EMAIL_DOMAIN}
                  </span>
                </div>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  You may edit only the part before @; the domain is fixed for university routing.
                </span>
              </label>
            </div>
          </div>
        </section>
      )}

      {activeView === "settings" && (
        <section className="settings-section settings-section--wide">
          <h2 className="settings-page-title">Settings</h2>
          <div className="settings-page-grid">
            <div className="settings-page-grid__col settings-page-grid__col--controls">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.compactCalendar}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, compactCalendar: event.target.checked }))
                  }
                />
                Focus week view on your schedule
              </label>
              <p className="muted settings-hint">
                Crops the week view to the earliest and latest time on your schedule (courses and personal events) plus
                one hour of padding, snapped to whole hours. Hides off-hours. Applies to Enrollment, Planning, and the
                calendar pop-out. If nothing is on the schedule, a default 7:00 a.m.–7:00 p.m. window is used.
              </p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.compactCatalog}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, compactCatalog: event.target.checked }))
                  }
                />
                Compact course cards (denser list)
              </label>
              <p className="muted settings-hint">
                Merges meeting and exam into one line and arranges cards in a <strong>responsive column grid</strong> (more
                cards per row when the pane is wide; one column on narrow screens). Good for scanning long lists; turn off
                if you prefer a single column.
              </p>
              <details className="settings-backup">
                <summary>Plans backup (JSON)</summary>
                <div className="settings-backup__body">
                  <p className="muted settings-hint">
                    Export or replace your in-browser <strong>saved plans</strong> (not enrollment). Import overwrites
                    the current plan list; keep a file if you need to undo.
                  </p>
                  <div className="settings-backup__actions">
                    <button className="btn btn--secondary" type="button" onClick={downloadPlansJson}>
                      Export plans (.json)
                    </button>
                    <button
                      className="btn btn--subtle"
                      type="button"
                      onClick={() => plansFileInputRef.current?.click()}
                    >
                      Import plans (JSON)…
                    </button>
                    <input
                      ref={plansFileInputRef}
                      className="settings-file-input"
                      type="file"
                      accept="application/json,.json"
                      aria-label="Select plans JSON file"
                      onChange={onPlansFileSelected}
                    />
                  </div>
                </div>
              </details>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.trackSessionStats}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, trackSessionStats: event.target.checked }))
                  }
                />
                Show in-app session activity counts (this visit)
              </label>
              <p className="muted settings-hint">
                In-memory only; resets on refresh. A lightweight stand-in for analytics — not sent anywhere.
              </p>
              {settings.trackSessionStats && (
                <ul className="session-stats" aria-label="This visit activity">
                  <li>Filter clears: {sessionStatsRef.current.filterClears}</li>
                  <li>Filter preset uses: {sessionStatsRef.current.filterPresets}</li>
                  <li>Successful enroll add clicks: {sessionStatsRef.current.enrollSuccess}</li>
                  <li>“Import plan to enrollment” runs: {sessionStatsRef.current.planImports}</li>
                  <li>Plan JSON exports: {sessionStatsRef.current.planExportDownloads}</li>
                  <li>Plan JSON imports: {sessionStatsRef.current.planImportUploads}</li>
                </ul>
              )}
              <details className="settings-advanced">
                <summary>Alerts, motion, and contrast (show more)</summary>
                <div className="settings-advanced__body">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={settings.showConflictAlerts}
                      onChange={(event) =>
                        setSettings((prev) => ({ ...prev, showConflictAlerts: event.target.checked }))
                      }
                    />
                    Enable conflict alerts
                  </label>
                  <p className="muted settings-hint">
                    When off, schedule-overlap toasts are hidden (enrollment add blocked; planning still allows overlap
                    but won’t toast). The planning conflict panel on the page still updates.
                  </p>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={settings.showReminderAlerts}
                      onChange={(event) =>
                        setSettings((prev) => ({ ...prev, showReminderAlerts: event.target.checked }))
                      }
                    />
                    Enable reminder alerts
                  </label>
                  <p className="muted settings-hint">
                    When off, success toasts for adding, editing, or removing personal weekly events on your calendar are
                    suppressed (actions still apply).
                  </p>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={settings.reduceInterfaceMotion}
                      onChange={(event) =>
                        setSettings((prev) => ({ ...prev, reduceInterfaceMotion: event.target.checked }))
                      }
                    />
                    Reduce interface motion (also respects your system’s “reduced motion” when set to off)
                  </label>
                  <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
                    When the OS already requests reduced motion, the calmer experience applies even with this unset.
                  </p>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={settings.highContrast}
                      onChange={(event) =>
                        setSettings((prev) => ({ ...prev, highContrast: event.target.checked }))
                      }
                    />
                    High-contrast theme
                  </label>
                  <p className="muted settings-hint">
                    Dark background and bright text for low vision, glare, or a dim room. You can also zoom the browser;
                    we keep controls keyboard-accessible.
                  </p>
                </div>
              </details>
            </div>
            <div className="settings-page-grid__col settings-page-grid__col--help">
              <h3 className="settings-help-heading">Keyboard and tips</h3>
              <p className="muted settings-help-lead">Keyboard shortcuts and quick tips for the prototype.</p>
              <div className="settings-help-box">
                <HelpTipsList />
              </div>
            </div>
          </div>
          <p className="muted settings-doc-link">
            UI principles in <code>hci-ui-suggestions.md</code> · roadmap in <code>tasks.md</code>.
          </p>
        </section>
      )}

      {eventModal && (
        <Modal
          title={eventModal.mode === "add" ? "Add weekly event" : "Edit event"}
          onClose={() => setEventModal(null)}
          actions={
            <>
              {eventModal.mode === "edit" && eventModal.id && (
                <button
                  className="btn btn--danger"
                  type="button"
                  onClick={() => removeEventById(eventModal.id)}
                >
                  Remove from calendar
                </button>
              )}
              <button className="btn btn--subtle" type="button" onClick={() => setEventModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => saveEventFromForm(eventModal.mode, eventModal.id)}
              >
                {eventModal.mode === "add" ? "Add event" : "Save changes"}
              </button>
            </>
          }
        >
          <div className="event-modal-grid">
            <label>
              Event name
              <input
                value={eventForm.title}
                onChange={(ev) => setEventForm((p) => ({ ...p, title: ev.target.value }))}
                type="text"
              />
            </label>
            <label>
              Details
              <textarea
                rows={3}
                value={eventForm.details}
                onChange={(ev) => setEventForm((p) => ({ ...p, details: ev.target.value }))}
              />
            </label>
            <div className="day-chip-group">
              <span className="day-chip-label">Days (toggle)</span>
              <div className="day-chip-row">
                {scheduleColumnDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`day-chip ${eventForm.days.includes(day) ? "day-chip--on" : ""}`}
                    onClick={() => toggleEventDay(day)}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="event-time-row">
              <label>
                Start
                <input
                  type="time"
                  value={eventForm.start}
                  onChange={(ev) => setEventForm((p) => ({ ...p, start: ev.target.value }))}
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  value={eventForm.end}
                  onChange={(ev) => setEventForm((p) => ({ ...p, end: ev.target.value }))}
                />
              </label>
            </div>
            <div className="color-pick">
              <span>Color on calendar</span>
              <div className="color-presets">
                {EVENT_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="color-swatch"
                    style={{ background: c }}
                    title={c}
                    onClick={() => setEventForm((p) => ({ ...p, color: c, useCustomColor: false }))}
                  />
                ))}
              </div>
              <label className="color-custom">
                <input
                  type="checkbox"
                  checked={eventForm.useCustomColor}
                  onChange={(ev) => setEventForm((p) => ({ ...p, useCustomColor: ev.target.checked }))}
                />
                Custom
                <input
                  type="color"
                  value={eventForm.color?.slice(0, 7) || "#2f6fcb"}
                  onChange={(ev) => setEventForm((p) => ({ ...p, color: ev.target.value, useCustomColor: true }))}
                  aria-label="Pick custom event color"
                />
              </label>
              <p className="color-selected-summary">
                <span className="muted">Selected color: </span>
                <span className="color-hex-value" aria-live="polite">
                  {(eventForm.color || "#2f6fcb").toUpperCase()}
                </span>
              </p>
            </div>
          </div>
        </Modal>
      )}

      {uniRequest && (
        <Modal
          title={uniRequest.type === "name" ? "Request a name change" : "Request a password change"}
          onClose={() => {
            setUniRequest(null)
            setUniRequestNote("")
          }}
          actions={
            <>
              <button
                className="btn btn--subtle"
                type="button"
                onClick={() => {
                  setUniRequest(null)
                  setUniRequestNote("")
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  if (!uniRequestNote.trim()) {
                    pushToast("error", "Please add a short reason for the request.")
                    return
                  }
                  pushToast(
                    "success",
                    "Request recorded (mock). The registrar / IT would email you in a real deployment.",
                  )
                  setUniRequest(null)
                  setUniRequestNote("")
                }}
              >
                Submit
              </button>
            </>
          }
        >
          <p>
            {uniRequest.type === "name"
              ? "Describe why your legal name should be updated in university records."
              : "Describe why you need a password change through the University (not in this app)."}
          </p>
          <label>
            Reason
            <textarea
              rows={4}
              value={uniRequestNote}
              onChange={(ev) => setUniRequestNote(ev.target.value)}
            />
          </label>
        </Modal>
      )}

      {selectedCourse && (
        <Modal
          title="Course details"
          onClose={() => setSelectedCourse(null)}
          actions={
            <>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => downloadCourseIcs(selectedCourse)}
                title="Mock semester start Jan 12, 2026"
              >
                Download .ics (mock)
              </button>
              <button className="btn btn--subtle" type="button" onClick={() => setSelectedCourse(null)}>
                Close
              </button>
              {activeView === "planning" && activePlan?.courseIds.includes(selectedCourse.id) && (
                <button
                  className="btn btn--danger"
                  type="button"
                  onClick={() => {
                    const id = selectedCourse.id
                    setSelectedCourse(null)
                    removeFromPlan(id)
                  }}
                >
                  Remove from plan
                </button>
              )}
              {enrolledIds.includes(selectedCourse.id) ? (
                <button
                  className="btn btn--danger"
                  type="button"
                  onClick={() => {
                    const c = selectedCourse
                    setSelectedCourse(null)
                    removeEnrolledCourse(c)
                  }}
                >
                  Remove from enrollment
                </button>
              ) : (
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => {
                    const c = selectedCourse
                    const r = addCourseToEnrollment(c)
                    if (r.added) {
                      setSelectedCourse(null)
                    }
                  }}
                >
                  Add to enrollment
                </button>
              )}
            </>
          }
        >
          <div className="course-detail">
            <div className="course-detail__section">
              <h4 className="course-detail__label">Course code</h4>
              <p className="course-detail__value">
                <strong>{selectedCourse.id}</strong> · {selectedCourse.department}
              </p>
            </div>
            <div className="course-detail__section">
              <h4 className="course-detail__label">Course title</h4>
              <p className="course-detail__value course-detail__value--title">{selectedCourse.title}</p>
            </div>
            <div className="course-detail__section">
              <h4 className="course-detail__label">Description</h4>
              <p className="course-detail__value">{selectedCourse.description}</p>
            </div>
            <div className="course-detail__section">
              <h4 className="course-detail__label">Syllabus</h4>
              <p className="course-detail__value">
                <a
                  href={selectedCourse.syllabusUrl || "#"}
                  className="mock-syllabus-link"
                  onClick={(e) => e.preventDefault()}
                >
                  Open syllabus (mock link)
                </a>
              </p>
              <p className="muted course-detail__fine">
                Placeholder only — the URL is not a real page. Use the mock .ics download for calendar experiments.
              </p>
            </div>
            <div className="course-detail__section">
              <h4 className="course-detail__label">Instructor</h4>
              <p className="course-detail__value">{selectedCourse.professor}</p>
            </div>
            <div className="course-detail__section">
              <h4 className="course-detail__label">Credits</h4>
              <p className="course-detail__value">{selectedCourse.credits} credits</p>
            </div>
            <div className="course-detail__section">
              <h4 className="course-detail__label">Class times</h4>
              <p className="course-detail__value">{meetingLabel(selectedCourse.meetingTimes)}</p>
            </div>
            <div className="course-detail__section">
              <h4 className="course-detail__label">Exam</h4>
              <p className="course-detail__value">{selectedCourse.examTime}</p>
            </div>
            {getCourseDegreeMatches(selectedCourse.id, currentUser.programs).length > 0 && (
              <div className="course-detail__section">
                <h4 className="course-detail__label">Program fit</h4>
                <div className="chip-row">
                  {getCourseDegreeMatches(selectedCourse.id, currentUser.programs).map((label) => (
                    <span className="chip" key={label}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {importSummaryModal && (
        <Modal
          title="Import to enrollment — summary"
          onClose={() => setImportSummaryModal(null)}
          actions={
            <>
              <button className="btn btn--subtle" type="button" onClick={() => setImportSummaryModal(null)}>
                Close
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  setImportSummaryModal(null)
                  setActiveView("dashboard")
                }}
              >
                View week calendar
              </button>
            </>
          }
        >
          <p className="import-summary__lead">
            Plan <strong>“{importSummaryModal.planName}”</strong> — {importSummaryModal.addedCount} course
            {importSummaryModal.addedCount === 1 ? "" : "s"} added to <strong>current-term enrollment</strong> (
            {ENROLLMENT_TERM_LABEL} mock) when rules allowed. Skipped rows show why.
          </p>
          <div className="import-summary__table-wrap">
            <table className="import-summary__table">
              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col">Title</th>
                  <th scope="col">Result</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {importSummaryModal.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.id}</th>
                    <td>{row.title}</td>
                    <td>
                      {row.result === "enrolled" ? (
                        <span className="import-summary__ok">enrolled</span>
                      ) : (
                        <span className="import-summary__skip">skipped</span>
                      )}
                    </td>
                    <td>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {confirmState && (
        <Modal
          title={confirmState.title}
          onClose={() => setConfirmState(null)}
          actions={
            <>
              <button className="btn btn--subtle" type="button" onClick={() => setConfirmState(null)}>
                Cancel
              </button>
              <button className="btn btn--primary" type="button" onClick={confirmState.onConfirm}>
                Confirm
              </button>
            </>
          }
        >
          <p>{confirmState.message}</p>
        </Modal>
      )}
      </main>
    </>
  )
}

export default App
