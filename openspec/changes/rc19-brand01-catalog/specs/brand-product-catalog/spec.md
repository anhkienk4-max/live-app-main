## ADDED Requirements

### Requirement: Canonical Product and SKU catalog

The system SHALL use existing Brand, Campaign, and Platform records as the authoritative dimensions and SHALL NOT migrate descriptive text into fabricated entity records.

#### Scenario: Product is linked to multiple Brands

- **WHEN** an Admin creates or edits a Product with one or more active Brands
- **THEN** the catalog stores explicit Brand relationships and each read uses the viewer's Admin role or active Brand grant

#### Scenario: Campaign SKU association crosses Brand scope

- **WHEN** an Admin attaches a SKU whose Product is not linked to the Campaign's canonical Brand
- **THEN** PostgreSQL rejects the association and leaves no partial link

### Requirement: Account-scoped catalog authorization

The system SHALL require an active Admin-managed Brand read grant for Leader and Member catalog data and SHALL enforce the same boundary in PostgreSQL RLS.

#### Scenario: User lacks a Brand grant

- **WHEN** a Leader or Member requests a Product or Campaign resource for an unassigned Brand
- **THEN** the API and database return no catalog data and do not reveal another Brand's records

#### Scenario: Non-Admin sends a forged write

- **WHEN** a Member sends a direct REST write or forged actor metadata
- **THEN** the API and database reject the request

### Requirement: Sourced and independently reviewed marketing knowledge

The system SHALL store immutable knowledge versions and SHALL reveal content to non-Admins only after an independent Admin review and within the effective date.

#### Scenario: Author reviews own knowledge

- **WHEN** the creator attempts to approve their own knowledge version
- **THEN** the database rejects the decision and preserves the review state

#### Scenario: Approved content has no source

- **WHEN** an approval has no source provenance or effective start date
- **THEN** PostgreSQL rejects it

### Requirement: Typed STO-02 resource relationships

The system SHALL link Brand, Campaign, Product, and SKU records to existing STO-02 metadata without granting registry or provider access.

#### Scenario: Link attendance evidence

- **WHEN** an Admin attaches an attendance evidence resource to a Brand, Campaign, Product, or SKU
- **THEN** PostgreSQL rejects the link

#### Scenario: Resource is not visible through STO-02 policy

- **WHEN** catalog scope is granted but the viewer has no STO-02 registry/provider access
- **THEN** the resource metadata and link are not returned
