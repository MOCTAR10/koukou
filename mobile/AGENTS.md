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
- Open: « Appeler » button (no phone data in the app), cares needing treatment details fall back to `CompleteCareSheet`, « Vendre » opens the full `/pos`.

## Voice notes (jury lot 4)

- `components/voice/VoiceNoteRecorder` records mono 16 kHz AAC 32 kbit/s `.m4a` (about 4 KB/s, hard stop at 120 s; 3 MiB and 2 notes max, rules in `poufa/voice-note.ts`). It calls `stopSpeaking()` first and stops on background or unmount.
- `expo-audio` is a native module with an `app.json` plugin (`microphonePermission`): a new APK is needed, not an OTA.
- The queue's `HealthEventOpPayload.audio` is optional (old ops replay). Notes are copied by `offline/audio-files(.native)` into `koukou-audio` and uploaded after the photos, with the same failure semantics as photos.
- Listening goes through `StoredVoiceNote` (`components/voice/VoiceNotePlayer`): the note is downloaded with the Authorization header into the cache (`voice/audio-cache.native.ts`) and played from the local file.
- The simple « Problème » flow has an optional `voice` step between the count and the photos (`SENTENCES.problemeVoix`).

## Delegated entry (jury lot 5)

- A technical agent (INSTITUTION) enters for the farmer only through `poufa/fermia-access.ts#delegatedEntry` (codes `saisie:creer` / `sanitaire:signaler` of `/farms/:id/me`, exposed as `useFarmProfile().delegated`); every other Fermia write stays blocked by `fermiaReadOnly`.
- Screen `app/saisie-deleguee.tsx` works on the active farm and reuses the simple flows via `SimpleFlowModal onBehalfOf`; `DelegationContext` (SimpleParts) shows the permanent « Vous saisissez pour le compte de … » banner. Tiles: `poufa/delegated-entry.ts#delegatedActions`; offline gating: `delegatedBlock`.
- Automatic read-out is off there (`setAnnounceSilenced`); taps use `cue`, the speaker button still `speak`s.
- Server marking (`enteredOnBehalf`, `enteredByName`, `enteredByProfile`, type `OnBehalfMark`) is shown by `components/OnBehalfBadge`.
- `hooks/farm-access.ts#profileFetchState` keeps the cached `/me` after a network-failed refresh (never after a 4xx), so permission codes survive offline; the screen prefetches the day's entries of every open band online.
