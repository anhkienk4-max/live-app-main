SELECT md5(
  coalesce((SELECT string_agg(to_jsonb(r)::text, E'\n' ORDER BY r.id)
    FROM public.storage_resources r WHERE r.id LIKE 'c4-rehearsal-%'), '') || '|' ||
  coalesce((SELECT string_agg(to_jsonb(g)::text, E'\n' ORDER BY g.resource_id, g.user_id)
    FROM public.storage_resource_user_grants g WHERE g.resource_id LIKE 'c4-rehearsal-%'), '') || '|' ||
  coalesce((SELECT string_agg(to_jsonb(a)::text, E'\n' ORDER BY a.id)
    FROM public.storage_resource_audit_events a WHERE a.resource_id LIKE 'c4-rehearsal-%'), '')
);
