# Push Notifications – Master Instructions for Codex
This document defines the complete ruleset Codex must follow when implementing,
reviewing, modifying, or extending the push notification architecture across the
client app, backend Cloud Functions, and Firestore security rules.

It is **mandatory** that Codex reads and follows this file before making any
suggestion or modification.

---

# 🌐 Global Rules

1. **Do not break anything.**
   - All existing features of the app must continue to work exactly as before.
   - No rewriting, renaming, or deleting existing functionality unless explicitly instructed.

2. **Strictly additive changes.**
   - New logic MUST be added in a non-invasive way.
   - Never rewrite whole files or large sections of code.
   - Extend existing patterns instead of replacing them.

3. **Always inspect existing code before modifying anything.**
   - Search for helpers, hooks, utils, existing patterns.
   - Reuse what exists when possible.

4. **Never invent field names, collection names, or structures.**
   - Use ONLY what exists:
     - `users`
     - `riders`
     - `boardPosts`
     - fields actually present in the codebase or confirmed by audit.

5. **Follow the principle of least privilege.**
   - Keep Firestore rules as strict as possible.
   - Relax them ONLY when absolutely required by the push architecture.

6. **No paid Firebase services.**
   - Must remain fully compatible with Firebase **Spark plan**.
   - DO NOT introduce or require:
     - Blaze plan
     - paid quotas
     - Cloud Messaging fees
   - Expo Push API MUST be used instead of sending FCM via admin SDK.

7. **No external backend unless explicitly instructed.**
   - Do NOT create or propose external servers, Render, Railway, Fly.io, etc.
   - All backend logic must live inside Firebase Cloud Functions.

8. **All changes must be explained.**
   - Every time Codex modifies a file, the response must include:
     - Which file was changed
     - What was changed
     - Why it was safe
     - Why it does not break existing functionality

---

# 🔒 No regressions – Absolutely preserve existing functionality

Codex must always guarantee:

- No regression in **any** part of the app.
- No feature degradation.
- No breaking change.
- No modification to existing business logic of `users`, `riders`, `boardPosts`, authentication, or UI flows.

When in doubt, Codex MUST:
- prefer adding new small functions,
- avoid modifying existing ones,
- avoid refactoring unless explicitly requested,
- avoid assumptions.

---

# 👤 Users collection – Push Token Fields

The codebase and production data contain multiple token fields:

- `expoPushTokens` (plural, lower-case) → **client currently tries to write here**
- `expoPushToken` (singular) → present in `firestore.rules`
- `ExpoPushTokens` → may exist in production data (legacy)
- `fcmTokens` → may exist in production data (legacy)

Codex must adhere to:

### ✅ Canonical token field
**The canonical field is:**  
`users/{uid}.expoPushTokens`  
- Must be an array of strings.
- Must store Expo push tokens.
- Must be the only field used by Cloud Functions for notifications.

### 🔄 Backward compatibility
- Codex MAY read `expoPushToken`, `ExpoPushTokens`, or `fcmTokens` **only during migration scripts**.
- These fields MUST NOT be written in new logic.
- Migration must dedupe and merge all old tokens into `expoPushTokens`.

### 🗂 Devices subcollection (optional)
The rules support:
users/{uid}/devices/{deviceId}
	•	expoPushToken
	•	platform
	•	updatedAt

    Codex MAY keep this subcollection for metadata, but:

- Notifications MUST be sent using `users/{uid}.expoPushTokens`
- The subcollection MUST NOT become the primary source of truth.

---

# 🔐 Firestore Security Rules – Guidelines (Repo-specific)

### Current gaps identified during audit:
- `expoPushTokens` is NOT allowed by the rules.
- Only `expoPushToken` (singular) is validated.
- No rules exist for the `riders` collection (default deny).
- Token registration is blocked by security rules.

Codex must:

### 1️⃣ Allow writing `expoPushTokens`
Modify rules minimally so:

- An authenticated user can update **their own** `expoPushTokens`.
- Admin/owner permissions remain unchanged.
- No write access for other users.

### 2️⃣ Preserve existing constraints
Rules for:
- `approved`
- `disabled`
- read access for boardPosts / riders
must remain untouched.

### 3️⃣ Add rules for `riders` (if required by flows)
Add read rules similar to boardPosts:
- authenticated,
- approved,
- not disabled.

Write permissions must reflect:
- member → no write
- admin/owner → allowed writes

### 4️⃣ Minimal, safe changes only
For EVERY change to rules, Codex MUST:

- explain exactly which blocks were modified,
- preserve all existing rule logic,
- avoid wildcard `allow read, write: if true`,
- maintain schema validation.

---

# 🧩 Required Push Notification Flows

Codex must implement these backend flows:

### 1. New Ride Created
Trigger: `riders/{rideId}` `.onCreate`  
Send notification to ALL approved, not disabled users.

### 2. Ride Updated or Cancelled
Trigger: `riders/{rideId}` `.onUpdate`  
Send notification to ALL approved, not disabled users.

### 3. New Board Post (News)
Trigger: `boardPosts/{postId}` `.onCreate`  
Notify ALL approved, not disabled users.

### 4. New User Registered (Pending Approval)
Trigger: `users/{uid}` `.onCreate`
Notify ONLY users with role `"Owner"`.

Codex must:
- read Expo tokens from `expoPushTokens`
- batch into chunks (max 100 tokens)
- use Expo Push API
- log and ignore invalid tokens

---

# 🔧 Cloud Functions Implementation Rules

Codex must:

1. Create a valid `functions/` folder if not present.
2. Use ES modules or TypeScript depending on project config.
3. Initialize Admin SDK correctly (no FCM sending).
4. Add **ONLY** the new push flows.
5. NEVER modify unrelated functions or logic.
6. Always dedupe Expo tokens before sending.
7. Log all API responses for debugging.
8. Respect Firestore rules semantically (backend bypasses them, but user roles must match).

---

# 📱 Client Implementation Rules

Codex must:

### 1. Ensure token registration actually runs
- The existing `registerPushToken.ts` MUST be invoked at app startup.
- Prefer App.tsx, AuthProvider, or a top-level hook once the user is authenticated.

### 2. Write tokens only to:
users/{uid}.expoPushTokens

Using `arrayUnion` and dedupe.

### 3. Do not change unrelated client logic.

---

# 🔍 Existing Push Implementation Review (Always Run FIRST)

Before adding or modifying code, Codex must:

1. Search for any:
   - expo-notifications usage
   - old push helpers
   - Cloud Functions attempts
   - usage of `expoPushTokens`, `expoPushToken`, `ExpoPushTokens`, `fcmTokens`

2. Produce a short summary:
   - what exists
   - what is unused
   - what must be preserved
   - what must be updated

3. Confirm that the final architecture matches:
   - canonical token field
   - Spark-plan-safe Expo Push API usage
   - no regressions
   - correct rules constraints

Never proceed without running this review first.

---

# 🧪 Verification Rules

For every change, Codex must help verify:

- Token registration works for an authenticated user.
- Functions deploy without errors.
- Rules compile successfully.
- Approved users can still read rides/boardPosts.
- No other features are broken.

---

# 🚫 Absolutely Forbidden

Codex must NEVER:

- introduce direct FCM sending from Cloud Functions  
- propose switching to Firebase Blaze  
- propose external backends (Render/Railway/etc.)  
- refactor unrelated code  
- loosen rules dangerously  
- rename collections or fields  
- remove legacy data without explicit migration steps

---

# 🎯 Final Reminder to Codex

Always follow:

- **Global Rules**
- **No regressions**
- **Canonical field = expoPushTokens**
- **Expo Push API only**
- **Spark plan compatibility**
- **Minimal rule changes**
- **Strictly additive behavior**

All modifications must be deliberate, small, safe, and fully compatible with existing behavior.