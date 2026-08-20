# IFT LoadTrack

Real driver logging portal for IFT Logistics LLC. Static frontend (hosted on GitHub Pages) backed by Supabase (auth, database, file storage).

## Setup (one-time)

1. Create a free project at https://supabase.com
2. Open **SQL Editor** in the Supabase dashboard, paste the entire contents of `schema.sql`, and run it. This creates all tables, security policies, and the file storage bucket.
3. Open **Project Settings -> API** and copy the **Project URL** and **anon public** key.
4. Paste those two values into `js/config.js`.
5. Commit and push — GitHub Pages will pick up the change automatically.

## First login as admin/dispatcher

1. Open the site and create an account (this becomes a normal driver account).
2. In Supabase **SQL Editor**, run:
   ```sql
   update public.profiles set role = 'dispatcher'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. Log out and back in — you'll now see the **Dispatch** tab to create and assign loads to drivers.

## Pages

- `index.html` — sign in / create account
- `dashboard.html` — driver home: current load, HOS, upcoming loads
- `load.html?id=...` — accept/decline, arrival confirmation, BOL photo capture, signature capture, workflow status
- `dispatch.html` — dispatcher-only: create and assign loads
- `documents.html` — delivered load history and POD documents

## Notes

- Storage bucket `documents` is private; files are served through short-lived signed URLs.
- HOS values are a simple starting model (driver's remaining drive/shift time); wire up real ELD data later if needed.
