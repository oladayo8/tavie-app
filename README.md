# Tavie

The execution agent for online learning. One Expo app (iOS, Android, web) serves students and creators.
The build brief is the source of truth for scope, brand, and build order.

**Status:** Milestone 1 (Expo project, brand, navigation, email one-time-code auth, no-link screen) and
Milestone 2 PR 1 (database, row-level security, roles from the database).

## Stack

Expo SDK 58 · Expo Router · TypeScript · Supabase (auth, Postgres with row-level security, Storage; pgvector later)

## Run it on your phone (Expo Go)

1. Install **Expo Go** on your phone (App Store or Play Store) and **Node 20+** on your computer.
2. Clone and install:
   ```bash
   git clone <this repo>
   cd <repo>
   npm install
   ```
3. Set up Supabase (one time):
   - Create a project at https://supabase.com.
   - **Authentication > Sign In / Providers > Email**: make sure Email is enabled.
   - **Authentication > Sign In / Providers > Email**: set **Email OTP Length** to `6`.
   - **Authentication > Email Templates**: in both **Magic Link** and **Confirm signup**, replace the body
     so it sends the code (new emails get Confirm signup, returning ones Magic Link), for example:
     ```html
     <h2>Your Tavie code</h2>
     <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
     ```
     Leave out `{{ .ConfirmationURL }}`: Tavie signs in with the code only. Supabase only lets you edit
     templates once custom SMTP is set up (**Authentication > Emails > SMTP Settings**).
   - **SQL Editor > New query**: paste the whole of each file in `supabase/migrations/`, oldest first,
     and click **Run**. This creates the tables, security rules, and the private file bucket.
   - Copy `.env.example` to `.env` and fill in the Project URL and the anon (publishable) key from
     **Project Settings > API**. Never put the `service_role` key in the app. `.env` is git-ignored.
4. Start the dev server:
   ```bash
   npx expo start
   ```
   Scan the QR code with the iPhone Camera app or from inside Expo Go on Android.
   If your phone and computer are on different networks, use `npx expo start --tunnel`.

Supabase's built-in email sender is rate limited (a few emails per hour). Add custom SMTP under
**Authentication > Emails** before inviting real users.

## Routes

| Route | Screen |
| --- | --- |
| `/` | No link: "Ask your coach for your Tavie link" + "I'm a creator" |
| `/j/[slug]` | Creator share link (student arrival). Try `exp://<your-ip>:8081/--/j/marcus-wholesaling` in Expo Go |
| `/sign-in`, `/verify` | Email one-time code |
| `/creator/name` | "What's your name?" The explicit step that makes someone a creator |
| `/creator` | Your programs (Draft or Live) |
| `/creator/new` | New program: goal, then length |
| `/creator/programs/[id]` | Program overview: goal, length, path, what publishing still needs, Publish |
| `/creator/programs/[id]/milestones` and `/milestones/[mid]` | Add, rename, reorder, and remove milestones and their tasks |
| `/creator/programs/[id]/tasks/[tid]` | Task editor (`new` for a new task): action, why, report type, resources, minutes |
| `/creator/programs/[id]/agent`, `/preview`, `/share` | Agent name, student preview (saves nothing), join link with Copy |
| `/student` | Student home (Today card arrives in Milestone 3) |
| `/no-access` | Signed in with no role and no link: "Ask your coach for your Tavie link" |

There is no role picker. How someone arrives picks a side, but only the database grants access: a person is a
creator if they have a `creators` row (made only by `register_creator`, from "I'm a creator" then their name),
and a student if they have a `students` row. User metadata is never used for roles, because users can edit it.

## Database and security

`supabase/migrations/` holds every database change. Each table has row-level security; logged-out users can
only call `get_join_info`; creators see only their own programs; registering, creating, and publishing programs go through server
functions that check the caller. See the migration file's comments for the full list.

## Scripts

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm test            # app unit tests (jest-expo)
npm run test:db     # database security tests on a local Postgres 16 (set DATABASE_URL)
npm run test:api    # end-to-end security tests on a TEST Supabase project (TAVIE_TEST_SUPABASE_* variables)
```

`test:api` creates and deletes users and data, so only ever point it at a project used for testing.
