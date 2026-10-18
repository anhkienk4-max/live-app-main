-- Isolated real RPC + captured Production function definitions + repository RLS.
insert into public.brands(id,name) values('reports-gate','Reports gate');
insert into public.shifts(id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,brand_id,platform_id,registration_cutoff_at,status,title,host_id)
select 'candidate-'||lpad(n::text,3,'0'),'2026-09-01','10:00','11:00','2026-09-01 10:00Z','2026-09-01 11:00Z','2026-09-01',false,60,'reports-gate','p','2026-09-01 10:00Z','completed',case when n=117 then 'Older title last page' else 'Candidate '||n end,'member'
from generate_series(1,117)n;
insert into public.shift_registrations(id,shift_id,user_id,operational_role,status,source) values
('gate-approved','candidate-010','member','host','approved','self_registration'),
('gate-pending','candidate-011','member','support','pending','self_registration'),
('gate-manual','candidate-012','member','technical','manually_assigned','manual_assignment');
insert into public.shifts(id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,brand_id,platform_id,registration_cutoff_at,status,title)
select id,'2026-09-01','12:00','13:00','2026-09-01 12:00Z','2026-09-01 13:00Z','2026-09-01',false,60,'reports-gate','p','2026-09-01 12:00Z','completed',id
from unnest(array['direct-support','direct-technical','own-submitted','unrelated','archived-shift','deleted-shift'])id;
update public.shifts set support_id='member' where id='direct-support';
update public.shifts set technical_id='member' where id='direct-technical';
update public.shifts set host_id='member',archived_at=now() where id='archived-shift';
update public.shifts set host_id='member',deleted_at=now() where id='deleted-shift';
insert into public.reports(id,shift_id,status,metrics_confirmed,submitted_by,revenue,orders)
select 'gate-report-'||n,'candidate-'||lpad(n::text,3,'0'),case when n%4=0 then 'draft' else 'confirmed' end,n%4<>0,'member',100,2 from generate_series(1,117)n;
insert into public.reports(id,shift_id,status,metrics_confirmed,submitted_by) values
('gate-submitter','own-submitted','draft',false,'member'),('gate-unrelated','unrelated','confirmed',true,'other');
analyze public.shifts;
analyze public.shift_registrations;
analyze public.reports;
set role authenticated;
select set_config('rc16k.actor','member',true);
select public.k_assert(public.get_shift_list_page('mine',1,20,'{"brandIds":["reports-gate"]}')->>'total'='3','My Shifts remains active registrations only');
select public.k_assert(public.get_shift_list_page('mine',1,20,'{"brandIds":["reports-gate"],"reportCandidates":true}')->>'total'='120','Reports includes Host Support Technical and own submitter');
select public.k_assert(jsonb_array_length(public.get_shift_list_page('mine',5,20,'{"brandIds":["reports-gate"],"reportCandidates":true}')->'rows')=20,'Reports picker page five');
select public.k_assert(jsonb_array_length(public.get_shift_list_page('mine',6,20,'{"brandIds":["reports-gate"],"reportCandidates":true}')->'rows')=20,'Reports picker complete final page');
select public.k_assert(public.get_shift_list_page('mine',1,20,'{"reportCandidates":true,"search":"Older title last page"}')->'rows'->0->>'id'='candidate-117','Reports search reaches older than thirty');
select public.k_assert(public.get_shift_list_page('mine',1,20,'{"brandIds":["reports-gate"],"reportCandidates":true,"roles":["support"],"registrationStatuses":["pending"]}')->>'total'='1','Reports extras never bypass role and registration status filters');
select public.k_assert(public.get_shift_list_page('mine',1,20,'{"brandIds":["reports-gate"],"reportCandidates":true,"roles":["host"],"registrationStatuses":["pending"]}')->>'total'='0','Different registration dimensions compose with AND');
select public.k_assert(private.can_read_shift('own-submitted') and not private.can_read_shift('unrelated') and not private.can_read_shift('archived-shift') and not private.can_read_shift('deleted-shift'),'Submitter RLS is limited to own active report and active shift');
select public.k_assert(not exists(select 1 from jsonb_array_elements(public.get_shift_list_page('mine',1,20,'{"brandIds":["reports-gate"],"reportCandidates":true}')->'registrations')r where r->>'user_id'<>'member'),'Member registrations remain private');
select public.k_assert(public.get_report_list_page(1,20,'{"brandIds":["reports-gate"]}')->>'total'='118','Reports RLS excludes unrelated report before aggregates');
select public.k_assert(public.get_report_list_page(1,20,'{"brandIds":["reports-gate"]}')->'summary'->>'revenue'='8800','Revenue summarizes every filtered page');
select public.k_assert(public.get_report_list_page(6,20,'{"brandIds":["reports-gate"]}')->'summary'->>'needsReview'='30','Final page retains global draft summary');
select public.k_assert((public.get_report_list_page(6,20,'{"brandIds":["reports-gate"]}')->'summary'->>'aov')::numeric=50,'Global AOV is paired');
select public.k_assert(public.get_report_list_page(1,20,'{"search":"Older title last page"}')->>'total'='1','Reports title search uses full set');
reset role;
update public.reports set archived_at=now(),status='archived' where id='gate-submitter';
set role authenticated;
select public.k_assert(not private.can_read_shift('own-submitted'),'Archived report does not extend shift access');
select set_config('rc16k.actor','leader',true);
select public.k_assert(public.get_report_list_page(1,20,'{"brandIds":["reports-gate"]}')->>'total'='118','Leader retains team report scope');
select set_config('rc16k.actor','admin',true);
select public.k_assert(public.get_report_list_page(1,20,'{"brandIds":["reports-gate"]}')->>'total'='118','Admin scope still excludes archived report and shift');
reset role;
set role anon;
do $$ begin
  begin perform public.get_report_list_page(); exception when insufficient_privilege then raise notice 'RC16K_PASS: anonymous Reports denied'; return; end;
  raise exception 'Anonymous Reports unexpectedly allowed';
end $$;
reset role;
set role authenticated;
select set_config('rc16k.actor','member',true);
explain (analyze,buffers) select public.get_report_list_page(1,20,'{"brandIds":["reports-gate"]}');
reset role;
