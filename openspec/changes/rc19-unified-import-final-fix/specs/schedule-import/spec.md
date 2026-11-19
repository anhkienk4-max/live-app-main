## ADDED Requirements

### Requirement: Agency and execution source remain consistent
The system MUST map ADA to Internal and SNAP or Live AI to External. It MUST preserve an explicitly supplied mismatch as a blocking validation error and MUST reject unknown explicit source values.

#### Scenario: Valid mapped agency
- **WHEN** an import row has ADA, SNAP, or Live AI and no explicit conflicting source
- **THEN** its source is Internal for ADA and External for SNAP or Live AI

#### Scenario: Explicit conflict
- **WHEN** an import row explicitly supplies an execution source that conflicts with its Agency
- **THEN** the row cannot be confirmed until the conflict is corrected

### Requirement: Source columns have an explicit retention destination
An Admin MUST be able to retain a custom source column as source-only data, map it to a supported operational Shift field, or persist it as a typed supplemental Shift field. Invalid mapped values MUST block the affected row.

#### Scenario: Supplemental persistence
- **WHEN** an Admin maps a valid source column to a supplemental type and confirms the row
- **THEN** the typed field remains available on the Shift after reload and authorized export

#### Scenario: Source-only retention
- **WHEN** a column is source-only
- **THEN** its original value remains in the import source record and MUST NOT alter the Shift

### Requirement: Existing data and access boundaries are preserved
The migration MUST NOT silently rewrite legacy Agency/source data. Supplemental detail updates MUST use the existing authenticated `shifts.edit` authorization and version contract; supplemental exports MUST use the existing `shifts.export` permission and requested Shift scope.
