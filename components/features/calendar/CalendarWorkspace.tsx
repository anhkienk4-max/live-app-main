"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { PageHeader, PageHeaderContent } from "@/components/ui/archetypes";
import { CalendarView } from "@/components/features/calendar/CalendarView";
import {
  ImportHistoryPanel,
  ScheduleImportPanel,
} from "@/components/features/calendar/ScheduleImportPanel";
import { ShiftRegistrationBoard } from "@/components/features/calendar/ShiftRegistrationBoard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { hasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { resolveSystemPermission } from "@/lib/permissions";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function CalendarWorkspace() {
  const { currentUser } = useCurrentUser();
  const identity = currentUser ? currentUser.id + ':' + resolveSystemPermission(currentUser) + ':' + currentUser.updated_at : '';
  // Retain TTL-bound identity-scoped reference data when navigating away and back.
  return <CalendarIdentityWorkspace key={identity} />;
}

function CalendarIdentityWorkspace() {
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialTab = searchParams.get("tab");
  const defaultTab = currentUser?.role === 'staff' ? 'mine' : 'calendar';
  const [tab, setTab] = React.useState(
    initialTab &&
      ["calendar", "open", "mine", "import", "history"].includes(initialTab)
      ? initialTab
      : defaultTab,
  );
  const [createRequest, setCreateRequest] = React.useState(0);
  const [visitedTabs, setVisitedTabs] = React.useState(() => new Set([tab]));
  const tabScroll = React.useRef<Record<string, number>>({});
  const workspace = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = workspace.current;
    const main = root?.closest('main');
    if (!root || !main) return;
    const top = tabScroll.current[tab] ?? 0;
    const observer = new ResizeObserver(() => {
      main.scrollTo({ top });
      if (main.scrollHeight - main.clientHeight >= top) observer.disconnect();
    });
    observer.observe(root);
    const stop = () => observer.disconnect();
    main.addEventListener('wheel', stop, { passive: true });
    main.addEventListener('touchstart', stop, { passive: true });
    main.addEventListener('keydown', stop);
    return () => {
      observer.disconnect();
      main.removeEventListener('wheel', stop);
      main.removeEventListener('touchstart', stop);
      main.removeEventListener('keydown', stop);
    };
  }, [tab]);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const action = searchParams.get("action");
      const currentTab = searchParams.get("tab");
      if (!action && !currentTab) return;
      let nextTab = tab;
      if (
        action === "create" &&
        hasPermission(currentUser, "shifts.assign_staff")
      ) {
        nextTab = "calendar";
        setCreateRequest((v) => v + 1);
      } else if (
        action === "import" &&
        hasPermission(currentUser, "shifts.import")
      ) {
        nextTab = "import";
      }

      if (
        currentTab &&
        ["calendar", "open", "mine", "import", "history"].includes(currentTab)
      ) {
        nextTab = currentTab;
      }

      if (nextTab !== tab) {
        tabScroll.current[tab] = workspace.current?.closest('main')?.scrollTop ?? 0;
        setTab(nextTab);
      }
      setVisitedTabs((current) => current.has(nextTab) ? current : new Set(current).add(nextTab));

      if (action) {
        const next = new URLSearchParams(searchParams.toString());
        next.delete("action");
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [searchParams, pathname, router, currentUser, tab]);

  const handleTabChange = (value: string) => {
    tabScroll.current[tab] = workspace.current?.closest('main')?.scrollTop ?? 0;
    setTab(value);
    setVisitedTabs((current) => current.has(value) ? current : new Set(current).add(value));
    const next = new URLSearchParams(window.location.search);
    next.set("tab", value);
    const qs = next.toString();
    window.history.pushState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <Tabs
      ref={workspace}
      value={tab}
      onValueChange={handleTabChange}
      className="min-w-0 w-full space-y-3"
    >
      <PageHeader className="mb-0 min-h-16" data-testid="calendar-stable-header">
        <PageHeaderContent>
          <h1 className="text-xl font-semibold tracking-tight">{t("calendar")}</h1>
          <p className="text-sm text-muted-foreground">{t("calendarSubtitle")}</p>
        </PageHeaderContent>
      </PageHeader>
      <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden" data-testid="calendar-stable-tabs">
        <TabsList aria-label={t("calendar")} className="h-auto w-max min-w-full flex-nowrap justify-start sm:min-w-0">
          <TabsTrigger className="!flex-none px-3 py-2" value="calendar">{t("shiftCalendar")}</TabsTrigger>
          <TabsTrigger className="!flex-none px-3 py-2" value="open">{t("openShifts")}</TabsTrigger>
          <TabsTrigger className="!flex-none px-3 py-2" value="mine">{t("myShifts")}</TabsTrigger>
          <TabsTrigger className="!flex-none px-3 py-2" value="import">{t("importSchedule")}</TabsTrigger>
          <TabsTrigger className="!flex-none px-3 py-2" value="history">{t("importHistory")}</TabsTrigger>
        </TabsList>
      </div>
      <div className="flex min-h-10 flex-wrap items-center gap-2" data-testid="calendar-tab-toolbar">
        {tab === "calendar" && hasPermission(currentUser, "shifts.assign_staff") && <Button size="sm" onClick={() => setCreateRequest(value => value + 1)}><Plus className="mr-2 h-4 w-4" />{t("newShift")}</Button>}
      </div>
      <TabsContent className="min-w-0 w-full" value="calendar">
        <CalendarView createRequest={createRequest} />
      </TabsContent>
      <TabsContent className="min-w-0 w-full" value="open">
        {visitedTabs.has("open") && <ShiftRegistrationBoard mode="open" />}
      </TabsContent>
      <TabsContent className="min-w-0 w-full" value="mine">
        {visitedTabs.has("mine") && <ShiftRegistrationBoard mode="mine" />}
      </TabsContent>
      <TabsContent className="min-w-0 w-full" value="import">
        <ScheduleImportPanel />
      </TabsContent>
      <TabsContent className="min-w-0 w-full" value="history">
        <ImportHistoryPanel />
      </TabsContent>
    </Tabs>
  );
}
