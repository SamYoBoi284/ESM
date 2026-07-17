# ESM v5.0.2 — Major Overhaul Update 🚀

## ✨ ESM Dashboard Overhaul

This update introduces a complete dashboard experience overhaul, improving navigation, personalization, and visibility across the application.

### 🖥️ Redesigned Dashboard Layouts
- Added multiple dashboard layouts to give employees more flexibility in how they use ESM.
- Improved workspace organization with cleaner separation between:
  - Status controls
  - Workspace tools
  - Employee information
  - Quick actions
  - Communication features
- Layout preferences are now respected to provide a more personalized experience.

### 💬 Improved Chat Experience
- Chat has been redesigned to better fit different dashboard layouts.
- When using the sidebar layout, chats now open as a dedicated popup window instead of replacing the main workspace.
- This allows employees to keep their dashboard visible while communicating.

---

# 🆕 New Employee Experience Features

## 🕘 Activity Timeline (New)
A completely new personal activity history system.

Employees can now:
- View their recent activity timeline.
- See important actions and status changes in a cleaner visual format.
- Track their daily activity history with improved readability.

Improvements:
- Added activity icons for easier recognition.
- Added consistent status indicators matching ESM's existing status colors.
- Added automatic fallback icons for future activity types.

---

## 🔔 Notification Center (New)
Introduced a centralized notification history system.

Features:
- View previous notifications even after they disappear.
- Notification history is saved separately from temporary popups.
- Added unread notification tracking.
- Added notification badge counter.
- Added filtering by category:
  - System
  - Status
  - Chat
  - Announcements
  - Reports
  - Loads

Actions:
- Mark notifications as read.
- Mark all as read.
- Clear read notifications.
- Clear notification history.

---

## 👤 Employee Profiles (New)
Employees can now view detailed profiles directly from employee lists.

Added profile access from:
- Live Employee Board
- Admin employee list

Profile information includes:
- Name
- Employee code
- Role
- Permission level
- Assigned shift
- Current status
- Status duration
- Today's activity timeline

Design:
- Uses the same visual language as existing ESM modals.
- Reuses existing activity and status systems instead of creating duplicates.

---

# 🛠️ Desktop & Stability Improvements

## 🖥️ Electron Focus Bug Fix (Major)
Fixed a major issue where buttons, modals, text fields and textareas could become unusable after interacting with native OS dialogs.

Previously:
- Closing alerts, confirmations, and native dialogs could cause ESM inputs to stop accepting keyboard input.
- Textareas appeared focused but would not receive typing.
- The issue could happen anywhere, including:
  - Login screen
  - Logout flow
  - Admin actions
  - Confirmation dialogs
  - Load additions
  - Load edits through Load History
  - etc.

Fixed:
- Added a centralized Electron window focus recovery system.
- ESM now correctly restores renderer keyboard focus after dialogs close.
- No more need to:
  - Alt+Tab away and back
  - Click the window title bar
  - Refocus manually before typing again

This fix improves reliability across the entire application.

---

# 🔧 Technical Improvements

- Continued additive architecture approach:
  - Existing systems reused instead of duplicated.
  - No unnecessary rewrites.
  - Existing permission and status systems preserved.
- Improved module separation for new features.
- Maintained compatibility with existing employee workflows.

---

# 📦 Updated Files & Systems

Major additions:
- Activity Timeline system
- Notification Center system
- Employee Profile system
- Dashboard layout improvements

Electron:
- Improved window focus handling.
- Improved application stability after native dialogs.

---

# 🎯 What's Next

Future improvements will continue expanding ESM's productivity tools, employee experience, and workflow automation.

---

**ESM v5.0.2**
A major step toward making ESM a complete employee operations platform.