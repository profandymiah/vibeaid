# Putting Vibe Aid on vibeaid.andymiah.net

Same set-up as SignStories: **Supabase** (database, sign-in, screenshots) → **GitHub Pages** (the site) → **Squarespace DNS** (the address). About 45 minutes.

## Part 1: Supabase (already done)

Vibe Aid lives in the shared **vibeaid** Supabase project (also home to SignStories; the free plan allows two active projects). Every Vibe Aid table, function and storage bucket starts with `va_` / `va-`, so nothing touches SignStories. The tables are installed and `config.js` is filled in.

Two dashboard settings left, in the vibeaid project:

1. **Authentication → URL Configuration → Redirect URLs**: add `https://vibeaid.andymiah.net/**` (keep the SignStories ones).
2. **Authentication → Emails → Templates → Magic Link**: if it mentions BSL Sign Stories, reword it to something neutral like "Your sign-in link", since both sites now send it.

The "real accounts only" block at the end of `schema.sql` is already applied.

### Part 1b (optional): "Continue with GitHub"

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**. Homepage `https://vibeaid.andymiah.net`; callback URL: the one Supabase shows under **Authentication → Sign In / Providers → GitHub**.
2. Paste the Client ID and a new Client Secret into that Supabase GitHub provider and enable it.
3. In `config.js` set `GITHUB_SIGNIN: true`.

### Part 1c: "Continue with LinkedIn"

Every project already links to its sharer's LinkedIn profile (they paste it into their profile before submitting). Turning on LinkedIn sign-in also marks them as "signed in with LinkedIn".

1. Go to **linkedin.com/developers/apps → Create app**. LinkedIn asks you to attach the app to a **LinkedIn Page** — use an existing page or create one for Vibe Aid. Upload the Vibe Aid mark as the logo.
2. In the app, open **Products** and request **Sign In with LinkedIn using OpenID Connect** (usually approved instantly).
3. Open **Auth**. Under **Authorized redirect URLs** add the callback URL Supabase shows in the next step (it looks like `https://ynqfrqlagcqxoadjvtfy.supabase.co/auth/v1/callback`). Copy the **Client ID** and **Client Secret**.
4. In Supabase (the vibeaid project): **Authentication → Sign In / Providers → LinkedIn (OIDC)**. Turn it on, paste the Client ID and Secret, save.
5. In `config.js` set `LINKEDIN_SIGNIN: true` and commit.

## Part 2: GitHub Pages

1. New **public** repository `vibeaid` under `profandymiah`, then upload everything in this folder (keep the folder structure, including `.github` and `.nojekyll`).
2. **Settings → Pages**: deploy from branch `main`, folder `/ (root)`; custom domain `vibeaid.andymiah.net`.
3. **Settings → Actions → General → Workflow permissions**: *Read and write* (lets the weekly open-data export commit).

## Part 3: Squarespace DNS

**Domains → andymiah.net → DNS → Add record**: Type `CNAME`, Host `vibeaid`, Data `profandymiah.github.io`. When GitHub shows a green tick, enable **Enforce HTTPS**.

## Part 4: make yourself a moderator

Sign in on the live site, add your name, then in Supabase's SQL Editor run:

```sql
insert into public.va_moderators (user_id)
select id from auth.users where email = 'YOUR-EMAIL-HERE';
```

Reload: a **Moderation** link appears. Projects wait there until approved.

## Good to know

- Example projects show only while nothing real is published; delete `data/examples.js` entries whenever you like.
- Any author edit sends a project back for re-approval.
- Supabase's free plan pauses after about a week of no activity; restart it from the dashboard.
