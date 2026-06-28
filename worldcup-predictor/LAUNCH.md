# 🚀 Go-live checklist (Polla LDF)

The app is built and deployed to GitHub Pages. The only thing left is to connect
the backend (Supabase) so friends can sign in and predictions are saved. Work
top to bottom — it takes ~15 minutes.

The live site: **https://josemontegu.github.io/wc26-predictor/**

---

## 1. Create the Supabase project
1. Go to **supabase.com** → sign in → **New project** (free tier is fine).
2. Pick any name, set a database password (save it somewhere), choose a region
   near you, and create it. Wait ~2 min for it to spin up.

## 2. Load the database (one paste)
1. In the project: left sidebar → **SQL Editor** → **New query**.
2. Open [`supabase/setup.sql`](supabase/setup.sql), copy the **whole file**,
   paste it in, and click **Run**. (It creates every table, security rule,
   scoring view, the 32 real fixtures with kick-off times, and the four awards.)
3. You should see "Success". If you see an error, paste it to me.

## 3. Turn on email login
1. **Authentication → Sign In / Providers → Email**: make sure **Email** is
   enabled (it is by default). Magic links work on the free tier.
2. **Authentication → URL Configuration → Redirect URLs**: add **both**
   - `https://josemontegu.github.io/wc26-predictor/`
   - `http://localhost:5173/`  *(for local testing — optional)*
   Save. ⚠️ This step is the usual cause of "login link doesn't work", so
   double-check the first URL exactly (trailing slash included).

## 4. Connect the site to Supabase
1. **Project Settings → API**: copy the **Project URL** and the **anon public**
   key (NOT the service_role key).
2. Give those two values to me and I'll set them as GitHub secrets and redeploy —
   **or** do it yourself: GitHub repo → **Settings → Secrets and variables →
   Actions** → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then
   **Actions → Deploy → Re-run**.
3. After it redeploys (~1 min), the live link shows the **login screen** instead
   of "Configuration needed".

## 5. Make yourself the admin
1. Open the live site, sign in with your email (click the magic link), and set
   your nickname + emoji.
2. Back in Supabase → **SQL Editor**, run:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
   ```
3. Refresh the site — you'll now see the **Admin** tab.

## 6. Fill in the Round-of-32 teams
Matches start as "TBD" until the real teams are set.
- Open **Admin** → **Auto-fill bracket → Sync fixtures now**. This pulls the
  matchups from the openfootball feed as the groups finalise. Tap it again as
  more groups finish.
- For any slot still showing TBD, you can type the teams in manually in the
  match editor (you know the draw before the feed does).

## 7. Share with your friends 🎉
Send them **https://josemontegu.github.io/wc26-predictor/**. They sign in with
their email, pick a nickname + emoji, and start predicting. Predictions for each
match lock 1 hour before kick-off; award picks lock when the Round of 32 begins.

---

### Quick troubleshooting
- **"Configuration needed"** → secrets not set yet / deploy not re-run (step 4).
- **Magic link does nothing** → redirect URL not added exactly (step 3). Open the
  link on the same device/browser you requested it from.
- **Can't predict a match** → its teams are still "TBD" (step 6), or it has
  already locked.
- Anything else → paste me the error.
