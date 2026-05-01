import { mockUsers } from "../data/mockUsers"

export function loginWithSso(userId) {
  return mockUsers.find((entry) => entry.id === userId) || null
}
