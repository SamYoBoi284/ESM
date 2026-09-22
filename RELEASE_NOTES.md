# ESM v5.1.7 — Dispatch + Safety Dashboard Update 🚀

This release continues the operational work that started after v5.0.9 and folds the recent STS workflow changes into a cleaner dashboard experience.

## 🆕 v5.1.7 — Dispatch + Safety Dashboard

### 🚚 One Dashboard, Two Real-Time Views
- Reworked the Safety Dashboard so it is no longer a separate dashboard mode.
- Added horizontal **Dispatch Dashboard** / **Safety Dashboard** tabs above the main dashboard.
- Tabs switch instantly without leaving the dashboard.
- The last selected dashboard view is remembered locally.
- Safety Dashboard can be disabled completely from Settings.
- Replaced the old Classic Dashboard Type choices with:
  - **Dispatch Dashboard**
  - **Dispatch + Safety Dashboard**
- Kept the existing Classic / Tabbed / Sidebar layout system separate from the Dispatch/Safety content choice.

### 🛡️ Admin Panel Fixes
- Restored the **Edit Employee** action so it actually performs an employee edit.
- Employee editing now updates the employee name and permission level.
- Preserved the existing PIN-reset action and permission checks.
- Reduced Admin Panel lag by avoiding a full employee-card rebuild for ordinary live status/timer updates.
- Admin status and timers now update locally in real time while Firestore structural changes trigger a proper re-render.
- PIN/name reveal state remains immediate and survives necessary list rebuilds.

### 📋 What's New Fix
- Made the updater's **What's New** modal close reliably from its Close/Okay button.
- Added a direct backdrop-close path.
- Added reliable Escape-key closing.
- Closing no longer depends on clicking the app first to restore focus.

---

# 📚 ESM Change History Since v5.0.9

## v5.0.9 → J.B. Hunt
- Added the J.B. Hunt department/driver support.
- Updated the Add Load workflow to recognize the new department.

## Driver Expansion → v5.1.0
- Expanded and corrected the driver lists used by ESM.
- Continued aligning Add Load department/driver selection with the operational driver roster.

## v5.1.1
- Maintenance release / version update following the driver expansion work.

## v5.1.2
- Maintenance release / version update preparing the next department and roster changes.

## v5.1.3 — MSL
- Added the MSL department.
- Added MSL drivers and connected the department to the Add Load workflow.
- Continued driver roster corrections.

## v5.1.4 — Department & Driver Cleanup
- Expanded the driver roster for the newer departments.
- Added the **Other** department and its driver pool.
- Added the newer departments to the Add Load selector.
- Fixed the visual/department handling around the expanded driver lists.

## v5.1.5 — J.B. Hunt Fix
- Corrected the J.B. Hunt department handling after the department expansion.

## v5.1.6 — Other Drivers, Permissions & Safety Foundation
### 👤 Other Driver Management
- Added a Firestore-backed **Other Drivers** editor.
- Existing Other drivers are seeded from the original driver list the first time the editor is used.
- Add Load now reads the editable Other driver list live.
- Added permission-gated add/rename/remove/save controls.

### 🦺 Safety Dashboard Foundation
- Added the first Safety Dashboard implementation.
- Added per-department driver cards.
- Added PTI status.
- Added Current Load, BOL, Trailer, and Truck fields.
- Added Firestore-backed daily Safety Dashboard data.
- Allowed Safety-role users to update Safety Dashboard data.

### 🛡️ Permission/Admin Fixes
- Preserved elevated legacy Admin/Supervisor/Owner roles when older records still carried the default Employee permission level.
- Fixed Admin PIN/name reveal controls so they toggle the displayed value directly.

### 🎨 Dashboard Integration Foundation
- Added the dashboard layout integration needed for the Safety Dashboard.
- Added the supporting Safety Dashboard styling and Settings hooks.

---

## 👷 STS Operational Changes Across v5.0.9–v5.1.6
- Driver rosters were repeatedly updated to reflect the live STS operation.
- J.B. Hunt, MSL, and Other were added/adjusted as operational departments.
- Add Load department/driver selection was updated alongside those roster changes.
- Admin permissions and employee management were tightened while keeping legacy elevated accounts functional.
- The first Safety Dashboard and editable Other-driver system were introduced as the foundation for the v5.1.7 integrated dashboard.

---

## ❤️ Built With the STS Team

ESM has grown through repeated real-world fixes, driver roster changes, workflow adjustments, and feedback from the people actually using it.

**ESM v5.1.7**
Built for the team. Improved by the team.
