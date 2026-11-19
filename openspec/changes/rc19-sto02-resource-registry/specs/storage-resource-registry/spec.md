## ADDED Requirements

### Requirement: Metadata-only provider resource registry
The system SHALL store canonical references and metadata for Google Drive and OneDrive resources without storing binary content or creating provider resources during registry CRUD.

#### Scenario: Add a provider link
- **WHEN** an Admin adds a supported provider resource URL
- **THEN** the system stores a validated canonical resource ID and normalized URL, labels it unverified, and does not create a folder or file

### Requirement: Registry visibility enforcement
The system SHALL enforce Admin, owner, or explicit user-grant visibility independently of resource scope links and provider ACLs.

#### Scenario: User views a scoped resource without a grant
- **WHEN** a non-Admin is linked to the resource's Brand or Campaign but has no registry visibility grant
- **THEN** the resource is not returned

### Requirement: Private attendance resource boundary
Attendance evidence SHALL remain owner-only and SHALL NOT be linked to a Brand or public Client Group.

#### Scenario: Admin links attendance evidence to a Brand
- **WHEN** an Admin attempts to attach an attendance evidence resource to a Brand
- **THEN** the database rejects the scope link

### Requirement: Registry does not control placement
The registry SHALL NOT change the selected root or route used by operational upload placement.

#### Scenario: Add a root resource
- **WHEN** an Admin registers or links a root folder
- **THEN** operational uploads continue to use only the approved `operational_storage_routes` resolver
