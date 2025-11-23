# MINOR Backend

This document explains the backend for the MINOR Flutter project: folder layout, architecture, key files, how the dynamic (rotating) QR works end-to-end, how to run and test locally, and recommended security practices.

## Quick summary
- Node.js + Express REST API
- MongoDB (mongoose) for persistence
- Socket.IO for realtime QR token broadcasting
- HMAC-style per-second rotating tokens derived server-side (qrSeed + sessionId + time)

## Folder structure

backend/
- src/
  - app.js                -> Express app setup and HTTP server
  - router.js             -> Top-level router that mounts sub-routers
  - config/
    - db.js               -> MongoDB connection setup
  - models/
    - session.js          -> Session mongoose model (sessionId, qrSeed, expiresAt, etc.)
    - attendance.js       -> Attendance records (sessionId, studentUid, timestamp, verified)
    - user.js             -> User model
    - refreshToken.js     -> (auth) refresh token model
  - modules/
    - auth/               -> Authentication controllers/services/routes
    - sessions/           -> Session creation, checkin, professor endpoints
      - router.js         -> Routes: POST /api/sessions, POST /api/sessions/checkin, GET /api/sessions/professor
      - controller.js     -> Thin HTTP -> service layer
      - service.js        -> Business logic (createSession, checkin, token derivation & validation)
    - attendance/         -> Attendance-related API
    - face/               -> Face registration / verification APIs
  - realtime/
    - index.js            -> Socket.IO namespace `/sessions` and per-session broadcasting logic
- test/
  - qr_test.js            -> Automated test/harness that exercises session creation, socket subscription and QR ticks
- .env.example            -> Environment variable examples

## Architecture & flow

1. Professor (frontend) calls POST `/api/sessions` to create a session.
   - `SessionsService.createSession` (src/modules/sessions/service.js) creates a `Session` document with a generated `sessionId` and a secret `qrSeed` stored server-side.

2. Realtime token broadcast
   - `src/realtime/index.js` runs a Socket.IO namespace `/sessions`.
   - When a professor client joins a session room the server ensures a per-session interval is running that every second:
     - computes `token = deriveRotatingToken(qrSeed, sessionId, nowSec)`
     - emits `qr:tick` events to the room with payload `{ sessionId, token, ts: nowSec }`
   - The server never sends `qrSeed` to clients; only the derived token and timestamp are emitted.

3. Frontend subscription and rendering
   - Frontend `RealtimeService.subscribeQrTicks(sessionId)` (frontend) connects to `/sessions`, emits `professor:join` and listens for `qr:tick` events.
   - Each tick is rendered on the professor UI as a QR (payload is typically `sessionId:token` or `sessionId:ts:token`).

4. Student check-in
   - Student submits the token (POST `/api/sessions/checkin`) including `sessionId`, `qrToken` (and optionally `ts`).
   - `SessionsService.checkin` locates the `Session` and validates the token.
     - Current validation supports deriving the rotating token server-side using `deriveRotatingToken` and accepts a small time window (e.g., now ±1 second) using `isRotatingTokenValid`.
     - If validation passes and the student is identified, attendance is recorded in `Attendance`.

## Key files (quick reference)
- `src/app.js` - sets up Express, middleware, error handling and starts server.
- `src/router.js` - mounts module routers (auth, sessions, face, attendance).
- `src/config/db.js` - mongoose connection helper.
- `src/modules/sessions/service.js` - session lifecycle and rotating-token logic:
  - `createSession(body, authorization)` - create session, generate `qrSeed`.
  - `deriveRotatingToken(qrSeed, sessionId, seconds)` - deterministic per-second token derivation (HMAC-SHA256 -> trimmed).
  - `isRotatingTokenValid(candidate, qrSeed, sessionId)` - checks candidate against a small time window.
  - `checkin(body)` - validates token and persists attendance.
- `src/realtime/index.js` - manages Socket.IO namespace `/sessions`, handles `professor:join` and `student:subscribe`, starts/stops per-session timers that emit `qr:tick`.
- `test/qr_test.js` - test that registers a professor, creates a session, connects to Socket.IO, and asserts `qr:tick` messages appear.

## Models (data schema)

The backend uses Mongoose models stored in `src/models/`. Here are the primary schemas and the important fields they contain:

- `session.js` (Session)
  - `sessionId` (string): public session identifier returned to the frontend.
  - `professorUid` (string): user id of the professor who created the session.
  - `qrSeed` (string): secret seed used to derive per-second rotating tokens (must remain server-side).
  - `title` (string | null): session title (optional).
  - `createdAt` (Date): creation time.
  - `expiresAt` (Date): expiry time for the session; checkin must reject after this.
  - Purpose: persistent record for sessions; `qrSeed` is used by `deriveRotatingToken` in `SessionsService`.

- `attendance.js` (Attendance)
  - `sessionId` (string): references the session under which attendance was taken.
  - `studentUid` (string): unique student identifier.
  - `timestamp` (Date): time of check-in.
  - `verified` (boolean): whether the check-in was verified (e.g., face match).
  - `method` (string): how the check-in was performed (`face-embedding`, `none`, etc.).
  - Purpose: stores attendance records and is updated/upserted on student checkin.

- `user.js` (User)
  - `uid` (string): unique user id used across sessions and attendance.
  - `email`, `name`: user profile fields.
  - `role` (string): `student` or `professor` used in authorization checks.
  - `face` (object): optional face embedding data used for face verification.
  - Purpose: authentication/identity for both professors and students; `createSession` authorizes professor via JWT.

- `refreshToken.js` (RefreshToken)
  - Internal model used by auth module to store refresh tokens (if implemented). Fields depend on auth service.
  - Purpose: support long-lived sessions and token refresh flows.

These models are the canonical storage for the QR/session/checkin flows. If you implement replay protection (one-time tokens) you can either add a small `usedTokens` array/TTL index inside `Session` or create a separate `UsedToken` collection storing `{ sessionId, ts }` with TTL to automatically expire entries.

## Environment & run

1. Copy `.env.example` to `.env` and set required variables (example):

```
MONGO_URI=mongodb://localhost:27017/minor
JWT_SECRET=replace_with_a_secret
PORT=4000
```

2. Install dependencies and run:

```
cd backend
npm install
node src/app.js        # or use your dev script (nodemon)
```

3. Run the QR test harness (optional):

```
npm run test:qr
```

## Security considerations & recommendations

- Never send `qrSeed` to clients. The server should always derive tokens and broadcast them.
- Use TLS for all HTTP and socket connections.
- Keep `qrSeed` high-entropy and store it server-side only (already implemented by `createSession`).
- Consider adding a server-wide secret into HMAC derivation (HMAC(serverSecret, qrSeed + sessionId + seconds)) so seed leaks are less catastrophic.
- Include `ts` in the QR payload and require clients to submit it with checkin; validate using the exact `ts` and optionally maintain a short-lived used-token store to prevent replay.
- Rate-limit checkin endpoints (already present in router: `express-rate-limit`).
- Log suspicious patterns and consider rotating seeds for long-running sessions.

## Recommended small improvements (next steps)

- Enforce strict ts validation and one-time-use tokens (server records used token timestamps with TTL). This reduces the effective acceptance window to a single second.
- Add server-side `serverSecret` into token derivation for defense-in-depth.
- Add monitoring/logging on `qr:tick` emission failures and checkin rejections.

## Contact / Contribution

If you want me to implement any of the recommended hardening changes (ts enforcement, used-token store, serverSecret integration), tell me which one and I will prepare the code changes and tests.

---
Generated on: 2025-11-23
## Deep dive: token derivation, validation & replay protection

This project uses a compact HMAC-based rotating token derived from a server-side `qrSeed` and the public `sessionId` so that the server can deterministically compute a per-second token without sharing any secret with clients.

Core idea (pseudo):

```
// deriveRotatingToken(qrSeed, sessionId, seconds)
const payload = `${sessionId}:${seconds}`;
const hmac = HMAC_SHA256(qrSeed, payload);
const token = base64urlTrim(hmac).slice(0, 10); // compact human-friendly token
return token;
```

Validation should require a timestamp (`ts`) alongside the token and prefer exact-match semantics for `ts` to reduce replay risk. A recommended pattern:

- Frontend QR payload: include both `ts` and `token` (e.g., `sessionId:ts:token`).
- Student submits `sessionId`, `ts`, and `qrToken` to `POST /api/sessions/checkin`.
- Server checks:
  - Session exists and not expired.
  - Optionally, `Math.abs(nowSec - ts) <= allowedSkew` (allowedSkew default 1). For strict enforcement set `allowedSkew = 0`.
  - Compute `expected = deriveRotatingToken(qrSeed, sessionId, ts)` and require `expected === qrToken`.
  - Check for replay by ensuring `(sessionId, ts)` was not seen before. Use a TTL-backed store so entries expire automatically (e.g., TTL index of 2 minutes).

Replay-protection implementation options:

- Add `usedTokens` subdocument on `Session` with a TTL index (`createdAt`) and store `{ ts }` entries (small, simple, keeps data grouped).
- Or create a small `UsedToken` collection `{ sessionId, ts, createdAt }` with TTL index to expire used entries automatically.

Example (high-level) `checkin` flow to implement:

```
// 1. require body.sessionId, body.ts, body.qrToken
// 2. session = Session.findOne({ sessionId })
// 3. if (!session || session.expiresAt < now) reject
// 4. if (Math.abs(nowSec - body.ts) > allowedSkew) reject
// 5. expected = deriveRotatingToken(session.qrSeed, sessionId, body.ts)
// 6. if (expected !== body.qrToken) reject
// 7. // replay check
// if (UsedToken.exists({ sessionId, ts: body.ts })) reject
// 8. UsedToken.insert({ sessionId, ts: body.ts, createdAt: new Date() })
// 9. // proceed to identify student and persist Attendance
```

Moving to strict `ts` enforcement plus a one-time-used token store is the most direct way to ensure tokens cannot be abused after they are displayed. If you want, I can implement this change (add model, TTL index, update `checkin`, and extend `test/qr_test.js` to assert replay rejection).
