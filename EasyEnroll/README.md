# EasyEnroll

A student course enrollment and planning prototype built as an HCI (Human-Computer Interaction) course project. EasyEnroll helps students explore courses, manage their current enrollment, plan future semesters, and detect scheduling conflicts while respecting academic credit limits.

## Project Overview

EasyEnroll is a **single-page React application** (frontend only) that demonstrates usable, accessible course scheduling through an interactive calendar interface. It emphasizes HCI principles like clear feedback, constraint visibility, and error prevention.

**Key Features:**
- 📅 Visual week-at-a-glance calendar with Mon–Fri schedule grid
- 🔍 Course catalog search with filtering by department, suggested year, and major requirements
- ✅ Enrollment management with live conflict detection
- 📋 Planning mode for drafting future-term schedules
- ⚠️ Toast notifications for real-time feedback
- 💾 Local persistence (browser localStorage)
- 📤 Export schedules as `.ics` files (Google Calendar, Outlook, etc.)
- ♿ Accessibility features (ARIA labels, keyboard support)

## Project Structure

```
EasyEnroll/
├── src/
│   ├── App.jsx                 # Main app container & global state
│   ├── App.css                 # App-wide styling
│   ├── main.jsx                # React entry point
│   ├── index.css               # Global styles & reset
│   ├── components/
│   │   ├── TimeGridCalendar.jsx    # Visual calendar grid (Mon–Fri, 24h)
│   │   └── ToastStack.jsx          # Toast notification system
│   ├── data/
│   │   ├── courses.js              # 40+ course catalog (CS, BIO, Gen Ed)
│   │   ├── mockUsers.js            # Demo user accounts
│   │   ├── planningTerms.js        # Academic calendar (Spring 2026, Fall 2026, etc.)
│   │   └── degreeSheets.js         # Degree requirements by program
│   └── utils/
│       ├── auth.js                 # Login validation (password, SSO)
│       ├── storage.js              # localStorage persistence
│       ├── calendarLayout.js       # Calendar rendering math & positioning
│       ├── conflicts.js            # Schedule conflict detection
│       ├── courseColors.js         # Color assignment per course
│       ├── courseDrag.js           # Drag-and-drop course interactions
│       ├── degreeProgress.js       # Degree audit & course recommendations
│       ├── ics.js                  # iCalendar export (.ics format)
│       └── timeFormat.js           # Time display utilities
├── public/                     # Static assets
├── .cursor/
│   └── rules/                  # Local Cursor IDE guidance
├── lecture_extracts/           # HCI lecture materials (study reference)
├── index.html                  # HTML entry point
├── package.json                # Node.js project manifest
├── vite.config.js              # Vite build configuration
├── eslint.config.js            # Code quality rules
├── tasks.md                    # Implementation roadmap
├── hci-ui-suggestions.md       # HCI design principles & backlog
└── README.md                   # This file
```

## Libraries & Frameworks

### Core Dependencies
- **[React](https://react.dev/)** (v19.2.0) — UI component library
  - `react-dom` — DOM rendering
- **[Vite](https://vite.dev/)** (v7.2.4) — Lightning-fast build tool & dev server
  - `@vitejs/plugin-react` — React support with Fast Refresh (HMR)

### Development Dependencies
- **[ESLint](https://eslint.org/)** (v9.39.1) — Code quality & consistency
  - `eslint-plugin-react-hooks` — React best practices
  - `eslint-plugin-react-refresh` — Vite HMR checks
- **TypeScript** types (optional, installed but not required to use)
  - `@types/react`, `@types/react-dom`

### Why These Choices?
- **React** provides component reusability and state management for complex scheduling logic
- **Vite** enables rapid development with instant Hot Module Replacement (edit code, see changes immediately)
- **ESLint** enforces code consistency across the team
- **No backend API** — data is mocked and stored locally (localStorage) for rapid prototyping

## Getting Started

### Prerequisites
- **Node.js** (v16+) with npm
- A modern browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Navigate to the project directory:**
   ```bash
   cd EasyEnroll
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

### Running the Development Server

Start the local dev server with Hot Module Replacement:
```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or another port if 5173 is in use).

For other ports use:
```
npm run dev -- --port####
```

Replaceing the '#' with numbers of your choice

**Hot Reload:** Edit any `.jsx` or `.css` file and the browser will automatically refresh without losing state.

### Building for Production

Create an optimized production bundle:
```bash
npm run build
```

Output will be in the `dist/` folder. Preview the production build locally:
```bash
npm run preview
```

### Code Quality

Check for ESLint violations:
```bash
npm run lint
```

## Demo Users

Three mock users are built in for testing. Use any of these credentials:

| Name | Email | Password | Class Year | Program |
|------|-------|----------|-----------|---------|
| Jordan Lee | `jlee@easyenroll.edu` | `demo123` | Freshman (1) | BS CS + Minor Math |
| Avery Patel | `apatel@easyenroll.edu` | `demo123` | Sophomore (2) | BS Biology |
| Morgan Rivera | `mrivera@easyenroll.edu` | `demo123` | Senior (4) | BS CS |

## Key Workflows

### 1. Enrollment (Current Term: Spring 2026)
- **Search & Filter:** Browse catalog by department, seat availability, or suggested year
- **Degree Matching:** Courses highlight major requirements and prerequisites
- **Add Course:** Drag course cards onto calendar; system auto-detects scheduling conflicts
- **Conflict Detection:** Toast alerts warn of time overlaps or credit limit exceeded (19 credit cap)
- **View Calendar:** Visual Mon–Fri, 24-hour grid with color-coded courses

### 2. Planning (Draft Future Terms)
- **Select Term:** Choose from Fall 2026, Spring 2027, or other available terms
- **Draft Schedule:** Same search/filter/drag as Enrollment, but planning courses are striped/distinct
- **Conflict Summary:** Displays both course-vs-course and course-vs-personal-event overlaps
- **Save Plans:** Multiple named plans per term (e.g., "Plan A", "Plan B")
- **Track Changes:** Dirty state indicator; `beforeunload` warning if unsaved

### 3. Profile & Settings
- **Profile:** View/edit identity (name, email, avatar, programs)
- **Settings:** Toggles for display preferences, accessibility options, and links to help resources
- **Keyboard & Tips:** Built-in documentation of shortcuts and UI patterns

### 4. Export
- **iCalendar:** Export planned schedule as `.ics` file
- **Import Anywhere:** Open with Google Calendar, Outlook, Apple Calendar, etc.

## Component Architecture

### App.jsx (Main Container)
Orchestrates all global state:
- Authentication (user session, login/logout)
- Enrollment view (enrolled courses, events)
- Planning view (plans per term, plan-specific courses)
- Calendar blocks & conflict detection
- Toast notifications

### TimeGridCalendar.jsx (Calendar Grid)
Renders the visual schedule:
- Positioned CSS blocks for each course/event
- Handles overlapping courses (side-by-side layout)
- Scrollable to focal time windows (e.g., 6am–8pm only)
- Click handlers for course interaction

### ToastStack.jsx (Notifications)
Manages temporary feedback messages:
- Success (green), error (red), info (blue)
- Auto-dismiss after 4.5 seconds or manual close
- ARIA `aria-live` for screen reader accessibility

## Data Flow

```
User Login
    ↓
Load Auth Session (localStorage)
    ↓
Load Courses (courses.js)
    ↓
Load User's Enrollment/Plans (localStorage per user)
    ↓
Render Calendar (TimeGridCalendar)
    ↓
User Adds Course
    ↓
Check Conflicts (conflicts.js)
    ↓
If Valid: Save State (storage.js) → Show Success Toast
    ↓
If Invalid: Show Error Toast
    ↓
Export → Generate iCalendar (ics.js) → Download
```

## Persistence & Storage

All data is stored in **browser localStorage** under namespaced keys:

| Key | Purpose |
|-----|---------|
| `easy-enroll-auth` | Current logged-in user session |
| `easy-enroll:{userId}:enrollment` | Current term enrolled courses |
| `easy-enroll:{userId}:events` | Personal calendar events |
| `easy-enroll:{userId}:plans` | All saved plans by term |
| `easy-enroll:{userId}:profile` | User profile data (name, avatar, etc.) |
| `easy-enroll:{userId}:settings` | User preferences |

**Note:** Data persists only for the current browser. Clearing browser cache will delete all saved data.

## HCI Principles Applied

EasyEnroll was built with these HCI principles in mind:

1. **Visibility of System State** — Calendar shows enrolled vs. planned; conflict count displays immediately
2. **Match Between System & Real World** — Uses familiar calendar metaphors; 12-hour time format
3. **Error Prevention** — Credit limit warnings; conflict toast alerts before adding overlapping courses
4. **Recovery from Errors** — Toast actions can undo recent additions; dirty state warning before losing data
5. **Accessibility** — ARIA labels, keyboard navigation, high contrast color options
6. **Learnability** — Onboarding modals; in-app help tips; consistent UI patterns

## Future Enhancements

Potential features for future phases:

- [ ] Real backend API integration (replace mock data)
- [ ] User role variation (advisor, registrar views)
- [ ] Waitlist management
- [ ] Prerequisite enforcement
- [ ] Semester GPA calculator
- [ ] Export to PDF
- [ ] Dark mode theme
- [ ] Multi-language support

## Troubleshooting

### Dev server won't start
```bash
# Clear node_modules and reinstall
rm -r node_modules package-lock.json
npm install
npm run dev
```

### Data not persisting
- Check browser localStorage is enabled (not in private/incognito mode)
- Clear browser cache if corrupted data: `localStorage.clear()` in console
- Open DevTools (F12) → Application → Local Storage to inspect stored keys

### Linting errors
```bash
npm run lint
```

## License & Credits

This is an academic project for **CS 4063 Human-Computer Interaction** at the University of Oklahoma.

Built with React, Vite, and a lot of iteration on usability testing.
