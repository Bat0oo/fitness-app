# Workout Planner

Drag & drop workout builder. React + Vite frontend, Supabase for database + auth,
deployed on Cloudflare Pages. No backend to host — Supabase is the backend.

## Architecture

```
Browser (React)  ──▶  Cloudflare Pages   static files, free
      │
      └───────────▶  Supabase           Postgres + Auth + auto REST API, free
```

You maintain zero servers. Two managed free services.

---

## 1. Local setup

Requires Node 18+.

```bash
npm install
cp .env.example .env      # then fill in your Supabase keys (step 2)
npm run dev               # http://localhost:5173
```

---

## 2. Supabase (database + auth)

1. Create a free account at https://supabase.com and make a **New project**.
   Pick a region close to your users. Save the database password somewhere.
2. Once it's ready, go to **Project Settings > API** and copy:
   - `Project URL`  → put in `.env` as `VITE_SUPABASE_URL`
   - `anon public` key → put in `.env` as `VITE_SUPABASE_ANON_KEY`
   (The anon key is safe to expose in the browser — Row Level Security protects the data.)
3. Go to **SQL Editor > New query**, paste the entire contents of
   `supabase/schema.sql`, and click **Run**. This creates the tables and the
   security policies so each user only sees their own data.
4. **Auth setup:**
   - Email login works out of the box (magic link).
   - For Google login: **Authentication > Providers > Google**, enable it, and
     follow their link to create Google OAuth credentials. Optional — you can
     ship with email-only first.
   - Under **Authentication > URL Configuration**, add your production URL
     (your Cloudflare Pages domain) to **Redirect URLs** once you have it.

---

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial workout planner"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/workout-planner.git
git push -u origin main
```

`.env` is gitignored — your keys never go to GitHub. You'll add them in
Cloudflare instead.

---

## 4. Deploy to Cloudflare Pages

1. Sign in at https://dash.cloudflare.com (free account).
2. **Workers & Pages > Create > Pages > Connect to Git**, pick your repo.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables** — add the same two from your `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Save and Deploy.** You get a `*.pages.dev` URL in ~1 minute.
6. Copy that URL back into Supabase **Auth > URL Configuration > Redirect URLs**
   so login redirects work.

Every `git push` to `main` now auto-deploys.

---

## 5. Custom domain (needed for AdSense)

- Buy a domain (~€10/yr). AdSense won't approve a `pages.dev` subdomain.
- In Cloudflare Pages: **Custom domains > Set up a domain**. If you also register
  the domain through Cloudflare, DNS is automatic.
- Add the custom domain to Supabase redirect URLs too.

---

## 6. AdSense

Apply only after you have:
- a custom domain,
- some real text content (a few exercise guides / articles help approval and SEO),
- a privacy policy page (required).

Then paste the AdSense script into `index.html` and add ad units where you want them.

---

## Where to extend

- **Exercise images/animations:** the library lives in `src/lib/library.js`.
  wger (https://wger.de) has an open exercise database you can pull from. Avoid
  random GIFs off the web — most are copyrighted.
- **Reordering days / exercises:** already using dnd-kit; add `@dnd-kit/sortable`
  to the day lists and persist the new `position` values.
- **Multiple workouts per user:** the schema already supports it (a user can have
  many `workouts` rows) — add a workout switcher in the UI.
- **Grouping cards into a "training":** the `workouts` table is exactly this
  grouping. Each workout = one training plan holding many day cards.
