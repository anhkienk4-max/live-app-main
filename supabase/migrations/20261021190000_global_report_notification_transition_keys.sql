-- Global Stabilization GS-P1-04: notify each genuine report lifecycle transition exactly once.
-- The original report_submitted:<report>:<recipient> key suppressed resubmissions
-- after a reviewer reopened a report. The review key likewise suppressed later cycles.
-- We retain the existing unique event_key index and the private insert helper.
-- Version increments are persisted by private.record_report_revision in the same transaction.
-- The trigger runs before that revision is recorded, so OLD.version_number + 1
-- identifies the incoming lifecycle transition without relying on timestamps.
-- No historic notification rows are rewritten or removed.
create or replace function private.emit_report_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  recipient_id text;
  event_type text;
  title text;
  message text;
  transition_version integer;
  report_action_url text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  -- Report identifiers are not URL path parameters. Use an explicitly
  -- restricted shift identifier in the deep link, otherwise fall back safely.
  report_action_url := case
    when new.shift_id ~ '^[A-Za-z0-9_-]+$' then '/reports?shiftId=' || new.shift_id
    else '/reports'
  end;
  transition_version := case
    when tg_op = 'UPDATE' then coalesce(old.version_number, 0) + 1
    else coalesce(new.version_number, 0) + 1
  end;

  if (tg_op = 'INSERT' and new.status = 'in_review')
    or (tg_op = 'UPDATE' and old.status in ('draft', 'reopened') and new.status = 'in_review') then
    for recipient_id in select private.notification_reviewer_ids(new.shift_id)
    loop
      perform private.insert_notification(
        recipient_id, 'report_submitted', 'report', 'info',
        'Report submitted', 'A report is ready for review.',
        'report', new.id, report_action_url,
        'report_submitted:' || new.id || ':' || transition_version || ':' || recipient_id
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'in_review' and new.status in ('confirmed', 'reopened') then
    event_type := 'report_reviewed';
    title := case when new.status = 'confirmed' then 'Report approved' else 'Report needs updates' end;
    message := case when new.status = 'confirmed' then 'Your report was approved.'
      else coalesce(new.review_notes, 'Your report needs updates.') end;
    perform private.insert_notification(
      new.submitted_by, event_type, 'report',
      case when new.status = 'confirmed' then 'success' else 'warning' end,
      title, message, 'report', new.id, report_action_url,
      event_type || ':' || new.id || ':' || transition_version || ':' ||
        coalesce(new.submitted_by, '') || ':' || new.status
    );
  end if;
  return new;
end;
$$;

revoke all on function private.emit_report_notification() from public, anon, authenticated;
-- Existing reports_notification_events trigger is retained by CREATE OR REPLACE.
