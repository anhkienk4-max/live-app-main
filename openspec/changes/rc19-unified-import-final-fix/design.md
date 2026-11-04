## Data flow

Parse source rows into the existing import batch representation. Admin-selected column mappings transform validated values into either existing operational fields or typed `supplemental_fields` on Shift candidates. Source-only columns remain in the batch source record. The current confirmation service persists eligible Shift fields through the existing create/update RPCs.

## Security and data integrity

The migration adds a checked JSONB column and replaces the Agency/source constraint with the documented mapping. It refuses to auto-correct incompatible existing rows. RPCs retain existing actor, version, and authorization contracts. Detail updates use `shifts.edit`; exports expose supplemental values only to callers already authorized for `shifts.export` and within their requested Shift scope.

## Compatibility

The migration is forward-only and additive. Older import batches keep their raw values; supplemental fields default to an empty object. Mock mode omits database-only fields. No existing source-only value is promoted into operational Shift data without an explicit mapping.
