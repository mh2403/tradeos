# MH Journal

Persoonlijke forex trading journal met Supabase auth + database.

## Stack

- React + Vite + TypeScript
- Supabase Auth (magic link)
- Supabase Postgres (RLS)
- GitHub Actions deploy naar GitHub Pages

## 1) Supabase setup

1. Maak een nieuw Supabase project.
2. Ga naar `SQL Editor` en run `supabase/schema.sql`.
3. Ga naar `Authentication -> Providers -> Email` en zet `Enable Email provider` aan.
4. Voeg redirect URLs toe in `Authentication -> URL Configuration`:
   - `http://localhost:5173`
   - `https://<jouw-github-username>.github.io/<repo-naam>/`
5. Kopieer:
   - Project URL
   - anon public key

## 2) Lokale setup

1. Installeer dependencies:

```bash
npm install
```

2. Maak een `.env` op basis van `.env.example`:

```bash
cp .env.example .env
```

3. Vul in `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

4. Start lokaal:

```bash
npm run dev
```

## 3) GitHub repo + Pages deploy

1. Push deze code naar een **public** GitHub repo.
2. In GitHub repo:
   - `Settings -> Pages -> Build and deployment -> Source = GitHub Actions`
3. Voeg repo secrets toe (`Settings -> Secrets and variables -> Actions`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Push naar `main`.
5. Workflow `Deploy to GitHub Pages` bouwt en publiceert automatisch.

## Veiligheid

- `VITE_SUPABASE_ANON_KEY` mag publiek zijn.
- **Nooit** de `service_role` key in frontend of GitHub Pages gebruiken.
- Bescherming gebeurt via Supabase RLS policies.

## Volgende stap

Na deploy kan je meteen verder bouwen op de modules:

- MT5 imports/sync
- Trade blotter + position tracker
- Setup/checklist journal
- Performance dashboards
- Accountability settings (boete, partner-mail, donatielink)
- Coaching/edge reports
