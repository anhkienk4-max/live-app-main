# Storage runtime integrity

## ADDED Requirements

### Requirement: Reconcile the static Drive registry without granting access

The system SHALL register the 93-folder baseline and 55 additional Owner-created folders with exact provider IDs and parent relationships. Additional folders SHALL remain inactive and carry `restricted_pending_app_acl_verification` until actual ACL review is complete.

#### Scenario: Seed additional folders

- **WHEN** the additive registry migration runs against the expected schema
- **THEN** each of the 55 new records is inserted idempotently with its approved ID and parent and remains inactive
- **AND** a conflicting existing mapping causes the migration to fail rather than changing the existing mapping

### Requirement: Enforce independent sensitivity, ACL and application authorization

The system SHALL treat content sensitivity, effective Drive ACL state, actor permissions, operation permissions and resource scope as separate checks. Sensitive categories SHALL require `restricted_verified` for every registered ancestor. Pending ACL states SHALL deny writes regardless of application role.

#### Scenario: Sensitive Excel source on a shared or pending route

- **WHEN** a user uploads an Excel source file to a route that is shared, restriction-pending, or ACL-verification-pending
- **THEN** the upload is denied even if the category would otherwise permit the operation

#### Scenario: Leader requests an unverified Brand scope

- **WHEN** a Leader requests a Brand or period scope without an authoritative authorization mapping
- **THEN** the request is denied

### Requirement: Preserve verified Excel source before confirmation

An Excel batch SHALL have a unique, owner-bound source receipt whose bytes and metadata are read back from Drive before confirmation or batch-linked shift writes. Confirmed batch identity and receipt references SHALL remain immutable.

#### Scenario: Confirm without physical provider readback

- **WHEN** an Excel batch has no provider-verified source receipt
- **THEN** direct confirmation and shift writes are rejected

#### Scenario: Retry the source upload

- **WHEN** the same batch and source checksum are retried before confirmation
- **THEN** the receipt remains idempotent and concurrent duplicate uploads cannot create a second receipt

### Requirement: Read private files through the authorized backend

Private file reads SHALL require an authenticated actor, authorized resource scope, exact provider parent and checksum verification. The API SHALL NOT redirect an unauthorized actor to a provider URL.

#### Scenario: Member requests a file by a forged ID or scope

- **WHEN** a Member requests a file they are not assigned to, or supplies a mismatched Brand/Shift scope
- **THEN** the API denies the read before accessing the provider
