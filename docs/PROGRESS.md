# Progress

## Done
- **M1** auth screens (email sign-in, arrival-based role).
- **M2 PR1** security foundation (#1, merged 2026-10-23): tables, RLS, RPCs, private file bucket; roles from the database.
- Sign-in is email plus a six-digit code only, with no magic links (#2, merged 2026-10-23). Repeat code requests are blocked while rate-limited. Verified on Daniel's iPhone.
- **M2 PR2** creator builder (#3, merged 2026-10-23): programs, milestones, tasks (4 report types and a follow-up), resources (links and PDFs), agent name, preview, publish, share link with Copy.

- **AI plan generator** (open): goal and existing course to a suggested plan the creator edits and approves; one-sentence task suggestions; advanced task fields behind "Edit details".

## Key decisions
- Progression is deterministic. AI only suggests builder content; it never publishes or decides completion, and nothing is saved until the creator approves.
- AI: Claude via a Supabase Edge Function, Haiku by default (`TAVIE_AI_MODEL`). Limits per creator: 5 plans and 30 task suggestions a day, one at a time.
- Roles come from the `creators`/`students` tables, never user metadata. Creator signup stays open.
- Test (tavie-test) and production Supabase projects stay separate. The app uses only the publishable key.
- Builder scope (Daniel): no QR code; deleting milestones and tasks archives them. No student enrollment until M3.
- npm audit: 4 highs are one `node-forge` issue inside Expo's CLI (dev only, no patch yet). Don't run `npm audit fix --force`.

## Blockers
- Production Supabase still needs the PR1 migration before the pilot.

## Next
- Daniel sets up the Anthropic key and deploys the function, tests the AI generator on his iPhone, and approves its PR.
- Then M3 (student enrollment and Today), with Daniel's approval.
