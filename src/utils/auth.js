// Mock authentication helpers (demo-only): no real identity provider integration
import { mockUsers } from "../data/mockUsers"

// Return the demo user that matches the provided mock SSO id, or null
export function loginWithSso(userId) {
  return mockUsers.find((entry) => entry.id === userId) || null
}
