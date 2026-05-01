// Pastel palette for calmer schedule blocks and theme consistency
const PALETTE = [
  "#f8c8dc",
  "#cde7ff",
  "#d8f3dc",
  "#ffe5b4",
  "#e6d5ff",
  "#ffd6cc",
  "#fff1b8",
  "#c9f2ff",
  "#f9d5e5",
  "#d9f7be",
  "#ffe0f0",
  "#d6e4ff",
]

// Deterministic hash used to index into the palette for a stable color per id
function hashId(str) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

// Pick a pastel color for a course id (stable across reloads)
export function colorForCourseId(courseId) {
  if (!courseId) {
    return PALETTE[0]
  }
  return PALETTE[hashId(String(courseId)) % PALETTE.length]
}

// Return a readable text color for course blocks (contrasts with pastel backgrounds)
export function textColorOnCourseBlock() {
  return "#1f2937"
}

// Convert a hex color to an rgba(...) string with the provided alpha value
export function withAlpha(hex, a) {
  if (!hex || hex[0] !== "#" || (hex.length !== 7 && hex.length !== 4)) {
    return `rgba(248, 200, 220, ${a})`
  }
  const n = hex.slice(1)
  const v =
    n.length === 3
      ? [parseInt(n[0] + n[0], 16), parseInt(n[1] + n[1], 16), parseInt(n[2] + n[2], 16)]
      : [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
  return `rgba(${v[0]},${v[1]},${v[2]},${a})`
}