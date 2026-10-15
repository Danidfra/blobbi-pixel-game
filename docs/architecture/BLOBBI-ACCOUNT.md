# Seamless entry today, and a future Blobbi Account

M11D.8 design note. Nothing here is built: no account service, no signer, no backend, no cross-origin key sharing.

## 1. What seamless entry can do today

- **On the same browser and origin**, a returning CONNECTED player enters their island directly with their Blobbi
  (`src/game/world-entry.ts`). "Connected" means an identity that is really here: one this game keeps (its key
  sealed in the IndexedDB vault, restored or registered here) or a browser extension (NIP-07) that answers with the
  account's own key on this page load (M11D.8.2: another key, no answer or no extension never enters).
- The current Blobbi is read from the owner's public kind 11125 profile (`docs/architecture/CURRENT-BLOBBI.md`), so a
  Blobbi chosen in Standalone is offered in Pixel. Reading needs no permission and no signature.
- **A new browser** needs one explicit step: connect the extension, or restore the identity from its backup (Recovery
  Key or Protected Key). After that, the same seamless entry applies.

## 2. What is impossible without cross-application authentication

- A link such as "Visit Blobbi Pixel" from another app cannot sign the player in. A public key, a URL parameter or a
  published profile proves nothing about who is at the keyboard; Pixel never treats them as a session.
- Each origin has its own storage: a key kept by one app's vault is invisible to another app, by design. No private
  key ever travels between apps or in a URL.
- With a NIP-07 extension the player is "signed in everywhere" already (the extension holds the key); without one,
  every app needs its own connect or restore step.

## 3. How a future Blobbi Account could integrate

The account would be a signer the player approves once per app, never a shared secret:

1. Pixel shows "Connect with Blobbi Account". The account (its own origin) asks the player to approve Pixel, with
   scoped permissions: read public key, sign kind 31124 for Blobbis, sign kind 11125, sign kind 1124. Nothing else.
2. Pixel keeps only a revocable session (for example a NIP-46 client key and the account's pubkey), never the key.
3. Seamless entry then works exactly as today: the session is the "identity really here", the current Blobbi is
   read from 11125, signing goes through the account with its permission prompt or standing grant.
4. The account page lists connected apps, what each may sign, and a revoke button; backups are made there.

Pixel's code is ready for this shape: identity checks go through one place (`account.snapshot()` method and
`present`), signing through one adapter (`accountSigner`), publishing through one publisher.

## 4. Approaches to evaluate

- **NIP-07** (browser extensions such as Alby, nos2x): works today; not friendly for children or phones.
- **NIP-46** (Nostr Connect / remote signer, "bunker"): the leading candidate for a Blobbi Account. Per-app client
  keys, permission strings per kind, revocation. Needs a signer service the player trusts.
- **NIP-55** (Android signer apps such as Amber): native on Android.
- **NIP-49** (encrypted key export): already used for the Protected Key backup; a recovery format, not a session.
- **NIP-98** (HTTP auth) only if a backend is ever added; not needed for relays.

## 5. Keeping onboarding simple without weakening security

- Guest first: play without any account; the identity is made and sealed on the device, and explained later.
- Ask for permissions in the player's words ("Pixel may save Pudding's progress"), per kind, revocable.
- Never blanket-trust Blobbi domains: every app, first party or not, is approved by the player, one by one.
- Separate the steps a player can see: being recognized (read only), reading public data, signing in, signing,
  publishing (always with consent). Seamless entry only ever uses the first two plus a session that already exists.
- Never put keys in links, never import keys silently from another app. A choice is published only when the player
  makes it (companion sync, CURRENT-BLOBBI.md §6): never on load, never by an automatic entry, never to copy another
  app's choice back.
