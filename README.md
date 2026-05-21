# MH Journal

Persoonlijke forex trading journal met Supabase auth + database.

## Stack

- React + Vite + TypeScript
- Supabase Auth (email + password + reset)
- Supabase Postgres (RLS)
- Supabase Edge Function (`mt5-trade`) voor MT5 ingest
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

## MT5 ingest activeren

1. Run alle migraties naar remote:

```bash
supabase db push
```

2. Deploy de edge function:

```bash
supabase functions deploy mt5-trade --no-verify-jwt --use-api
```

3. In de app (`Instellingen > MT5 koppeling`):
- genereer API key
- vul MT5 login / broker / server in
- klik `MT5 koppeling opslaan`

4. In MT5:
- voeg in `Tools > Options > Expert Advisors` je WebRequest URL toe:
  - `https://<PROJECT_REF>.supabase.co`
- laat je EA POSTen naar:
  - `https://<PROJECT_REF>.supabase.co/functions/v1/mt5-trade`
- stuur API key via `x-api-key` header of in body als `apiKey`

5. Voorbeeld payload:

```json
{
  "apiKey": "mhj_xxx",
  "account": {
    "login": "9234567",
    "broker": "IC Markets",
    "server": "ICMarketsSC-Demo",
    "currency": "EUR",
    "starting_balance": 10000
  },
  "trades": [
    {
      "ticket": "5001",
      "symbol": "XAUUSD",
      "type": "buy",
      "volume": 0.1,
      "open_time": "2026-05-21T09:00:00Z",
      "close_time": "2026-05-21T11:00:00Z",
      "entry_price": 3325.1,
      "exit_price": 3330.5,
      "stop_loss": 3318.0,
      "take_profit": 3338.0,
      "profit": 54.0,
      "commission": -2.1,
      "swap": 0,
      "comment": "London setup"
    }
  ]
}
```
