# Design

The existing `get_report_list_page` lists persisted reports, not report obligations where no report exists. A new `public.get_report_obligation_page` RPC returns a bounded page of shift/report pairs. It uses the caller's normal table grants and RLS, then applies the stricter Member queue rule (direct staffing, approved/manual registration, or own submitted report when the shift remains visible under existing RLS); active report states are filtered before count and page selection.

The existing operations collection endpoint remains the authentication boundary and maps database rows to established `Shift` and `Report` domain types. Mock mode keeps using local fixture data; Production Supabase mode uses the new RPC. Reports CRUD and report-history access are unchanged.

Known boundary: a submitter whose shift access was later revoked cannot be surfaced by this queue unless the existing shift RLS still exposes that shift. This change does not broaden shift-read policy; that permission boundary remains separately governed by the existing security contract.
