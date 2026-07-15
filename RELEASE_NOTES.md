# What's New — ESM v4.5.0

## ✨ New Features

### 📄 PDF Export Support
Added PDF export functionality for:
- Admin Statistics
- Shift History
- Monthly Statistics Archive
- Audit Logs

Existing CSV, TXT, and JSON export options remain available.

---

### 🚚 Amazon Relay Trip Import
Relay Import Copy now supports multi-stop Amazon Relay trips.

New capabilities:
- Automatic Trip ID detection
- Automatic Sub Load ID detection
- Automatic stop parsing
- Automatic stop generation
- Automatically enables "Show these stops in report"

---

### 📝 Report Formatter Templates
- Added selectable report templates.
- Template 1 remains the default format.
- Added support for user-importable templates.
- Supports placeholders such as:
  - {{date}}
  - {{user}}
  - {{shiftStart}}
  - {{shiftEnd}}
  - {{loadCount}}
  - {{loads}}
  - {{notes}}
- Custom templates now sync across devices using Firestore.

---

### ⌨️ ESC Navigation
Added Escape key navigation for supported employee screens.
- Returns to the previous screen where applicable.
- Does not interfere with typing inside inputs or editors.

---

### 🗄️ Developer Data Recovery
Added a developer-only backup system featuring:
- Manual exports
- Automated pre-archive backups
- GitHub backup support
- Recovery exports with version and timestamp metadata

---

### 🧪 GitHub Export Test
Added a dedicated testing utility to verify GitHub export configuration before relying on scheduled backups.

---

## 🛠️ Improvements

- Audit logs now stay expanded until manually closed.
- Added PDF export for Audit Logs.
- Improved audit log viewing experience during live refreshes.
- Updated User Guide and Admin Guide to reflect the latest features.
- Improved report customization and workflow flexibility.
- Improved export consistency across reporting modules.

---

## 🧹 Cleanup

Removed deprecated Admin Action Center remnants:
- Freeze Accounts
- Unfreeze Accounts
- Force End Shift
- Broadcast Message
- Reset All Users
- Related permissions
- Legacy backend logic
- Unused listeners and dead code

Reduced technical debt and simplified the admin system.

---

## 🐞 Fixes

- Fixed audit logs collapsing during automatic refreshes.
- Fixed Monthly Statistics Archive missing PDF export support.
- Fixed Report Formatter documentation to match current functionality.
- Fixed outdated guide information after template system overhaul.
- Fixed multiple legacy references to removed Admin Action Center features.
- Fixed various UI consistency issues across export panels.
- Fixed several minor backend cleanup issues and improved overall stability.