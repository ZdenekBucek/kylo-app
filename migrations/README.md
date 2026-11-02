# Action planning migration

`20261009_action_planning.sql` only adds columns; it does not replace existing records, users, sessions, planned events or environment variables. Apply it once before deploying the action-planning code. It is safe to apply again.

Existing plans retain their original care-type recurrence. New plans snapshot the chosen dose, interval and reminder offsets. An interval of zero means no recurrence; an empty reminder array disables reminders, including overdue reminders. On completion, the saved record carries these values and its next due date is calculated from the actual completion date.

Verification:
- `npm run test:ci`: validation, authorization, calendar selection and reminder behavior.
- `npm run test:e2e`: desktop Chromium and two iPhone WebKit viewports, using test data.
- `scripts/verify-planning-db.cjs`: run with `DATABASE_URL` and `KYLO_TEST_BRANCH_ID` pointing to an isolated Neon branch. It writes only test actions, users, sessions, plans and records; checks concurrent completion and preservation of previous record counts.
- `scripts/verify-planning-flow.cjs`: requires the same isolated branch and the local server at port 4173. Its browser adapter calls the actual API handlers with an isolated test session, verifies persistence after reload and checks the completed record in PostgreSQL. It never runs automatically against production.

Verified on Neon branch `kylo-planning-2026-10-09` before applying the additive migration to production.

## Completion of recurring care (2026-11-02)

Apply `20261102_care_completion.sql` before releasing the completion UI/API. It adds an optional source record reference with a unique index. Existing history is preserved; duplicate and simultaneous confirmations of the same occurrence cannot create multiple records. Repeated care uses the interval stored by the previous record's dates, even when the action default has changed or the definition was archived.

`node scripts/verify-completion-db.cjs` runs the real API on an isolated test branch (`DATABASE_URL` and `KYLO_TEST_BRANCH_ID`). With `KYLO_BROWSER_VERIFY=1`, installed Chromium and the local E2E server at port 4173, it also verifies the complete browser/API/database/reload flow.
