// localStorage helpers and key names used to persist sessions and per-user data
const AUTH_KEY = "easy-enroll-auth"

// Namespaced key builder for user-scoped storage buckets
const ns = (userId, bucket) => `easy-enroll:${userId}:${bucket}`

// Load the persisted auth session (if any) from localStorage
export function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Save auth session object to localStorage
export function saveAuthSession(session) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session))
}

// Remove the stored auth session (used at logout)
export function clearAuthSession() {
  localStorage.removeItem(AUTH_KEY)
}

// Load a user-scoped bucket (e.g., "plans", "events", "profile") with a fallback
export function loadUserBucket(userId, bucket, fallback) {
  try {
    const raw = localStorage.getItem(ns(userId, bucket))
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// Persist a user-scoped bucket to localStorage
export function saveUserBucket(userId, bucket, value) {
  localStorage.setItem(ns(userId, bucket), JSON.stringify(value))
}