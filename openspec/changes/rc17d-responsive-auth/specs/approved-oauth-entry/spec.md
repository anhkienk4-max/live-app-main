## Purpose

Provide clear light auth screens and genuine provider login while preserving business approval, session security and role authorization.

## ADDED Requirements

### Requirement: Shared light auth layout
Login, Request Access and recovery SHALL use a white/navy/brand-blue responsive layout with a single column on mobile. Email/password, password visibility, recovery, request-access and approval/error states MUST remain available.

#### Scenario: Request access
- **WHEN** a new Production user requests access
- **THEN** the existing Admin approval workflow is used without public self-registration.

### Requirement: Real provider-aware Google login
Google login SHALL call the provider OAuth API only when Google is available. Disabled/unconfigured provider MUST NOT appear as a working login. Callback MUST exchange the code, verify the active canonical business identity, reject unsafe redirects and never grant business roles from Google profile metadata. Provider errors and unapproved users MUST receive clear feedback. Provider/credential/redirect configuration checks MUST be read-only.

#### Scenario: Unapproved Google user
- **WHEN** Google authentication returns an identity without an approved active business mapping
- **THEN** application access is denied without creating or elevating a business user.

#### Scenario: Malicious redirect
- **WHEN** callback next or forwarded-host data points outside the application
- **THEN** the response redirects only to an allowed local path on the request origin.
