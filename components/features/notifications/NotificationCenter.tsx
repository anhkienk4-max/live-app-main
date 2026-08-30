"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Bell,
  X,
  Clock,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import { notificationService } from "@/lib/services/notificationService";
import type { AppNotification } from "@/lib/types/database.types";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/components/ui/toast";

function resolveNotificationDestination(n: AppNotification) {
  if (n.action_url) return n.action_url;
  if (n.type.includes("swap")) return "/swaps";
  if (n.type.includes("report")) return "/reports";
  if (n.type === "shift_assigned") return "/calendar?tab=mine";
  return "/notifications";
}

export function NotificationCenter() {
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<AppNotification[]>(
    [],
  );
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const { t } = useTranslation();
  const { toast } = useToast();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const seenIds = React.useRef<Set<string>>(new Set());
  const initialLoadDone = React.useRef(false);

  const load = React.useCallback(async () => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }
    const items = await notificationService.getForCurrentUser();

    if (initialLoadDone.current) {
      items.forEach((n) => {
        if (!n.read_at && !seenIds.current.has(n.id)) {
          toast({
            title: n.title,
            description: n.message,
            variant: "info",
            duration: 8000,
            action: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void notificationService.markRead(n.id);
                  router.push(resolveNotificationDestination(n));
                }}
              >
                {t("view")}
              </Button>
            ),
          });
          seenIds.current.add(n.id);
        }
      });
    } else {
      items.forEach((n) => seenIds.current.add(n.id));
      initialLoadDone.current = true;
    }

    setNotifications(items);
  }, [currentUser, router, t, toast]);

  React.useEffect(() => {
    let active = true;
    let unsubscribeRealtime: () => void = () => undefined;
    const refresh = async () => {
      try {
        await load();
      } catch {
        if (active) setNotifications([]);
      }
    };
    void refresh();
    if (currentUser)
      unsubscribeRealtime = notificationService._subscribeRealtime(
        currentUser.id,
        () => void refresh(),
      );
    const unsubscribeMock = notificationService._subscribe(
      () => void refresh(),
    );
    return () => {
      active = false;
      unsubscribeRealtime();
      unsubscribeMock();
    };
  }, [currentUser, load]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const groupedNotifications = React.useMemo(() => {
    const newItems: AppNotification[] = [];
    const earlierItems: AppNotification[] = [];
    notifications.slice(0, 30).forEach((n) => {
      if (!n.read_at) newItems.push(n);
      else earlierItems.push(n);
    });
    return { new: newItems, earlier: earlierItems };
  }, [notifications]);

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await notificationService.markRead(id);
    await load();
  };

  const markAllAsRead = async () => {
    await notificationService.markAllRead();
    await load();
  };

  const handleClick = async (n: AppNotification) => {
    if (!n.read_at) await notificationService.markRead(n.id);
    router.push(resolveNotificationDestination(n));
    setOpen(false);
  };

  const getIcon = (type: string, read: boolean) => {
    const baseClass = "h-4 w-4";
    const colorClass = read
      ? "text-muted-foreground"
      : type === "shift_assigned"
        ? "text-blue-600"
        : type.includes("import")
          ? "text-red-600"
          : type.includes("swap")
            ? "text-amber-600"
            : type.includes("report")
              ? "text-orange-600"
              : "text-primary";

    switch (type) {
      case "shift_assigned":
        return <Clock className={`${baseClass} ${colorClass}`} />;
      case "import_warning":
      case "import_failure":
        return <AlertCircle className={`${baseClass} ${colorClass}`} />;
      case "swap_request":
      case "swap_accepted":
      case "swap_rejected":
        return <RefreshCw className={`${baseClass} ${colorClass}`} />;
      case "report_submitted":
      case "report_reviewed":
        return <AlertCircle className={`${baseClass} ${colorClass}`} />;
      default:
        return <Bell className={`${baseClass} ${colorClass}`} />;
    }
  };

  const NotificationItem = ({ n }: { n: AppNotification }) => {
    const isUnread = !n.read_at;
    return (
      <div
        onClick={() => void handleClick(n)}
        className={`group relative flex items-start gap-3 p-4 transition-colors hover:bg-muted/50 ${
          isUnread
            ? "bg-background cursor-pointer"
            : "bg-transparent cursor-pointer opacity-80 hover:opacity-100"
        } hover:shadow-sm`}
      >
        <div
          className={`mt-0.5 rounded-full p-1.5 ${isUnread ? "bg-primary/10" : "bg-muted"}`}
        >
          {getIcon(n.type, !isUnread)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div
              className={`text-sm leading-tight ${isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}
            >
              {n.title}
            </div>
            {isUnread && (
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
            )}
          </div>
          <p
            className={`text-xs leading-relaxed line-clamp-2 ${isUnread ? "text-muted-foreground" : "text-muted-foreground/80"}`}
          >
            {n.message}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {format(new Date(n.created_at), "MMM d, h:mm a")}
            </span>
            {isUnread ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] uppercase font-bold text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => void markAsRead(n.id, e)}
              >
                {t("markRead")}
              </Button>
            ) : (
              <span className="text-[10px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
                {t("view")} &rarr;
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className={`relative h-11 w-11 ${unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <Card className="absolute right-0 top-12 z-50 w-[100vw] sm:w-[420px] max-w-[100vw] overflow-hidden shadow-2xl rounded-xl border-border animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b bg-muted/40 p-4">
            <div>
              <h3 className="font-semibold text-foreground">
                {t("notifications")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {unreadCount} {t("unread")}
              </p>
            </div>
            <div className="flex gap-1.5">
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-medium"
                  onClick={markAllAsRead}
                >
                  <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                  {t("markAllRead")}
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden bg-background">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="mb-4 rounded-full bg-muted p-4">
                  <Bell className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="font-medium text-foreground">
                  {t("allCaughtUp")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("noNewNotifications")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {groupedNotifications.new.length > 0 && (
                  <div className="bg-muted/20">
                    <div className="sticky top-0 z-10 bg-muted/95 px-4 py-2 backdrop-blur-sm">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {t("new")}
                      </span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {groupedNotifications.new.map((n) => (
                        <NotificationItem key={n.id} n={n} />
                      ))}
                    </div>
                  </div>
                )}

                {groupedNotifications.earlier.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 bg-background/95 px-4 py-2 backdrop-blur-sm border-y divide-border/50">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {t("earlier")}
                      </span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {groupedNotifications.earlier.map((n) => (
                        <NotificationItem key={n.id} n={n} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
