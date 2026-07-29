# Option A Firebase Auth Context

## Original request thread

The requested change was to keep the current ESM / RelayDesk employee-code + PIN/password login experience, while adding a lightweight Firebase Auth layer underneath it. The goal was to avoid Google/Gmail sign-in, avoid staying completely unauthenticated at the Firebase layer, and make the work happen on a separate branch so it can be reverted or tested safely if issues show up.

The specific requests were:

1. Change the existing Firestore catch-all expiry date from July 30, 2026 to the same date in 2027.
2. Explain the available auth paths before implementation.
3. Use Option A after confirmation:
   - keep the existing employee-code + PIN/password login UI;
   - add Firebase Auth behind the scenes;
   - do not use Google/Gmail OAuth;
   - allow Firestore and Storage rules to start checking `request.auth`.
4. Create a separate branch for this work.
5. Add this context file documenting the request, what was completed, and the current diff.

## Branch and commit state

- Branch created: `option-a-basic-firebase-auth`
- Implementation commit: `3571446 Add lightweight Firebase auth bridge`
- Context-file commit: added after the implementation commit to preserve the request/completion/diff notes.

## What was completed

### Branch isolation

A separate branch named `option-a-basic-firebase-auth` was created so the Option A work can be reviewed and reverted without touching the original `work` branch directly.

### Firebase Auth SDK loading

`index.html` now loads the Firebase Auth compat SDK next to the existing Firebase App, Firestore, and Storage compat SDKs.

### Firebase Auth initialization

`firebase.js` now initializes `window.auth = firebase.auth()` during the existing Firebase bootstrap, next to `window.db` and `window.storage`.

### Lightweight auth bridge

`auth.js` now exposes `ensureRelayDeskFirebaseAuth(code)`.

That helper keeps the existing app login as the real user-facing gate. Once employee-code + PIN/password validation succeeds, it signs the renderer into Firebase Auth anonymously. This gives Firestore and Storage rules a server-recognized `request.auth` object without requiring employees to use Gmail, Google OAuth, or a separate email/password login screen.

When an anonymous Firebase Auth user is available, the helper also writes these fields into the matching `users/{employeeCode}` document:

- `firebaseAuthUid`
- `firebaseAuthMode`
- `firebaseAuthLinkedAt`

These fields are intended as a lightweight audit/linking aid for future hardening. They are not yet strict rule-enforcement keys.

### Login/session integration

The auth bridge is called from the existing flows where the app considers the employee session valid:

- remembered session restore;
- PIN-reset first login branch;
- normal successful employee-code + PIN/password login;
- first-login wizard PIN save and finish flow.

Logout now also attempts `window.auth.signOut()` after clearing the app's remembered session and before reloading back to the login screen.

### Firestore rule update

`firestore.rules` now changes the catch-all expiry from:

```js
timestamp.date(2026, 7, 30)
```

to:

```js
timestamp.date(2027, 7, 30)
```

The explicit rules for the following collections now require Firebase Auth:

- `featureRequests/{requestId}`
- `violationLogs/{logId}`
- `violationsArchive/{month}`
- `system/{docId}`
- `shifts/{shiftId}`
- `notificationHistory/{entryId}`

Each now uses:

```js
allow read, write: if request.auth != null;
```

Important nuance: the catch-all rule still allows broad read/write access until July 30, 2027. Because Firestore rules are permissive when any matching rule allows access, the explicit `request.auth != null` rules mostly become meaningful after the catch-all expiry or if the catch-all is tightened in a later pass.

### Storage rule update

`storage.rules` now requires Firebase Auth for chat image attachment paths:

```js
allow read, write: if request.auth != null;
```

This applies to:

```txt
chatImages/{chatId}/{fileName}
```

## Current diff summary

The implementation commit changed these files:

- `index.html`
  - Added Firebase Auth compat SDK.
- `firebase.js`
  - Added `window.auth = firebase.auth()`.
- `auth.js`
  - Added the anonymous Firebase Auth bridge.
  - Linked anonymous auth UID metadata back to the employee record.
  - Called the bridge during restore/login paths.
  - Signed out of Firebase Auth during logout.
- `firstlogin.js`
  - Ensured the lightweight Firebase Auth session exists before first-login wizard Firestore writes / finish.
- `firestore.rules`
  - Extended catch-all expiry to July 30, 2027.
  - Replaced explicit open collection rules with `request.auth != null`.
- `storage.rules`
  - Replaced time-boxed open chat image attachment access with `request.auth != null`.

The implementation commit stat was:

```txt
auth.js         | 52 +++++++++++++++++++++++++++++++++++++++++++++++++++-
firebase.js     |  5 +++++
firestore.rules | 46 +++++++++++++++++-----------------------------
firstlogin.js   |  4 ++++
index.html      |  1 +
storage.rules   | 12 +++++-------
6 files changed, 83 insertions(+), 37 deletions(-)
```

## Required Firebase Console setup

For the current Option A implementation to work, Anonymous sign-in must be enabled in Firebase Console:

```txt
Firebase Console → Authentication → Sign-in method → Anonymous → Enable
```

If Anonymous sign-in is not enabled, `signInAnonymously()` may fail and the lightweight auth bridge will not produce `request.auth` for Firestore/Storage rules.

## Testing actually performed in this environment

The following checks were run successfully:

```sh
node --check auth.js && node --check firstlogin.js && node --check firebase.js
```

```sh
git diff --check
```

Firebase CLI validation was attempted with:

```sh
npx firebase-tools --version
```

That command failed because npm registry access returned `403 Forbidden` for `firebase-tools` in this environment, so Firebase CLI rules validation was not available here.

## Known follow-up considerations

1. Anonymous Auth proves that a Firebase Auth session exists, but it does not by itself prove which employee owns a request. The current employee-code/PIN logic remains the real gate.
2. The `firebaseAuthUid` field is written to user documents for future hardening, but current rules do not yet enforce per-user ownership by UID.
3. The catch-all Firestore rule remains broad until July 30, 2027, so collection-specific auth rules are a transition step rather than complete lockdown until the catch-all is tightened.
4. A future stricter phase could replace anonymous auth with custom tokens or a backend-admin-created email/password account per employee code, then enforce `request.auth.uid` against user/profile data.
