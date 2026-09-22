# ESM v5.2.4 — Admin Permissions, Workspace & Dashboard Fixes 🚀

This release brings the Admin Panel permission model in line with the current ESM codebase and finishes the recent dashboard/report-formatter fixes.

## 🆕 v5.2.4 — Roles, Permissions & Dashboard Reliability

### 🛡️ Admin Panel & Permission System
- Added a legacy-account migration bridge for **A009**, resolving it as an **Owner** account when an older Firestore record is still missing the new permission level.
- Kept the newer permission system as the source of truth while preserving elevated legacy Admin/Supervisor/Owner access.
- Added a single effective-permission-level resolver so legacy roles and explicit permission levels are handled consistently.
- Fixed the Owner-tier check to use the **effective** permission level instead of only the raw Firestore `permissionLevel` field.
- Admin employee cards now display the employee's **effective permission level**, so legacy accounts no longer appear as "Employee" when their effective access is elevated.
- The Edit Employee / Permissions editor now opens with the employee's effective permission level, keeping the editor aligned with the permissions actually in effect.
- Existing permission gates for employee management, statistics, audit access, load management, and Owner-only account creation/deletion remain intact.

### 📱 Mobile Safety Operations
- Added a mobile-first Safety operations layer for smaller screens without replacing the existing desktop dashboard.
- Added a driver search box so Safety staff can quickly find a driver instead of scrolling through the full board.
- Search results narrow the department sections and driver cards in real time.
- Mobile driver cards keep the operational details together: HOS countdowns, PTI state, current load, BOL, trailer, and truck.
- Optimized the HOS timer cards and HOS confirmation modal for touch-sized controls and narrow phone screens.
- Added quick mobile shortcuts from Safety to **Announcements** and **Team Chat**, returning to the Dispatch view and scrolling directly to the requested workspace area.

### ⏱️ Driver HOS Layer
- Added the first implementation of the original Driver HOS concept directly on the Safety Dashboard.
- Added Shift, Driving (DR), and Break countdowns with live one-second updates.
- Added explicit HOS confirmation timestamps so timers do not silently start at the daily reset.
- Each driver keeps an independent confirmation timestamp and countdown state.
- Added OFF / ON / DR / SB duty status display and low-time / expired visual states.
- Added a dedicated HOS editor for authorized Safety/Admin users.
- Added live Firestore synchronization for Safety/HOS data.

### 🩺 Developer Diagnostics
- Integrated **ESM Diagnostics** into the existing Developer Panel instead of creating a separate diagnostics screen.
- Added read-only health checks for the renderer, core UI, Firebase/Firestore, Firebase Auth, permissions, settings, Safety/HOS modules, workspace/load booking, and Electron bridge.
- Added an installed-version check through the Electron runtime when available.
- Added a safe Firestore connectivity/read test against `appConfig/main`.
- Diagnostics report pass, warning, and failure counts with a timestamped run result.
- Diagnostics do not modify operational data or write test records.

### 🧭 Dashboard Startup & Navigation Reliability
- Fixed persistence of the **Dispatch + Safety Dashboard** composition across application restarts.
- Restored the Dispatch / Safety dashboard tabs when the combined dashboard setting is enabled.
- Preserved the user's last selected Dispatch/Safety view in local storage while still forcing Dispatch when the dashboard is configured as Dispatch-only.
- Added a shared dashboard composition API so Settings and dashboard startup use the same source of truth.

### 📋 Report Formatter & Dashboard Layout
- Restored the End-of-Shift Report Formatter after the workspace boot syntax failure.
- Fixed the formatter's placement so it stays beside the main status card instead of stacking above the dashboard.
- Prevented the desktop dashboard from incorrectly switching to its mobile/stacked layout at normal desktop widths.
- Kept the formatter available across the supported dashboard styles without forcing an unwanted vertical page layout.

### 📦 Workspace / Load Booking
- Fixed the workspace JavaScript parse failure caused by an `await` inside the load-modal validation function.
- Restored workspace initialization as a result, including the **+ Add Load** modal and booked-load controls.

---

# 📚 ESM Change History — v5.1.7 → v5.2.4

## v5.1.7 — Dispatch + Safety Dashboard
- Integrated the Dispatch and Safety dashboard views into one dashboard.
- Added Dispatch Dashboard / Safety Dashboard switching.
- Preserved the separate Classic / Tabbed / Sidebar layout system.
- Fixed Admin Panel employee editing and live admin updates.
- Improved the What's New modal closing behavior.

## v5.1.8
- Maintenance release following the v5.1.7 dashboard integration.

## v5.1.9 — Report Import & Formatter Improvements
- Improved Relay/report importing.
- Improved booked-by attribution.
- Improved report formatting and live report preview behavior.
- Prevented duplicate **Other** sections in report previews.

## v5.1.10
- Maintenance release following the report import/formatter work.

## v5.2.0
- Continued release/version alignment after the report-import and formatter improvements.

## v5.2.1
- Maintenance release following the report formatter and dashboard workflow updates.

## v5.2.2 — Shared Report Formatter Integration
- Moved the shared Report Formatter outside the Dispatch-only container.
- Synced formatter visibility with the dashboard tabs.
- Fixed formatter visibility and placement across dashboard views.

## v5.2.3 — Dashboard Formatter Layout
- Continued the shared formatter/dashboard integration.
- Adjusted the dashboard structure and styling for the formatter alongside the main dashboard panels.

## v5.2.4 — Current Release
- Fixed the workspace boot failure that prevented the Report Formatter and Add Load modal from initializing.
- Fixed desktop formatter stacking and restored the intended left-side placement beside the status card.
- Fixed the desktop dashboard breakpoint so normal desktop widths no longer switch into the narrow stacked layout prematurely.
- Fixed persistence of the **Dispatch + Safety Dashboard** setting and restored the Dispatch/Safety tab controller during startup.
- Preserved the last selected Dispatch/Safety view in combined mode while keeping Dispatch-only mode locked to Dispatch.
- Fixed legacy/effective permission resolution for Admin Panel access.
- Restored A009's intended Owner-level access through the new permission model.
- Aligned Admin employee cards and the Permissions editor with effective permission levels.
- Restored Admin Panel action buttons/employee-card controls by allowing the existing inline handlers to run under the Electron renderer CSP.
- Added the original Driver HOS concept as an additive Safety Dashboard layer: independent confirmation-based timers, duty status, live countdowns, attention/expired states, and Firestore synchronization.
- Added touch-friendly mobile Safety operations with driver lookup, HOS/PTI/load/BOL/trailer/truck visibility, and quick Announcements/Team Chat shortcuts.
- Added the first integrated **ESM Diagnostics** system inside the Developer Panel with read-only runtime, Firebase, permissions, settings, Safety/HOS, workspace, and Electron health checks.
- Expanded the Developer Panel diagnostics to verify Firestore reachability and the currently installed app version when the Electron bridge is available.
- Fixed a Safety Dashboard render syntax error that could leave the Safety view permanently stuck on **“Loading Safety Dashboard…”**.
- Fixed the Driver HOS editor so it opens as a viewport-centered modal instead of appearing at the bottom of the Safety page and requiring a scroll.
- Made the HOS editor independent of **PTI Checked** state, so HOS can be opened and confirmed whether PTI is checked or unchecked.
- Added visual HOS field-state tinting in the confirmation editor: **Shift** uses a blue border, **Driving** uses a green border, and **Break** uses a yellow/orange border after confirmation.
- Added an explicit unconfirmed HOS field state with black borders so all three HOS inputs clearly show when the driver's HOS has not yet been confirmed.
- Kept the centered HOS modal usable on narrow screens with the existing mobile modal/layout rules.
- Preserved the existing HOS countdown and Firestore behavior while adding these UI/confirmation-state improvements.

---

## ❤️ Built With the STS Team

ESM continues to be shaped by real STS workflows, operational feedback, and fixes discovered in daily use.

**ESM v5.2.4**
Built for the team. Improved by the team.
