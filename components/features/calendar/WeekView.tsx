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
import { vi, enUS } from "date-fns/locale";
import { useTranslation } from "@/lib/i18n";
import { CurrentTimeIndicator } from "@/components/ui/current-time-indicator";
import { TIME_COLUMN_WIDTH, calculateShiftPosition, groupTimeGridShifts, shiftsForGridDate, getCurrentTimePosition } from "@/lib/utils/timeGrid";
import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { pageRange } from "@/lib/utils/pagination";
import { formatShiftTimeRange } from "@/lib/utils/shiftUtils";
import { Plus } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { User } from '@/lib/types/database.types';

interface WeekViewProps {
  currentDate: Date;
  shifts: Shift[];
  brands: Brand[];
  platforms: Platform[];
  registrations: ShiftRegistration[];
  users?: User[];
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
  users = [],
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
  const { t, language } = useTranslation();
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const [detailDay, setDetailDay] = React.useState<Date | null>(null);
  const [detailIds, setDetailIds] = React.useState<string[] | null>(null);
  const [detailPage, setDetailPage] = React.useState(1);
  const [detailSize, setDetailSize] = React.useState(10);
  const detailShifts = (detailDay ? shiftsForGridDate(shifts, format(detailDay, "yyyy-MM-dd")).map(item => item.shift) : [])
    .filter(shift => !detailIds || detailIds.includes(shift.id))
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id));
  const detailRange = pageRange(detailShifts.length, detailPage, detailSize);


  const getShiftsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return shiftsForGridDate(shifts, dateStr).map(item => item.shift);
  };

  const firstHour = Math.min(8, ...weekDays.flatMap(day => shiftsForGridDate(shifts, format(day, 'yyyy-MM-dd')).map(item => Number(item.start_time.slice(0, 2)))));
  const hourHeight = 36;
  const hours = Array.from({ length: 24 - firstHour }, (_, i) => i + firstHour);

  return (
    <>
      <div className="hidden flex-wrap gap-1 border-b p-2 sm:flex" aria-label={t("viewDetails")}>
        {weekDays.map(day => {
          const count = getShiftsForDate(day).length;
          return count > 0 && <Button key={day.toISOString()} size="sm" variant="ghost" onClick={() => { setDetailIds(null); setDetailDay(day); setDetailPage(1); }}>
            {format(day, "dd/MM")} · {count} {t("totalShifts")} · {t("viewDetails")}
          </Button>;
        })}
      </div>
      {/* DESKTOP: Horizontally scrollable true-time grid */}
      <div
        data-testid="calendar-week-scroller"
        aria-label={language === 'vi' ? 'Lịch tuần, cuộn ngang để xem đủ bảy ngày' : 'Week calendar, scroll horizontally to see all seven days'}
        className="relative hidden max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-md border bg-background sm:block"
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
          className="grid min-w-[1080px]"
          style={{ gridTemplateColumns: `${TIME_COLUMN_WIDTH}px repeat(7, minmax(140px, 1fr))` }}
        >
          {/* Header Row */}
          <div className="bg-background border-b border-border border-r"></div>
          {weekDays.map((day) => {
            const isToday = isSameDay(day, today);
            const dayShifts = getShiftsForDate(day);
            return (
              <div
                key={`header-${day.toString()}`}
                className={`bg-background flex flex-col items-center gap-1 py-2 px-1 border-b border-r last:border-r-0 ${isToday ? "border-primary/40 bg-primary/[0.02]" : "border-border"}`}
              >
                <span
                  className={`text-[10px] uppercase tracking-wider font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}
                >
                  {format(day, "EEEE", { locale: language === "vi" ? vi : enUS })}
                </span>
                <span
                  className={`text-sm font-bold shrink-0 ${isToday ? "text-primary" : "text-foreground"}`}
                >
                  {format(day, "dd/MM")}
                </span>
                {dayShifts.length > 0 && (
                  <span className="text-[10px] text-muted-foreground font-medium">
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
                  style={{ height: hourHeight }}
                >
                  <span className="text-[10px] text-muted-foreground font-medium absolute top-0 right-2 bg-background px-1">
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
                  style={{ height: hourHeight }}
                />
              ))}
            </div>

            {/* Day Columns */}
            <div className="flex flex-1 z-10 relative">
              {weekDays.map((day) => {
                const isToday = isSameDay(day, today);
                const groups = groupTimeGridShifts(shiftsForGridDate(shifts, format(day, 'yyyy-MM-dd')));

                return (
                  <div
                    key={`col-${day.toString()}`}
                    className={`min-w-0 flex-1 relative border-r last:border-r-0 border-border/40 ${isToday ? "bg-primary/[0.02]" : ""}`}
                  >
                    {isToday && today.getHours() >= firstHour && (
                      <div
                        className="absolute w-full z-20 pointer-events-none border-t-[1.5px] border-primary"
                        style={{
                          top: getCurrentTimePosition(today) / 2 - firstHour * hourHeight,
                        }}
                      >
                        <div className="absolute -top-1.5 -left-1 w-3 h-3 rounded-full bg-primary ring-2 ring-background"></div>
                        <div className="absolute -top-5 left-3 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm">
                          NOW {format(today, 'HH:mm')}
                        </div>
                      </div>
                    )}

                    {groups.map((group) => {
                      const { shift } = group[0];
                      const pos = calculateShiftPosition(group[0].start_time, group[0].end_time, false, 60);

                      return (
                        <div
                          key={shift.id}
                          className="absolute"
                          style={{
                            top: pos.top / 2 - firstHour * hourHeight,
                            height: pos.height / 2,
                            left: '0%',
                            width: '100%',
                            paddingLeft: '2px',
                            paddingRight: '2px'
                          }}
                        >
                          {group.length > 1 ? <Button variant="outline" data-testid={'week-overlap-' + format(day, 'yyyy-MM-dd') + '-' + shift.id} aria-label={group[0].start_time.slice(0, 5) + ' · ' + group.length + ' ' + t('totalShifts') + ' · ' + t('viewDetails')} className="h-full w-full flex-col gap-0 whitespace-normal px-1 py-0 text-xs leading-tight" onClick={() => { setDetailIds(group.map(item => item.id)); setDetailDay(day); setDetailPage(1); }}>
                            <span>{group[0].start_time.slice(0, 5)} · {group.length} {language === 'vi' ? 'ca' : 'shifts'}</span>
                            <span>{t('viewDetails')}</span>
                          </Button> : <ShiftCard
                            title={[shift.title, formatShiftTimeRange(shift)].filter(Boolean).join(" · ")}
                            aria-label={[shift.title || shift.id, formatShiftTimeRange(shift), t("viewDetails")].join(" · ")}
                            shift={shift}
                            variant="embedded"
                          users={users}
                          showDate
                            onClick={() => onShiftClick?.(shift)}
                            context={context}
                            isToday={isToday}
                            className="h-full min-w-0 border bg-card"
                          />}
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
                  {format(day, "EEEE", { locale: language === "vi" ? vi : enUS })}
                </span>
                <span
                  className={`text-base font-bold shrink-0 ${isToday ? "text-primary" : "text-foreground"}`}
                >
                  {format(day, "dd/MM")}
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
                  {dayShifts.slice(0,3).map((shift, index) => {
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
                          variant="compact"
                          onClick={() => onShiftClick?.(shift)}
                          context={context}
                          isToday={isToday}
                        />
                      </React.Fragment>
                    );
                  })}
                  {dayShifts.length>3 && <Button size="sm" variant="outline" className="w-full"
                    onClick={()=>{setDetailIds(null);setDetailDay(day);setDetailPage(1)}}>{t('viewDetails')} · {dayShifts.length} {t('totalShifts')}</Button>}
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
      <Dialog open={!!detailDay} onOpenChange={open => { if (!open) setDetailDay(null); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{detailDay ? format(detailDay, "dd/MM/yyyy") : ""} · {detailShifts.length} {t("totalShifts")}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {detailShifts.slice((detailRange.page - 1) * detailSize, detailRange.page * detailSize).map(shift =>
              <ShiftCard key={shift.id} shift={shift} context={context} showDate onClick={() => { setDetailDay(null); onShiftClick?.(shift); }} />
            )}
          </div>
          <HistoryPagination page={detailRange.page} pageSize={detailSize} total={detailShifts.length} onPageChange={setDetailPage} onPageSizeChange={size => { setDetailSize(size); setDetailPage(1); }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
