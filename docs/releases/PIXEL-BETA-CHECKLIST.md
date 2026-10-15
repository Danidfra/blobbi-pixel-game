# Blobbi Pixel: public beta checklist

Written in M11D.6 ([milestone](../milestones/M11D6.md)), 2026-10-13; reviewed in the [release audit of 2026-10-15](RELEASE-AUDIT-2026-10-15.md). **The beta is NOT ready to release**: the
release blockers in §16 are open. Update a row only with evidence (a person's manual test, a log, a link).

Status words:

- **PASS**: checked, with the evidence named in the row.
- **FAIL**: checked and wrong.
- **NOT TESTED**: not checked by a person yet. Automated tests passing do not make a manual row PASS; they are listed
  as "auto" in the evidence column.
- **BLOCKED**: cannot be checked until something else happens (named in the row).

## 1. Core gameplay

| Item | Status | Evidence |
|---|---|---|
| Main menu: continue, new adventure (with its confirmation), several islands, delete asks first | PASS | Owner's manual test after M11D.5 (menu, islands, save protection) |
| Egg and birth cinematic | PASS | Owner's manual test after M11D.5 |
| Baby look, and it stays a Baby through island growth | PASS | Owner's manual test after M11D.5; auto `tests/m11d5.test.ts` |
| Naming after birth | PASS | Owner's manual test after M11D.5 |
| The first 30 minutes (quests, tools, building, farming) on a fresh island in this build | NOT TESTED | auto: quests, tutorial, building, farming suites |
| Baby shadow, Baby tools, V1/V2 world forms, departure and arrival | NOT TESTED | auto `m11d1-baby`, `m11d2`, `m11d5` |
| Fishing, canoe, ocean | NOT TESTED | auto suites; M10 manual plan |

## 2. Nostr account

| Item | Status | Evidence |
|---|---|---|
| Login with an existing account (browser extension, read-only) | PASS | Owner's manual test after M11D.5 |
| MY BLOBBIS lists the account's canonical Blobbis from the relays | NOT TESTED | auto `m11c-blobbis`; now read from three relays |
| Registering a Blobbi never replaces a connected extension account | NOT TESTED | auto `m11d6`; manual PUB-06 |
| Remote signers (NIP-46), mobile signers | BLOCKED | Not implemented (KI-93) |
| The extension's account verified on each page load; another key never enters an island (M11D.8.2) | NOT TESTED | auto `m11d8-2-extension`; manual EXT-02 |
| The current Blobbi set in Ditto is found in Pixel (kind 11125) | PASS | Owner's manual test with real events, 2026-10-15 (M11D.8.2) |
| Seamless entry: reload inside an island, MAIN MENU kept, CONTINUE | PASS | Owner's manual test, 2026-10-15 (M11D.8) |
| The most recent explicit choice wins; same result on every load (M11D.8.3, M11D.8.4) | NOT TESTED | auto `m11d8-3-selection`, `m11d8-4-startup`, browser checks; manual START-01..06 |

## 3. Canonical publishing

| Item | Status | Evidence |
|---|---|---|
| Events built only with the kit; V3 look from (owner, d); no explicit seed | PASS (auto) | `m11d4`, `m11d6`, live-check dry run |
| Read-back policy (two relays, relay.ditto.pub required), partial and failed states, retries without duplicates | PASS (auto) | `m11d6`: in-memory relays and a local relay through Nostrify |
| Publishing to the real relays with a disposable identity | PASS | Approved and run 2026-10-14: acks and read-back on all three relays, discovery by the Standalone's query, idempotent on a fresh device (M11D.6 §5a, `examples/m11d6/live-run-2026-10-14.txt`) |
| Standalone shows a Pixel-published Baby as the same Blobbi | NOT TESTED | Its discovery query and the kit's parsing PASS against the real relays; a person must still open the test npub in the Standalone app (PUB-03) |
| Live publishing enabled in the release build (`VITE_BLOBBI_PUBLISH=live`) | BLOCKED | Owner's decision after PUB-01..04 |
| A real player's share end to end (PUB-04..06) | BLOCKED | Needs a live build |

## 4. Backup and restore

| Item | Status | Evidence |
|---|---|---|
| Both backups offered; check is mandatory before sharing | PASS | Owner's manual test after M11D.5; auto |
| Restore in a different browser, recognized as the same character | PASS | Owner's manual test after M11D.5 |
| After a restore, CONTINUE leads to playing (islands, or a new adventure) | NOT TESTED | auto `m11d6`; browser check PASS; manual REST-01..03 |
| A Pixel Recovery Key file opens in Blobbi Standalone | NOT TESTED | Format checked by reading Standalone's code; under its 4 KB limit (auto) |
| A Pixel Protected Key (NIP-49) file opens in Blobbi Standalone | FAIL | Standalone has no NIP-49 support yet (M11D.6 §10) |

## 5. Browsers

| Item | Status | Evidence |
|---|---|---|
| Chrome (desktop) | NOT TESTED | Headless Chrome checks only (auto) |
| Firefox, Safari (desktop) | NOT TESTED | IndexedDB and Web Crypto are required for identities |
| Private browsing (no persistent IndexedDB) | NOT TESTED | The game must refuse to make an identity and say why (`create.identityFailed`) |

## 6. Mobile

| Item | Status | Evidence |
|---|---|---|
| Phone layouts of the account flow and restore | NOT TESTED | Headless screenshots at 844x390 only |
| Text fields through the phone keyboard (name, password, paste) | NOT TESTED | KI-95 |
| Saving and loading a backup file on iOS and Android | NOT TESTED | |

## 7. Save migration safety

| Item | Status | Evidence |
|---|---|---|
| Records from M11D.4/5 practice runs read as practiced, not registered (nothing rewritten) | PASS (auto) | `m11d6` |
| Islands and saves from earlier builds load | NOT TESTED | auto `save-reliability`, `migration-m8` |
| Upgrading a browser that has real data (the owner's) | NOT TESTED | Do it on a copy of the profile, never by clearing storage |

## 8. Performance

| Item | Status | Evidence |
|---|---|---|
| Frame time on a mid-range laptop and a phone | NOT TESTED | `docs/testing/perf/` history; nothing measured in M11D.6 |
| Bundle size (one chunk over 500 kB after minification) | NOT TESTED | Build warning, unchanged |

## 9. Audio lifecycle

| Item | Status | Evidence |
|---|---|---|
| Music starts only after a gesture, stops with mute, and nothing plays from hidden tabs left by checks | PASS (auto/harness) | M11D.5 muted lab browser, used again in M11D.6; nothing left running |
| Audio after backgrounding the tab on phones | NOT TESTED | |

## 10. Accessibility

| Item | Status | Evidence |
|---|---|---|
| Reduced motion (the account flow, the portraits, the birth) | NOT TESTED | auto `m11d1-intro`, `audio` |
| Keyboard-only play and every account page | NOT TESTED | auto (key handling) |
| Text size and readability | NOT TESTED | auto `readability` |
| Screen reader | BLOCKED | The game is drawn on a canvas; only a few page labels exist |

## 11. Localization

| Item | Status | Evidence |
|---|---|---|
| English, Brazilian Portuguese, Spanish: every key present, no em dash in new copy | PASS (auto) | `i18n`, `m11d6` |
| A native reader of each language checks the account and restore pages | NOT TESTED | |

## 12. Production security headers

The production page carries a `<meta>` CSP (`vite.config.ts`): scripts and styles only from the page's origin, no
eval, WebSockets only to the three relays, no plugins, no form posts. A `<meta>` CSP cannot do everything; the host
must also send these HTTP headers:

| Header | Value | Status |
|---|---|---|
| Content-Security-Policy | the same policy as the meta, plus `frame-ancestors 'none'` | NOT TESTED (no host yet) |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | NOT TESTED |
| X-Content-Type-Options | `nosniff` | NOT TESTED |
| Referrer-Policy | `no-referrer` | NOT TESTED |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` | NOT TESTED |

## 13. Hosting

- Static files over **HTTPS only** (Web Crypto and IndexedDB identities need a secure context).
- One stable origin forever: the key vault and every save belong to the origin. Moving the game to another domain
  leaves players' identities behind (they would need their backups).
- No analytics or third-party scripts (the CSP would block them; the threat model assumes none).
- Built with the publish mode decided by the owner (`VITE_BLOBBI_PUBLISH`); never a development server.

## 14. Known limitations (see [KNOWN-ISSUES](../testing/KNOWN-ISSUES.md))

- Keys live in the browser: a script running in the page (an XSS, a malicious extension) could sign or export with
  them. The CSP narrows this; it does not remove it.
- A Recovery Key file is the account in plain text.
- Islands are only on the device; there is no island sync (and the game does not promise it).
- Protected Key files do not open in Standalone yet.
- A bare nsec restore cannot name its Blobbis (they are found again only through the account's relays later).

## 15. Manual testing still required

Everything marked NOT TESTED above, plus the M11D.6 table (PUB, REST, STAT, INV) and the earlier milestone tables in
the [manual test plan](../testing/MANUAL-TEST-PLAN.md).

## 16. Release blockers

1. **Standalone's own screen** showing the disposable test Blobbi (PUB-03): reported working by the owner during M11D.7 (Pudding found in Standalone) but never recorded; to be confirmed and recorded. The live publication itself passed (PUB-01..02).
2. **A real share in a live build** (PUB-04..06) has not been run; live publishing is off.
3. **Hosting**: HTTPS origin and the headers of §12 do not exist yet.
4. **Browser and phone coverage** (§5, §6): no real Firefox, Safari, iOS or Android test.
5. **The owner's decision on Protected Key interoperability** (FAIL in §4): ship with a clear note, or wait for
   NIP-49 in Standalone.
