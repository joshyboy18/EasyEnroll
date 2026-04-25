import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "./App.css"
import { TimeGridCalendar } from "./components/TimeGridCalendar.jsx"
import { useToast } from "./components/ToastStack.jsx"
import { loginWithPassword, loginWithSso } from "./utils/auth"
import { buildTimeGridBlocks, getViewWindowFromBlocks, popoutHtmlForGrid } from "./utils/calendarLayout.js"
import { courses } from "./data/courses"
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
import { buildWeekScheduleIcs, downloadIcsFile } from "./utils/ics.js"

const MAX_CREDITS = 19
const SCHOOL_EMAIL_DOMAIN = "@school.edu"

const VIEW_WAYFINDING = {
  dashboard: "Enrollment — search the catalog, manage your term, and see your week.",
  planning: "Planning — try alternate schedules before you enroll; compare to your current classes.",
  profile: "Profile — identity fields and how this mock handles university policy.",
  settings: "Settings — display, alerts, and accessibility for the planner.",
}

const EVENT_COLOR_PRESETS = ["#1f8f4c", "#2f6fcb", "#7a3d8c", "#b85c0a", "#0d4a4a", "#6b1d3d"]

function isFormTypingTarget(el) {
  if (!el) {
    return false
  }
  if (el.isContentEditable) {
    return true
  }
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true
  }
  const role = el.getAttribute?.("role")
  if (role === "textbox" || role === "searchbox" || role === "combobox") {
    return true
  }
  return false
}

function isHelpHotkey(e) {
  if (e.key === "?" || e.key === "？") {
    return true
  }
  if (e.code === "Slash" && e.shiftKey) {
    return true
  }
  return false
}

const defaultSettings = {
  compactCalendar: false,
  showConflictAlerts: true,
  showReminderAlerts: true,
  /** Extra soft UI when the OS does not already request reduce (stack with prefers-reduced-motion). */
  reduceInterfaceMotion: false,
  /** High-contrast theme for readability (also helps in bright light). */
  highContrast: false,
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
}) {
  return (
    <article
      className="course-card"
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
      <p className="course-card__meta">Class Time: {meetingLabel(course.meetingTimes)}</p>
      <p className="course-card__meta">Exam: {course.examTime}</p>
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
      >
        {addLabel}
      </button>
    </article>
  )
}

function Modal({ title, children, onClose, actions }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
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
  const [helpOpen, setHelpOpen] = useState(false)
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
  const keyboardLayerRef = useRef({})

  const currentUser = useMemo(
    () => mockUsers.find((entry) => entry.id === session?.userId) || null,
    [session],
  )

  const classYear = currentUser?.classYear ?? 1

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
  }

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
    helpOpen,
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
        if (s.helpOpen) {
          e.preventDefault()
          setHelpOpen(false)
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
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      if (e.repeat) {
        return
      }
      if (!isHelpHotkey(e)) {
        return
      }
      if (isFormTypingTarget(document.activeElement)) {
        return
      }
      e.preventDefault()
      setHelpOpen((o) => !o)
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
    const html = popoutHtmlForGrid(
      currentUser.name,
      dashboardBlocks,
      scheduleColumnDays,
      dashboardViewWindow.viewStartMin,
      dashboardViewWindow.viewEndMin,
    )
    pop.document.open()
    pop.document.write(html)
    pop.document.close()
  }, [dashboardBlocks, currentUser, dashboardViewWindow, settings.compactCalendar])

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
    const ics = buildWeekScheduleIcs(dashboardBlocks, `Easy Enroll — ${currentUser.name}`)
    if (!ics) {
      pushToast("error", "Nothing on your calendar to export yet.")
      return
    }
    downloadIcsFile(ics, "easyenroll-week.ics")
    pushToast("success", "Downloaded a weekly schedule file (.ics). Open it in your phone or desktop calendar.")
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
    pushToast("success", `${course.id} was added to your enrollment.`)
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
        pushToast("error", `${course.id} conflicts with your schedule: ${parts.join(" and ")}.`)
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

    const skipped = []
    let addedCount = 0
    let workingIds = [...enrolledIds]
    let workingCredits = enrolledCredits

    for (const courseId of activePlan.courseIds) {
      const course = courses.find((item) => item.id === courseId)
      if (!course) {
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
          ? "already enrolled"
          : seatBlocked
            ? "seat/waitlist unavailable"
            : creditBlocked
              ? "credit limit"
              : classConflict
                ? `conflicts with ${classConflict.id}`
                : "conflicts with event"
        skipped.push(`${course.id} (${reason})`)
        continue
      }

      workingIds = [...workingIds, course.id]
      workingCredits += course.credits
      addedCount += 1
    }

    setEnrolledIds(workingIds)

    if (addedCount > 0) {
      pushToast(
        "success",
        skipped.length === 0
          ? `Imported ${addedCount} course(s) into your enrollment.`
          : `Imported ${addedCount} course(s). Some were skipped (see summary).`,
      )
    } else {
      pushToast("error", "No courses could be imported. Check seats, credits, and conflicts.")
    }

    setConfirmState({
      type: "summary",
      title: "Import Complete",
      message:
        skipped.length === 0
          ? `Enrolled in ${addedCount} class(es).`
          : `Enrolled in ${addedCount} class(es). Skipped: ${skipped.join("; ")}`,
      onConfirm: () => setConfirmState(null),
    })
  }

  const savePlansSnapshot = () => {
    setLastSavedPlansJson(JSON.stringify(plans))
    pushToast("success", "Plan changes saved locally.")
  }

  const planningConflicts = useMemo(() => detectPlanConflicts(plannedCourses, events), [plannedCourses, events])

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
    setHelpOpen(false)
  }

  const openCalendarPopout = () => {
    if (!currentUser) {
      return
    }
    const popup = window.open("about:blank", "easy-enroll-calendar", "width=1100,height=800")
    if (!popup) {
      pushToast("error", "Pop-up was blocked. Allow pop-ups to see the calendar window.")
      return
    }
    popupRef.current = popup
    const html = popoutHtmlForGrid(
      currentUser.name,
      dashboardBlocks,
      scheduleColumnDays,
      dashboardViewWindow.viewStartMin,
      dashboardViewWindow.viewEndMin,
    )
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    pushToast("success", "Calendar pop-out opened.")
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
    <main className="app-shell">
      <header className="app-topbar">
        <div>
          <h1>Easy Enroll</h1>
          <p className="app-wayfinding muted">{VIEW_WAYFINDING[activeView]}</p>
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
          <button
            className="btn btn--subtle"
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Open tips (? or Shift+/ on US QWERTY when not in a text field)"
          >
            Help
            <span className="help-key-hint" aria-hidden>
              {" "}
              (?)
            </span>
          </button>
          <button className="btn btn--danger" type="button" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      </header>

      <ToastContainer />

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
              <div className="scroll-list">
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
              <div className="scroll-list">
                {enrolledCourses.length === 0 && <p className="muted">No enrolled classes yet.</p>}
                {enrolledCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    degreeLabels={getCourseDegreeMatches(course.id, currentUser.programs)}
                    onOpen={setSelectedCourse}
                    onAdd={removeEnrolledCourse}
                    addLabel="Remove"
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
                <button className="btn btn--secondary" type="button" onClick={openCalendarPopout}>
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
              </div>
            </header>
            <p className="muted calendar-hint">
              Enrolled courses use solid colors. Click a block for course details or to edit a personal event.
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
          {plans.length === 0 ? (
            <div className="planning-empty">
              <h2>No plans yet</h2>
              <p>Create a plan to use the planning studio, then add courses and compare them to your current enrollment.</p>
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
          ) : (
            <>
              <header className="planning-header">
                <div>
                  <h2>Planning studio</h2>
                  <p className="muted">
                    Enrolled classes are solid. Plan-only classes use diagonal striping. Conflicts are allowed; we warn you
                    with a toast and list them below.
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

              <div className="planning-calendar-wrap">
                <h3 className="planning-cal-title">Calendar (enrolled + this plan)</h3>
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
              </div>

              <div className="pane-grid">
                <article className="pane">
                  <h3>Available courses</h3>
                  <div className="scroll-list">
                    {sortedAvailableCourses.length === 0 && (
                      <p className="muted" role="status">
                        No courses match your filters. On Enrollment you can change search, department, and seats — or{" "}
                        <button className="btn btn--link" type="button" onClick={clearFilters}>
                          clear filters
                        </button>
                        .
                      </p>
                    )}
                    {sortedAvailableCourses.map((course) => (
                      <CourseCard
                        key={`${course.id}-planner`}
                        course={course}
                        degreeLabels={getCourseDegreeMatches(course.id, currentUser.programs)}
                        onOpen={setSelectedCourse}
                        onAdd={addToPlan}
                        addLabel="Add to plan"
                        actionVariant="secondary"
                        draggable
                      />
                    ))}
                  </div>
                </article>

                <article className="pane" onDragOver={(event) => event.preventDefault()} onDrop={onDropToPlan}>
                  <h3>
                    Plan courses
                    {activePlan && (
                      <span className="muted" style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                        {" "}
                        — {plannedCredits} planned credits
                      </span>
                    )}
                  </h3>
                  <div className="scroll-list">
                    {activePlan && plannedCourses.length === 0 && <p className="muted">Drag or add classes here.</p>}
                    {plannedCourses.map((course) => (
                      <CourseCard
                        key={`${course.id}-planned`}
                        course={course}
                        degreeLabels={getCourseDegreeMatches(course.id, currentUser.programs)}
                        onOpen={setSelectedCourse}
                        onAdd={() => removeFromPlan(course.id)}
                        addLabel="Remove"
                        actionVariant="danger"
                      />
                    ))}
                  </div>
                </article>
              </div>

              <section className="planning-conflicts">
                <h3>Schedule conflicts in this plan</h3>
                {planningConflicts.length === 0 && <p className="muted">No time overlaps in this plan right now.</p>}
                <ul>
                  {planningConflicts.map((conflict, index) => (
                    <li key={`${conflict.a}-${conflict.b}-${index}`}>
                      {conflict.type === "course"
                        ? `Course ${conflict.a} overlaps with course ${conflict.b}`
                        : `Course ${conflict.a} overlaps with event “${conflict.bTitle || conflict.b}”`}
                    </li>
                  ))}
                </ul>
              </section>

              <footer className="planning-footer-bar">
                {plansDirty && <span className="planning-unsaved">Unsaved plan changes</span>}
                <button className="btn btn--subtle" type="button" onClick={savePlansSnapshot}>
                  Save
                </button>
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={importPlanToEnrollment}
                  disabled={!activePlan || activePlan.courseIds.length === 0}
                >
                  Import to enrollment
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

            <div className="profile-locked">
            <p>
              <strong>Display name:</strong> {profile.name || currentUser.name}
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

            <label>
            School email
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
        </section>
      )}

      {activeView === "settings" && (
        <section className="settings-section">
          <h2>Settings</h2>
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
            Crops the week view to the earliest and latest time on your schedule (courses and personal events) plus one
            hour of padding, snapped to whole hours. Hides off-hours. Applies to Enrollment, Planning, and the calendar
            pop-out. If nothing is on the schedule, a default 7:00 a.m.–7:00 p.m. window is used.
          </p>
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
                When off, schedule-overlap toasts are hidden (enrollment add blocked; planning still allows overlap but
                won’t toast). The planning conflict list on the page still updates.
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
                When the OS already requests reduced motion, the calmer experience applies even with this
                unset.
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
                Dark background and bright text for low vision, glare, or a dim room. You can also zoom the browser; we
                keep controls keyboard-accessible.
              </p>
            </div>
          </details>
          <p className="muted settings-doc-link">
            Principles and a living backlog: <code>hci-ui-suggestions.md</code>. Roadmap: <code>tasks.md</code>.
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
              <button className="btn btn--subtle" type="button" onClick={() => setSelectedCourse(null)}>
                Close
              </button>
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
              {selectedCourse.syllabusUrl ? (
                <p className="course-detail__value">
                  <a href={selectedCourse.syllabusUrl} target="_blank" rel="noreferrer">
                    Open course syllabus
                  </a>{" "}
                  <span className="muted">(mock link)</span>
                </p>
              ) : (
                <p className="course-detail__value muted">
                  No syllabus in this mock catalog. In production this would point to the LMS or department site.
                </p>
              )}
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

      {helpOpen && (
        <Modal
          title="Tips and keyboard"
          onClose={() => setHelpOpen(false)}
          actions={
            <button className="btn btn--primary" type="button" onClick={() => setHelpOpen(false)}>
              Got it
            </button>
          }
        >
          <ul className="help-tips">
            <li>
              Press <kbd>?</kbd> (on many US keyboards: <kbd>Shift</kbd>+<kbd>/</kbd>) to open or close this panel when
              you are <strong>not</strong> focused in a text field.
            </li>
            <li>
              Press <kbd>Esc</kbd> to close any dialog, including this one and course details.
            </li>
            <li>
              Use the top navigation: <strong>Enrollment</strong> to search and enroll, <strong>Planning</strong> to try
              alternate course sets, <strong>Settings</strong> for the calendar view and high contrast.
            </li>
            <li>Download a <strong>week</strong> file (Enrollment → weekly calendar) to check your plan on a phone or desktop calendar app.</li>
          </ul>
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
  )
}

export default App
