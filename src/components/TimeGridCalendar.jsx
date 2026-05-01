import { useEffect, useRef } from "react"
import { formatHourGutterLabel, layoutOverlappingDayBlocks, PX_PER_HOUR } from "../utils/calendarLayout.js"
import { textColorOnCourseBlock } from "../utils/courseColors.js"

const MIN_IN_DAY = 24 * 60

export function TimeGridCalendar({
  blocks,
  days,
  onBlockClick,
  initialScrollHour = 0,
  className = "",
  /** Minutes from midnight: top of the visible time axis (0 = show from midnight). */
  viewStartMin = 0,
  /** Minutes from midnight: bottom of the visible time axis (1440 = full day). */
  viewEndMin = MIN_IN_DAY,
}) {
  const scrollRef = useRef(null)
  let viewStart = Math.max(0, Math.min(MIN_IN_DAY, viewStartMin))
  let viewEnd = Math.max(0, Math.min(MIN_IN_DAY, viewEndMin))
  if (viewEnd <= viewStart) {
    viewStart = 0
    viewEnd = MIN_IN_DAY
  }
  const totalH = ((viewEnd - viewStart) / 60) * PX_PER_HOUR
  const useFocal = viewStart > 0 || viewEnd < MIN_IN_DAY

  useEffect(() => {
    const el = scrollRef.current
    if (el && initialScrollHour > 0) {
      el.scrollTop = Math.max(0, initialScrollHour * PX_PER_HOUR)
    }
  }, [initialScrollHour])

  const timeSlots = []
  for (let t = viewStart; t < viewEnd; t += 60) {
    timeSlots.push(t)
  }

  const wrapStyle = {
    "--px-per-hour": `${PX_PER_HOUR}px`,
    "--time-grid-total-px": `${totalH}px`,
  }

  return (
    <div
      className={`time-grid-wrap ${useFocal ? "time-grid-wrap--focal" : ""} ${className}`.trim()}
      style={wrapStyle}
    >
      <div className="time-grid-scroll" ref={scrollRef}>
        <div className="time-grid-inner time-grid-inner--with-sticky">
          <div className="time-grid__head" role="row">
            <div className="time-grid__corner" aria-hidden />
            {days.map((day) => (
              <h4 key={day} className="time-grid__day-title">
                {day}
              </h4>
            ))}
          </div>
          <div className="time-grid__row">
            <div className="time-grid__gutter" aria-hidden>
              {timeSlots.map((t) => {
                const h = t / 60
                return (
                  <div key={t} className="time-grid__hour-label" style={{ height: PX_PER_HOUR }}>
                    {formatHourGutterLabel(h)}
                  </div>
                )
              })}
            </div>
            <div className="time-grid__days">
              {days.map((day) => {
                const dayBlocks = blocks
                  .filter((b) => b.columnDay === day)
                  .filter((b) => b.endMin > viewStart && b.startMin < viewEnd)
                const overlapLayout = layoutOverlappingDayBlocks(dayBlocks)
                return (
                  <div key={day} className="time-grid__day">
                    <div
                      className="time-grid__col time-grid__col--gridlines"
                      style={{ height: totalH }}
                    >
                      {dayBlocks.map((b) => {
                        const top = ((b.startMin - viewStart) / 60) * PX_PER_HOUR
                        const h = ((b.endMin - b.startMin) / 60) * PX_PER_HOUR
                        const mainTitle = b.blockTitle ?? b.label
                        const timeLine = b.timeLine ?? ""
                        const code = b.blockCode
                        const ol = overlapLayout.get(b.id)
                        const totalLanes = ol?.totalLanes ?? 1
                        const lane = ol?.lane ?? 0
                        const laneFrac = totalLanes > 1 ? 100 / totalLanes : 0
                        const horizontalStyle =
                          totalLanes > 1
                            ? {
                                left: `calc(${(lane * laneFrac).toFixed(3)}% + 1px)`,
                                width: `calc(${laneFrac.toFixed(3)}% - 3px)`,
                                right: "auto",
                              }
                            : {}
                        return (
                          <button
                            key={b.id}
                            type="button"
                            className={`time-grid__block ${b.stripe ? "time-grid__block--stripe" : ""} ${totalLanes > 1 ? "time-grid__block--overlap" : ""}`}
                            style={{
                              top,
                              height: Math.max(h, 20),
                              backgroundColor: b.color,
                              color: textColorOnCourseBlock(b.color),
                              ...horizontalStyle,
                            }}
                            onClick={() => onBlockClick?.(b)}
                            title={
                              totalLanes > 1
                                ? `${mainTitle} — overlaps ${totalLanes - 1} other block(s) this hour; column ${lane + 1} of ${totalLanes}`
                                : undefined
                            }
                            aria-label={
                              code
                                ? `${mainTitle}, ${code}, ${timeLine}`
                                : `${mainTitle}, ${timeLine}`
                            }
                          >
                            <strong className="time-grid__block-title">{mainTitle}</strong>
                            {timeLine ? (
                              <span className="time-grid__block-time">{timeLine}</span>
                            ) : null}
                            {code ? <span className="time-grid__block-code">{code}</span> : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
