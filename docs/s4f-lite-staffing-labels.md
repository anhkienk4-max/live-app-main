# S4F-Lite staffing display labels

Schedule imports preserve Host, Assistant/Trợ live, and Technical names as display-only text arrays on the shift. These labels are independent from `business_users`, direct assignment projections, and `shift_registrations`.

The intended future workflow is:

```text
imported/display name
        ↓
optional name matching
        ↓
user manually confirms person
        ↓
staff_id / assignment relationship
```

Matching and assignment are deliberately outside S4F-Lite. The imported labels remain audit/fallback text even after a personnel assignment exists.
