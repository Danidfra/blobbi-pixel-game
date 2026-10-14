# Account creation inside the game (M11C.5, DESIGN)

**Status: INVESTIGATION + PROPOSAL (M11C.5); a guest account flow is IMPLEMENTED in [M11D.4](../milestones/M11D4.md); the two backups (Recovery Key nsec / Protected Key NIP-49), naming and the new look in [M11D.5](../milestones/M11D5.md)** (reserved identity, verified NIP-49 backup, consent, registration; live publishing off). Nothing is implemented: no key generation, no nsec import, no secret storage.
Today the game only connects an existing browser extension (NIP-07) read-only ([M11B](../milestones/M11B.md)).
Facts are **VERIFIED** (path given) or **PROPOSED**.

## 1. What a "Nostr account" is, for a player who knows nothing about Nostr

One secret key (nsec) is the account. Whoever has it **is** the player, everywhere; nobody can reset it; losing it
loses the account and every Blobbi it owns. Any design must make that understandable without the word "Nostr" on the
first screen, and never pretend the browser is a safe place for it.

## 2. How the sister apps do it (VERIFIED)

- **nostr-pet**: `createNewAccount` = nostr-tools `generateSecretKey` (`src/features/onboarding/new-account.ts:26-32`);
  the nsec stays in screen state until the player confirms a backup (copy, download
  `blobbi-nostr-key-backup-<npub8>.txt`, or write down; a required "I saved my secret key" box,
  `KeyScene.tsx:1-25, 118`); then `NLogin.fromNsec` with `NostrLoginProvider storageKey="nostr:login"`
  (`src/App.tsx:95`), which **persists the nsec in localStorage** (`@nostrify/react/dist/login/NostrLoginProvider.js:19`).
  Also NIP-07, NIP-46 `bunker://` and `nostrconnect://` QR (`src/hooks/useLoginActions.ts:35-58`), nsec paste/file.
  Guest mode reserves a key up front, stored in `blobbi:guest:v1` (`src/features/guest/guest-store.ts:1-44`).
- **blobbi-island**: `generateSecretKey` → `nsecEncode` → download step → `login.nsec`, same provider
  (`src/components/auth/SignupDialog.tsx:28-90`, `src/App.tsx:68`).

## 3. Options

| Option | For whom | Safety | Mobile | Notes |
|---|---|---|---|---|
| **NIP-07 extension** (done) | people with Alby, nos2x, Brave... | key never touches the game | desktop only (few mobile browsers) | read-only today |
| **NIP-46 remote signer** (bunker, `nostrconnect://` QR) | Amber (Android), nsec.app, nsecBunker | key stays in the signer app | good on Android; iOS via web signers | needs a game-made **session key** (not the account) and kind 24133 request events on a relay: needs the owner's approval (M11B KI-64) |
| **Key made in the browser** | complete beginners | weakest: localStorage is readable by any script on the page; lost when site data is cleared; Safari may evict script-written storage after 7 days without a visit (ITP) unless installed to the home screen | works everywhere | only with a forced backup step; the browser copy is a convenience, **never** the recovery |
| **nsec import (paste)** | people moving from another app | trains players to paste secrets into websites (phishing pattern) | awkward | recommend against offering it by default |
| **Password-encrypted key (NIP-49 `ncryptsec`)** | backup file | the backup is useless without the password | fine | pair with browser-made keys: the downloaded backup is an ncryptsec |
| **Passkey-wrapped key (WebAuthn PRF)** | future | key encrypted by a device passkey | support varies by browser | promising; not mature enough to depend on |

## 4. Recommended UX (PROPOSED)

1. **Keep "Play as guest" the default.** Accounts are offered by the M11C.5 invitation and the ACCOUNT page only.
2. ACCOUNT offers, in this order: **"I have a Blobbi account"** (extension; signer app via QR on phones, once NIP-46 is
   approved) and **"Create one here"**.
3. Create one here:
   - one screen of plain words: "Your account is a secret key. It lives on this device. If you lose this device or
     clear the browser, only your backup can bring it back. Nobody, not even us, can recover it.";
   - make the key; show only the public name/npub;
   - **backup before anything else**: download an encrypted backup (NIP-49, the player picks a password) and/or copy
     the secret, then a required "I saved my backup" box; offer "Remind me later" only for play, never for
     registering a Blobbi (registration requires a confirmed backup);
   - the browser keeps the key for convenience, labelled "kept in this browser"; ACCOUNT later shows "Back up again"
     and "Move to a signer app" (export to Amber or nsec.app; then the game forgets its copy).
4. Never: a key without a backup step before anything is published; claiming browser storage is a backup; auto-
   creating an account; showing the nsec in screenshots/logs; sending it anywhere.

## 5. Signer migration (PROPOSED)

From a browser-made key to a signer app: show the backup or a one-time QR of the ncryptsec; the player imports it
into the signer; the game switches to NIP-46 and erases its own copy (with a confirmation). The npub is unchanged, so
every Blobbi stays the player's.

## 6. Account loss (risks)

Cleared site data, a lost phone, Safari eviction, a shared computer, malware or an injected script reading
localStorage, a player screenshotting the secret. Mitigations: the encrypted backup, reminders on ACCOUNT (never
nagging during play), "Move to a signer app", a strict Content Security Policy before shipping secret storage, and a
security review.

## 7. Open decisions (owner)

1. Allow secret keys in the browser at all (needed for "create one here" and for guest key reservation)?
2. NIP-46 now (session key + relay requests)?
3. Offer nsec import, or only signer apps and extensions?
4. Backup format: NIP-49 file, copy, or both?

## 8. Implementation order (after approval)

1. NIP-46 connect (no secret of the player's in the game).
2. Create-in-game with the forced encrypted backup; key store module confined to `src/nostr/`; the boundary test
   rewritten to allow exactly that module, nothing else.
3. Move-to-signer flow. 4. Only then registration ([guest identity](GUEST-BLOBBI-IDENTITY.md) §4).

## 9. Manual test checklist (future, all NOT TESTED)

ACCN-01 a beginner creates an account without help; ACCN-02 the backup restores it in another browser; ACCN-03 clearing
site data without a backup shows the honest loss message; ACCN-04 move to Amber keeps the npub; ACCN-05 phones.
