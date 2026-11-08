# Storage image read compatibility

## ADDED Requirements

### Requirement: preserve legacy image reads during expand
The initial forward migration sequence MUST retain the existing `live-dashboard-images` bucket visibility and public-read policy so the currently deployed pre-proxy application can continue to render legacy image URLs. It MUST NOT rewrite historical screenshot URLs to an endpoint absent from that application.

#### Scenario: old application rollback before private activation
- GIVEN the expand migration sequence has been applied
- AND the currently deployed application has no `/api/dashboard-screenshots` route
- WHEN a user rolls the application back to that deployment
- THEN existing public dashboard image URLs remain readable
- AND persisted screenshot URL references remain unchanged

### Requirement: gate private image contract on a compatible rollback target
The private visibility migration MUST fail closed unless an operator explicitly attests that the authenticated proxy is deployed and the supported rollback target also contains that proxy. After activation, the application MUST resolve legacy storage-path images through the authenticated, shift-scoped proxy.

#### Scenario: missing runtime attestation
- GIVEN the private contract migration is run without the required proxy and rollback-target attestations
- WHEN the migration guard executes
- THEN the transaction aborts before bucket visibility or policy changes

#### Scenario: supported post-contract rollback
- GIVEN the private contract is active
- WHEN the application rolls back to the approved proxy-capable bridge release
- THEN legacy storage-path images are served through authenticated shift-scoped reads
- AND rollback to a pre-proxy release is disallowed
