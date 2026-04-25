/** 24h "HH:MM" → "h:mm AM/PM" for display. */
export function formatTime12h(twentyFour) {
  if (!twentyFour || typeof twentyFour !== "string") {
    return ""
  }
  const m = twentyFour.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) {
    return twentyFour
  }
  let h = Number(m[1])
  const min = m[2]
  const ap = h >= 12 ? "pm" : "am"
  h = h % 12
  if (h === 0) {
    h = 12
  }
  return `${h}:${min} ${ap}`
}

export function formatTimeRange12h(start24, end24) {
  return `${formatTime12h(start24)} – ${formatTime12h(end24)}`
}
