# Manual two-browser checklist (Team Product Surface)

Automated coverage for ACL denials, GitHub App mocks, landing route smoke, roles, import filters, and sync conflict fixtures lives in:

- `tests/product-surface-verification.test.ts`
- `services/api/tests/product-surface-verification.test.ts`
- Related suites: `tests/firestore-rules.test.ts`, `tests/landing.test.ts`, `tests/conflicts-ui.test.ts`, `services/api/tests/github-app.test.ts`, `services/api/tests/conflicts.test.ts`

The items below still need a human with two browsers (or two profiles) against a running stack (SPA + API + collab + Firebase emulator or staging).

## Setup

1. Start the SPA (`npm run dev`), API, and collab gateway with emulator/staging auth.
2. Open **Browser A** and **Browser B** (separate profiles or devices) signed in as two different users.
3. Create or join the same workspace from both.

## Presence & cursors

- [ ] Both users see the shared document content update live.
- [ ] Remote cursors / presence indicators appear for the other user.
- [ ] After one user refreshes, presence returns without corrupting the document.

## Comments (Yjs-relative anchors)

- [ ] User A creates a comment on a selection; User B sees it.
- [ ] User A edits text above the anchor; User B’s comment stays attached to the intended region.
- [ ] Viewer cannot create comments; commentator can (roles UI matches ACL).

## Roles / invite

- [ ] Invite link opens `/invite/:id`; email mismatch leaves invite pending (403).
- [ ] Viewer cannot edit body; commentator can comment only; editor/owner can write.

## Import & conflict resolve

- [ ] Browser folder import brings only markdown paths into the workspace tree.
- [ ] Trigger a GitHub sync conflict (overlapping edit); Conflict UI appears.
- [ ] Resolve keep-local / take-remote / merged; autosync resumes after resolve.

## History restore

- [ ] History panel lists snapshots; restore as editor/owner works.
- [ ] Viewer cannot restore; list may still be readable per ACL.

## Landing smoke (quick visual)

- [ ] `/` shows marketing landing; guest CTA opens `/app`.
- [ ] Signed-in create/join reaches `/app` without a broken shell.
