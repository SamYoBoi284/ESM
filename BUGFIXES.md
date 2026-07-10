# Bugfixes — v4.1.3 (session addendum)

Two fixes made to `workspace.js` after the Shift Management feature
went code-complete. Both are unrelated to Shift Management itself.

---

## 1. EoS Report: Trip stops showed above the load line instead of in the From/To field

**Symptom:** Ever since Trip-type VRIDs got Additional Stops, turning
on a load's "Show these stops in the End-of-Shift Report" toggle made
the stops print as their own `🛑 Stops (VRID ...)` line, floating
*above* that VRID group's header/load-id line — not attached to the
load's own line at all.

**Root cause:** `formatLoadsForTemplate()` built a separate `stopLines`
block per VRID group and prepended it above `header` + `lines`, instead
of feeding the stops into the load's own line where `From → To`
normally goes.

**Fix:** `formatLine()` now fills the exact same field/position a
Load or Block/Contract's `From → To` occupies with the stop list
(`🛑 Stop1 → Stop2 → Stop3`) whenever the toggle is on — right on the
load's own line, next to its VRID. The old separate block above the
VRID header is gone.

**Before:**
```
🛑 Stops (VRID T-12345): Chicago → Memphis → Atlanta
  Trip (1)
• 2026-07-12 | $278.51 ($3.99/mi) | VRID: T-12345
```

**After:**
```
  Trip (1)
• 2026-07-12 | $278.51 ($3.99/mi) | 🛑 Chicago → Memphis → Atlanta | VRID: T-12345
```

Regular Load / Block-Contract lines are unaffected — the stop field
only ever activates for a Trip load with the toggle on; everything
else still shows `From → To` exactly as before.

**File touched:** `workspace.js` (`formatLoadsForTemplate()`).

---

## 2. Add Load modal: date didn't default to today

**Symptom:** Every new load required manually opening the calendar
picker and selecting the date, even though the overwhelming majority
of loads are booked same-day.

**Fix:** `openLoadModal()` now pre-fills a brand-new load's date field
with today's date automatically — same
`new Date().toISOString().split("T")[0]` pattern already used by the
Report Generator's date picker elsewhere in the app, so it's consistent
with an existing idiom rather than a new one. The field stays a normal,
fully editable `<input type="date">`, so booking a load a few days out
still just means changing the date like before — this only removes the
extra click for the common same-day case.

Editing an **existing** load is untouched: it still shows that load's
saved date, never silently overwritten with today's date.

**File touched:** `workspace.js` (`openLoadModal()`).

---

## 3. Single-instance lock: reopening from the launch shortcut while minimized to tray opened an unresponsive window

**Symptom:** With "Minimize To Tray" on, minimizing ESM and then
launching it again from the desktop/taskbar shortcut opened *a*
window, but it was completely unresponsive — no clicks registered.
Closing that window and then reopening ESM from the system tray
(the hidden-icons flyout, not the shortcut) worked fine and was
interactive as normal.

**Root cause:** classic Electron single-instance race condition.
`electron/main.js`'s single-instance-lock check called `app.quit()`
in the losing (second) process when the lock wasn't obtained:

```js
if (!gotSingleInstanceLock) {
    app.quit();
} else { ... }
```

`app.quit()` is graceful/async — it doesn't stop the rest of the file
from executing synchronously. Further down, `app.whenReady().then(() =>
createWindow())` is registered unconditionally (outside that if/else),
so in the losing process, `whenReady()` could still resolve and
`createWindow()` could still run *before* the queued quit actually took
effect. That created a real, visible `BrowserWindow` in a process that
was already shutting down — it painted on screen (the "it opens" part)
but could never become interactive (the "can't press anything" part),
since its host process was mid-teardown. Meanwhile, the *correct*
window — in the surviving, still-alive process — had already been
silently restored/shown/focused by the existing `second-instance`
handler, sitting underneath the phantom one. Closing the phantom and
reopening via the tray icon (which only ever talks to the surviving
process) reached the real, working window.

**Fix:** changed the losing process's exit call from `app.quit()` to
`app.exit(0)`, which terminates immediately and synchronously — it
never gives `whenReady()` a chance to fire in that process, so the
phantom window can no longer be created.

**File touched:** `electron/main.js` (single-instance-lock block near
the top of the file). One-line functional change plus an explanatory
comment.

**Note:** there's also an unused, stale duplicate `main.js` at the
project root (older icon path, doesn't match `electron/main.js`, and
isn't referenced anywhere — `package.json`'s `"main"` field points at
`electron/main.js`, the file actually fixed here). Left untouched since
it's dead code outside this bug's scope — flagging it here in case a
future cleanup pass wants to delete it.

---

## Verification

- `node --check workspace.js` and `node --check electron/main.js` — both clean.
- Diffed both edited files against the previous package to confirm only
  the lines described above changed — no incidental edits elsewhere.
