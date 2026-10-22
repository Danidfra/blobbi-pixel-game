/**
 * M11D.4: a Blobbi's true beginning. Reserved identities (a real keypair sealed in the vault, the kit's canonical d,
 * the V3 look fixed from birth: egg and Baby alike), the secret backup (made, verified only by loading it back,
 * restored without overwriting or duplicating), registration (explicit consent, a verified backup, the kit's events,
 * idempotent and resumable, confirmed by reading back), the account flow screen, the title's owner question, the
 * selection, legacy local Blobbis, and no secret anywhere it should not be. Everything against an in-memory relay:
 * nothing is ever published to a real relay by these tests.
 */
import { describe, expect, it } from 'vitest';
import { getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { decrypt as nip49Decrypt } from 'nostr-tools/nip49';
import { deriveBlobbiV3Seed, getCanonicalBlobbiD, isCanonicalBlobbiD, parseBlobbiEvent } from '@blobbi-kit/core';
import { generateGenome } from '@blobbi-kit/renderer/procedural';
import { KeyVault, memoryVaultBackend } from '../src/nostr/keystore';
import { IdentityService } from '../src/nostr/identity';
import { memoryRelay } from '../src/nostr/publisher';
import { activate, activationRun, ACTIVATION_KEY } from '../src/nostr/activation';
import { babyStateTemplate, canonicalSeed } from '../src/nostr/canonical-events';
import { backupFileName, buildBackupFile, parseBackupFile } from '../src/nostr/backup';
import { GUEST_BLOBBIS_KEY, guestBlobbi, readGuestBlobbis, updateGuestBlobbi } from '../src/game/guest-blobbis';
import { effectiveSelection, loadSelectionRecord, SELECTION_KEY, storeGuestSelection } from '../src/game/blobbi-selection';
import { memoryStore, saveKey } from '../src/game/persistence';
import { resolveBlobbi } from '../src/blobbi/source';
import { identityOfSource } from '../src/blobbi/identity';
import { buildEggSprite } from '../src/blobbi/egg';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { IdentityScreen, type IdentityHost } from '../src/ui/screens/identity';
import { GameUI } from '../src/ui/game-ui';
import { TitleScreen } from '../src/ui/title';
import { paletteFor } from '../src/world/generate';
import { IntroCinematic, SKIP_GRACE } from '../src/cinematic/intro';
import { introPreviewWorld } from '../src/cinematic/preview';
import { LiveRenderer } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { PixelBuffer } from '../src/core/pixel';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';

const PASSWORD = 'bubbles and stars';
const LINES = ['Secret backup of Pip, a Blobbi.'];

function setup(opts: { relay?: ReturnType<typeof memoryRelay>; petId?: string } = {}) {
  const store = memoryStore();
  const backend = memoryVaultBackend();
  const vault = new KeyVault(backend);
  const relay = opts.relay ?? memoryRelay();
  const registered: string[] = [];
  let t = 1_760_000_000_000;
  const svc = new IdentityService({ store, vault, publisher: relay, now: () => (t += 1000), petId: opts.petId ? () => opts.petId! : undefined, onRegistered: (b) => registered.push(b.d) });
  return { store, backend, vault, relay, svc, registered };
}

/** A reserved guest Blobbi, born (its egg seen), with a verified backup. */
async function readyGuest(s: ReturnType<typeof setup>) {
  const r = await s.svc.reserve({ kind: 'guest' }, 'island-1');
  if (!r.ok) throw new Error(r.problem);
  updateGuestBlobbi(s.store, r.value.d, { born: true });
  const file = await s.svc.makeBackup(r.value.owner, PASSWORD, LINES);
  if (!file.ok) throw new Error(file.problem);
  const ok = await s.svc.verifyBackup(r.value.owner, file.value.text, PASSWORD);
  expect(ok.ok).toBe(true);
  return { b: r.value, file: file.value };
}

describe('a reserved identity from birth', () => {
  it('a new Blobbi gets a real keypair and the kit canonical d; its V3 look is (owner, d), nothing published', async () => {
    const s = setup();
    const r = await s.svc.reserve({ kind: 'guest' }, null);
    if (!r.ok) throw new Error(r.problem);
    const b = r.value;
    expect(await s.vault.has(b.owner)).toBe(true);
    expect(isCanonicalBlobbiD(b.d)).toBe(true);
    expect(b.d).toBe(getCanonicalBlobbiD(b.owner, b.petId));
    expect(b).toMatchObject({ ownerKind: 'guest', born: false, activatedAt: null });
    expect(s.relay.sent).toEqual([]); // nothing signed or sent at birth
    expect(s.store.get(ACTIVATION_KEY)).toBe(null);
    // The look: the kit's seed of (owner, d), the egg and the Baby from the same genome.
    const src = resolveBlobbi({ pubkey: b.owner, d: b.d });
    if (!src.ok) throw new Error(src.error);
    expect(src.source.seed).toBe(deriveBlobbiV3Seed(b.owner, b.d));
    expect(canonicalSeed(b.owner, b.petId)).toBe(src.source.seed);
    const genome = identityOfSource(src.source, 'baby').genome;
    expect(genome).toEqual(generateGenome(src.source.seed));
    expect(buildEggSprite(genome, { crack: 'none', angle: 0 }, 24).buffer.data).toEqual(buildEggSprite(generateGenome(deriveBlobbiV3Seed(b.owner, b.d)), { crack: 'none', angle: 0 }, 24).buffer.data);
  });

  it('two new Blobbis never share an owner or a d; a Blobbi on an existing account makes no key', async () => {
    const s = setup();
    const a = await s.svc.reserve({ kind: 'guest' }, null);
    const c = await s.svc.reserve({ kind: 'guest' }, null);
    expect(a.ok && c.ok && a.value.owner !== c.value.owner && a.value.d !== c.value.d).toBe(true);
    const keys = s.backend.records.size;
    const acc = 'a'.repeat(63) + 'b';
    const onAccount = await s.svc.reserve({ kind: 'account', pubkey: acc }, null);
    expect(onAccount.ok && onAccount.value.ownerKind === 'account' && onAccount.value.owner === acc).toBe(true);
    expect(s.backend.records.size).toBe(keys);
    // A vault identity that is the player's account owns the next Blobbi too (no new key).
    const own = await s.svc.reserve({ kind: 'vault', pubkey: a.ok ? a.value.owner : '' }, null);
    expect(own.ok && own.value.owner === (a.ok && a.value.owner) && own.value.ownerKind === 'guest').toBe(true);
    expect(s.backend.records.size).toBe(keys);
    expect((await s.svc.reserve({ kind: 'vault', pubkey: 'c'.repeat(64) }, null)).ok).toBe(false); // not ours: refused
  });

  it('a vault that cannot keep a key makes no Blobbi (nothing half made)', async () => {
    const store = memoryStore();
    const broken = { ...memoryVaultBackend(), put: async () => { throw new Error('quota'); } };
    const svc = new IdentityService({ store, vault: new KeyVault(broken), publisher: memoryRelay() });
    expect((await svc.reserve({ kind: 'guest' }, null)).ok).toBe(false);
    expect(readGuestBlobbis(store)).toEqual([]);
  });

  it('the public records hold no secret; the vault holds it sealed only', async () => {
    const s = setup();
    const { b, file } = await readyGuest(s);
    const secret = nip49Decrypt(parseBackupFile(file.text)!.secret, PASSWORD);
    const hex = Buffer.from(secret).toString('hex');
    expect(getPublicKey(secret)).toBe(b.owner);
    const stored = JSON.stringify([...s.store.data.entries()]);
    expect(stored).not.toContain(hex);
    expect(stored).not.toMatch(/nsec1|ncryptsec/);
    expect(file.text).not.toContain(hex);
    expect(file.text).not.toMatch(/nsec1/);
    for (const r of s.backend.records.values()) expect(Buffer.from(r.data).toString('hex')).not.toContain(hex);
  }, 30_000);
});

describe('the secret backup', () => {
  it('is a readable file with the NIP-49 key and a public line; only loading it back and opening it verifies', async () => {
    const s = setup();
    const r = await s.svc.reserve({ kind: 'guest' }, null);
    if (!r.ok) throw new Error(r.problem);
    expect((await s.svc.makeBackup(r.value.owner, 'short', LINES)).ok).toBe(false);
    const file = await s.svc.makeBackup(r.value.owner, PASSWORD, LINES);
    if (!file.ok) throw new Error(file.problem);
    expect(file.value.fileName).toBe(backupFileName(r.value.owner));
    expect(file.value.fileName).toMatch(/^blobbi-nostr-key-backup-[a-z0-9]{8}\.ncryptsec\.txt$/);
    expect(await s.svc.backupVerified(r.value.owner)).toBe(false); // made is not verified
    const parsed = parseBackupFile(file.value.text)!;
    expect(parsed.meta).toEqual({ pubkey: r.value.owner, blobbis: [{ d: r.value.d, petId: r.value.petId, name: r.value.name, bornAt: r.value.bornAt }] });
    expect(await s.svc.verifyBackup(r.value.owner, file.value.text, 'not the password')).toEqual({ ok: false, problem: 'wrong-password' });
    expect(await s.svc.verifyBackup(r.value.owner, 'hello there', PASSWORD)).toEqual({ ok: false, problem: 'corrupt-backup' });
    expect(await s.svc.verifyBackup(r.value.owner, file.value.text.replace(/ncryptsec1(\w{10})/, 'ncryptsec1qqqqqqqqqq'), PASSWORD)).toMatchObject({ ok: false });
    expect(await s.svc.verifyBackup(r.value.owner, file.value.text, PASSWORD)).toEqual({ ok: true, value: true });
    expect(await s.svc.backupVerified(r.value.owner)).toBe(true);
  }, 30_000);

  it('restores on a new device: identity and the Blobbis it names; previews first; never duplicates or overwrites', async () => {
    const a = setup();
    const { b, file } = await readyGuest(a);
    const other = setup();
    const before = await other.svc.reserve({ kind: 'guest' }, null);
    const preview = await other.svc.previewBackup(file.text, PASSWORD);
    expect(preview).toMatchObject({ ok: true, value: { pubkey: b.owner, alreadyHere: false, blobbis: [{ d: b.d, name: b.name, alreadyHere: false }] } });
    expect(other.backend.records.size).toBe(1); // previewing stores nothing
    expect(await other.svc.restoreBackup(file.text, 'wrong password!')).toEqual({ ok: false, problem: 'wrong-password' });
    expect(await other.svc.restoreBackup('ncryptsec1zzz', PASSWORD)).toEqual({ ok: false, problem: 'corrupt-backup' });
    const done = await other.svc.restoreBackup(file.text, PASSWORD);
    expect(done.ok).toBe(true);
    expect(await other.vault.has(b.owner)).toBe(true);
    expect(guestBlobbi(other.store, b.d)).toMatchObject({ owner: b.owner, petId: b.petId, name: b.name, born: true });
    expect(other.relay.sent).toEqual([]); // restoring publishes nothing
    // The Blobbi met here before is untouched; restoring again duplicates nothing.
    expect(before.ok && guestBlobbi(other.store, before.value.d)).toBeTruthy();
    await other.svc.restoreBackup(file.text, PASSWORD);
    expect(readGuestBlobbis(other.store).filter((x) => x.d === b.d).length).toBe(1);
    expect(other.backend.records.size).toBe(2);
  }, 60_000);

  it('a public line that names another identity is ignored (never trusted alone)', async () => {
    const a = setup();
    const { file } = await readyGuest(a);
    const forged = file.text.replace(/"pubkey":"[0-9a-f]{64}"/, `"pubkey":"${'d'.repeat(64)}"`);
    const p = await setup().svc.previewBackup(forged, PASSWORD);
    expect(p.ok && p.value.blobbis).toEqual([]);
    expect(parseBackupFile(buildBackupFile('ncryptsec1' + 'q'.repeat(60), 'e'.repeat(64), [], [])) ).toBeTruthy();
    expect(parseBackupFile('x'.repeat(20_000))).toBe(null);
  }, 30_000);
});

describe('registration: consent, a verified backup, the kit events, idempotent and resumable', () => {
  it('nothing is published without consent, nor for a guest without a verified backup', async () => {
    const s = setup();
    const r = await s.svc.reserve({ kind: 'guest' }, null);
    if (!r.ok) throw new Error(r.problem);
    updateGuestBlobbi(s.store, r.value.d, { born: true });
    expect(await s.svc.register(r.value.d, false)).toEqual({ ok: false, problem: 'no-consent' });
    expect(await s.svc.register(r.value.d, true)).toEqual({ ok: false, problem: 'no-backup' });
    expect(s.relay.sent).toEqual([]);
  });

  it('publishes the hatched Baby (kit-canonical, same look) then the profile, confirms them, and makes it the account', async () => {
    // M11D.6: an in-memory relay playing a REAL one (a rehearsal never registers: tests/m11d6.test.ts).
    const s = setup({ relay: memoryRelay({ mode: 'live', url: 'memory://live' }) });
    const { b } = await readyGuest(s);
    const r = await s.svc.register(b.d, true);
    expect(r).toMatchObject({ ok: true, value: { stage: 'done', mode: 'live' } });
    const [blobbi, profile] = s.relay.sent;
    expect([blobbi.kind, profile.kind]).toEqual([31124, 11125]);
    expect(verifyEvent(blobbi) && verifyEvent(profile)).toBe(true);
    expect(blobbi.pubkey).toBe(b.owner);
    const parsed = parseBlobbiEvent(blobbi as never)!;
    expect(parsed).toMatchObject({ d: b.d, stage: 'baby', name: b.name });
    expect(parsed.v3Identity?.seed).toBe(deriveBlobbiV3Seed(b.owner, b.d)); // the same look everywhere
    expect(blobbi.tags.some((t) => t[0] === 'seed')).toBe(false); // no explicit seed: V3 rules unchanged
    expect(profile.tags).toContainEqual(['has', b.d]);
    expect(profile.tags).toContainEqual(['current_companion', b.d]);
    expect(guestBlobbi(s.store, b.d)!.activatedAt).not.toBe(null);
    expect(s.registered).toEqual([b.d]);
  }, 30_000);

  it('an interrupted publication resumes with the very same events; a retry never duplicates', async () => {
    let refuseProfile = true;
    const relay = memoryRelay({ refuse: (e) => e.kind === 11125 && refuseProfile });
    const s = setup({ relay });
    const { b } = await readyGuest(s);
    expect(await s.svc.register(b.d, true)).toEqual({ ok: false, problem: 'publish-failed' });
    const run = activationRun(s.store, b.d)!;
    expect(run.stage).toBe('signed');
    expect(run.accepted.blobbi.length).toBe(1);
    expect(guestBlobbi(s.store, b.d)!.activatedAt).toBe(null); // not registered until confirmed
    refuseProfile = false;
    expect((await s.svc.register(b.d, true)).ok).toBe(true);
    const ids = relay.sent.map((e) => e.id);
    expect(relay.sent.filter((e) => e.kind === 31124).length).toBe(1); // the Blobbi was not sent again
    expect(new Set(relay.sent.filter((e) => e.kind === 11125).map((e) => e.id)).size).toBe(1); // the same profile event
    expect(ids.length).toBe(3);
    // Done is done: another press sends nothing.
    expect((await s.svc.register(b.d, true)).ok).toBe(true);
    expect(relay.sent.length).toBe(3);
  }, 30_000);

  it('unreachable relays: nothing signed is lost, the run waits; a Blobbi already on the relays is adopted, never re-created', async () => {
    let down = true;
    const relay = memoryRelay({ down: () => down });
    const s = setup({ relay });
    const { b } = await readyGuest(s);
    expect(await s.svc.register(b.d, true)).toEqual({ ok: false, problem: 'unreachable' });
    down = false;
    // Meanwhile another app had already published this Blobbi (same owner and d): it is adopted.
    const existing = await s.vault.sign(b.owner, babyStateTemplate({ owner: b.owner, petId: b.petId, name: b.name, bornAt: b.bornAt }, 1_760_000_500));
    await relay.publish(existing, 1000);
    relay.sent.length = 0;
    expect((await s.svc.register(b.d, true)).ok).toBe(true);
    expect(relay.sent.some((e) => e.kind === 31124 && e.id !== existing.id)).toBe(false);
    expect(activationRun(s.store, b.d)!.adopted).toBe(true);
  }, 30_000);

  it('a signer that answers as someone else is refused; nothing is published under the wrong owner', async () => {
    const store = memoryStore();
    const relay = memoryRelay();
    const owner = 'b'.repeat(64);
    const otherVault = new KeyVault(memoryVaultBackend());
    const someone = await otherVault.create(1);
    const r = activate(
      { facts: { owner, petId: '0123456789', name: 'Pip', bornAt: 1 }, consent: true, backupVerified: true, ownerKind: 'account' },
      { store, publisher: relay, sign: (t) => otherVault.sign(someone.pubkey, t), now: () => 5000 },
    );
    await expect(r).rejects.toMatchObject({ problem: 'wrong-signer' });
    expect(relay.sent).toEqual([]);
  });
});

describe('selection, islands and the live Blobbi', () => {
  it('a reserved Blobbi walks with or without an account; the record is checked against its public registry', async () => {
    const s = setup();
    const { b } = await readyGuest(s);
    const src = resolveBlobbi({ pubkey: b.owner, d: b.d });
    if (!src.ok) throw new Error(src.error);
    storeGuestSelection(s.store, src.source, 'baby');
    const rec = loadSelectionRecord(s.store)!;
    expect(rec).toMatchObject({ guest: true, stage: 'baby', name: b.name, account: null });
    expect(effectiveSelection(rec, null)).toBe(rec);
    expect(effectiveSelection(rec, 'f'.repeat(64))).toBe(rec); // another account connecting never replaces it
    // A guest record for a Blobbi the registry does not know is refused.
    s.store.set(SELECTION_KEY, JSON.stringify({ version: 1, source: resolveBlobbi({ pubkey: 'a'.repeat(64), d: getCanonicalBlobbiD('a'.repeat(64), '0123456789') }).ok ? (resolveBlobbi({ pubkey: 'a'.repeat(64), d: getCanonicalBlobbiD('a'.repeat(64), '0123456789') }) as { source: unknown }).source : null, guest: true }));
    expect(loadSelectionRecord(s.store)).toBe(null);
  }, 30_000);

  it('registration changes nothing about the island or the Blobbi in play (no departure, no arrival)', async () => {
    const s = setup();
    const { b } = await readyGuest(s);
    const src = resolveBlobbi({ pubkey: b.owner, d: b.d });
    if (!src.ok) throw new Error(src.error);
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), src.source, 16, { stage: 'baby', store: s.store });
    live.save();
    const save = s.store.get(saveKey(live.identity));
    const before = { seed: live.blobbi.seed, x: live.blobbi.x, presence: live.teleport.state, stage: live.blobbi.identity.stage };
    expect((await s.svc.register(b.d, true)).ok).toBe(true);
    expect({ seed: live.blobbi.seed, x: live.blobbi.x, presence: live.teleport.state, stage: live.blobbi.identity.stage }).toEqual(before);
    expect(live.swap).toBe(null);
    expect(s.store.get(saveKey(live.identity))).toBe(save);
    expect(save).not.toContain(b.owner); // islands never name a Blobbi or an identity
  }, 30_000);

  it('records keep identity, Blobbi and island separate: one identity can own several Blobbis, a Blobbi visits any island', async () => {
    const s = setup();
    const a = await s.svc.reserve({ kind: 'guest' }, 'island-a');
    if (!a.ok) throw new Error(a.problem);
    await s.svc.reserve({ kind: 'vault', pubkey: a.value.owner }, 'island-b');
    const raw = JSON.parse(s.store.get(GUEST_BLOBBIS_KEY)!);
    expect(raw.blobbis.map((x: { owner: string }) => x.owner)).toEqual([a.value.owner, a.value.owner]);
    expect(raw.blobbis.map((x: { island: string }) => x.island)).toEqual(['island-a', 'island-b']);
  });
});

describe('the account flow screen', () => {
  function screen(s: ReturnType<typeof setup>, walking: IdentityHost['walking']) {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    const sc = new IdentityScreen();
    const downloads: string[] = [];
    sc.identity = s.svc;
    sc.host = { pickFile: () => {}, download: (n) => downloads.push(n), copy: async () => true, walking, bring: () => {} };
    ui.register(sc);
    return { ui, sc, downloads, draw: () => ui.render(new PixelBuffer(960, 540), 0) };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('walks a guest from the benefits to a checked backup, consent, registration and the Nostr reveal', async () => {
    const s = setup();
    const r = await s.svc.reserve({ kind: 'guest' }, null);
    if (!r.ok) throw new Error(r.problem);
    updateGuestBlobbi(s.store, r.value.d, { born: true });
    const pub = { ...r.value, born: true };
    const { ui, sc, downloads, draw } = screen(s, () => ({ reserved: pub, legacyLocal: false }));
    sc.start('activate');
    ui.open('identity');
    draw();
    expect(sc.page).toBe('intro');
    ui.handleKey('Enter'); // LET'S DO IT
    await flush(); // M11D.6: the intro first asks whether the backup is already checked
    expect(sc.page).toBe('name');
    sc.setField('name', 'Mochi');
    sc.index = 1;
    ui.handleKey('Enter'); // CONTINUE
    // M11D.5: the two backups are offered first; the Protected Key (NIP-49) is the M11D.4 path.
    expect(sc.page).toBe('choose');
    draw();
    sc.index = 1;
    ui.handleKey('Enter'); // PROTECTED KEY
    expect(sc.page).toBe('password');
    expect(guestBlobbi(s.store, r.value.d)!.name).toBe('Mochi');
    sc.setField('password', PASSWORD);
    sc.setField('password2', 'different');
    sc.index = 2;
    ui.handleKey('Enter');
    await flush();
    expect(sc.page).toBe('password'); // the two passwords differ
    sc.setField('password', PASSWORD);
    sc.setField('password2', PASSWORD);
    sc.index = 2;
    ui.handleKey('Enter');
    for (let i = 0; i < 50 && sc.page !== 'save'; i++) await new Promise((res) => setTimeout(res, 20));
    expect(sc.page).toBe('save');
    expect(sc.fields.password).toBe(''); // secrets leave with their page
    draw();
    // CHECK IT is not possible before the backup was offered.
    sc.index = 0;
    ui.handleKey('Enter'); // SAVE THE BACKUP FILE
    expect(downloads).toEqual([backupFileName(r.value.owner)]);
    const file = await s.svc.makeBackup(r.value.owner, PASSWORD, LINES);
    sc.go('verify');
    sc.setLoaded(file.ok ? file.value.text : '');
    sc.setField('backupPassword', PASSWORD);
    sc.index = 3;
    ui.handleKey('Enter');
    for (let i = 0; i < 100 && sc.page !== 'consent'; i++) await new Promise((res) => setTimeout(res, 20));
    expect(sc.page).toBe('consent');
    draw();
    expect(s.relay.sent).toEqual([]); // nothing before SHARE
    await sc.register();
    expect(sc.page).toBe('reveal');
    draw();
    expect(s.relay.sent.map((e) => e.kind)).toEqual([31124, 11125]);
  }, 60_000);

  it('a legacy local Blobbi is told kindly it stays here; restoring is offered; nothing is changed', () => {
    const s = setup();
    const { ui, sc, draw } = screen(s, () => ({ reserved: null, legacyLocal: true }));
    sc.start('activate');
    ui.open('identity');
    draw();
    expect(sc.page).toBe('legacy');
    expect(en['identity.legacy.body']).toMatch(/stays here/);
  });

  it('every new text exists in three languages, with no em dash, and early pages speak no jargon', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('identity.') || k.startsWith('title.owner') || k === 'title.login.backup' || k.startsWith('account.saveBlobbi') || k === 'create.identityFailed');
    expect(keys.length).toBeGreaterThan(90);
    for (const cat of [en, ptBR, es] as Record<string, string>[])
      for (const k of keys) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k], k).not.toMatch(/—/);
      }
    for (const k of keys.filter((k) => /identity\.(intro|name|password|save|verify|consent|working)\./.test(k))) for (const cat of [en, ptBR, es] as Record<string, string>[]) expect(cat[k], k).not.toMatch(/nostr|relay|nsec|npub|NIP|private key|public key|chave privada|clave privada/i);
    expect(en['identity.reveal.body1']).toMatch(/Nostr/); // only the reveal names it
  });
});

describe('the title: whose new Blobbi', () => {
  it('connected: a new Blobbi asks whose it will be (never decided silently); a guest goes straight on', () => {
    const acc = { status: 'connected' as const, name: 'Ana', signerAvailable: true, method: 'nip07' as const };
    const t = new TitleScreen({ worlds: () => [], current: () => ({ identity: '', name: '', saved: false }), continueGame: () => {}, openWorld: () => {}, settings: () => {}, account: () => acc });
    t.key('Enter'); // NEW ADVENTURE
    t.key('Enter'); // the Carrier
    t.key('Enter'); // CREATE ISLAND
    expect(t.page).toBe('owner');
    t.key('Enter'); // ON MY ACCOUNT
    expect(t.takeCreate()).toMatchObject({ companion: 'new', owner: 'account' });
    const g = new TitleScreen({ worlds: () => [], current: () => ({ identity: '', name: '', saved: false }), continueGame: () => {}, openWorld: () => {}, settings: () => {} });
    g.key('Enter');
    g.key('Enter');
    g.key('Enter');
    expect(g.takeCreate()).toMatchObject({ companion: 'new', owner: 'guest' });
  });
});

describe('the missing egg (M11D.3 report): a double press must not skip the birth', () => {
  it("a player's skip is ignored for the first moment of the cinematic; later it skips", () => {
    const live = new LiveWorld(introPreviewWorld('turtle'), 'blobbi-9', 16, { stage: 'baby', store: null });
    const renderer = new LiveRenderer(live);
    const intro = new IntroCinematic({ live, renderer, view: new ViewRenderer(live, renderer) }, { birth: true });
    intro.frame(1 / 30, 320, 180);
    expect(intro.requestSkip()).toBe(false); // the second press of CREATE ISLAND lands here
    expect(intro.done).toBe(false);
    while (intro.elapsed < SKIP_GRACE + 0.05) intro.frame(1 / 30, 320, 180);
    expect(intro.requestSkip()).toBe(true);
    expect(intro.done).toBe(true);
    expect(live.egg).toBe(null);
  });
});
