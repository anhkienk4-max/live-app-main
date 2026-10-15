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
