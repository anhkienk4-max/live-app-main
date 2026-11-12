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
  columns.forEach((col, colIndex) => {
    col.forEach((shift) => {
      const pos = calculateShiftPosition(shift.start_time, shift.end_time, shift.crosses_midnight ?? false, minimumMinutes);
      layouts[shift.id] = {
        top: pos.top,
        height: pos.height,
        left: `${(colIndex / numColumns) * 100}%`,
        width: `${100 / numColumns}%`
      };
    });
  });
}

// ---------------------------------------------------------------------------
// RC19 G2 Calendar Architecture: True 3-Lane Overlap Layout with Overflow Badges
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
 * - Maximum 3 lanes (0, 1, 2) side by side at any time.
 * - When > 3 concurrent shifts intersect, Lane 0 and Lane 1 display the first 2 streams,
 *   and Lane 2 renders an interactive overflow badge (`+N ca khác`).
 * - Shifts at non-overlapping hours are separated into distinct clusters.
 * - Short shifts between long shifts are preserved in free lanes without being obscured.
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
  const normalized = items.map(raw => {
    const startMins = timeToMinutes(raw.start_time)
    let endMins = raw.end_time === '24:00' ? 1440 : timeToMinutes(raw.end_time)
    if (raw.crosses_midnight || endMins <= startMins) endMins = 1440
    const duration = Math.max(endMins - startMins, minimumMinutes)
    const shift = (raw.shift || (raw as unknown as Shift))
    return {
      raw,
      shift,
      id: raw.id,
      startMins,
      endMins,
      visualEnd: startMins + duration,
      duration,
      continuation: Boolean(raw.continuation),
      start_time: raw.start_time,
      end_time: raw.end_time,
    }
  }).sort((a, b) => a.startMins - b.startMins || (b.visualEnd - b.startMins) - (a.visualEnd - a.startMins) || a.id.localeCompare(b.id))

  // 2. Partition into true overlapping clusters (islands)
  const clusters: typeof normalized[] = []
  let currentCluster: typeof normalized = []
  let clusterEnd = -1

  for (const item of normalized) {
    if (currentCluster.length === 0) {
      currentCluster.push(item)
      clusterEnd = item.visualEnd
    } else if (item.startMins < clusterEnd) {
      // Intersects with current cluster
      currentCluster.push(item)
      clusterEnd = Math.max(clusterEnd, item.visualEnd)
    } else {
      // Gap detected: independent time cluster
      clusters.push(currentCluster)
      currentCluster = [item]
      clusterEnd = item.visualEnd
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster)
  }

  const renderedShifts: RenderedTimelineShift<T>[] = []
  const overflowBadges: TimelineOverflowBadge<T>[] = []

  // 3. Process each cluster
  for (const cluster of clusters) {
    // Check maximum concurrent overlapping shifts at any 5-minute slice
    const sliceCounts = new Map<number, number>()
    for (const item of cluster) {
      for (let m = item.startMins; m < item.visualEnd; m += 5) {
        sliceCounts.set(m, (sliceCounts.get(m) || 0) + 1)
      }
    }
    const maxConcurrency = Math.max(...sliceCounts.values(), 1)
    const effectiveLanes = Math.min(maxConcurrency, maxLanes)

    if (maxConcurrency <= maxLanes) {
      // Fits in 1, 2, or 3 lanes without overflow!
      const lanes: typeof normalized[] = Array.from({ length: effectiveLanes }, () => [])
      for (const item of cluster) {
        let placed = false
        for (let l = 0; l < effectiveLanes; l++) {
          const lastInLane = lanes[l][lanes[l].length - 1]
          if (!lastInLane || lastInLane.visualEnd <= item.startMins) {
            lanes[l].push(item)
            placed = true
            const topPx = Math.min((item.startMins / 60) * hourHeight, maxGridHeight - 10)
            const heightPx = Math.min(Math.max((item.duration / 60) * hourHeight, 26), maxGridHeight - topPx)
            renderedShifts.push({
              item: item.raw,
              shift: item.shift,
              id: item.id,
              lane: l,
              totalLanes: effectiveLanes,
              leftPercent: (l / effectiveLanes) * 100,
              widthPercent: 100 / effectiveLanes,
              topPx,
              heightPx,
              start_time: item.start_time,
              end_time: item.end_time,
              continuation: item.continuation,
            })
            break
          }
        }
        if (!placed) {
          // If slight boundary collision, place in last lane
          const l = effectiveLanes - 1
          lanes[l].push(item)
          const topPx = Math.min((item.startMins / 60) * hourHeight, maxGridHeight - 10)
          const heightPx = Math.min(Math.max((item.duration / 60) * hourHeight, 26), maxGridHeight - topPx)
          renderedShifts.push({
            item: item.raw,
            shift: item.shift,
            id: item.id,
            lane: l,
            totalLanes: effectiveLanes,
            leftPercent: (l / effectiveLanes) * 100,
            widthPercent: 100 / effectiveLanes,
            topPx,
            heightPx,
            start_time: item.start_time,
            end_time: item.end_time,
            continuation: item.continuation,
          })
        }
      }
    } else {
      // Concurrency > maxLanes (more than 3 concurrent shifts)
      // Display Lane 0 and Lane 1 for visible streams, and place overflow badges in Lane 2!
      const visibleLaneCount = maxLanes - 1 // 2 visible lanes (Lane 0 and Lane 1)
      const lanes: typeof normalized[] = Array.from({ length: visibleLaneCount }, () => [])
      const overflowItems: typeof normalized = []

      for (const item of cluster) {
        let placed = false
        for (let l = 0; l < visibleLaneCount; l++) {
          const lastInLane = lanes[l][lanes[l].length - 1]
          if (!lastInLane || lastInLane.visualEnd <= item.startMins) {
            lanes[l].push(item)
            placed = true
            const topPx = Math.min((item.startMins / 60) * hourHeight, maxGridHeight - 10)
            const heightPx = Math.min(Math.max((item.duration / 60) * hourHeight, 26), maxGridHeight - topPx)
            renderedShifts.push({
              item: item.raw,
              shift: item.shift,
              id: item.id,
              lane: l,
              totalLanes: maxLanes,
              leftPercent: (l / maxLanes) * 100,
              widthPercent: 100 / maxLanes,
              topPx,
              heightPx,
              start_time: item.start_time,
              end_time: item.end_time,
              continuation: item.continuation,
            })
            break
          }
        }
        if (!placed) {
          overflowItems.push(item)
        }
      }

      if (overflowItems.length > 0) {
        // Group overflow items by overlapping intervals so separate time windows get distinct badges
        const overflowSubGroups: typeof normalized[] = []
        let currentSubGroup: typeof normalized = []
        let subGroupEnd = -1

        for (const item of overflowItems) {
          if (currentSubGroup.length === 0) {
            currentSubGroup.push(item)
            subGroupEnd = item.visualEnd
          } else if (item.startMins < subGroupEnd) {
            currentSubGroup.push(item)
            subGroupEnd = Math.max(subGroupEnd, item.visualEnd)
          } else {
            overflowSubGroups.push(currentSubGroup)
            currentSubGroup = [item]
            subGroupEnd = item.visualEnd
          }
        }
        if (currentSubGroup.length > 0) {
          overflowSubGroups.push(currentSubGroup)
        }

        for (const subGroup of overflowSubGroups) {
          const overflowStart = Math.min(...subGroup.map(i => i.startMins))
          const overflowEnd = Math.max(...subGroup.map(i => i.visualEnd))
          const overflowDuration = Math.max(overflowEnd - overflowStart, minimumMinutes)
          const startHours = String(Math.floor(overflowStart / 60)).padStart(2, '0')
          const startMinutesStr = String(overflowStart % 60).padStart(2, '0')
          const endHours = String(Math.floor(overflowEnd / 60)).padStart(2, '0')
          const endMinutesStr = String(overflowEnd % 60).padStart(2, '0')
          const timeLabel = `${startHours}:${startMinutesStr} – ${endHours}:${endMinutesStr}`

          const topPx = Math.min((overflowStart / 60) * hourHeight, maxGridHeight - 10)
          const heightPx = Math.min(Math.max((overflowDuration / 60) * hourHeight, 36), maxGridHeight - topPx)

          // Find all cluster shifts that intersect this overflow window
          const clusterShiftsInWindow = cluster
            .filter(c => c.startMins < overflowEnd && c.visualEnd > overflowStart)
            .map(c => c.raw)

          overflowBadges.push({
            id: `overflow-${subGroup[0].id}-${overflowStart}`,
            lane: maxLanes - 1, // Lane 2
            totalLanes: maxLanes,
            leftPercent: ((maxLanes - 1) / maxLanes) * 100,
            widthPercent: 100 / maxLanes,
            topPx,
            heightPx,
            count: subGroup.length,
            timeLabel,
            allClusterShifts: clusterShiftsInWindow,
            overflowShifts: subGroup.map(i => i.raw),
            startMins: overflowStart,
            endMins: overflowEnd,
          })
        }
      }
    }
  }

  return { renderedShifts, overflowBadges, clusterCount: clusters.length }
}
