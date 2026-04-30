# EasyEnroll

EasyEnroll is a student course enrollment and planning prototype for our HCI course project. It was designed to address a common problem with school registration systems: they are often cluttered, difficult to scan, and not very helpful for building a conflict-free schedule.

## Hosted Link
https://joshyboy18.github.io/EasyEnroll/

## Project Summary

EasyEnroll is a frontend-only React application that helps students search for classes, manage enrollment, draft future-term plans, degree progress, and visualize weekly schedules. The interface emphasizes clear feedback, constraint visibility, and error prevention.

**Key Features:**
- 🎯 User-friendly interface with a focus on usability and intuitive design
- 📚 Onboarding tutorial to guide new users through the application
- 🔍 Course catalog search with filtering by department, seat status, and degree requirements
- ✅ Enrollment validation with real-time conflict detection
- 📋 Planning mode for drafting and comparing future-term schedules
- 📅 Time-grid calendar with Sun–Sat schedule visualization
- 📤 Schedule pop-out and export as `.ics` files for calendar apps (Google Calendar, Outlook, etc.)
- ♿ Accessibility features (ARIA labels, keyboard navigation, high-contrast mode, reduced motion)
- ⚠️ Toast notifications for user feedback and error handling
- 💾 Browser localStorage persistence for sessions, plans, and profiles

## Project Structure

```text
EasyEnroll/
├── src/
│   ├── App.jsx                      (Main app state and layout)
│   ├── App.css                      (Application-wide styles)
│   ├── main.jsx                     (React entry point)
│   ├── index.css                    (Global styles and reset)
│   ├── components/
│   │   ├── TimeGridCalendar.jsx     (Time-grid calendar renderer)
│   │   └── ToastStack.jsx           (Toast notification system)
│   ├── data/
│   │   ├── courses.js               (Course catalog data)
│   │   ├── degreeSheets.js          (Degree requirements by program)
│   │   ├── mockUsers.js             (Demo user accounts for testing)
│   │   └── planningTerms.js         (Academic term definitions)
│   └── utils/
│       ├── auth.js                  (Login validation logic)
│       ├── calendarLayout.js        (Time-grid positioning and layout)
│       ├── conflicts.js             (Schedule conflict detection)
│       ├── courseColors.js          (Course color assignment)
│       ├── courseDrag.js            (Drag-and-drop interaction)
│       ├── degreeProgress.js        (Degree audit and recommendations)
│       ├── ics.js                   (iCalendar export generation)
│       ├── prerequisites.js         (Prerequisite checking)
│       ├── storage.js               (localStorage persistence)
│       └── timeFormat.js            (Time display formatting)
├── public/
├── index.html
├── package.json
├── vite.config.js
├── eslint.config.js
└── README.md
```

## Libraries and Frameworks

### Core Technologies
- **React 19** — Component-based UI framework with hooks for state management
- **React DOM** — DOM rendering and lifecycle management
- **Vite** — Fast development server with Hot Module Replacement (HMR) and optimized production builds
- **ESLint** — Static code analysis for consistency and best practices

### Why These Choices
- React provides reusable component architecture for modular UI design
- Vite enables rapid iteration with instant feedback during development
- ESLint ensures consistent code style across the entire team
- No backend API needed; mock data allows focus on interaction design and UX

## Running the Project

### Prerequisites

- Node.js and npm
- A modern browser such as Chrome, Edge, Firefox, or Safari

### Install

```bash
npm install
```

### Start the Dev Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or another port if 5173 is in use).

For other ports use (example):
```bash
npm run dev -- --port 3000
```

Replace `3000` with any available port number you prefer.

**Hot Reload:** Edit any `.jsx` or `.css` file and the browser will automatically refresh without losing state.

### Build for Production

```bash
npm run build
```

### Preview the Build

```bash
npm run preview
```

### Lint the Code

```bash
npm run lint
```

## Code Organization & Readability

The codebase follows modular design principles to maximize clarity and maintainability:

### Component Layer (`src/components/`)
- **Reusable UI pieces** with single responsibilities
- **TimeGridCalendar.jsx** renders the calendar grid with overlap handling
- **ToastStack.jsx** manages notification display and lifecycle
- Components are self-contained and easy to reason about

### Data Layer (`src/data/`)
- **Separated from UI logic** to keep components clean
- **Immutable mock data** for courses, users, and degree information
- Easy to swap with API calls in the future without changing components

### Utility Layer (`src/utils/`)
- **Domain-specific logic** isolated from UI rendering
- **Meaningful function names** like `hasCourseConflict`, `buildTimeGridBlocks`, `downloadIcsFile`
- **Consistent naming conventions** across all modules (e.g., `toMinutes`, `formatHourGutterLabel`)
- **Clear responsibility** — each file handles one feature area

### Naming Conventions
- React components use PascalCase: `TimeGridCalendar`, `ToastStack`
- Functions use camelCase: `detectPlanConflicts`, `getCourseDegreeMatches`
- Constants use UPPER_SNAKE_CASE: `MAX_CREDITS`, `MIN_IN_DAY`, `PLANNING_CREDIT_CAP_MESSAGE`
- Booleans use descriptive prefixes: `showConflictAlerts`, `compactCalendar`

### Comments & Documentation
- Comments explain non-obvious logic (e.g., time-grid overlap calculations, iCalendar format rules)
- JSDoc comments document function parameters and return types where helpful
- Code follows consistent indentation and whitespace rules (enforced by ESLint)

## Key Components

### App.jsx

Main application container and state coordinator. It handles authentication, enrollment, planning, settings, notifications, and calendar data.

### TimeGridCalendar.jsx

Renders the schedule grid and positions events on a time axis. It also handles overlap layout so conflicting items remain readable.

### ToastStack.jsx

Displays short-lived user feedback messages for success, warning, and error states.

### Data Modules

- `courses.js` — 40+ course catalog entries with meeting times, credits, and seat availability
- `mockUsers.js` — Demo user accounts for testing different student scenarios
- `degreeSheets.js` — Degree requirements and elective course mappings
- `planningTerms.js` — Academic term definitions (Spring 2026, Fall 2026, etc.)

### Utility Modules

- `auth.js` — Password and SSO login validation
- `conflicts.js` — Schedule overlap detection for courses and events
- `degreeProgress.js` — Course-to-degree matching and recommendation engine
- `calendarLayout.js` — Time-grid rendering math and overlap positioning
- `courseDrag.js` — Drag-and-drop interaction and visual feedback
- `ics.js` — iCalendar file generation and export
- `storage.js` — Browser localStorage persistence and namespacing
- `timeFormat.js` — Time display and parsing utilities

## Demo Users

Three test accounts are included in the application. Login with any of these:

| Name | Email | Program | Year |
|------|-------|---------|------|
| Jordan Lee | `jlee@easyenroll.edu` | BS Computer Science | Freshman |
| Avery Patel | `apatel@easyenroll.edu` | BS Biology | Sophomore |
| Morgan Rivera | `mrivera@easyenroll.edu` | BS Computer Science | Junior |

## Software Engineering Practices

### 1. Modular Design
- Components, data, and utilities are separated by concern
- Each file has a single, clear responsibility
- Easy to locate and modify specific features without affecting others

### 2. Meaningful Naming
- Function names describe what they do: `hasCourseConflict`, `detectPlanConflicts`, `buildTimeGridBlocks`
- Variable names are descriptive: `enrolledIds`, `plannedCourses`, `timeSlots`
- Abbreviations are avoided unless universally understood

### 3. Consistent Formatting
- ESLint enforces code style across the project
- Consistent indentation, spacing, and quote usage
- All files follow the same structural patterns

### 4. Appropriate Comments
- Comments explain the "why" rather than the "what"
- Complex logic (overlap detection, time calculations) includes explanatory comments
- JSDoc-style comments on exported functions

### 5. Error Prevention & Handling
- Input validation before state updates
- Toast notifications for user feedback
- Graceful fallbacks for missing or invalid data

## Data Flow

```text
User logs in
  ↓
Load session and user data from localStorage
  ↓
Render enrolled courses, plans, and calendar blocks
  ↓
User searches, filters, or drags courses
  ↓
Conflict logic validates the action
  ↓
Update state and persist changes to localStorage
  ↓
Show toast feedback
  ↓
Optionally export schedule as .ics file
```

## Troubleshooting

### Dev server will not start

```bash
npm install
npm run dev
```

If dependencies are corrupted, delete `node_modules` and reinstall using PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

### Data is not persisting

- Make sure browser localStorage is enabled
- Avoid private/incognito mode if data is disappearing
- Clear localStorage from browser DevTools if saved data becomes corrupted

### Linting errors

```bash
npm run lint
```

## Submission Checklist

- ✅ Project structure clearly documented
- ✅ Major components and their responsibilities described
- ✅ Libraries and frameworks listed with rationale
- ✅ Instructions for running the code (install, dev, build, lint)
- ✅ Modular design demonstrated through file organization
- ✅ Meaningful naming conventions applied throughout
- ✅ Consistent formatting and style (ESLint enforced)
- ✅ Appropriate comments on complex logic
- ✅ Good software engineering practices evident in code structure

## Note

This is an academic prototype, so it uses mock data instead of a live backend, given true SSO api integration requires a contract with the institution's identity provider. That choice keeps the code focused on user experience, interaction design, and scheduling logic.
