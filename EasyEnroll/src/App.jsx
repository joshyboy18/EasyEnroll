import { useEffect, useMemo, useRef, useState } from "react"
import "./App.css"
import { loginWithPassword, loginWithSso } from "./utils/auth"
import { courses } from "./data/courses"
import { mockUsers } from "./data/mockUsers"
import {
  detectPlanConflicts,
  getEventConflicts,
  groupScheduleByDay,
  hasCourseConflict,
  meetingLabel,
  weekDays,
} from "./utils/conflicts"
import {
  getCourseDegreeMatches,
  getProgramNames,
  getRecommendations,
} from "./utils/degreeProgress"
import {
  clearAuthSession,
  loadAuthSession,
  loadUserBucket,
  saveAuthSession,
  saveUserBucket,
} from "./utils/storage"

const MAX_CREDITS = 19

const defaultSettings = {
  compactCalendar: false,
  showConflictAlerts: true,
  showReminderAlerts: true,
}

const defaultEvents = [
  {
    id: "ev-work",
    title: "Campus Job",
    days: ["Monday", "Wednesday"],
    start: "14:30",
    end: "16:30",
  },
]

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
  onDragStart,
  actionVariant = "primary",
  actionDisabled = false,
}) {
  return (
    <article
      className="course-card"
      draggable={draggable}
      onDragStart={(event) => onDragStart?.(event, course.id)}
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

  const [session, setSession] = useState(() => initialSession)
  const [activeView, setActiveView] = useState("dashboard")

  const [localEmail, setLocalEmail] = useState("jlee@easyenroll.edu")
  const [localPassword, setLocalPassword] = useState("demo123")
  const [ssoUserId, setSsoUserId] = useState(mockUsers[0].id)
  const [loginError, setLoginError] = useState("")

  const [searchText, setSearchText] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("All")
  const [seatFilter, setSeatFilter] = useState("all")

  const [selectedCourse, setSelectedCourse] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const [notification, setNotification] = useState("")

  const [enrolledIds, setEnrolledIds] = useState(() =>
    initialUser ? loadUserBucket(initialUser.id, "enrolled", []) : [],
  )
  const [events, setEvents] = useState(() =>
    initialUser ? loadUserBucket(initialUser.id, "events", defaultEvents) : defaultEvents,
  )
  const [settings, setSettings] = useState(() =>
    initialUser ? loadUserBucket(initialUser.id, "settings", defaultSettings) : defaultSettings,
  )
  const [profile, setProfile] = useState(() =>
    initialUser
      ? loadUserBucket(initialUser.id, "profile", {
          name: initialUser.name,
          email: initialUser.email,
        })
      : { name: "", email: "" },
  )
  const [plans, setPlans] = useState(() =>
    initialUser
      ? loadUserBucket(initialUser.id, "plans", [{ id: "plan-main", name: "Main Draft", courseIds: [] }])
      : [{ id: "plan-main", name: "Main Draft", courseIds: [] }],
  )
  const [activePlanId, setActivePlanId] = useState(() =>
    initialUser
      ? (loadUserBucket(initialUser.id, "plans", [{ id: "plan-main", name: "Main Draft", courseIds: [] }])[0]?.id ??
        "plan-main")
      : "plan-main",
  )

  const [eventForm, setEventForm] = useState({
    title: "",
    days: ["Monday"],
    start: "13:00",
    end: "14:00",
  })

  const popupRef = useRef(null)

  const currentUser = useMemo(
    () => mockUsers.find((entry) => entry.id === session?.userId) || null,
    [session],
  )

  const hydrateUserState = (user) => {
    const nextEnrolled = loadUserBucket(user.id, "enrolled", [])
    const nextEvents = loadUserBucket(user.id, "events", defaultEvents)
    const nextSettings = loadUserBucket(user.id, "settings", defaultSettings)
    const nextProfile = loadUserBucket(user.id, "profile", { name: user.name, email: user.email })
    const nextPlans = loadUserBucket(user.id, "plans", [
      { id: "plan-main", name: "Main Draft", courseIds: [] },
    ])

    setEnrolledIds(nextEnrolled)
    setEvents(nextEvents)
    setSettings(nextSettings)
    setProfile(nextProfile)
    setPlans(nextPlans)
    setActivePlanId(nextPlans[0]?.id || "plan-main")
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
    return getRecommendations(courses, enrolledCourses, currentUser.programs).slice(0, 6)
  }, [currentUser, enrolledCourses])

  const availableCourses = useMemo(() => {
    return courses.filter((course) => {
      const textHit = `${course.id} ${course.title} ${course.professor}`
        .toLowerCase()
        .includes(searchText.toLowerCase())
      const departmentHit = departmentFilter === "All" || departmentFilter === course.department
      const seatHit =
        seatFilter === "all" ||
        (seatFilter === "open" && course.seatsAvailable > 0) ||
        (seatFilter === "waitlist" && course.seatsAvailable === 0 && course.waitlistOpen)

      return textHit && departmentHit && seatHit
    })
  }, [searchText, departmentFilter, seatFilter])

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) || plans[0],
    [plans, activePlanId],
  )

  const plannedCourses = useMemo(() => {
    if (!activePlan) {
      return []
    }
    return courses.filter((course) => activePlan.courseIds.includes(course.id))
  }, [activePlan])

  const scheduleByDay = useMemo(
    () => groupScheduleByDay(enrolledCourses, events),
    [enrolledCourses, events],
  )

  useEffect(() => {
    if (!popupRef.current || popupRef.current.closed || !currentUser) {
      return
    }

    const rows = weekDays
      .map((day) => {
        const items = scheduleByDay[day]
          .map((item) => `<li><strong>${item.start}-${item.end}</strong> ${item.title}</li>`)
          .join("")
        return `<section><h3>${day}</h3><ul>${items || "<li>No items</li>"}</ul></section>`
      })
      .join("")

    popupRef.current.document.body.innerHTML = `
      <main style="font-family: Arial, sans-serif; padding: 16px; background: #f4faf4; color: #14361e;">
        <h1>Easy Enroll Calendar - ${currentUser.name}</h1>
        <p>Synced read-only pop-out view.</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">${rows}</div>
      </main>
    `
  }, [scheduleByDay, currentUser])

  const clearFilters = () => {
    setSearchText("")
    setDepartmentFilter("All")
    setSeatFilter("all")
  }

  const addCourseToEnrollment = (course, options = { ignoreEventConflicts: false }) => {
    if (enrolledIds.includes(course.id)) {
      setNotification(`${course.id} is already enrolled.`)
      return { added: false, reason: "duplicate" }
    }

    if (course.seatsAvailable === 0 && !course.waitlistOpen) {
      setNotification(`${course.id} cannot be added because no seats or waitlist are available.`)
      return { added: false, reason: "seat_rule" }
    }

    if (enrolledCredits + course.credits > MAX_CREDITS) {
      setNotification(`Adding ${course.id} exceeds the ${MAX_CREDITS} credit limit.`)
      return { added: false, reason: "credit_limit" }
    }

    const courseConflict = hasCourseConflict(course, enrolledCourses)
    if (courseConflict) {
      setNotification(`${course.id} conflicts with ${courseConflict.id} and cannot be added.`)
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
    setNotification(`${course.id} was added successfully.`)
    return { added: true }
  }

  const removeEnrolledCourse = (course) => {
    setConfirmState({
      type: "remove",
      title: "Confirm Removal",
      message: `Remove ${course.id} from enrolled classes?`,
      onConfirm: () => {
        setEnrolledIds((prev) => prev.filter((id) => id !== course.id))
        setNotification(`${course.id} was removed.`)
        setConfirmState(null)
      },
    })
  }

  const createEvent = () => {
    if (!eventForm.title.trim()) {
      setNotification("Event title is required.")
      return
    }
    if (eventForm.days.length === 0) {
      setNotification("Select at least one day for the event.")
      return
    }
    setEvents((prev) => [
      ...prev,
      {
        id: `ev-${Date.now()}`,
        title: eventForm.title.trim(),
        days: eventForm.days,
        start: eventForm.start,
        end: eventForm.end,
      },
    ])
    setEventForm({ title: "", days: ["Monday"], start: "13:00", end: "14:00" })
    setNotification("Event added to calendar.")
  }

  const deleteEvent = (eventId) => {
    setEvents((prev) => prev.filter((event) => event.id !== eventId))
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
      return
    }
    if (activePlan.courseIds.includes(course.id)) {
      setNotification(`${course.id} is already in this mock plan.`)
      return
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

  const createPlan = () => {
    const planName = `Draft ${plans.length + 1}`
    const newPlan = { id: `plan-${Date.now()}`, name: planName, courseIds: [] }
    setPlans((prev) => [...prev, newPlan])
    setActivePlanId(newPlan.id)
  }

  const importPlanToEnrollment = () => {
    if (!activePlan || activePlan.courseIds.length === 0) {
      setNotification("No courses in selected plan.")
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

    setConfirmState({
      type: "summary",
      title: "Import Complete",
      message:
        skipped.length === 0
          ? `Imported all classes. ${addedCount} classes enrolled.`
          : `Imported ${addedCount} classes. Skipped: ${skipped.join("; ")}`,
      onConfirm: () => setConfirmState(null),
    })
  }

  const planningConflicts = useMemo(() => detectPlanConflicts(plannedCourses, events), [plannedCourses, events])

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
    clearAuthSession()
    setSession(null)
    setEnrolledIds([])
    setEvents(defaultEvents)
    setSettings(defaultSettings)
    setProfile({ name: "", email: "" })
    setPlans([{ id: "plan-main", name: "Main Draft", courseIds: [] }])
    setActivePlanId("plan-main")
    setActiveView("dashboard")
    setNotification("")
  }

  const openCalendarPopout = () => {
    const popup = window.open("", "easy-enroll-calendar", "width=960,height=720")
    if (popup) {
      popupRef.current = popup
      setNotification("Calendar pop-out opened.")
    }
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
          <p>{profile.name || currentUser.name} | {profile.email || currentUser.email}</p>
          <p className="muted">Programs: {getProgramNames(currentUser.programs).join("; ")}</p>
        </div>
        <nav className="nav-row">
          <button
            className={`btn ${activeView === "dashboard" ? "btn--primary" : "btn--subtle"}`}
            type="button"
            onClick={() => setActiveView("dashboard")}
          >
            Enrollment
          </button>
          <button
            className={`btn ${activeView === "planning" ? "btn--primary" : "btn--subtle"}`}
            type="button"
            onClick={() => setActiveView("planning")}
          >
            Planning
          </button>
          <button
            className={`btn ${activeView === "profile" ? "btn--primary" : "btn--subtle"}`}
            type="button"
            onClick={() => setActiveView("profile")}
          >
            Profile
          </button>
          <button
            className={`btn ${activeView === "settings" ? "btn--primary" : "btn--subtle"}`}
            type="button"
            onClick={() => setActiveView("settings")}
          >
            Settings
          </button>
          <button className="btn btn--danger" type="button" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      </header>

      {notification && <p className="notice">{notification}</p>}

      {activeView === "dashboard" && (
        <>
          <section className="recommendation-panel">
            <h2>Recommended For Next Semester</h2>
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

          <section className="pane-grid">
            <article className="pane">
              <header>
                <h2>Available Courses</h2>
                <p>Click for details. Drag to enroll.</p>
              </header>
              <div className="scroll-list">
                {availableCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    degreeLabels={getCourseDegreeMatches(course.id, currentUser.programs)}
                    onOpen={setSelectedCourse}
                    onAdd={addCourseToEnrollment}
                    addLabel="Add"
                    draggable
                    onDragStart={(event, courseId) => {
                      event.dataTransfer.setData("text/plain", courseId)
                    }}
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
              <h2>Weekly Calendar</h2>
              <button className="btn btn--secondary" type="button" onClick={openCalendarPopout}>
                Open Pop-out Calendar
              </button>
            </header>

            <div className={`calendar-grid ${settings.compactCalendar ? "calendar-grid--compact" : ""}`}>
              {weekDays.map((day) => (
                <article className="calendar-day" key={day}>
                  <h3>{day}</h3>
                  <ul>
                    {scheduleByDay[day].length === 0 && <li className="muted">No items</li>}
                    {scheduleByDay[day].map((item) => (
                      <li key={item.id} className={`calendar-item calendar-item--${item.kind}`}>
                        <strong>
                          {item.start}-{item.end}
                        </strong>
                        <span>{item.title}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            <section className="event-editor">
              <h3>Add Weekly Event</h3>
              <div className="event-editor__grid">
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Event title"
                />
                <input
                  type="time"
                  value={eventForm.start}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, start: event.target.value }))}
                />
                <input
                  type="time"
                  value={eventForm.end}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, end: event.target.value }))}
                />
                <select
                  value={eventForm.days[0]}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, days: [event.target.value] }))}
                >
                  {weekDays.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
                <button className="btn btn--primary" type="button" onClick={createEvent}>
                  Add Event
                </button>
              </div>
              <ul className="event-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <span>
                      {event.title} | {event.days.join(", ")} | {event.start}-{event.end}
                    </span>
                    <button className="btn btn--subtle" type="button" onClick={() => deleteEvent(event.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </section>
        </>
      )}

      {activeView === "planning" && (
        <section className="planning-section">
          <header className="planning-header">
            <h2>Planning Studio (Mock Schedule)</h2>
            <p>Conflicts are allowed here for test planning.</p>
            <div className="planning-tools">
              <select value={activePlan?.id || ""} onChange={(event) => setActivePlanId(event.target.value)}>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              <button className="btn btn--subtle" type="button" onClick={createPlan}>
                New Plan
              </button>
              <button className="btn btn--primary" type="button" onClick={importPlanToEnrollment}>
                Import Plan To Enrollment
              </button>
            </div>
          </header>

          <div className="pane-grid">
            <article className="pane">
              <h3>Available Courses</h3>
              <div className="scroll-list">
                {availableCourses.map((course) => (
                  <CourseCard
                    key={`${course.id}-planner`}
                    course={course}
                    degreeLabels={getCourseDegreeMatches(course.id, currentUser.programs)}
                    onOpen={setSelectedCourse}
                    onAdd={addToPlan}
                    addLabel="Add To Plan"
                    actionVariant="secondary"
                    draggable
                    onDragStart={(event, courseId) => {
                      event.dataTransfer.setData("text/plain", courseId)
                    }}
                  />
                ))}
              </div>
            </article>

            <article className="pane" onDragOver={(event) => event.preventDefault()} onDrop={onDropToPlan}>
              <h3>Plan Courses</h3>
              <div className="scroll-list">
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
            <h3>Planning Conflicts (Allowed)</h3>
            {planningConflicts.length === 0 && <p className="muted">No conflicts currently in this plan.</p>}
            <ul>
              {planningConflicts.map((conflict, index) => (
                <li key={`${conflict.a}-${conflict.b}-${index}`}>
                  {conflict.type === "course"
                    ? `${conflict.a} conflicts with ${conflict.b}`
                    : `${conflict.a} overlaps with event ${conflict.b}`}
                </li>
              ))}
            </ul>
          </section>
        </section>
      )}

      {activeView === "profile" && (
        <section className="profile-section">
          <h2>Profile</h2>
          <p>Update your account profile information for this prototype.</p>
          <label>
            Name
            <input
              value={profile.name}
              onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Email
            <input
              value={profile.email}
              onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <p className="muted">Password changes are managed by University SSO in this prototype.</p>
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
            Use compact calendar mode
          </label>
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
        </section>
      )}

      {selectedCourse && (
        <Modal title={`${selectedCourse.id} details`} onClose={() => setSelectedCourse(null)}>
          <p>{selectedCourse.title}</p>
          <p>{selectedCourse.description}</p>
          <p>Professor: {selectedCourse.professor}</p>
          <p>Credits: {selectedCourse.credits}</p>
          <p>Class Time: {meetingLabel(selectedCourse.meetingTimes)}</p>
          <p>Exam: {selectedCourse.examTime}</p>
          <div className="chip-row">
            {getCourseDegreeMatches(selectedCourse.id, currentUser.programs).map((label) => (
              <span className="chip" key={label}>
                {label}
              </span>
            ))}
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
  )
}

export default App
