"use client";

import React, { useRef, useEffect, useState } from "react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { vi, enUS } from "date-fns/locale";
import { Plus } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { hasPermission } from "@/lib/permissions";
import { ShiftCard } from "@/components/features/shifts/ShiftCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { CurrentTimeIndicator } from "@/components/ui/current-time-indicator";
import { CalendarOverflowDialog } from "./CalendarOverflowDialog";
import {
  TIME_COLUMN_WIDTH,
  shiftsForGridDate,
  computeDayTimelineLayout,
  type TimelineOverflowBadge,
} from "@/lib/utils/timeGrid";
import { formatShiftTimeRange } from "@/lib/utils/shiftUtils";
import { pageRange } from "@/lib/utils/pagination";
import type { CalendarFilterContext } from "@/lib/utils/calendarFilters";
import type { Shift, Brand, Platform, ShiftRegistration, User } from "@/lib/types/database.types";

interface WeekViewProps {
  currentDate: Date;
  shifts: Shift[];
  brands: Brand[];
  platforms: Platform[];
  registrations: ShiftRegistration[];
  users?: User[];
  onShiftClick?: (shift: Shift) => void;
  onEditShift?: (shift: Shift) => void;
  hasActiveFilters?: boolean;
  currentUser?: User | null;
  onClearFilters?: () => void;
  onCreateShift?: () => void;
  fullOnMobile?: boolean;
}

export function WeekView({
  currentDate,
  shifts,
  brands,
  platforms,
  registrations,
  users = [],
  onShiftClick,
  onEditShift,
  hasActiveFilters = false,
  currentUser = null,
  onClearFilters,
  onCreateShift,
  fullOnMobile = false,
}: WeekViewProps) {
  const context: CalendarFilterContext = {
    currentDate: new Date(),
    brands,
    platforms,
    registrations,
  };
  const { t, language } = useTranslation();
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  // Active overflow badge for modal
  const [activeOverflowBadge, setActiveOverflowBadge] = useState<TimelineOverflowBadge<unknown> | null>(null);

  // Day detail dialog for header click
  const [detailDay, setDetailDay] = useState<Date | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [detailSize, setDetailSize] = useState(10);
  const detailShifts = (detailDay ? shiftsForGridDate(shifts, format(detailDay, "yyyy-MM-dd")).map(item => item.shift) : [])
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id));
  const detailRange = pageRange(detailShifts.length, detailPage, detailSize);

  // Fixed 24-hour timeline height for stable rendering without layout shifts
  const hourHeight = 44;
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const totalGridHeight = 24 * hourHeight;

  // Auto-scroll to business hours (07:00) on initial load
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollerRef.current) {
      // 7:00 AM default scroll
      scrollerRef.current.scrollTop = 7 * hourHeight;
    }
  }, [hourHeight]);

  const getShiftsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return shiftsForGridDate(shifts, dateStr).map(item => item.shift);
  };

  return (
    <>
      {/* Top summary bar for quick day selection */}
      <div className="hidden flex-wrap gap-1 border-b p-2 sm:flex" aria-label={t("viewDetails")}>
        {weekDays.map(day => {
          const count = getShiftsForDate(day).length;
          return count > 0 && (
            <Button
              key={day.toISOString()}
              size="sm"
              variant="ghost"
              onClick={() => {
                setDetailDay(day);
                setDetailPage(1);
              }}
            >
              {format(day, "dd/MM")} · {count} {t("totalShifts")} · {t("viewDetails")}
            </Button>
          );
        })}
      </div>

      {/* DESKTOP: Horizontally & vertically scrollable 24-hour true-time grid */}
      <div
        ref={scrollerRef}
        data-testid="calendar-week-scroller"
        aria-label={language === "vi" ? "Lịch tuần, cuộn ngang để xem đủ bảy ngày" : "Week calendar, scroll horizontally to see all seven days"}
        className={`relative max-w-full min-w-0 overflow-x-auto max-h-[75vh] overflow-y-auto overscroll-contain rounded-md border bg-background ${
          fullOnMobile ? "block" : "hidden sm:block"
        }`}
        style={{ scrollbarWidth: "thin" }}
      >
        {shifts.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm min-h-[400px]">
            <div className="text-center p-6 bg-background rounded-xl border shadow-sm max-w-sm">
              <p className="text-lg font-medium text-foreground mb-4">
                {hasActiveFilters ? "No shifts match these filters." : "No shifts scheduled this week."}
              </p>
              {hasActiveFilters ? (
                <Button variant="outline" onClick={onClearFilters}>
                  Clear filters
                </Button>
              ) : currentUser && hasPermission(currentUser, "shifts.edit") ? (
                <Button onClick={onCreateShift}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Shift
                </Button>
              ) : (
                <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("calendar:view", { detail: "list" }))}>
                  Browse Open Shifts
                </Button>
              )}
            </div>
          </div>
        )}

        <div
          className="grid min-w-[1080px]"
          style={{ gridTemplateColumns: `${TIME_COLUMN_WIDTH}px repeat(7, minmax(140px, 1fr))` }}
        >
          {/* Sticky Header Row */}
          <div className="sticky top-0 z-30 bg-background border-b border-border border-r h-14"></div>
          {weekDays.map(day => {
            const isToday = isSameDay(day, today);
            const dayShifts = getShiftsForDate(day);
            return (
              <div
                key={`header-${day.toString()}`}
                className={`sticky top-0 z-30 bg-background flex flex-col items-center justify-center py-2 px-1 border-b border-r last:border-r-0 h-14 ${
                  isToday ? "border-primary/40 bg-primary/[0.04]" : "border-border"
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  {format(day, "EEEE", { locale: language === "vi" ? vi : enUS })}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold shrink-0 ${isToday ? "text-primary" : "text-foreground"}`}>
                    {format(day, "dd/MM")}
                  </span>
                  {dayShifts.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-700 font-semibold">
                      {dayShifts.length}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Grid Body */}
          <div className="col-span-full relative flex" style={{ height: totalGridHeight }}>
            {/* Time Axis Column */}
            <div
              className="relative shrink-0 border-r border-border bg-background z-20"
              style={{ width: TIME_COLUMN_WIDTH, height: totalGridHeight }}
            >
              {hours.map(hour => (
                <div key={`time-${hour}`} className="relative text-right pr-2" style={{ height: hourHeight }}>
                  <span className="text-[10px] text-muted-foreground font-medium absolute top-0 right-2 bg-background px-1">
                    {hour.toString().padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Horizontal Grid Lines */}
            <div className="absolute inset-0 left-[50px] pointer-events-none flex flex-col z-0">
              {hours.map(hour => (
                <div key={`line-${hour}`} className="w-full border-t border-border/40" style={{ height: hourHeight }} />
              ))}
            </div>

            {/* 7 Day Columns with 3-Lane Overlap Layout */}
            <div className="flex flex-1 z-10 relative">
              {weekDays.map(day => {
                const isToday = isSameDay(day, today);
                const dayDateStr = format(day, "yyyy-MM-dd");
                const dayGridShifts = shiftsForGridDate(shifts, dayDateStr);

                // Compute layout with maximum 3 lanes and overflow badges
                const { renderedShifts, overflowBadges } = computeDayTimelineLayout(dayGridShifts, {
                  hourHeight,
                  minimumMinutes: 30,
                  maxLanes: 3,
                });

                // Current time position in px
                const currentMinutes = today.getHours() * 60 + today.getMinutes();
                const currentTimeTop = (currentMinutes / 60) * hourHeight;

                return (
                  <div
                    key={`col-${day.toString()}`}
                    className={`min-w-0 flex-1 relative border-r last:border-r-0 border-border/40 overflow-hidden ${
                      isToday ? "bg-primary/[0.02]" : ""
                    }`}
                    style={{ height: totalGridHeight }}
                  >
                    {/* Real-time Indicator Line */}
                    {isToday && (
                      <div
                        className="absolute w-full z-20 pointer-events-none border-t-[1.5px] border-primary"
                        style={{ top: currentTimeTop }}
                      >
                        <div className="absolute -top-1.5 -left-1 w-3 h-3 rounded-full bg-primary ring-2 ring-background"></div>
                        <div className="absolute -top-5 left-3 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm">
                          {format(today, "HH:mm")}
                        </div>
                      </div>
                    )}

                    {/* 1. Visible Shifts in Lanes (Lane 0, 1, or 2) */}
                    {renderedShifts.map(layout => {
                      const { shift } = layout;
                      const title = [shift.title, formatShiftTimeRange(shift)].filter(Boolean).join(" · ");

                      return (
                        <div
                          key={`rendered-${shift.id}-${layout.start_time}`}
                          className="absolute z-10"
                          style={{
                            top: `${layout.topPx}px`,
                            height: `${layout.heightPx}px`,
                            left: `${layout.leftPercent}%`,
                            width: `${layout.widthPercent}%`,
                            paddingLeft: "1.5px",
                            paddingRight: "1.5px",
                          }}
                        >
                          <ShiftCard
                            title={title}
                            aria-label={[shift.title || shift.id, formatShiftTimeRange(shift), t("viewDetails")].join(" · ")}
                            shift={shift}
                            variant="embedded"
                            users={users}
                            showDate
                            onClick={() => onShiftClick?.(shift)}
                            context={context}
                            isToday={isToday}
                            className={`h-full min-w-0 border bg-card shadow-2xs hover:shadow-md transition-all ${
                              layout.continuation ? "border-l-4 border-l-blue-400" : ""
                            }`}
                          />
                        </div>
                      );
                    })}

                    {/* 2. Interactive Overflow Badges in Lane 2 */}
                    {overflowBadges.map(badge => (
                      <div
                        key={badge.id}
                        className="absolute z-10"
                        style={{
                          top: `${badge.topPx}px`,
                          height: `${badge.heightPx}px`,
                          left: `${badge.leftPercent}%`,
                          width: `${badge.widthPercent}%`,
                          paddingLeft: "1.5px",
                          paddingRight: "1.5px",
                        }}
                      >
                        <button
                          type="button"
                          data-testid={`week-overlap-${dayDateStr}-${badge.id}`}
                          aria-label={`${badge.timeLabel} · ${badge.count} ${language === "vi" ? "ca livestream khác" : "more shifts"} · ${t("viewDetails")}`}
                          onClick={() => setActiveOverflowBadge(badge)}
                          className="h-full w-full rounded-md border border-amber-300 bg-amber-50/95 p-1 text-left text-xs text-amber-900 shadow-2xs hover:bg-amber-100 hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 transition-all flex flex-col justify-between overflow-hidden cursor-pointer"
                        >
                          <div className="flex items-center gap-1 font-bold text-amber-800 leading-tight">
                            <span className="rounded bg-amber-200/90 px-1 py-0.2 text-[10px] font-extrabold text-amber-950 shrink-0">
                              +{badge.count}
                            </span>
                            <span className="text-[10px] truncate leading-none">{badge.timeLabel}</span>
                          </div>
                          <span className="text-[9px] text-amber-700 font-medium truncate mt-0.5">
                            {language === "vi" ? "Xem tất cả →" : "View all →"}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE: Compact date-grouped agenda */}
      <div className={fullOnMobile ? "hidden" : "sm:hidden divide-y divide-border"}>
        {weekDays.map(day => {
          const dayShifts = getShiftsForDate(day);
          const isToday = isSameDay(day, today);
          return (
            <div key={`mob-${day.toString()}`} className={isToday ? "bg-primary/[0.02]" : ""}>
              <div
                className={`flex items-baseline gap-2 px-3 py-2 ${
                  isToday ? "text-primary bg-primary/[0.04]" : "text-muted-foreground bg-muted/10"
                }`}
              >
                <span className="text-[11px] uppercase tracking-wider font-bold">
                  {format(day, "EEEE", { locale: language === "vi" ? vi : enUS })}
                </span>
                <span className={`text-base font-bold shrink-0 ${isToday ? "text-primary" : "text-foreground"}`}>
                  {format(day, "dd/MM")}
                </span>
                <span className="text-[11px] text-muted-foreground font-medium">{format(day, "MMM")}</span>
                {dayShifts.length === 0 && (
                  <span className="ml-auto text-[11px] text-muted-foreground/60 italic">{t("noShiftsScheduled")}</span>
                )}
              </div>
              {dayShifts.length > 0 && (
                <div className="px-3 py-2 space-y-2">
                  {dayShifts.slice(0, 3).map((shift, index) => {
                    const currentTimeStr = format(today, "HH:mm:ss");
                    const firstFutureShiftIndex = isToday ? dayShifts.findIndex(s => s.start_time > currentTimeStr) : -1;
                    const showIndicator = isToday && index === firstFutureShiftIndex;
                    return (
                      <React.Fragment key={`mob-shift-${shift.id}`}>
                        {showIndicator && <CurrentTimeIndicator />}
                        <ShiftCard shift={shift} variant="compact" onClick={() => onShiftClick?.(shift)} context={context} isToday={isToday} />
                      </React.Fragment>
                    );
                  })}
                  {dayShifts.length > 3 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs font-semibold"
                      onClick={() => {
                        setDetailDay(day);
                        setDetailPage(1);
                      }}
                    >
                      {t("viewDetails")} · {dayShifts.length} {t("totalShifts")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overflow Modal: Pops up on +N Badge click */}
      <CalendarOverflowDialog
        open={!!activeOverflowBadge}
        onOpenChange={open => {
          if (!open) setActiveOverflowBadge(null);
        }}
        badge={activeOverflowBadge}
        brands={brands}
        platforms={platforms}
        users={users}
        currentUser={currentUser}
        onShiftClick={shift => {
          setActiveOverflowBadge(null);
          onShiftClick?.(shift);
        }}
        onEditShift={shift => {
          setActiveOverflowBadge(null);
          onEditShift?.(shift);
        }}
      />

      {/* Day Overview Dialog (when clicking header date) */}
      <Dialog
        open={!!detailDay}
        onOpenChange={open => {
          if (!open) setDetailDay(null);
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {detailDay ? format(detailDay, "dd/MM/yyyy") : ""} · {detailShifts.length} {t("totalShifts")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto p-1">
            {detailShifts.slice((detailRange.page - 1) * detailSize, detailRange.page * detailSize).map(shift => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                context={context}
                showDate
                onClick={() => {
                  setDetailDay(null);
                  onShiftClick?.(shift);
                }}
              />
            ))}
          </div>
          <HistoryPagination
            page={detailRange.page}
            pageSize={detailSize}
            total={detailShifts.length}
            onPageChange={setDetailPage}
            onPageSizeChange={size => {
              setDetailSize(size);
              setDetailPage(1);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
