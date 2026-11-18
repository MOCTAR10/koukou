# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

This app targets **Expo SDK 54** (Expo Go in stores was stuck on a newer SDK until 57 was approved; SDK 55+ won't run in store Expo Go). Do not bump to newer SDK docs unless the SDK version is deliberately upgraded.

## Simple mode (jury lot 3)

- Account experience is `useUiMode()` (`src/hooks/`): server `uiMode` first, fallback « ELEVEUR link or global role = SIMPLE ». Never recompute it ad hoc.
- SIMPLE UI lives in `src/components/simple/`: home, tab bar (Accueil / Moi) and flows are swapped in `(tabs)/index.tsx`, `menu.tsx`, `_layout.tsx` and `CustomTabBar`. A change to COMPLET screens must not touch it. No statistics in SIMPLE mode.
- Simple entry flows write ONE field through `queueDailyEntry` via `buildSimplePayload`; the day's existing entry travels as `withEntryBase`. Never send the whole day's entry from them.
- Flows run in a full-screen `Modal` (`SimpleFlowModal`), not in routes. The session store (`simpleSession.ts`) is read with `useSyncExternalStore`.
- Voice goes through `src/voice/speak.ts` only (`speak` always, `announce` honours the device setting `koukou.simple.voice`); it never throws. `expo-speech` is a native module (new APK needed, no `app.json` plugin).
- Rules: pictograms from `simple/pictos/Pictos.tsx`, touch targets ≥ 64 dp, one question per screen, every spoken sentence in `SENTENCES`.
- `pickDeclarationPhotos` (`DeclarationExtras.tsx`) is the shared photo picker; `capture/feed-phase.ts` holds the feed-phase rules shared by the daily sheet and the simple flows.
- Open: « Appeler » button (no phone data in the app), voice notes in `ProblemFlow`, cares needing treatment details fall back to `CompleteCareSheet`, « Vendre » opens the full `/pos`.
