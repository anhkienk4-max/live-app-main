- [x] Add a shared shift-change Realtime subscription and bounded polling fallback.
- [x] Wire dependent route data to refresh after shift status changes.
- [x] Add regression coverage for event invalidation, reconnect and polling fallback.
- [x] Default Shift List to 30 recent business-local dates and newest-first;
  add Upcoming and All presets.
- [x] Apply the fixed 10-minute Workforce punctuality grace consistently.
- [ ] Verify two-session authenticated Realtime/RLS behavior and mobile UX in
  isolated browser UAT.
- [ ] Implement attendance/correction schema and API only after policy and
  location configuration are represented and can be tested in isolation.
- [ ] Validate Staffing, Registration and Swap refresh after approved writes.
- [ ] Run focused tests, typecheck, lint/build as dependencies allow, and review
  the final diff. Keep Production and RC1.7C untouched.
