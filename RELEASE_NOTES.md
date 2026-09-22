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
- Fixed legacy/effective permission resolution for Admin Panel access.
- Restored A009's intended Owner-level access through the new permission model.
- Aligned Admin employee cards and the Permissions editor with effective permission levels.

---

## ❤️ Built With the STS Team

ESM continues to be shaped by real STS workflows, operational feedback, and fixes discovered in daily use.

**ESM v5.2.4**
Built for the team. Improved by the team.
