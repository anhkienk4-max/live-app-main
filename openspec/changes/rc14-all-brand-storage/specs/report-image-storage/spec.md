## ADDED Requirements
### Requirement: Exact all-brand operational placement
Compat configuration SHALL resolve the audited Production Brand/source/platform combinations through verified legacy bases, canonical new Internal routes, or temporary Agency brand/period/category routes. Unknown or ambiguous routes SHALL fail closed. Configured historical labels SHALL be used exactly, including significant whitespace, and SHALL reject traversal, separators and control characters.

#### Scenario: Temporary Agency brand route
- **WHEN** an Agency route uses TEMP_AGENCY_BRAND_PERIOD_CATEGORY
- **THEN** placement SHALL be brand/period/category under agency snap without a platform segment.

#### Scenario: Historical naming exception
- **WHEN** an exact month/category period or category label override exists
- **THEN** that exact label SHALL take precedence over the normal route style/labels.

### Requirement: Live image names and content idempotency
Live image metadata SHALL preserve the sanitized original in file_name and persist the deterministic date/category/full-digest storage filename separately. Same report/category/content retries SHALL return the existing image. Concurrent retries SHALL not produce duplicate metadata and SHALL delete any redundant newly uploaded provider object. Legacy rows and clients SHALL remain valid with null storage fields.

#### Scenario: Concurrent retry
- **WHEN** two requests upload the same report/category/content
- **THEN** one metadata row SHALL remain and the losing request SHALL clean its own redundant provider object and return the winner.

#### Scenario: Original name collisions
- **WHEN** equal original filenames have different content or categories
- **THEN** distinct deterministic provider names and metadata rows SHALL be allowed.
