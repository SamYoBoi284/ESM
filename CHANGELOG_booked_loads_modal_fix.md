# Booked Loads Modal Close Fix

## Summary
- Fixed the shared modal backdrop close logic so modal close now follows the appropriate modal-specific close flow.
- Applied the same close-state reset to the Booked Loads add/edit modal so it no longer stays in a half-closed state after backdrop dismissal.
- Preserved the existing Escape key and close button behavior.
