"use client";
import { CalendarFilterContext } from "@/lib/utils/calendarFilters";
import { ShiftCard } from "@/components/features/shifts/ShiftCard";
import {
  Shift,
  Brand,
  Platform,
  ShiftRegistration,
} from "@/lib/types/database.types";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { useTranslation } from "@/lib/i18n";
import { CurrentTimeIndicator } from "@/components/ui/current-time-indicator";
import { TIME_COLUMN_WIDTH, MINUTE_HEIGHT, calculateShiftPosition, calculateOverlaps, getCurrentTimePosition } from "@/lib/utils/timeGrid";
import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { User } from '@/lib/types/database.types';

interface WeekViewProps {
  currentDate: Date;
  shifts: Shift[];
  brands: Brand[];
  platforms: Platform[];
  registrations: ShiftRegistration[];
  onShiftClick?: (shift: Shift) => void;
  hasActiveFilters?: boolean;
  currentUser?: User | null;
  onClearFilters?: () => void;
  onCreateShift?: () => void;
}



export function WeekView({
  currentDate,
  shifts,
  brands,
  platforms,
  registrations,
  onShiftClick,
  hasActiveFilters = false,
  currentUser = null,
  onClearFilters,
  onCreateShift,
}: WeekViewProps) {
  const context: CalendarFilterContext = {
    currentDate: new Date(),
    brands,
    platforms,
    registrations,
  };
  const { t } = useTranslation();
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const getShiftsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return shifts.filter((s) => s.date === dateStr);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <>
      {/* DESKTOP: Horizontally scrollable true-time grid */}
      <div
        className="hidden sm:block overflow-x-auto relative bg-background"
        style={{ scrollbarWidth: "thin" }}
      >
        {shifts.length === 0 && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm min-h-[400px]">
            <div className="text-center p-6 bg-background rounded-xl border shadow-sm max-w-sm">
              <p className="text-lg font-medium text-foreground mb-4">
                {hasActiveFilters ? "No shifts match these filters." : "No shifts scheduled this week."}
              </p>
              {hasActiveFilters ? (
                <Button variant="outline" onClick={onClearFilters}>
                  Clear filters
                </Button>
              ) : (
                currentUser && hasPermission(currentUser, 'shifts.edit') ? (
                  <Button onClick={onCreateShift}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Shift
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent('calendar:view', { detail: 'list' }))}>
                    Browse Open Shifts
                  </Button>
                )
              )}
            </div>
          </div>
        )}
        <div
          className="grid min-w-[980px]"
          style={{ gridTemplateColumns: `${TIME_COLUMN_WIDTH}px repeat(7, minmax(140px, 1fr))` }}
        >
          {/* Header Row */}
          <div className="sticky top-0 z-30 bg-background border-b border-border border-r"></div>
          {weekDays.map((day) => {
            const isToday = isSameDay(day, today);
            const dayShifts = getShiftsForDate(day);
            return (
              <div
                key={`header-${day.toString()}`}
                className={`sticky top-0 z-30 bg-background flex items-center gap-1.5 py-2 px-2 border-b border-r last:border-r-0 ${isToday ? "border-primary/40 bg-primary/[0.02]" : "border-border"}`}
              >
                <span
                  className={`text-[10px] uppercase tracking-wider font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}
                >
                  {format(day, "EEE")}
                </span>
                <span
                  className={`text-sm font-bold shrink-0 ${isToday ? "text-primary" : "text-foreground"}`}
                >
                  {format(day, "d")}
                </span>
                {dayShifts.length > 0 && (
                  <span className="ml-auto text-[10px] text-muted-foreground font-medium">
                    {dayShifts.length}
                  </span>
                )}
              </div>
            );
          })}

          {/* Grid Body */}
          <div className="col-span-full relative flex">
            {/* Time Axis Column */}
            <div
              className="relative shrink-0 border-r border-border bg-background z-20"
              style={{ width: TIME_COLUMN_WIDTH }}
            >
              {hours.map((hour) => (
                <div
                  key={`time-${hour}`}
                  className="relative text-right pr-2"
                  style={{ height: 60 * MINUTE_HEIGHT }}
                >
                  <span className="text-[10px] text-muted-foreground font-medium absolute top-[-7px] right-2 bg-background px-1">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Horizontal Grid Lines */}
            <div className="absolute inset-0 left-[50px] pointer-events-none flex flex-col z-0">
              {hours.map((hour) => (
                <div
                  key={`line-${hour}`}
                  className="w-full border-t border-border/40"
                  style={{ height: 60 * MINUTE_HEIGHT }}
                />
              ))}
            </div>

            {/* Day Columns */}
            <div className="flex flex-1 z-10 relative">
              {weekDays.map((day) => {
                const dayShifts = getShiftsForDate(day);
                const isToday = isSameDay(day, today);
                const layouts = calculateOverlaps(dayShifts);

                return (
                  <div
                    key={`col-${day.toString()}`}
                    className={`flex-1 relative border-r last:border-r-0 border-border/40 ${isToday ? "bg-primary/[0.02]" : ""}`}
                  >
                    {isToday && (
                      <div
                        className="absolute w-full z-20 pointer-events-none border-t-[1.5px] border-primary"
                        style={{
                          top: getCurrentTimePosition(today),
                        }}
                      >
                        <div className="absolute -top-1.5 -left-1 w-3 h-3 rounded-full bg-primary ring-2 ring-background"></div>
                        <div className="absolute -top-5 left-3 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm">
                          NOW {format(today, 'HH:mm')}
                        </div>
                      </div>
                    )}

                    {dayShifts.map((shift) => {
                      const pos = layouts[shift.id] || calculateShiftPosition(shift.start_time, shift.end_time, shift.crosses_midnight ?? false);

                      return (
                        <div
                          key={shift.id}
                          className="absolute"
                          style={{
                            top: pos.top,
                            height: pos.height,
                            left: 'left' in pos ? pos.left : '0%',
                            width: 'width' in pos ? pos.width : '100%',
                            paddingLeft: '2px',
                            paddingRight: '2px'
                          }}
                        >
                          <ShiftCard
                            shift={shift}
                            variant="embedded"
                            onClick={() => onShiftClick?.(shift)}
                            context={context}
                            isToday={isToday}
                            className="h-full"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE: Compact date-grouped agenda */}
      <div className="sm:hidden divide-y divide-border">
        {weekDays.map((day) => {
          const dayShifts = getShiftsForDate(day);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={`mob-${day.toString()}`}
              className={isToday ? "bg-primary/[0.02]" : ""}
            >
              <div
                className={`flex items-baseline gap-2 px-2 py-1.5 ${isToday ? "text-primary bg-primary/[0.03]" : "text-muted-foreground bg-muted/10"}`}
              >
                <span className="text-[11px] uppercase tracking-wider font-bold">
                  {format(day, "EEE")}
                </span>
                <span
                  className={`text-base font-bold shrink-0 ${isToday ? "text-primary" : "text-foreground"}`}
                >
                  {format(day, "d")}
                </span>
                <span className="text-[11px] text-muted-foreground font-medium">
                  {format(day, "MMM")}
                </span>
                {dayShifts.length === 0 && (
                  <span className="ml-auto text-[11px] text-muted-foreground/60 italic">
                    {t("noShiftsScheduled")}
                  </span>
                )}
              </div>
              {dayShifts.length > 0 && (
                <div className="px-2 py-1.5 space-y-1.5">
                  {dayShifts.map((shift, index) => {
                    const currentTimeStr = format(today, "HH:mm:ss");
                    const firstFutureShiftIndex = isToday
                      ? dayShifts.findIndex(
                          (s) => s.start_time > currentTimeStr,
                        )
                      : -1;
                    const showIndicator =
                      isToday && index === firstFutureShiftIndex;
                    return (
                      <React.Fragment key={`mob-shift-${shift.id}`}>
                        {showIndicator && <CurrentTimeIndicator />}
                        <ShiftCard
                          shift={shift}
                          variant="standard"
                          onClick={() => onShiftClick?.(shift)}
                          context={context}
                          isToday={isToday}
                        />
                      </React.Fragment>
                    );
                  })}
                  {isToday &&
                    dayShifts.length > 0 &&
                    dayShifts.findIndex(
                      (s) => s.start_time > format(today, "HH:mm:ss"),
                    ) === -1 && <CurrentTimeIndicator />}
                  {isToday && dayShifts.length === 0 && (
                    <CurrentTimeIndicator />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
