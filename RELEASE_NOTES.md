## Version 4.1.2 -> 4.1.3

###### 

##### New Features

##### 

##### • Added a fully configurable **Shift Management** system (Owner Panel → 🕐 Shift Management). Create any number of shifts with a name, start/end time, timezone, and an Assigned Employees list — no more fixed "Shift 1/2/3" cycles. Shifts support overnight schedules (e.g. 10 PM–7 AM), can overlap in time, and take effect live for every admin and employee the instant they're saved.

##### 

##### • An employee's shift is now resolved automatically wherever it's needed — login, lateness/late-clock-in alerts, dashboard countdowns, overtime, reports, and feedback — so assigning or changing someone's shift updates all of that immediately, with no separate re-sync step.

##### 

##### • Creating or deleting a shift (and creating or deleting an employee account) is now restricted to the Owner role and above; everyday shift editing and enabling/disabling is still available to anyone with shift-assignment permission, same as before.

##### 

##### Improvements

##### 

##### • Each employee's card in the Admin Panel now shows their live-resolved shift (name, times, timezone, and a "Disabled" badge if applicable) instead of a manual per-employee shift picker — assignment now happens from the shift itself.

##### 

##### • Late clock-in detection, the dashboard shift countdown, and overtime calculations now use each shift's real configured duration (including overnight shifts) instead of a hardcoded 9-hour assumption.

##### 

##### Removed

##### 

##### • Retired the old fixed 3-shift-per-day system (Shift 1/2/3, US/SY schedule timezone toggle) now that every part of the app runs on the new Shift Management system.

##### 
