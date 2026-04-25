/** Consistent, readable text on all blocks (light backgrounds). */
const PALETTE = [
  "#0d4f2a",
  "#0f3d6b",
  "#5c2d7a",
  "#7a3d0d",
  "#1d6b5c",
  "#6b1d3d",
  "#3d4f0d",
  "#0d3d5c",
  "#4a0d5c",
  "#5c4a0d",
  "#0d4a4a",
  "#4a0d0d",
]

function hashId(str) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function colorForCourseId(courseId) {
  if (!courseId) {
    return PALETTE[0]
  }
  return PALETTE[hashId(String(courseId)) % PALETTE.length]
}

export function textColorOnCourseBlock(hex) {
  return "#ffffff"
}

export function withAlpha(hex, a) {
  if (!hex || hex[0] !== "#" || (hex.length !== 7 && hex.length !== 4)) {
    return `rgba(13, 79, 42, ${a})`
  }
  const n = hex.slice(1)
  const v =
    n.length === 3
      ? [parseInt(n[0] + n[0], 16), parseInt(n[1] + n[1], 16), parseInt(n[2] + n[2], 16)]
      : [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
  return `rgba(${v[0]},${v[1]},${v[2]},${a})`
}
