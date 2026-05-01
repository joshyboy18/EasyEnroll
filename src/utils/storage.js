const AUTH_KEY = "easy-enroll-auth"

const ns = (userId, bucket) => `easy-enroll:${userId}:${bucket}`

export function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveAuthSession(session) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session))
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_KEY)
}

export function loadUserBucket(userId, bucket, fallback) {
  try {
    const raw = localStorage.getItem(ns(userId, bucket))
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function saveUserBucket(userId, bucket, value) {
  localStorage.setItem(ns(userId, bucket), JSON.stringify(value))
}
