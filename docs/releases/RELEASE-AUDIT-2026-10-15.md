# Release audit, 2026-10-15 (after M11D.8 to M11D.8.4)

A cleanup and readiness review before pushing the local commits. No gameplay change, no new publishing, nothing
pushed or deployed. Decisions remain the owner's.

## 1. Repository state

- Branch `develop`, working tree clean, 17 commits ahead of `origin/develop` (M11D.7 consent page to M11D.8.4) plus
  the audit commit. Nothing generated is tracked: `dist/`, `out/`, `node_modules/` and the lab browser's profile
  (`.lab-browser-profile/`, `.lab-browser.json`) are ignored.
- Evidence kept in the repository on purpose: `examples/m11d8*/` (browser check results and screenshots made with
  disposable keys; the hexadecimal values in them are derived visual seeds, not keys) and the browser check scripts
  (`scripts/m11d8*-browser.ts`; development only, never bundled).
- Secrets: no `nsec`, `ncryptsec`, `.env`, `.pem` or key file in the history added since `origin/develop`. The two
  fixed public keys in tests are public test vectors already pushed in M3.4 and M11B (the NIP-19 example key and a
  widely published key), used read only.

## 2. Security review

| Area | Finding |
|---|---|
| Keys | Sealed in the IndexedDB vault; never logged (no console line touches key material), never stored in the account record (its fields are checked), never in a URL. |
| Backups and restore | Unchanged since M11D.7; restore adopts the identity only when the account is a guest (never replaces a connected account). |
| NIP-07 | Connect asks for the public key only; on each page load the remembered account is verified (`verifyExtension`); a different key, no answer or no extension never enters an island and is never switched silently. Signing happens only in the consented share flow and refuses an event signed by another key. |
| Relay data | Every relay event is signature checked by the relay client (Nostrify's default `verifyEvent`); the current-Blobbi resolver checks every event again itself, plus author, Blobbonaut validity and the owner's own `d` prefix. |
| Kinds 11125 and 31124 | Parsed with the kit; no Pixel-specific format; read only. |
| Automatic entry | Imports readers only; no publisher, signer or EVENT reachable (tests pin it; every browser check counts zero EVENT frames). |
| Saves and identities | An island is entered only when its last visitor is one of the verified identity's Blobbis; island saves never name a Blobbi and are never written by entry or selection (tested by bytes). |
| Publishing | One path: the share flow after consent. Rehearsal unless the BUILD says `VITE_BLOBBI_PUBLISH=live`; the `#publish=live` page flag works on a development server only. No `.env` exists. |
| Entry diagnostic | One fixed key (`blobbi-pixel-lab:entry-diagnostic`), overwritten on each entry (bounded); holds decision, reasons, times and counts only, no key, address or name (tested). |
| Test hooks in production | The dev handle (`__blobbi`) and the browser checks' relay switches are absent from the production bundle (checked in `dist/`). The relay reader's injectable connection is a small, unused-in-production option. |

Non-blocking notes: MY BLOBBIS and the restore search rely on the relay client's signature check rather than a second
one of their own (the resolver does both); keys in the browser remain exposed to a script running in the page (CSP
narrows it).

## 3. Visual consistency (Boca rosa's colour)

Not confirmed as a bug. Pixel's V3 path follows the kit's contract exactly: the seed is the kit's
`deriveBlobbiV3Seed(owner, d)` (`src/blobbi/source.ts`), the genome is the kit's `generateGenome`, and the sprite is
the kit's own SVG (`renderBlobbiSvg`) rasterized with the kit's palette (`derivePalette`); Pixel adds only a darker
one-pixel outline and turns gradients into bands of the kit's own stop colours. Pixel, Ditto and Standalone have the
same kit versions installed locally (core 0.9.0, renderer 0.6.0). A new test pins this
(`tests/blobbi-colour-contract.test.ts`: same seed and genome colours as the kit; an adult's main body colour on the
kit's body gradient; a baby's main body colour with the kit's baby hue; a V1/V2 world form keeps its event's colours).

Likely causes of a perceived difference, all presentation: day and night lighting tints the whole frame (warmer in the
evening, darker at night); banded gradients and the small size read differently from Ditto's smooth vector drawing;
a baby is drawn with the kit's BABY palette, a little different from the adult's; a V1/V2 Blobbi appears in its
temporary world form. Left as a manual check: compare Boca rosa at midday in Pixel with Ditto's picture, noting its
stage and generation.

## 4. Readiness

| Target | Verdict | Blocking | Next action |
|---|---|---|---|
| A. Push to the private GitHub repository | **GO** | None | The owner approves the push of `develop` (18 commits). |
| B. Restricted preview (invited testers) | **GO with conditions** | Build in rehearsal mode (no `VITE_BLOBBI_PUBLISH`); HTTPS on its own permanent origin; testers told that islands live in that browser only | Deploy a rehearsal build to a private HTTPS origin, run the manual checklist there (M11D.8.4 §9, M11D.8.3 §11). |
| C. Public beta | **NO-GO** | The checklist's §16 blockers (a real live share, hosting headers, Firefox, Safari and phone coverage, the Protected Key decision); PUB-03 confirmation; the pending manual rows of M11D.8.2 to M11D.8.4 | Close §16 one by one, starting with hosting and browser coverage. |

## 5. Summary for the owner

- **Implemented**: guest-first play with a sealed identity; NIP-07 login (read only, verified per load); two backups
  and restore; consented canonical sharing (rehearsal by default); MY BLOBBIS; the current Blobbi from kind 11125
  (Ditto and Standalone); seamless world entry with a loading page; the most recent explicit choice wins between the
  device and the other worlds; an entry diagnostic.
- **Manual tests completed** (owner): M11D.7 live share and restore; M11D.8 reload, MAIN MENU and CONTINUE; M11D.8.2
  loading page, extension login and Ditto's companion found (real events).
- **Pending**: M11D.8.2 slow network, switched and locked extension, offline; M11D.8.3 SEL-02 to SEL-10; M11D.8.4
  START-01 to START-06; PUB-03 confirmation; the older milestone tables marked NOT TESTED.
- **Nostr publishing**: only the share flow, only with consent, only live in a live build; automatic entry, selection,
  MY BLOBBIS and restore never publish. A choice made in Pixel is not visible to other apps.
- **Local saves**: islands live in this browser's storage on this origin, never published, never tied to a Blobbi;
  the selection, visits, entry choice and diagnostic are small separate records.
- **Security assumptions**: a trusted HTTPS origin with the CSP and headers of the checklist; no third-party scripts;
  the player's browser and extensions are not compromised; relays are untrusted and checked.
