# Movie Poll

A cloud-backed movie voting app. Create a poll, nominate movies, and rank them — no account, no sign-up form, shared state lives in Firebase.

## How it works

1. **Create a poll** — you get a 6-character code and a shareable link/QR code
2. **Everyone nominates** — each participant searches [TMDB](https://www.themoviedb.org/) and picks one movie
3. **Everyone votes** — rank the nominations in order of preference
4. **See the winner** — [instant-runoff voting](https://en.wikipedia.org/wiki/Instant-runoff_voting) determines the result

No sign-up required. The host controls phase transitions (nominations → voting → results). Voting closes automatically once all participants have submitted a ballot.

## Architecture

The app is a client-side SPA backed by Firebase:

- **Anonymous Authentication** — every visitor is signed in anonymously; the issued uid is their identity in every poll.
- **Cloud Firestore** — one document per poll (`polls/{code}`) plus `participants`, `nominations` and `ballots` subcollections, one document per user. Clients subscribe to live updates.
- **Security rules** (`firestore.rules`) — all authorization is enforced server-side by Firestore, not by hiding buttons in the UI:
  - only the host can advance the phase, one step at a time;
  - users can only join/rename/leave as themselves;
  - nominations and ballots can only be written by their owner, only during the matching phase, and nominations are capped by the poll settings;
  - only the host can remove a participant (which also removes their nominations and ballot).

The rules are tested against the Firestore emulator (`rules-tests/`), which verifies each forbidden action is actually rejected.

## Tech stack

| | |
|---|---|
| [Vite](https://vite.dev/) + [React](https://react.dev/) | Build tooling and UI |
| [Firebase](https://firebase.google.com/) (Auth + Firestore) | Identity, storage and realtime sync |
| [TMDB API](https://developer.themoviedb.org/) | Movie search, posters, metadata |
| [Tailwind CSS](https://tailwindcss.com/) | Styling |

## Development

```sh
npm install
npm run dev
```

The dev server expects a Firebase project; copy its web app config into
`src/lib/firebaseConfig.ts`. To run fully locally instead, start the
emulators and opt into them:

```sh
npx firebase emulators:start          # Firestore on :8080, Auth on :9099
VITE_USE_FIREBASE_EMULATOR=1 npm run dev
```

```sh
npm run test         # unit tests
npm run test:rules   # security-rules tests against the Firestore emulator
```

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via the included Actions workflow.

To deploy manually:

```sh
npm run build   # outputs to dist/
```

The security rules are deployed from `firestore.rules` (`firebase deploy --only firestore:rules`, or paste them in the Firebase console).
