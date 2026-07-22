# CalApp 🍽🏋️

AI-powered calorie & gym coach — bilingual **Arabic / English** (full RTL support).

- **Scan a meal** with the camera → AI identifies the dishes (including Middle Eastern cuisine), estimates calories & macros → edit → log.
- **Scan gym equipment** → AI identifies the machine, shows target muscles, setup steps, form cues, common mistakes, and suggested sets/reps.
- **Daily plan**: onboarding computes calorie & macro targets (Mifflin-St Jeor TDEE) from your body stats and goal.

## Repo layout

| Path | What it is |
|---|---|
| `src/` | Expo (React Native) app — expo-router, TypeScript, zustand, i18next |
| `server/` | AI backend — Node + Hono + Anthropic SDK (vision analysis endpoints) |
| `.github/workflows/` | CI + automated deployment (EAS Update / TestFlight) |

## Run the app locally

```bash
npm install
npm start          # scan QR with Expo Go
```

With no configuration the app runs in **demo mode**: the full scan flow works with mocked AI results (a badge on the camera screen says so).

To use real AI analysis, run the server and point the app at it:

```bash
# 1. Server
cd server
cp .env.example .env       # put your ANTHROPIC_API_KEY in .env
npm install
npm run dev                # listens on :3000

# 2. App — in repo root, create .env:
# EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000
npm start
```

The server defaults to **Claude Haiku 4.5** (≈ $0.003–0.01 per scan). Set `ANTHROPIC_MODEL` to override.

## Deployment (fully automated)

| Trigger | Workflow | What happens |
|---|---|---|
| Every push / PR | `ci.yml` | Typecheck + lint (app and server) |
| Push to `main` | `ota-update.yml` | **EAS Update** — JS changes ship over-the-air to installed apps instantly, no store review |
| Push a `v*` tag (e.g. `v1.0.0`) or manual dispatch | `release.yml` | **EAS cloud build → auto-submit to TestFlight** |

### One-time setup (≈15 minutes)

1. `npx eas init` — link the repo to your Expo account (creates the EAS project id).
2. `npx eas credentials` — sign in with your Apple Developer account once; EAS stores the signing certificates and an App Store Connect API key on its servers, so CI never needs Apple secrets.
3. On [expo.dev](https://expo.dev) → project → **Environment variables**: add `EXPO_PUBLIC_API_URL` (your deployed server URL) for the `preview` and `production` environments.
4. In GitHub → repo **Settings → Secrets and variables → Actions**: add `EXPO_TOKEN` (create at expo.dev → Account settings → Access tokens).
5. Deploy `server/` anywhere that runs Docker or Node (Railway / Fly.io / Render — free tiers work). Set `ANTHROPIC_API_KEY` there.

After that: merging to `main` ships an OTA update automatically; tagging `v1.x.x` builds and submits to TestFlight automatically.

## Architecture notes

- **API key safety**: the Anthropic key lives only on the server. The app talks to `server/`, never to Anthropic directly.
- **RTL**: layout direction follows the selected language (`I18nManager`), applied at startup; switching language in Settings prompts a reload.
- **Local-first**: profile, meals, and workouts persist on-device (AsyncStorage). A cloud backend (accounts, sync) is a later phase.
- **Demo mode**: `src/lib/api.ts` returns mock results when `EXPO_PUBLIC_API_URL` is unset, so the app is fully testable without any backend.

## Roadmap

- [x] Phase 1 — Onboarding + TDEE, meal scan → log, gym equipment scan, AR/EN + RTL, dashboard
- [ ] Phase 1.5 — Barcode scan (Open Food Facts), meal history & weekly view
- [ ] Phase 2 — Apple Health / HealthKit (read activity, write nutrition)
- [ ] Phase 3 — Whoop API, recovery-aware daily targets
- [ ] Phase 4 — Accounts + sync (Supabase), subscriptions (RevenueCat + web checkout)

### Validation gates (decided up front)

- **Gate 1 (TestFlight beta):** ≥2 scans/user/day in week 1, D7 retention ≥ 20% → continue.
- **Gate 2 (soft launch):** free→paid ≥ 3%, CAC < $15 → scale.
