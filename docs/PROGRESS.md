# Progress

## Done
- **M1** auth screens (email sign-in, arrival-based role).
- **M2 PR1** security foundation (#1, merged 2026-10-23): tables, RLS, RPCs, private file bucket; roles from the database.
- Sign-in is email plus a six-digit code only, with no magic links (#2, merged 2026-10-23). Repeat code requests are blocked while rate-limited. Verified on Daniel's iPhone.
- **M2 PR2** creator builder (open): programs, milestones, tasks (4 report types and a follow-up), resources (links and PDFs), agent name, preview, publish, share link with Copy.

## Key decisions
- Progression is deterministic; no AI features yet.
- Roles come from the `creators`/`students` tables, never user metadata. Creator signup stays open.
- Test (tavie-test) and production Supabase projects stay separate. The app uses only the publishable key.
- Builder scope (Daniel): no QR code; deleting milestones and tasks archives them. No student enrollment until M3.
- npm audit: 4 highs are one `node-forge` issue inside Expo's CLI (dev only, no patch yet). Don't run `npm audit fix --force`.

## Blockers
- Production Supabase still needs the PR1 migration before the pilot.

## Next
- Daniel tests the builder on his phone, then reviews and approves PR2.
- Then M3 (student enrollment and Today), with Daniel's approval.
