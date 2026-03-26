import { mockUsers } from "../data/mockUsers"

export function loginWithPassword(email, password) {
  const normalized = email.trim().toLowerCase()
  const user = mockUsers.find((entry) => entry.email.toLowerCase() === normalized)
  if (!user || user.password !== password) {
    return null
  }
  return user
}

export function loginWithSso(userId) {
  return mockUsers.find((entry) => entry.id === userId) || null
}
