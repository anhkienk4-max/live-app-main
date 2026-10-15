-- Exact full-filtered aggregates and titles on 118 records, never just current page.
do $checks$
declare first_page jsonb; sixth_page jsonb; zero_page jsonb; searched jsonb; confirmed_only jsonb; summaries jsonb;
begin
  first_page := public.get_report_list_page(1,20,'{}'::jsonb,false);
  sixth_page := public.get_report_list_page(6,20,'{}'::jsonb,false);
  if (first_page->>'total')::int <> 118
    or jsonb_array_length(first_page->'rows') <> 20
    or (sixth_page->>'page')::int <> 6
    or jsonb_array_length(sixth_page->'rows') <> 18 then
    raise exception 'Reports full dataset pagination lost rows';
  end if;
  if (first_page->'summary'->>'needsReview')::int <> 30
    or (sixth_page->'summary'->>'needsReview')::int <> 30 then
    raise exception 'Reports needs-review total must count 29 false + one NULL across all pages';
  end if;
  if (first_page->'summary'->>'revenue')::numeric <> 8200
    or (sixth_page->'summary'->>'revenue')::numeric <> 8200
    or (first_page->'summary'->>'aov')::numeric <> 50 then
    raise exception 'Reports filtered revenue/AOV was computed from one page or missing paired values';
  end if;
  searched := public.get_report_list_page(1,20,'{"search":"special older"}'::jsonb,false);
  if (searched->>'total')::int <> 1
    or (searched->'rows'->0->>'shift_id') <> 'old-special'
    or (searched->'summary'->>'needsReview')::int <> 1 then
    raise exception 'Search by shift title or filtered aggregate is incorrect';
  end if;
  confirmed_only := public.get_report_list_page(1,20,'{"reportStatuses":["confirmed"]}'::jsonb,false);
  if (confirmed_only->>'total')::int <> 88
    or (confirmed_only->'summary'->>'needsReview')::int <> 0 then
    raise exception 'Confirmed-only server filtering did not use full set';
  end if;
  zero_page := public.get_report_list_page(5,20,'{"search":"absent-needle"}'::jsonb,false);
  if (zero_page->>'total')::int <> 0
    or jsonb_array_length(zero_page->'rows') <> 0
    or (zero_page->>'page')::int <> 1 then
    raise exception 'Zero-result pagination contract broken';
  end if;
  summaries := public.get_report_list_page(2,20,'{}'::jsonb,true);
  if jsonb_array_length(summaries->'rows') <> 20
    or (summaries->'summary'->>'needsReview')::int <> 30
    or (summaries->'rows'->0 ? 'deleted_at') then
    raise exception 'Summary projection must stay bounded and sanitized';
  end if;
  raise notice 'RC1.6K Reports RPC isolated PostgreSQL 17: 118-row pagination, filters, title search, NULLs, and full aggregates PASS';
end;
$checks$;
