# Progress

## Done
- **M1** auth screens (email sign-in, arrival-based role).
- **M2 PR1** security foundation (#1, merged 2026-10-23): tables, RLS, RPCs, private file bucket; roles from the database.
- Sign-in is email plus a six-digit code only, with no magic links (Daniel, 2026-10-23). Repeat code requests are blocked while rate-limited.

## Key decisions
- Progression is deterministic; no AI features yet.
- Roles come from the `creators`/`students` tables, never user metadata. Creator signup stays open.
- Test (tavie-test) and production Supabase projects stay separate. The app uses only the publishable key.
- npm audit: 4 highs are one `node-forge` issue inside Expo's CLI (dev only, no patch yet). Don't run `npm audit fix --force`.

## Blockers
- Supabase only allows email template edits with custom SMTP. tavie-test needs a free SMTP sender.
- Production Supabase still needs the PR1 migration before the pilot.

## Next
- Daniel tests creator sign-in end to end on his iPhone in Expo Go.
- Then M2 PR2 (creator builder), which Daniel approved once sign-in works.
