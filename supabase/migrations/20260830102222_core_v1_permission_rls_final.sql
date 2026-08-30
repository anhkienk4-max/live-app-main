-- Core V1 permission/RLS final gate: remove accidental PUBLIC/anon execution
-- from guarded expected-version mutation RPCs while retaining authenticated
-- entrypoints and revoking obsolete pre-concurrency overloads.

-- Expected-version application entrypoints: authenticated only.
revoke all on function public.approve_shift_registration(text, text, integer) from public, anon;
revoke all on function public.approve_shift_swap_request(text, text, integer) from public, anon;
revoke all on function public.cancel_own_shift_registration(text, text, integer) from public, anon;
revoke all on function public.cancel_own_shift_swap_request(text, text, integer) from public, anon;
revoke all on function public.manual_assign_imported_shift_staff(text, text, text, text, text, text, integer) from public, anon;
revoke all on function public.manual_assign_shift_staff(text, text, text, text, integer) from public, anon;
revoke all on function public.reject_shift_registration(text, text, integer) from public, anon;
revoke all on function public.reject_shift_swap_request(text, text, integer) from public, anon;
revoke all on function public.remove_shift_staffing(text, text, integer) from public, anon;
revoke all on function public.respond_shift_swap_request(text, text, text, integer) from public, anon;
revoke all on function public.restore_shift(text, integer) from public, anon;
revoke all on function public.set_shift_registration_lock(text, boolean, integer) from public, anon;
revoke all on function public.soft_delete_shift(text, text, integer) from public, anon;
revoke all on function public.update_shift(text, jsonb, boolean, integer) from public, anon;
revoke all on function public.update_shift_staffing_labels(text, text[], text[], text[], integer) from public, anon;

-- Legacy overloads are not application entrypoints and remain unavailable to
-- every client role. The guarded overloads above retain authenticated access.
revoke all on function public.approve_shift_registration(text, text) from public, anon, authenticated;
revoke all on function public.approve_shift_swap_request(text, text) from public, anon, authenticated;
revoke all on function public.cancel_own_shift_registration(text, text) from public, anon, authenticated;
revoke all on function public.cancel_own_shift_swap_request(text, text) from public, anon, authenticated;
revoke all on function public.manual_assign_imported_shift_staff(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.manual_assign_shift_staff(text, text, text, text) from public, anon, authenticated;
revoke all on function public.reject_shift_registration(text, text) from public, anon, authenticated;
revoke all on function public.reject_shift_swap_request(text, text) from public, anon, authenticated;
revoke all on function public.remove_shift_staffing(text, text) from public, anon, authenticated;
revoke all on function public.respond_shift_swap_request(text, text, text) from public, anon, authenticated;
revoke all on function public.restore_shift(text) from public, anon, authenticated;
revoke all on function public.set_shift_registration_lock(text, boolean) from public, anon, authenticated;
revoke all on function public.soft_delete_shift(text, text) from public, anon, authenticated;
revoke all on function public.update_shift(text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.update_shift_staffing_labels(text, text[], text[], text[]) from public, anon, authenticated;
