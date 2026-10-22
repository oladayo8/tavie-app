# Tavie

The execution agent for online learning. One Expo app (iOS, Android, web) serves students and creators.
The build brief is the source of truth for scope, brand, and build order.

**Status:** Milestone 1 (Expo project, brand, navigation, email one-time-code auth, no-link screen).

## Stack

Expo SDK 58 · Expo Router · TypeScript · Supabase (auth now; Postgres, Storage, pgvector later)

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
   - **Authentication > Email Templates > Magic Link**: replace the body so it sends the code, for example:
     ```html
     <h2>Your Tavie code</h2>
     <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
     ```
     Without `{{ .Token }}` Supabase emails a link instead of a code.
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
| `/creator` | Creator home (builder arrives in Milestone 2) |
| `/student` | Student home (Today card arrives in Milestone 3) |

There is no role picker. The role comes from how someone arrives and is saved to the user's metadata on
first sign-in.

## Scripts

```bash
npm run typecheck   # tsc --noEmit
npx eslint .        # lint
```
