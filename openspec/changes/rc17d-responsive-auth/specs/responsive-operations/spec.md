## Purpose

Make existing operational workflows readable and operable on phones, tablets and desktop without changing authority or data semantics.

## ADDED Requirements

### Requirement: Responsive workflows across roles
The app SHALL preserve visible content and reachable actions at widths 320, 360, 375, 390, 430, 768, 1024, 1280 and 1440 for Admin, Leader and Member. Important touch actions MUST target at least 44px. Wide tables MUST scroll within a labeled keyboard-accessible region. Dialogs MUST fit the viewport with focus containment and Escape dismissal.

#### Scenario: Narrow phone
- **WHEN** an authorized user opens any operational or auth route at 320px
- **THEN** the page has no unintended horizontal overflow, clipped controls or inaccessible actions.

### Requirement: Mobile calendar agenda
Mobile month view SHALL show a compact date selector and readable full agenda cards with brand, platform, date/time, Host, Support, staffing status and details/action access. Desktop SHALL retain its seven-column detailed month. Filters MUST open in a mobile drawer with count and reset. URL view/date, dense days, overnight shifts, Vietnamese names, assignment, registration, PASS and export MUST preserve their existing authority.

#### Scenario: Overnight and dense day
- **WHEN** a user selects a day with many shifts including an overnight continuation
- **THEN** all matching agenda items remain available with correct timing and authorized actions.

### Requirement: Grouped authorized navigation
Desktop and mobile SHALL use the same catalogue grouped as Overview, Livestream Operations, Data and Reports, People and Finance, and System Administration. Sidebar MUST remember collapsed groups and expand the active group. Mobile MUST prioritize Overview, Calendar, Shifts and Live only when available to that role, followed by More. More MUST open a grouped drawer with focus trap, Back, Escape and navigation dismissal. RBAC and capability filters MUST remain authoritative.

#### Scenario: Member opens More
- **WHEN** a Member opens the navigation drawer
- **THEN** only that Member's authorized/capability-enabled destinations are rendered in their groups.
