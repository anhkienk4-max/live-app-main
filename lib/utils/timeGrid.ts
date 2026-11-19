import type { Shift } from '@/lib/types/database.types'

export const TIME_COLUMN_WIDTH = 50;
export const MINUTE_HEIGHT = 1.2; // 1.2px per minute = 72px per hour = 1728px total height

export const timeToMinutes = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const getCurrentTimePosition = (date: Date) => {
  const mins = date.getHours() * 60 + date.getMinutes();
  return mins * MINUTE_HEIGHT;
};

export const calculateShiftPosition = (startTime: string, endTime: string, crossesMidnight: boolean, minimumMinutes = 30) => {
  const startMins = timeToMinutes(startTime);
  let endMins = timeToMinutes(endTime);
  if (crossesMidnight || endMins <= startMins) endMins = 1440;
  
  const durationMins = endMins - startMins;
  const visualDuration = Math.max(durationMins, minimumMinutes); // Minimum 30 mins visual height
  
  return {
    top: startMins * MINUTE_HEIGHT,
    height: visualDuration * MINUTE_HEIGHT,
  };
};

export interface ShiftLayout {
  top: number;
  height: number;
  left: string;
  width: string;
}

/** Project overnight coverage without changing the authoritative Shift. */
export function shiftsForGridDate<T extends { id: string; date: string; start_time: string; end_time: string; crosses_midnight?: boolean }>(shifts: T[], date: string) {
  const previous = new Date(date + 'T12:00:00Z')
  previous.setUTCDate(previous.getUTCDate() - 1)
  const previousDate = previous.toISOString().slice(0, 10)
  return shifts.flatMap(shift => {
    const overnight = shift.crosses_midnight || shift.end_time < shift.start_time
    if (shift.date === date) return [{ shift, id: shift.id, start_time: shift.start_time, end_time: overnight ? '24:00' : shift.end_time, crosses_midnight: false, continuation: false }]
    if (shift.date === previousDate && overnight && timeToMinutes(shift.end_time) > 0) return [{ shift, id: shift.id, start_time: '00:00', end_time: shift.end_time, crosses_midnight: false, continuation: true }]
    return []
  }).sort((a, b) => a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id))
}

export function groupTimeGridShifts<T extends { id: string; start_time: string; end_time: string; crosses_midnight?: boolean }>(shifts: T[], minimumMinutes = 60): T[][] {
  const groups: T[][] = []
  let end = -1
  for (const shift of [...shifts].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time) || a.id.localeCompare(b.id))) {
    const start = timeToMinutes(shift.start_time)
    if (start >= end) groups.push([])
    groups[groups.length - 1].push(shift)
    const actualEnd = shift.crosses_midnight || timeToMinutes(shift.end_time) <= start ? 1440 : timeToMinutes(shift.end_time)
    end = Math.max(start >= end ? 0 : end, start + Math.max(minimumMinutes, actualEnd - start))
  }
  return groups
}

export function calculateOverlaps(shifts: { id: string; start_time: string; end_time: string; crosses_midnight?: boolean }[], minimumMinutes = 30): Record<string, ShiftLayout> {
  const layouts: Record<string, ShiftLayout> = {};
  
  const sorted = [...shifts].sort((a, b) => {
    const startA = timeToMinutes(a.start_time);
    const startB = timeToMinutes(b.start_time);
    if (startA !== startB) return startA - startB;
    const endA = a.crosses_midnight ? 1440 : timeToMinutes(a.end_time);
    const endB = b.crosses_midnight ? 1440 : timeToMinutes(b.end_time);
    return endB - endA || a.id.localeCompare(b.id);
  });

  let columns: typeof sorted[] = [];
  let lastEventEnding = 0;
  
  sorted.forEach((shift) => {
    const startMins = timeToMinutes(shift.start_time);
    const endMins = shift.crosses_midnight || timeToMinutes(shift.end_time) <= startMins ? 1440 : timeToMinutes(shift.end_time);
    const visualEnd = startMins + Math.max(endMins - startMins, minimumMinutes);

    if (startMins >= lastEventEnding) {
      // Pack the previous group
      packGroup(columns, layouts, minimumMinutes);
      columns = [];
      lastEventEnding = 0;
    }

    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const lastInCol = col[col.length - 1];
      const lastStart = timeToMinutes(lastInCol.start_time);
      const lastEnd = lastInCol.crosses_midnight || timeToMinutes(lastInCol.end_time) <= lastStart ? 1440 : timeToMinutes(lastInCol.end_time);
      const lastVisualEnd = lastStart + Math.max(lastEnd - lastStart, minimumMinutes);

      if (lastVisualEnd <= startMins) {
        col.push(shift);
        placed = true;
        break;
      }
    }

    if (!placed) {
      columns.push([shift]);
    }

    if (visualEnd > lastEventEnding) {
      lastEventEnding = visualEnd;
    }
  });

  if (columns.length > 0) {
    packGroup(columns, layouts, minimumMinutes);
  }

  return layouts;
}

function packGroup(columns: { id: string; start_time: string; end_time: string; crosses_midnight?: boolean }[][], layouts: Record<string, ShiftLayout>, minimumMinutes: number) {
  const numColumns = columns.length;
  const widthPerColumn = 100 / numColumns;

  columns.forEach((col, colIdx) => {
    col.forEach((shift) => {
      const startMins = timeToMinutes(shift.start_time);
      const endMins = shift.crosses_midnight || timeToMinutes(shift.end_time) <= startMins ? 1440 : timeToMinutes(shift.end_time);
      const visualDuration = Math.max(endMins - startMins, minimumMinutes);

      layouts[shift.id] = {
        top: startMins * MINUTE_HEIGHT,
        height: visualDuration * MINUTE_HEIGHT,
        left: `${colIdx * widthPerColumn}%`,
        width: `${widthPerColumn}%`,
      };
    });
  });
}

// ---------------------------------------------------------------------------
// RC19 G2 Calendar Architecture: True 3-Lane Overlap Layout with Sweep-Line Concurrency
// ---------------------------------------------------------------------------

export interface RenderedTimelineShift<T = unknown> {
  item: T
  shift: Shift
  id: string
  lane: number
  totalLanes: number
  leftPercent: number
  widthPercent: number
  topPx: number
  heightPx: number
  start_time: string
  end_time: string
  continuation: boolean
}

export interface TimelineOverflowBadge<T = unknown> {
  id: string
  lane: number
  totalLanes: number
  leftPercent: number
  widthPercent: number
  topPx: number
  heightPx: number
  count: number
  timeLabel: string
  allClusterShifts: T[]
  overflowShifts: T[]
  startMins: number
  endMins: number
}

export interface DayTimelineLayoutResult<T = unknown> {
  renderedShifts: RenderedTimelineShift<T>[]
  overflowBadges: TimelineOverflowBadge<T>[]
  clusterCount: number
}

export interface DayTimelineOptions {
  minimumMinutes?: number
  hourHeight?: number
  maxLanes?: number
}

/**
 * Computes calendar lane placement for shifts on a single day.
 * Enforces:
 * - Exact concurrency detection via Sweep-Line algorithm on half-open [start, end) intervals.
 * - When end = start of another shift, it is NOT counted as overlap.
 * - Localized overflow: ONLY time windows with actual concurrency > 3 render overflow badges.
 * - Outside overloaded windows, displays up to 3 individual shifts across lanes normally.
 * - Never creates overlapping badges.
 * - Popup displays all shifts intersecting the exact selected window.
 * - Non-overlapping shifts remain in independent boxes.
 * - All positions are strictly bounded within the 24-hour day grid.
 */
export function computeDayTimelineLayout<T extends { id: string; start_time: string; end_time: string; shift?: Shift; continuation?: boolean; crosses_midnight?: boolean }>(
  items: T[],
  options: DayTimelineOptions = {},
): DayTimelineLayoutResult<T> {
  const { minimumMinutes = 30, hourHeight = 44, maxLanes = 3 } = options
  const maxGridHeight = 24 * hourHeight

  if (!items || items.length === 0) {
    return { renderedShifts: [], overflowBadges: [], clusterCount: 0 }
  }

  // 1. Prepare normalized items
  const minCardMinutes = Math.ceil((26 / hourHeight) * 60)
  const normalized = items.map(raw => {
    const startMins = timeToMinutes(raw.start_time)
    let endMins = raw.end_time === '24:00' ? 1440 : timeToMinutes(raw.end_time)
    if (raw.crosses_midnight || endMins <= startMins) endMins = 1440
    const duration = Math.max(endMins - startMins, minimumMinutes, minCardMinutes)
    const shift = (raw.shift || (raw as unknown as Shift))
    return {
      raw,
      shift,
      id: raw.id,
      startMins,
      endMins,
      visualEnd: Math.min(startMins + duration, 1440),
      duration,
      continuation: Boolean(raw.continuation),
      start_time: raw.start_time,
      end_time: raw.end_time,
    }
  }).sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins) || a.id.localeCompare(b.id))

  // 2. Partition into contiguous visual clusters
  // Two shifts belong to the same cluster if they visually overlap or touch:
  const clusters: typeof normalized[] = []
  let currentCluster: typeof normalized = []
  let clusterVisualEnd = -1

  for (const item of normalized) {
    if (currentCluster.length === 0) {
      currentCluster.push(item)
      clusterVisualEnd = item.visualEnd
    } else if (item.startMins < clusterVisualEnd) {
      currentCluster.push(item)
      clusterVisualEnd = Math.max(clusterVisualEnd, item.visualEnd)
    } else {
      clusters.push(currentCluster)
      currentCluster = [item]
      clusterVisualEnd = item.visualEnd
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster)
  }

  const renderedShifts: RenderedTimelineShift<T>[] = []
  const overflowBadges: TimelineOverflowBadge<T>[] = []

  // 3. Process each cluster
  for (const cluster of clusters) {
    // 3a. Sweep-line algorithm based on exact scheduled half-open [startMins, endMins)
    interface SweepEvent {
      time: number
      type: 'END' | 'START'
      shift: typeof normalized[0]
    }
    const events: SweepEvent[] = []
    for (const item of cluster) {
      events.push({ time: item.startMins, type: 'START', shift: item })
      events.push({ time: item.endMins, type: 'END', shift: item })
    }

    // Sort: time ASC. For equal time, END comes before START (half-open [start, end))
    events.sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time
      if (a.type !== b.type) return a.type === 'END' ? -1 : 1
      return a.shift.id.localeCompare(b.shift.id)
    })

    const active = new Set<typeof normalized[0]>()
    let maxClusterConcurrency = 0
    let lastTime = events[0]?.time ?? 0

    interface OverloadedSlice {
      start: number
      end: number
      activeShifts: typeof normalized[0][]
    }
    const overloadedSlices: OverloadedSlice[] = []

    for (const ev of events) {
      if (ev.time > lastTime && active.size > 0) {
        if (active.size > maxClusterConcurrency) {
          maxClusterConcurrency = active.size
        }
        if (active.size > maxLanes) {
          overloadedSlices.push({
            start: lastTime,
            end: ev.time,
            activeShifts: Array.from(active),
          })
        }
      }

      if (ev.type === 'START') {
        active.add(ev.shift)
        if (active.size > maxClusterConcurrency) {
          maxClusterConcurrency = active.size
        }
      } else {
        active.delete(ev.shift)
      }
      lastTime = ev.time
    }

    // 3b. Sweep-line for VISUAL concurrency [startMins, visualEnd)
    // Distinguishes logical scheduling overlap from visual card collision
    const visualEvents: { time: number; type: 'END' | 'START'; shift: typeof normalized[0] }[] = []
    for (const item of cluster) {
      visualEvents.push({ time: item.startMins, type: 'START', shift: item })
      visualEvents.push({ time: item.visualEnd, type: 'END', shift: item })
    }
    visualEvents.sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time
      if (a.type !== b.type) return a.type === 'END' ? -1 : 1
      return a.shift.id.localeCompare(b.shift.id)
    })

    const activeVisual = new Set<typeof normalized[0]>()
    let maxVisualConcurrency = 0
    let lastVisualTime = visualEvents[0]?.time ?? 0
    const visualOverloadedSlices: OverloadedSlice[] = []

    for (const ev of visualEvents) {
      if (ev.time > lastVisualTime && activeVisual.size > 0) {
        if (activeVisual.size > maxVisualConcurrency) {
          maxVisualConcurrency = activeVisual.size
        }
        if (activeVisual.size > maxLanes) {
          visualOverloadedSlices.push({
            start: lastVisualTime,
            end: ev.time,
            activeShifts: Array.from(activeVisual),
          })
        }
      }
      if (ev.type === 'START') {
        activeVisual.add(ev.shift)
        if (activeVisual.size > maxVisualConcurrency) {
          maxVisualConcurrency = activeVisual.size
        }
      } else {
        activeVisual.delete(ev.shift)
      }
      lastVisualTime = ev.time
    }

    // 3c. Merge contiguous overloaded slices ONLY (from both scheduled and visual sweep-lines)
    interface OverloadedWindow {
      start: number
      end: number
      allShifts: Set<typeof normalized[0]>
    }
    const overloadedWindows: OverloadedWindow[] = []

    const allOverloadedSlices = [...overloadedSlices, ...visualOverloadedSlices].sort(
      (a, b) => a.start - b.start || a.end - b.end,
    )

    for (const slice of allOverloadedSlices) {
      const last = overloadedWindows[overloadedWindows.length - 1]
      // Merge only strictly contiguous slices so distinct bursts remain independent
      if (last && slice.start <= last.end) {
        last.end = Math.max(last.end, slice.end)
        for (const s of slice.activeShifts) {
          last.allShifts.add(s)
        }
      } else {
        overloadedWindows.push({
          start: slice.start,
          end: slice.end,
          allShifts: new Set(slice.activeShifts),
        })
      }
    }

    // Effective lanes: must satisfy visual concurrency so adjacent short shifts don't collide
    const effectiveTotalLanes = Math.min(
      Math.max(maxClusterConcurrency, maxVisualConcurrency, 1),
      maxLanes,
    )

    if (overloadedWindows.length === 0) {
      // No overload: standard lane packing preventing visual collision
      const laneIntervals: { start: number; end: number }[][] = Array.from({ length: effectiveTotalLanes }, () => [])

      for (const item of cluster) {
        let placedLane = -1
        for (let l = 0; l < effectiveTotalLanes; l++) {
          const intervals = laneIntervals[l]
          const hasCollision = intervals.some(inv => Math.max(inv.start, item.startMins) < Math.min(inv.end, item.visualEnd))
          if (!hasCollision) {
            placedLane = l
            break
          }
        }
        if (placedLane === -1) {
          // Zero DOM collision guarantee: if no lane is available without collision,
          // create a localized visual overflow badge instead of forcing into a colliding lane
          const badgeStart = item.startMins
          const badgeEnd = item.visualEnd
          const overflowDuration = badgeEnd - badgeStart
          const startHours = String(Math.floor(badgeStart / 60)).padStart(2, '0')
          const startMinutesStr = String(badgeStart % 60).padStart(2, '0')
          const endHours = String(Math.floor(badgeEnd / 60)).padStart(2, '0')
          const endMinutesStr = String(badgeEnd % 60).padStart(2, '0')
          const timeLabel = `${startHours}:${startMinutesStr} – ${endHours}:${endMinutesStr}`

          const topPx = Math.min((badgeStart / 60) * hourHeight, maxGridHeight - 10)
          const heightPx = Math.min(Math.max((overflowDuration / 60) * hourHeight, 18), maxGridHeight - topPx)

          overflowBadges.push({
            id: `overflow-${item.id}-${badgeStart}`,
            lane: effectiveTotalLanes - 1,
            totalLanes: effectiveTotalLanes,
            leftPercent: ((effectiveTotalLanes - 1) / effectiveTotalLanes) * 100,
            widthPercent: 100 / effectiveTotalLanes,
            topPx,
            heightPx,
            count: 1,
            timeLabel,
            allClusterShifts: [item.raw],
            overflowShifts: [item.raw],
            startMins: badgeStart,
            endMins: badgeEnd,
          })
          continue
        }
        laneIntervals[placedLane].push({ start: item.startMins, end: item.visualEnd })
        laneIntervals[placedLane].sort((a, b) => a.start - b.start)

        const topPx = Math.min((item.startMins / 60) * hourHeight, maxGridHeight - 10)
        const heightPx = Math.min(Math.max((item.duration / 60) * hourHeight, 26), maxGridHeight - topPx)
        renderedShifts.push({
          item: item.raw,
          shift: item.shift,
          id: item.id,
          lane: placedLane,
          totalLanes: effectiveTotalLanes,
          leftPercent: (placedLane / effectiveTotalLanes) * 100,
          widthPercent: 100 / effectiveTotalLanes,
          topPx,
          heightPx,
          start_time: item.start_time,
          end_time: item.end_time,
          continuation: item.continuation,
        })
      }
    } else {
      // Localized overflow exists!
      // In Lane 2: pre-reserve intervals for overflow badges of each overloaded window.
      // Outside these intervals, Lane 2 is free for regular shifts!
      const laneIntervals: { start: number; end: number }[][] = Array.from({ length: maxLanes }, () => [])
      const badgeForWindow = new Map<OverloadedWindow, {
        badgeStart: number
        badgeEnd: number
        overflowShifts: typeof normalized[0][]
      }>()

      for (let wIdx = 0; wIdx < overloadedWindows.length; wIdx++) {
        const win = overloadedWindows[wIdx]
        const nextWin = overloadedWindows[wIdx + 1]
        const badgeStart = win.start
        const maxBadgeEnd = nextWin ? nextWin.start : 1440
        const minDuration = Math.min(25, Math.max(maxBadgeEnd - badgeStart, 0))
        const durationMins = Math.min(Math.max(win.end - win.start, minDuration), Math.max(maxBadgeEnd - badgeStart, 0))
        const badgeEnd = badgeStart + durationMins

        laneIntervals[maxLanes - 1].push({ start: badgeStart, end: badgeEnd })
        badgeForWindow.set(win, {
          badgeStart,
          badgeEnd,
          overflowShifts: [],
        })
      }

      for (const item of cluster) {
        let placedLane = -1
        for (let l = 0; l < maxLanes; l++) {
          const intervals = laneIntervals[l]
          const hasCollision = intervals.some(inv => Math.max(inv.start, item.startMins) < Math.min(inv.end, item.visualEnd))
          if (!hasCollision) {
            placedLane = l
            break
          }
        }

        if (placedLane !== -1) {
          laneIntervals[placedLane].push({ start: item.startMins, end: item.visualEnd })
          laneIntervals[placedLane].sort((a, b) => a.start - b.start)

          const topPx = Math.min((item.startMins / 60) * hourHeight, maxGridHeight - 10)
          const heightPx = Math.min(Math.max((item.duration / 60) * hourHeight, 26), maxGridHeight - topPx)
          renderedShifts.push({
            item: item.raw,
            shift: item.shift,
            id: item.id,
            lane: placedLane,
            totalLanes: maxLanes,
            leftPercent: (placedLane / maxLanes) * 100,
            widthPercent: 100 / maxLanes,
            topPx,
            heightPx,
            start_time: item.start_time,
            end_time: item.end_time,
            continuation: item.continuation,
          })
        } else {
          // Could not be placed in any lane without visual collision!
          // Match window based on visual intersection:
          let matchedWin = overloadedWindows.find(win => Math.max(win.start, item.startMins) < Math.min(win.end, item.visualEnd))
          if (!matchedWin) {
            matchedWin = overloadedWindows.find(win => {
              const bData = badgeForWindow.get(win)
              if (!bData) return false
              return Math.max(bData.badgeStart, item.startMins) < Math.min(bData.badgeEnd, item.visualEnd)
            })
          }

          if (matchedWin) {
            const badgeData = badgeForWindow.get(matchedWin)
            if (badgeData) {
              badgeData.overflowShifts.push(item)
            }
          } else {
            // NEVER dump into unrelated window (NO fallback to overloadedWindows[0]).
            // Instead, dynamically create a localized overflow badge right at [item.startMins, item.visualEnd)
            const fallbackWin: OverloadedWindow = {
              start: item.startMins,
              end: item.visualEnd,
              allShifts: new Set([item]),
            }
            overloadedWindows.push(fallbackWin)
            const badgeStart = item.startMins
            const badgeEnd = item.visualEnd
            laneIntervals[maxLanes - 1].push({ start: badgeStart, end: badgeEnd })
            badgeForWindow.set(fallbackWin, {
              badgeStart,
              badgeEnd,
              overflowShifts: [item],
            })
          }
        }
      }

      const badgesToRender: {
        id: string
        win: OverloadedWindow
        badgeStart: number
        badgeEnd: number
        overflowShifts: typeof normalized[0][]
        topPx: number
      }[] = []

      for (const win of overloadedWindows) {
        const badgeData = badgeForWindow.get(win)
        if (!badgeData || badgeData.overflowShifts.length === 0) continue
        const { badgeStart, badgeEnd, overflowShifts } = badgeData
        const topPx = Math.min((badgeStart / 60) * hourHeight, maxGridHeight - 10)
        badgesToRender.push({
          id: `overflow-${overflowShifts[0].id}-${badgeStart}`,
          win,
          badgeStart,
          badgeEnd,
          overflowShifts,
          topPx,
        })
      }

      // Sort badges by topPx ASC so adjacent badges are strictly bounded against each other
      badgesToRender.sort((a, b) => a.topPx - b.topPx)

      for (let bIdx = 0; bIdx < badgesToRender.length; bIdx++) {
        const current = badgesToRender[bIdx]
        const next = badgesToRender[bIdx + 1]
        const { id, badgeStart, badgeEnd, overflowShifts, topPx } = current

        const overflowDuration = badgeEnd - badgeStart
        const startHours = String(Math.floor(badgeStart / 60)).padStart(2, '0')
        const startMinutesStr = String(badgeStart % 60).padStart(2, '0')
        const endHours = String(Math.floor(badgeEnd / 60)).padStart(2, '0')
        const endMinutesStr = String(badgeEnd % 60).padStart(2, '0')
        const timeLabel = `${startHours}:${startMinutesStr} – ${endHours}:${endMinutesStr}`

        const maxAvailableHeight = next ? Math.max(next.topPx - topPx, 0) : maxGridHeight - topPx
        const naturalHeight = (overflowDuration / 60) * hourHeight
        const minHeight = Math.min(18, maxAvailableHeight)
        const heightPx = Math.min(Math.max(naturalHeight, minHeight), maxAvailableHeight)

        // Find all cluster shifts that intersect this overflow window
        const windowShiftsSet = new Set<T>()
        for (const c of cluster) {
          if (Math.max(c.startMins, badgeStart) < Math.min(c.visualEnd, badgeEnd)) {
            windowShiftsSet.add(c.raw)
          }
        }
        // Ensure all overflow shifts belonging to this badge are included in the popup
        for (const o of overflowShifts) {
          windowShiftsSet.add(o.raw)
        }
        const clusterShiftsInWindow = Array.from(windowShiftsSet)

        overflowBadges.push({
          id,
          lane: maxLanes - 1,
          totalLanes: maxLanes,
          leftPercent: ((maxLanes - 1) / maxLanes) * 100,
          widthPercent: 100 / maxLanes,
          topPx,
          heightPx,
          count: overflowShifts.length,
          timeLabel,
          allClusterShifts: clusterShiftsInWindow,
          overflowShifts: overflowShifts.map(i => i.raw),
          startMins: badgeStart,
          endMins: badgeEnd,
        })
      }
    }
  }

  return { renderedShifts, overflowBadges, clusterCount: clusters.length }
}
