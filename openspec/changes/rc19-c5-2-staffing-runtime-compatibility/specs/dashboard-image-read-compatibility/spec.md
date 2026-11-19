# Dashboard image read compatibility

## Requirements

### Requirement: Private dashboard images are read through authenticated application authority

The application SHALL resolve persisted dashboard image references through the authenticated screenshot endpoint, which SHALL verify the user's visible shift-scoped record before reading bytes. Bucket privatization SHALL occur only after a compatible application release is deployed and verified. A rollback after privatization SHALL target an application that retains this authenticated read path.

#### Scenario: Existing storage-path reference after private-bucket activation

- GIVEN an authorized user and a dashboard update with a persisted `screenshot_storage_path`
- WHEN the client loads the dashboard image
- THEN the image is returned through the authenticated endpoint with private no-store headers

#### Scenario: User cannot read another Brand's image

- GIVEN a user who cannot read the referenced shift
- WHEN the user requests the image by its storage path or file ID
- THEN the endpoint denies access without exposing image bytes
