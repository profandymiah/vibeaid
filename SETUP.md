# Putting Vibe Aid on vibeaid.andymiah.net

Same set-up as SignStories: **Supabase** (database, sign-in, screenshots) → **GitHub Pages** (the site) → **Squarespace DNS** (the address). About 45 minutes.

## Part 1: Supabase

> The free Supabase plan allows two active projects, and `aiethos` and `signstories` already use them. Either upgrade the organisation to Pro, pause a project you don't need live, or ask Claude to install Vibe Aid's tables inside an existing project.

1. supabase.com → **New project** → name `vibeaid`, region *West EU (London)*, generate and save a database password.
2. **SQL Editor → New query**: paste all of `schema.sql`, click **Run**.
3. **Authentication → URL Configuration**: Site URL `https://vibeaid.andymiah.net`; add redirect URL `https://vibeaid.andymiah.net/**`.
4. **Project Settings → API**: copy the **Project URL** and **anon public** key into `config.js`.
5. Before launch, connect custom SMTP (Resend or Brevo) under **Authentication → Emails → SMTP Settings** — the built-in sender only manages a few emails an hour.

### Part 1b (optional): "Continue with GitHub"

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**. Homepage `https://vibeaid.andymiah.net`; callback URL: the one Supabase shows under **Authentication → Sign In / Providers → GitHub**.
2. Paste the Client ID and a new Client Secret into that Supabase GitHub provider and enable it.
3. In `config.js` set `GITHUB_SIGNIN: true`.

## Part 2: GitHub Pages

1. New **public** repository `vibeaid` under `profandymiah`, then upload everything in this folder (keep the folder structure, including `.github` and `.nojekyll`).
2. **Settings → Pages**: deploy from branch `main`, folder `/ (root)`; custom domain `vibeaid.andymiah.net`.
3. **Settings → Actions → General → Workflow permissions**: *Read and write* (lets the weekly open-data export commit).

## Part 3: Squarespace DNS

**Domains → andymiah.net → DNS → Add record**: Type `CNAME`, Host `vibeaid`, Data `profandymiah.github.io`. When GitHub shows a green tick, enable **Enforce HTTPS**.

## Part 4: make yourself a moderator

Sign in on the live site, add your name, then in Supabase's SQL Editor run:

```sql
insert into public.moderators (user_id)
select id from auth.users where email = 'YOUR-EMAIL-HERE';
```

Reload: a **Moderation** link appears. Projects wait there until approved.

## Good to know

- Example projects show only while nothing real is published; delete `data/examples.js` entries whenever you like.
- Any author edit sends a project back for re-approval.
- Supabase's free plan pauses after about a week of no activity; restart it from the dashboard.
