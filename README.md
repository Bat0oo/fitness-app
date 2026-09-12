# 🏋️ Workout Planner

A drag-and-drop workout builder for the web. Create day cards (Push, Pull, Legs…),
drop exercises into them, set your reps and weight, and your whole plan is saved to
your account — ready every time you come back, from any device.

**Live demo:** [fitness-app-drj.pages.dev](https://fitness-app-drj.pages.dev)

![Workout Planner — main screen](docs/screenshot-desktop.png)

---

## What it does

- **Build your split visually.** Add a card for each training day and give it a name
  and colour (e.g. *Monday · Push*).
- **Drag exercises in.** On desktop, drag from the exercise library straight into a
  day card. On mobile, tap **+ Add exercise** and pick from a list.
- **Set the details.** Each exercise holds sets × reps × weight, editable inline.
- **It's saved to your account.** Log in and your plan is stored in the cloud — close
  the tab, switch to your phone, come back next week: it's all still there.
- **Private by default.** Every user sees only their own plans.

---


| Layer | Technology | Why |
|---|---|---|
| UI | **React + Vite** | Fast, familiar, easy to build |
| Drag & drop | **@dnd-kit** | Works with mouse and touch |
| Database + Auth | **Supabase** (Postgres) | Managed backend, generous free tier |
| Security | **Row Level Security** | Each user can only read their own rows |
| Hosting | **Cloudflare Pages** | Free static hosting, auto-deploy on push |

### Data model

```
workouts   (a plan — belongs to one user)
   └── days       (a card: label, title, colour, order)
          └── exercises   (name, sets, reps, kg, order)
```

Row Level Security policies ensure a user can only ever touch rows that trace back
to their own `user_id`.

---

## Running it locally

**Requirements:** Node 18+ and a free [Supabase](https://supabase.com) project.

```bash
# 1. Install dependencies
npm install

# 2. Add your Supabase keys
cp .env.example .env
#    then edit .env:
#    VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
#    VITE_SUPABASE_ANON_KEY=your-publishable-key

# 3. Create the tables
#    In Supabase → SQL Editor, run the contents of supabase/schema.sql

# 4. Start the dev server
npm run dev            # http://localhost:5173
```

To test on your phone over the same Wi-Fi:

```bash
npm run dev -- --host  # then open the Network URL it prints
```

---

## Project structure

```
src/
  lib/
    supabase.js     Supabase client
    data.js         all database reads/writes live here (only file that knows the DB)
    library.js      the exercise list shown in the sidebar
    useAuth.jsx     auth state (who's logged in)
  components/
    DayCard.jsx           a single day card (droppable)
    ExerciseRow.jsx       one exercise line with sets/reps/kg
    LibraryItem.jsx       a draggable exercise in the sidebar
    AddExerciseSheet.jsx  mobile "tap to add" bottom sheet
  pages/
    Login.jsx       email + password sign in / sign up
    Planner.jsx     the main screen, ties everything together
supabase/
  schema.sql        tables + Row Level Security policies
```

Because every database call lives in `src/lib/data.js`, the storage layer could be
swapped (e.g. to a different provider) without touching the UI.

---

## License

MIT — free to use, learn from, and build on.
