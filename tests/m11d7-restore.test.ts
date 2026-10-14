// M11D.7, A RESTORED IDENTITY STAYS THE PLAYER'S. The bug: an incognito browser restored the identity that owns
// Pudding from its raw nsec, WELCOME BACK said so, and the new adventure then hatched Tofu under a brand-new identity
// (SETTINGS > ACCOUNT: "Play freely without an account"). The vault kept the restored key, but nothing used it: no
// account adopted it, no Blobbi of it was looked for, so NEW ADVENTURE reserved a fresh guest identity.
//
// Here, as `main.ts` wires it: the restore makes the identity the account (unless ANOTHER account is connected), its
// shared Blobbis are read back from (fake, offline) relays before CONTINUE, Pudding is offered as the companion, a
// reload remembers it all, and nothing is ever sent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { KeyVault, memoryVaultBackend, type VaultBackend } from '../src/nostr/keystore';
import { IdentityService } from '../src/nostr/identity';
import { NostrAccount } from '../src/nostr/account';
import { memoryRelay, relayGroup } from '../src/nostr/publisher';
import { PUBLISH_RELAYS, READ_RELAYS } from '../src/nostr/relay-config';
import { babyStateTemplate, canonicalD } from '../src/nostr/canonical-events';
import type { BlobbiReader } from '../src/nostr/relays';
import type { PublicKeySigner } from '../src/nostr/signer';
import { guestBlobbi, readGuestBlobbis, updateGuestBlobbi } from '../src/game/guest-blobbis';
import { memoryStore, type KeyValueStore } from '../src/game/persistence';
import { IdentityScreen } from '../src/ui/screens/identity';
import { SettingsScreen } from '../src/ui/screens/settings';
import { t as tr } from '../src/i18n';
import { TitleScreen, type TitleAccount } from '../src/ui/title';
import { GameUI } from '../src/ui/game-ui';
import { Gfx } from '../src/ui/gfx';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { setLocale } from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';

const PASSWORD = 'bubbles and stars';
const PET = 'a1b2c3d4e5';
const noSleep = async () => {};

afterEach(() => {
  vi.restoreAllMocks();
  setLocale('en');
});

/** A disposable owner and its Pudding, as shared out there: the kit's canonical V3 Baby event, signed by the owner. */
function pudding(name = 'Pudding') {
  const sk = generateSecretKey();
  const owner = getPublicKey(sk);
  const event = finalizeEvent(babyStateTemplate({ owner, petId: PET, name, bornAt: 1_760_000_000 }, 1_760_000_100), sk);
  return { sk, owner, d: canonicalD(owner, PET), event, nsec: nsecEncode(sk) };
}

/**
 * Relays that hold some events (offline fakes). Like a careless relay they hand back whatever they hold, whoever
 * wrote it; `hang` never answers (a timeout), `reachable` how many relays answered.
 */
function fakeRelays(events: NostrEvent[], o: { hang?: boolean; reachable?: number } = {}) {
  const asked: string[] = [];
  const state = { ...o };
  const reader: BlobbiReader = {
    readBlobbis: (pubkey, relays) => {
      asked.push(pubkey);
      if (state.hang) return new Promise(() => {});
      return Promise.resolve({ events: [...events], reachable: state.reachable ?? relays.length });
    },
  };
  return { reader, asked, state };
}

const noSigner: PublicKeySigner = { available: () => false, getPublicKey: () => Promise.reject(new Error('not available')) };
const extension = (pubkey: string): PublicKeySigner => ({ available: () => true, getPublicKey: async () => pubkey });

/** One browser: its storage, vault, account and identity service, wired as `main.ts` wires them. */
function browser(o: { reader?: BlobbiReader; store?: KeyValueStore; backend?: VaultBackend; signer?: PublicKeySigner } = {}) {
  const store = o.store ?? memoryStore();
  const backend = o.backend ?? memoryVaultBackend();
  const vault = new KeyVault(backend);
  const members = PUBLISH_RELAYS.map((url) => memoryRelay({ url, mode: 'live' }));
  const account = new NostrAccount({ store, signer: o.signer ?? noSigner, reader: { readProfile: async () => ({ events: [], reachable: 0 }) }, relays: READ_RELAYS });
  let t = 1_770_000_000_000;
  const svc = new IdentityService({
    store,
    vault,
    publisher: relayGroup(members, 'live'),
    now: () => (t += 1000),
    sleep: noSleep,
    currentAccount: () => account.snapshot().pubkey,
    onRestored: (pubkey) => {
      if (account.snapshot().status === 'guest') account.adoptVaultIdentity(pubkey);
    },
    blobbiReader: o.reader,
    readRelays: READ_RELAYS,
    findTimeoutMs: 40,
  });
  const sent = () => members.reduce((n, m) => n + m.sent.length, 0);
  return { store, backend, vault, account, svc, sent };
}

let world: LiveWorld | null = null;
const islandBehind = () => (world ??= new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16));
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
};

/** The restore through the screen, as the player does it: load, LOOK INSIDE, RESTORE; then the page settles. */
async function restoreOnScreen(b: ReturnType<typeof browser>, text: string, password = '') {
  const ui = new GameUI(islandBehind, () => paletteFor('cozy'));
  const sc = new IdentityScreen();
  const continued: (string | null)[] = [];
  sc.identity = b.svc;
  sc.host = { editText: () => {}, pickFile: () => {}, pasteText: () => {}, download: () => {}, copy: async () => false, walking: () => ({ reserved: null, legacyLocal: false }), bring: () => {}, continueAfterRestore: (d) => continued.push(d), portraitOf: () => null };
  ui.register(sc);
  sc.start('restore');
  ui.open('identity');
  sc.setLoaded(text);
  if (password) sc.setField('backupPassword', password);
  sc.index = password ? 3 : 2; // LOOK INSIDE (after the file, the paste and, for a Protected Key, the password)
  ui.handleKey('Enter');
  await until(() => sc.page === 'restorePreview');
  expect(sc.page).toBe('restorePreview');
  ui.handleKey('Enter'); // RESTORE
  await until(() => sc.page === 'restoreDone' && sc.search?.status !== 'looking');
  expect(sc.page).toBe('restoreDone');
  return { ui, sc, continued };
}

/** What the page wrote (its paragraphs) and its buttons, drawn once. */
function drawn(ui: GameUI) {
  const paras: string[] = [];
  const buttons: string[] = [];
  const para = Gfx.prototype.para;
  const button = Gfx.prototype.button;
  vi.spyOn(Gfx.prototype, 'para').mockImplementation(function (this: Gfx, text, x, ...rest) {
    if (x > 0) paras.push(text);
    return para.call(this, text, x, ...rest);
  });
  vi.spyOn(Gfx.prototype, 'button').mockImplementation(function (this: Gfx, label, x, ...rest) {
    if (x > 0) buttons.push(label);
    return button.call(this, label, x, ...rest);
  });
  ui.render(new PixelBuffer(960, 540), 0);
  vi.restoreAllMocks();
  return { paras, buttons };
}

/** The title as `main.ts` gives it the account and the chosen Blobbi (no saved island in a fresh browser). */
function title(b: ReturnType<typeof browser>, chosen: () => { name: string } | null) {
  return new TitleScreen({
    worlds: () => [],
    current: () => ({ identity: 'none', name: '', saved: false }),
    continueGame: () => {},
    openWorld: () => {},
    settings: () => {},
    account: (): TitleAccount => {
      const s = b.account.snapshot();
      return { status: s.status === 'connected' ? 'connected' : s.status === 'connecting' ? 'connecting' : 'disconnected', name: s.displayName, signerAvailable: s.signerAvailable, method: s.method };
    },
    currentBlobbi: chosen,
  });
}

describe('M11D.7: the Pudding reproduction (a raw nsec in a fresh browser)', () => {
  it('the restored identity becomes the account, Pudding is found and offered, and no second identity is made', async () => {
    setLocale('en');
    const p = pudding();
    const relays = fakeRelays([p.event]);
    const b = browser({ reader: relays.reader });
    const { ui, sc, continued } = await restoreOnScreen(b, p.nsec);

    // The identity is the player's now: connected, kept by this game (no extension), and nothing secret remembered.
    expect(b.account.snapshot()).toMatchObject({ status: 'connected', pubkey: p.owner, method: 'vault' });
    expect(JSON.stringify([...(b.store as ReturnType<typeof memoryStore>).data.values()])).not.toMatch(/nsec1/);
    // Pudding was read back (one look, for this owner only) and is here as the very same Blobbi, already shared.
    expect(relays.asked).toEqual([p.owner]);
    expect(sc.search).toEqual({ status: 'found', others: 0 });
    expect(guestBlobbi(b.store, p.d)).toMatchObject({ owner: p.owner, petId: PET, d: p.d, name: 'Pudding', born: true, named: true, ownerKind: 'guest' });
    expect(guestBlobbi(b.store, p.d)!.activatedAt).not.toBe(null);
    expect(await b.svc.shareStatus(p.d)).toBe('shared');
    // The page says Pudding is back and offers CONTINUE WITH PUDDING.
    const page = drawn(ui);
    expect(page.paras.some((t) => t.startsWith('PUDDING IS BACK'))).toBe(true);
    expect(page.buttons.filter((l) => l !== 'X')[0]).toMatch(/PUDDING/i);
    ui.handleKey('Enter');
    expect(continued).toEqual([p.d]);

    // The title after CONTINUE (main.ts chose Pudding): a new adventure whose companion offered first is Pudding.
    const tt = title(b, () => ({ name: 'Pudding' }));
    tt.afterRestore('Pudding');
    expect(tt.page).toBe('carrier');
    tt.chooseCarrier(0);
    tt.key('Enter'); // CREATE ISLAND
    expect(tt.page).toBe('companion');
    tt.key('Enter'); // the first row: BRING PUDDING
    expect(tt.takeCreate()).toMatchObject({ companion: 'current' });
    // One identity on this device (the restored one), one Blobbi (Pudding), nothing sent anywhere.
    expect((await b.vault.list()).map((i) => i.pubkey)).toEqual([p.owner]);
    expect(readGuestBlobbis(b.store).map((g) => g.d)).toEqual([p.d]);
    expect(b.sent()).toBe(0);
  }, 30_000);

  it('a reload remembers it all: the account, Pudding shared, the backup counted as checked', async () => {
    const p = pudding();
    const b = browser({ reader: fakeRelays([p.event]).reader });
    await restoreOnScreen(b, p.nsec);
    // The same browser, later: everything read back from storage.
    const again = browser({ store: b.store, backend: b.backend, reader: fakeRelays([]).reader });
    expect(again.account.snapshot()).toMatchObject({ status: 'connected', pubkey: p.owner, method: 'vault' });
    expect(again.svc.reserved().map((r) => r.d)).toEqual([p.d]);
    expect(await again.svc.shareStatus(p.d)).toBe('shared');
    expect(await again.svc.backupVerified(p.owner)).toBe(true);
    expect(again.sent()).toBe(0);
  }, 30_000);

  it('no Blobbi shared yet: it says so, and a new Blobbi asks whose it is (the restored identity), never a silent new identity', async () => {
    setLocale('en');
    const p = pudding();
    const b = browser({ reader: fakeRelays([]).reader });
    const { ui, sc, continued } = await restoreOnScreen(b, p.nsec);
    expect(sc.search).toEqual({ status: 'none', others: 0 });
    expect(drawn(ui).paras).toContain(en['identity.restore.noneFound']);
    ui.handleKey('Enter'); // CONTINUE
    expect(continued).toEqual([null]);
    const tt = title(b, () => null);
    tt.afterRestore(null);
    tt.newAdventure();
    tt.chooseCarrier(0);
    tt.key('Enter'); // CREATE ISLAND
    expect(tt.page).toBe('owner'); // the restored identity's, or a new one of its own: the player decides
    expect(tt.takeCreate()).toBe(null);
    expect(b.account.snapshot().pubkey).toBe(p.owner);
    expect((await b.vault.list()).length).toBe(1);
  }, 30_000);
});

describe('M11D.7: a recovery file behaves the same', () => {
  for (const kind of ['recovery', 'protected'] as const)
    it(`a ${kind} key file: the identity becomes the account and its shared Blobbi comes back marked shared`, async () => {
      // The first browser: Pudding was met there, saved, and shared (its event signed by its own identity).
      const first = browser();
      const r = await first.svc.reserve({ kind: 'guest' }, 'island-1');
      if (!r.ok) throw new Error(r.problem);
      updateGuestBlobbi(first.store, r.value.d, { born: true, name: 'Pudding', named: true });
      const file = kind === 'recovery' ? await first.svc.makeRecoveryKey(r.value.owner, ['Recovery']) : await first.svc.makeBackup(r.value.owner, PASSWORD, ['Backup']);
      if (!file.ok) throw new Error(file.problem);
      const shared = await first.vault.sign(r.value.owner, babyStateTemplate({ owner: r.value.owner, petId: r.value.petId, name: 'Pudding', bornAt: r.value.bornAt }, 1_770_000_500));
      // Another browser.
      const b = browser({ reader: fakeRelays([shared]).reader });
      const { ui, sc, continued } = await restoreOnScreen(b, file.value.text, kind === 'protected' ? PASSWORD : '');
      expect(sc.search?.status).toBe('found');
      expect(b.account.snapshot()).toMatchObject({ status: 'connected', pubkey: r.value.owner, method: 'vault' });
      expect(guestBlobbi(b.store, r.value.d)).toMatchObject({ name: 'Pudding', born: true });
      expect(await b.svc.shareStatus(r.value.d)).toBe('shared');
      ui.handleKey('Enter');
      expect(continued).toEqual([r.value.d]);
      expect(readGuestBlobbis(b.store).length).toBe(1);
      expect(b.sent()).toBe(0);
    }, 30_000);
});

describe('M11D.7: when other worlds do not answer', () => {
  it('a timeout: the identity is safe and the account, CONTINUE waits, LOOK AGAIN finds Pudding', async () => {
    setLocale('en');
    const p = pudding();
    const relays = fakeRelays([p.event], { hang: true });
    const b = browser({ reader: relays.reader });
    const { ui, sc } = await restoreOnScreen(b, p.nsec);
    expect(sc.search?.status).toBe('unavailable');
    expect(b.account.snapshot().pubkey).toBe(p.owner);
    expect(b.svc.reserved()).toEqual([]); // nothing made instead
    const page = drawn(ui);
    expect(page.paras).toContain(en['identity.restore.offline']);
    expect(page.buttons.filter((l) => l !== 'X').map((l) => l.toUpperCase())).toEqual([en['identity.restore.retry'], en['identity.restore.continueAnyway'], en['identity.restore.later']].map((l) => l.toUpperCase()));
    // The relays answer again: LOOK AGAIN (the first, primary action).
    relays.state.hang = false;
    ui.handleKey('Enter');
    await until(() => sc.search?.status !== 'looking');
    expect(sc.search?.status).toBe('found');
    expect(guestBlobbi(b.store, p.d)?.name).toBe('Pudding');
    expect(b.sent()).toBe(0);
  }, 30_000);

  it('going on without them is the player\'s choice: CONTINUE WITHOUT THEM, nothing made', async () => {
    const p = pudding();
    const b = browser({ reader: fakeRelays([p.event], { hang: true }).reader });
    const { ui, sc, continued } = await restoreOnScreen(b, p.nsec);
    sc.index = 1; // CONTINUE WITHOUT THEM
    ui.handleKey('Enter');
    expect(continued).toEqual([null]);
    expect(b.svc.reserved()).toEqual([]);
    expect((await b.vault.list()).length).toBe(1);
  }, 30_000);

  it('while the look is under way CONTINUE cannot be pressed', async () => {
    const p = pudding();
    const b = browser({ reader: fakeRelays([p.event], { hang: true }).reader });
    const r = await b.svc.restoreBackup(p.nsec, '');
    expect(r.ok).toBe(true);
    const ui = new GameUI(islandBehind, () => paletteFor('cozy'));
    const sc = new IdentityScreen();
    sc.identity = b.svc;
    ui.register(sc);
    sc.start('restore');
    ui.open('identity');
    sc.go('restoreDone');
    (sc as unknown as { preview: unknown }).preview = r.ok ? r.value : null;
    const look = sc.lookForShared();
    expect(sc.search?.status).toBe('looking');
    const page = drawn(ui);
    expect(page.paras).toContain(en['identity.restore.searchBody']); // M11D.8: the loading page
    await look;
    expect(sc.search?.status).toBe('unavailable');
  }, 30_000);

  it('only some relays answered and nothing turned up: unavailable, never "none"', async () => {
    const p = pudding();
    const b = browser({ reader: fakeRelays([], { reachable: 1 }).reader });
    await b.svc.restoreBackup(p.nsec, '');
    expect(await b.svc.findShared(p.owner)).toEqual({ ok: true, value: { status: 'unavailable', blobbis: [], others: 0 } });
  });
});

describe('M11D.7: what is found, and what is never done', () => {
  it('only the owner\'s canonical V3 Baby is kept; another author\'s event is ignored', async () => {
    const p = pudding();
    const stranger = generateSecretKey();
    // Someone else's newer event with Pudding's d (a careless relay hands it back too).
    const forged = finalizeEvent(babyStateTemplate({ owner: p.owner, petId: PET, name: 'Impostor', bornAt: 1 }, 1_760_000_200), stranger);
    const b = browser({ reader: fakeRelays([p.event, forged]).reader });
    await b.svc.restoreBackup(p.nsec, '');
    const found = await b.svc.findShared(p.owner);
    expect(found).toMatchObject({ ok: true, value: { status: 'found', blobbis: [{ d: p.d, name: 'Pudding', alreadyHere: false }] } });
    expect(readGuestBlobbis(b.store).map((g) => [g.owner, g.name])).toEqual([[p.owner, 'Pudding']]);
    // Looking again keeps the one record (never duplicated).
    await b.svc.findShared(p.owner);
    expect(readGuestBlobbis(b.store).length).toBe(1);
  });

  it('an identity this device does not keep is never looked for', async () => {
    const p = pudding();
    const relays = fakeRelays([p.event]);
    const b = browser({ reader: relays.reader });
    expect(await b.svc.findShared(p.owner)).toEqual({ ok: false, problem: 'not-found' });
    expect(relays.asked).toEqual([]);
  });

  it('another connected account (a browser extension) stays connected: the restore never replaces it', async () => {
    const p = pudding();
    const mine = getPublicKey(generateSecretKey());
    const b = browser({ reader: fakeRelays([p.event]).reader, signer: extension(mine) });
    await b.account.connect();
    expect(b.account.snapshot()).toMatchObject({ status: 'connected', pubkey: mine, method: 'nip07' });
    const { sc } = await restoreOnScreen(b, p.nsec);
    expect(b.account.snapshot()).toMatchObject({ status: 'connected', pubkey: mine, method: 'nip07' });
    // Pudding still comes back (its own identity, kept here), ready to be chosen.
    expect(sc.search?.status).toBe('found');
    expect(guestBlobbi(b.store, p.d)?.owner).toBe(p.owner);
  }, 30_000);

  it('SETTINGS > ACCOUNT for the restored identity: connected, and no "the extension is not here" line', async () => {
    setLocale('en');
    const p = pudding();
    const b = browser({ reader: fakeRelays([p.event]).reader });
    await restoreOnScreen(b, p.nsec);
    const ui = new GameUI(islandBehind, () => paletteFor('cozy'));
    const settings = new SettingsScreen();
    settings.account = b.account;
    ui.register(settings);
    const texts: string[] = [];
    const g = { text: (x: string) => (texts.push(x), 0), heading: (x: string) => (texts.push(x), 40), para: (x: string) => (texts.push(x), 8), measure: (x: string) => x.length * 4, button: (x: string) => (texts.push(x), 40) };
    settings.showPage('account');
    (settings as unknown as { drawAccount: (g: unknown, ui: GameUI, x: number, y: number, w: number) => void }).drawAccount(g, ui, 0, 0, 290);
    const all = texts.join('|');
    expect(all).not.toContain(tr('account.pitch')); // "Play freely without an account." is the guest's page
    expect(all).not.toContain(tr('account.signerAway'));
    expect(b.account.snapshot()).toMatchObject({ status: 'connected', method: 'vault', signerAvailable: false });
  }, 30_000);

  it('a genuinely new player: guest-first as before (no owner question, no relay asked)', async () => {
    const relays = fakeRelays([]);
    const b = browser({ reader: relays.reader });
    const tt = title(b, () => null);
    expect(tt.page).toBe('welcome');
    tt.key('Enter'); // NEW ADVENTURE
    expect(tt.page).toBe('carrier');
    tt.chooseCarrier(0);
    tt.key('Enter'); // CREATE ISLAND
    expect(tt.takeCreate()).toMatchObject({ companion: 'new', owner: 'guest' });
    expect(relays.asked).toEqual([]);
    expect(b.account.snapshot().status).toBe('guest');
  });

  it('the new words exist in three languages, with no em dash and no protocol jargon', () => {
    const keys = ['searchTitle', 'searchBody', 'noneFound', 'offline', 'offlineMore', 'others', 'retry', 'continueAnyway'].map((k) => `identity.restore.${k}`);
    for (const cat of [en, ptBR, es] as Record<string, string>[])
      for (const k of keys) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k], k).not.toMatch(/—/);
        expect(cat[k], k).not.toMatch(/nostr|relay|nsec|npub|d-tag|31124/i);
      }
  });
});
