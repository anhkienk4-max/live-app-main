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
import React from "react";

interface WeekViewProps {
  currentDate: Date;
  shifts: Shift[];
  brands: Brand[];
  platforms: Platform[];
  registrations: ShiftRegistration[];
  onShiftClick?: (shift: Shift) => void;
}

export function WeekView({
  currentDate,
  shifts,
  brands,
  platforms,
  registrations,
  onShiftClick,
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

  return (
    <>
      {/* DESKTOP: Horizontally scrollable 7-column grid with 140px min column width */}
      <div
        className="hidden sm:block overflow-x-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        <div
          className="grid min-w-[980px]"
          style={{ gridTemplateColumns: "repeat(7, minmax(140px, 1fr))" }}
        >
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDate(day);
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toString()}
                className={`min-h-[260px] border-r last:border-r-0 border-border px-1.5 pb-3 ${isToday ? "bg-primary/[0.02]" : ""}`}
              >
                <div
                  className={`flex items-center gap-1.5 py-1.5 mb-2 border-b ${isToday ? "border-primary/40" : "border-border"}`}
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

                <div className="relative space-y-1 mt-2 min-h-[600px]">
                  {isToday && (
                    <div
                      className="absolute w-full z-20 pointer-events-none"
                      style={{
                        top: `${((today.getHours() * 60 + today.getMinutes()) / 1440) * 100}%`,
                      }}
                    >
                      <CurrentTimeIndicator />
                    </div>
                  )}
                  {dayShifts.map((shift) => (
                    <React.Fragment key={shift.id}>
                      <ShiftCard
                        shift={shift}
                        variant="standard"
                        onClick={() => onShiftClick?.(shift)}
                        context={context}
                        isToday={isToday}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MOBILE: Compact date-grouped agenda */}
      <div className="sm:hidden divide-y divide-border">
        {weekDays.map((day) => {
          const dayShifts = getShiftsForDate(day);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toString()}
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
                      <React.Fragment key={shift.id}>
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
