/**
 * M11D.5: naming a new Blobbi after its birth, the two backups (a Recovery Key: the plain nsec, no password; a
 * Protected Key: NIP-49), verifying and restoring either one (the kind told by the text, a password only when
 * needed), the account flow's new pages, and the one gameplay invitation. Against an in-memory relay only: nothing
 * here is ever published anywhere.
 */
import { describe, expect, it } from 'vitest';
import { getPublicKey } from 'nostr-tools/pure';
import { decode as nip19Decode, nsecEncode } from 'nostr-tools/nip19';
import { generateSecretKey } from 'nostr-tools/pure';
import { KeyVault, memoryVaultBackend, VaultError, backupKindOf } from '../src/nostr/keystore';
import { IdentityService } from '../src/nostr/identity';
import { memoryRelay } from '../src/nostr/publisher';
import { canonicalSeed } from '../src/nostr/canonical-events';
import { buildBackupFile, parseBackupFile, recoveryFileName } from '../src/nostr/backup';
import { awaitsName, chooseGuestName, cleanBlobbiName, GUEST_BLOBBIS_KEY, guestBlobbi, readGuestBlobbis, suggestedName, updateGuestBlobbi } from '../src/game/guest-blobbis';
import { memoryStore, saveKey } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { IdentityScreen, recoveryLines, type IdentityHost } from '../src/ui/screens/identity';
import { NamingScreen, type NamingHost } from '../src/ui/screens/naming';
import { GameUI } from '../src/ui/game-ui';
import { loadInvite, saveInvite, newInviteRecord, eligible, COOLDOWN_MS } from '../src/ui/account-invite';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';

const PASSWORD = 'bubbles and stars';

function setup(o: { account?: string } = {}) {
  const store = memoryStore();
  const backend = memoryVaultBackend();
  const vault = new KeyVault(backend);
  const relay = memoryRelay();
  let t = 1_760_000_000_000;
  const svc = new IdentityService({ store, vault, publisher: relay, now: () => (t += 1000), currentAccount: () => o.account ?? null });
  return { store, backend, vault, relay, svc };
}
async function bornGuest(s: ReturnType<typeof setup>) {
  const r = await s.svc.reserve({ kind: 'guest' }, 'island-1');
  if (!r.ok) throw new Error(r.problem);
  updateGuestBlobbi(s.store, r.value.d, { born: true });
  return guestBlobbi(s.store, r.value.d)!;
}
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as VaultError).code ?? String(e);
  }
};
/** Everything stored, as text (the localStorage-like store and the vault records). */
const everythingStored = (s: ReturnType<typeof setup>) => JSON.stringify([...Object.entries((s.store as unknown as { data?: Record<string, string> }).data ?? {}), s.store.get(GUEST_BLOBBIS_KEY), [...s.backend.records.values()].map((r) => ({ ...r, iv: [...r.iv], data: [...r.data] }))]);

describe('M11D.5: naming a new Blobbi', () => {
  it('a newborn waits for its name; choosing it keeps the owner, the d tag and so the look; registered names are fixed', async () => {
    const s = setup();
    const g = await bornGuest(s);
    expect(g.named).toBe(false);
    expect(g.name).toBe(suggestedName(g.petId));
    expect(awaitsName(g)).toBe(true);
    const seed = canonicalSeed(g.owner, g.petId);
    const named = chooseGuestName(s.store, g.d, '  Mo​mo \n ')!;
    expect(named.name).toBe('Momo');
    expect(named.named).toBe(true);
    expect([named.owner, named.d, named.petId]).toEqual([g.owner, g.d, g.petId]);
    expect(canonicalSeed(named.owner, named.petId)).toBe(seed);
    expect(awaitsName(guestBlobbi(s.store, g.d)!)).toBe(false);
    expect(chooseGuestName(s.store, g.d, '   ')).toBe(null);
    expect(cleanBlobbiName('x'.repeat(40))).toHaveLength(24);
    // Registered (M11D.6: for real, a live run behind it): its name is part of its canonical state.
    s.store.set('blobbi-pixel-lab:activation', JSON.stringify({ version: 1, runs: { [g.d]: { owner: g.owner, d: g.d, mode: 'live', stage: 'done' } } }));
    updateGuestBlobbi(s.store, g.d, { activatedAt: 5 });
    expect(chooseGuestName(s.store, g.d, 'Other')).toBe(null);
    expect(guestBlobbi(s.store, g.d)!.name).toBe('Momo');
    expect(s.relay.sent).toEqual([]);
  });

  it('records from before M11D.5 keep their names: renamed or registered ones are never asked again', async () => {
    const s = setup();
    const g = await bornGuest(s);
    const raw = JSON.parse(s.store.get(GUEST_BLOBBIS_KEY)!);
    const strip = (b: Record<string, unknown>) => (delete b.named, delete b.namingLaterAt, b);
    const legacy = [
      strip({ ...raw.blobbis[0] }),
      strip({ ...raw.blobbis[0], petId: '00000000aa', d: `blobbi-${g.owner.slice(0, 12)}-00000000aa`, name: 'Bean the Brave' }),
      strip({ ...raw.blobbis[0], petId: '00000000bb', d: `blobbi-${g.owner.slice(0, 12)}-00000000bb`, name: suggestedName('00000000bb'), activatedAt: 9 }),
    ];
    s.store.set(GUEST_BLOBBIS_KEY, JSON.stringify({ version: 1, blobbis: legacy }));
    const [a, b, c] = readGuestBlobbis(s.store);
    expect([a.named, b.named, c.named]).toEqual([false, true, true]);
    expect([a.name, b.name]).toEqual([g.name, 'Bean the Brave']);
    expect([awaitsName(a), awaitsName(b), awaitsName(c)]).toEqual([true, false, false]);
  });

  it('"later" is remembered and the name question can still be answered; the name survives the backup and its restore', async () => {
    const s = setup();
    const g = await bornGuest(s);
    s.svc.namingLater(g.d);
    expect(guestBlobbi(s.store, g.d)!.namingLaterAt).toBeGreaterThan(0);
    expect(awaitsName(guestBlobbi(s.store, g.d)!)).toBe(true);
    s.svc.rename(g.d, 'Momo');
    expect(s.svc.reserved()[0]).toMatchObject({ name: 'Momo', named: true });
    // Both backups carry the chosen name; a restore on another device does not ask again.
    for (const kind of ['nsec', 'ncryptsec'] as const) {
      const file = kind === 'nsec' ? await s.svc.makeRecoveryKey(g.owner, ['x']) : await s.svc.makeBackup(g.owner, PASSWORD, ['x']);
      if (!file.ok) throw new Error(file.problem);
      const other = setup();
      const done = await other.svc.restoreBackup(file.value.text, PASSWORD);
      expect(done.ok).toBe(true);
      expect(guestBlobbi(other.store, g.d)).toMatchObject({ name: 'Momo', named: true, born: true });
      expect(other.relay.sent).toEqual([]);
    }
  });

  it('the naming screen: type, confirm, a happy Blobbi; empty names refused; LATER keeps the name and says where to choose it', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    const sc = new NamingScreen();
    const calls: string[] = [];
    let subject = { d: 'd1', name: 'Pip' };
    const host: NamingHost = {
      subject: () => subject,
      editName: (_c, set) => set('Momo'),
      choose: (d, name) => (calls.push(`choose ${d} ${name}`), (subject = { d, name }), true),
      later: (d) => void calls.push(`later ${d}`),
      celebrate: () => void calls.push('celebrate'),
    };
    sc.host = host;
    ui.register(sc);
    sc.start();
    ui.open('naming');
    expect(sc.name).toBe('Pip');
    for (const reduced of [false, true]) {
      ui.settings.reducedMotion = reduced;
      ui.render(new PixelBuffer(960, 540), 1.3);
      ui.render(new PixelBuffer(320, 240), 2.1); // a small phone screen
    }
    sc.setName('');
    sc.index = 1;
    ui.handleKey('Enter');
    expect(sc.page).toBe('ask');
    expect(calls).toEqual([]);
    sc.index = 0;
    ui.handleKey('Enter'); // TYPE A NAME (the host types "Momo")
    expect(sc.name).toBe('Momo');
    sc.index = 1;
    ui.handleKey('Enter'); // THAT'S THE NAME!
    expect(sc.page).toBe('happy');
    expect(calls).toEqual(['choose d1 Momo', 'celebrate']);
    ui.render(new PixelBuffer(960, 540), 3);
    ui.handleKey('Enter'); // LET'S PLAY
    expect(ui.screen).toBe(null);
    // LATER
    sc.start();
    ui.open('naming');
    sc.index = 2;
    ui.handleKey('Enter');
    expect(calls.at(-1)).toBe('later d1');
    expect(ui.screen).toBe(null);
  });

  it('the account flow skips its name page for a Blobbi already named', async () => {
    const s = setup();
    const g = await bornGuest(s);
    s.svc.rename(g.d, 'Momo');
    const { ui, sc } = flowScreen(s, guestOf(s, g.d));
    sc.start('activate');
    ui.open('identity');
    ui.handleKey('Enter'); // LET'S DO IT
    await new Promise((r) => setTimeout(r, 0)); // M11D.6: the intro first asks whether the backup is already checked
    expect(sc.page).toBe('choose');
  });

  it('naming never touches the island save or publishes anything', async () => {
    const s = setup();
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: s.store });
    live.save();
    const before = s.store.get(saveKey(live.identity));
    const g = await bornGuest(s);
    chooseGuestName(s.store, g.d, 'Momo');
    expect(s.store.get(saveKey(live.identity))).toBe(before);
    expect(s.relay.sent).toEqual([]);
  });
});

const guestOf = (s: ReturnType<typeof setup>, d: string) => () => {
  const b = s.svc.reserved().find((x) => x.d === d) ?? null;
  return { reserved: b, legacyLocal: false };
};
function flowScreen(s: ReturnType<typeof setup>, walking: IdentityHost['walking'], live: LiveWorld | null = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16)) {
  const ui = new GameUI(() => live, () => paletteFor('cozy'));
  const sc = new IdentityScreen();
  const downloads: { name: string; text: string }[] = [];
  const copies: string[] = [];
  sc.identity = s.svc;
  sc.host = { editText: () => {}, pickFile: () => {}, pasteText: () => {}, download: (name, text) => downloads.push({ name, text }), copy: async (x) => (copies.push(x), true), walking, bring: () => {} };
  ui.register(sc);
  return { ui, sc, downloads, copies, draw: (t = 0) => ui.render(new PixelBuffer(960, 540), t) };
}
const until = async (f: () => boolean) => {
  for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 15));
};

describe('M11D.5: the Recovery Key (plain nsec) in the vault', () => {
  it('exports the identity as a standard nsec that decodes to the same key; verifies it with no password', async () => {
    const backend = memoryVaultBackend();
    const v = new KeyVault(backend);
    const id = await v.create(1);
    const nsec = await v.exportSecretKey(id.pubkey);
    expect(nsec).toMatch(/^nsec1[02-9ac-hj-np-z]{58}$/);
    const d = nip19Decode(nsec);
    expect(d.type).toBe('nsec');
    expect(getPublicKey(d.data as Uint8Array)).toBe(id.pubkey);
    expect(backupKindOf(nsec)).toBe('nsec');
    await v.verifyBackup(id.pubkey, nsec, '', 7);
    expect(await v.identity(id.pubkey)).toMatchObject({ backupVerifiedAt: 7, backupKind: 'nsec' });
    // Nothing about the export is stored: the record is still the sealed one.
    expect(JSON.stringify([...backend.records.values()].map((r) => ({ ...r, iv: [...r.iv], data: [...r.data] })))).not.toMatch(/nsec1/);
  });

  it('a wrong identity, a damaged key and plain junk are told apart; errors never contain the key', async () => {
    const v = new KeyVault(memoryVaultBackend());
    const id = await v.create(1);
    const nsec = await v.exportSecretKey(id.pubkey);
    const stranger = nsecEncode(generateSecretKey());
    expect(await code(v.verifyBackup(id.pubkey, stranger, '', 2))).toBe('mismatch');
    const damaged = nsec.slice(0, -1) + (nsec.endsWith('q') ? 'p' : 'q');
    expect(await code(v.verifyBackup(id.pubkey, damaged, '', 2))).toBe('corrupt-backup');
    expect(await code(v.verifyBackup(id.pubkey, 'hello', '', 2))).toBe('corrupt-backup');
    for (const bad of [stranger, damaged]) {
      try {
        await v.verifyBackup(id.pubkey, bad, '', 2);
      } catch (e) {
        expect(String((e as Error).message)).not.toMatch(/nsec1|[0-9a-f]{64}/);
        expect(JSON.stringify(e)).not.toMatch(/nsec1/);
      }
    }
    expect((await v.identity(id.pubkey))!.backupVerifiedAt).toBe(null);
  });

  it('restores from a Recovery Key without overwriting an identity already here', async () => {
    const a = new KeyVault(memoryVaultBackend());
    const id = await a.create(1);
    const nsec = await a.exportSecretKey(id.pubkey);
    const backend = memoryVaultBackend();
    const b = new KeyVault(backend);
    expect(await b.inspectBackup(nsec, '')).toEqual({ pubkey: id.pubkey, alreadyHere: false });
    const r = await b.restore(nsec, '', 3);
    expect(r).toMatchObject({ existed: false, identity: { pubkey: id.pubkey, origin: 'restored', backupKind: 'nsec' } });
    const sealed = backend.records.get(id.pubkey)!;
    const again = await b.restore(nsec, '', 4);
    expect(again.existed).toBe(true);
    expect(backend.records.get(id.pubkey)).toEqual(sealed);
    expect(backend.records.size).toBe(1);
  });
});

describe('M11D.5: the two backup files', () => {
  it('the Recovery Key file: labelled, one nsec line, no ncryptsec, the public line; it brings back the same identity', async () => {
    const s = setup();
    const g = await bornGuest(s);
    const file = await s.svc.makeRecoveryKey(g.owner, recoveryLines(g.name));
    if (!file.ok) throw new Error(file.problem);
    expect(file.value.fileName).toBe(recoveryFileName(g.owner));
    expect(file.value.fileName).toMatch(/^blobbi-nostr-recovery-key-[02-9ac-hj-np-z]{8}\.nsec\.txt$/);
    expect(file.value.text.match(/nsec1[02-9ac-hj-np-z]{58}/g)).toHaveLength(1);
    expect(file.value.text).not.toMatch(/ncryptsec/);
    expect(file.value.text).toMatch(/Anyone who has it can control your account/);
    const parsed = parseBackupFile(file.value.text)!;
    expect(parsed.kind).toBe('nsec');
    expect(parsed.meta?.pubkey).toBe(g.owner);
    expect(getPublicKey(nip19Decode(parsed.secret).data as Uint8Array)).toBe(g.owner);
    // Verified from the file, and from the key pasted alone (no password either way).
    expect(await s.svc.verifyBackup(g.owner, file.value.text, '')).toEqual({ ok: true, value: true });
    expect(await s.svc.verifyBackup(g.owner, `  ${parsed.secret}\n`, 'ignored')).toEqual({ ok: true, value: true });
    expect(s.svc.backupKind(parsed.secret)).toBe('nsec');
    // Nothing stored anywhere holds the key; nothing was published.
    expect(everythingStored(s)).not.toMatch(/nsec1/);
    expect(s.relay.sent).toEqual([]);
  });

  it('refuses unclear texts: both kinds at once, two different keys; the Protected Key path is unchanged', async () => {
    const s = setup();
    const g = await bornGuest(s);
    const rec = await s.svc.makeRecoveryKey(g.owner, []);
    const prot = await s.svc.makeBackup(g.owner, PASSWORD, []);
    if (!rec.ok || !prot.ok) throw new Error('backup');
    expect(parseBackupFile(rec.value.text + prot.value.text)).toBe(null);
    expect(parseBackupFile(`${nsecEncode(generateSecretKey())}\n${nsecEncode(generateSecretKey())}`)).toBe(null);
    expect(s.svc.backupKind(prot.value.text)).toBe('ncryptsec');
    expect(s.svc.backupKind('hello')).toBe(null);
    expect(await s.svc.verifyBackup(g.owner, prot.value.text, 'not the password')).toEqual({ ok: false, problem: 'wrong-password' });
    expect(await s.svc.verifyBackup(g.owner, prot.value.text, PASSWORD)).toEqual({ ok: true, value: true });
    // Another identity's Recovery Key does not verify this one.
    expect(await s.svc.verifyBackup(g.owner, nsecEncode(generateSecretKey()), '')).toEqual({ ok: false, problem: 'mismatch' });
    // An M11D.4 file (no `named`) still parses.
    expect(parseBackupFile(buildBackupFile('ncryptsec1' + 'q'.repeat(60), 'e'.repeat(64), [{ d: 'blobbi-eeeeeeeeeeee-0000000001', petId: '0000000001', name: 'Pip', bornAt: 1 }], []))!.meta!.blobbis[0]).toEqual({ d: 'blobbi-eeeeeeeeeeee-0000000001', petId: '0000000001', name: 'Pip', bornAt: 1 });
  });

  it('restore tells the kind, asks no password for a Recovery Key, flags another connected account, never duplicates', async () => {
    const s = setup();
    const g = await bornGuest(s);
    s.svc.rename(g.d, 'Momo');
    const rec = await s.svc.makeRecoveryKey(g.owner, []);
    if (!rec.ok) throw new Error(rec.problem);
    const other = setup({ account: 'a'.repeat(64) });
    const pv = await other.svc.previewBackup(rec.value.text, '');
    expect(pv).toMatchObject({ ok: true, value: { kind: 'nsec', pubkey: g.owner, alreadyHere: false, otherAccount: true, blobbis: [{ d: g.d, name: 'Momo', alreadyHere: false }] } });
    expect(other.backend.records.size).toBe(0); // looking stores nothing
    await other.svc.restoreBackup(rec.value.text, '');
    await other.svc.restoreBackup(rec.value.text, '');
    expect(readGuestBlobbis(other.store)).toHaveLength(1);
    expect(other.backend.records.size).toBe(1);
    // The same account connected: no "other account" note.
    const same = setup({ account: g.owner });
    expect(await same.svc.previewBackup(rec.value.text, '')).toMatchObject({ ok: true, value: { otherAccount: false } });
  });
});

describe('M11D.5: the account flow pages', () => {
  it('the Recovery Key path: two cards, an acknowledgment first, the file offered (never drawn, never copied), checked back', async () => {
    const s = setup();
    const g = await bornGuest(s);
    s.svc.rename(g.d, 'Momo');
    const { ui, sc, downloads, copies, draw } = flowScreen(s, guestOf(s, g.d));
    sc.start('activate');
    ui.open('identity');
    ui.handleKey('Enter'); // LET'S DO IT
    await new Promise((r) => setTimeout(r, 0)); // M11D.6: the intro first asks whether the backup is already checked
    expect(sc.page).toBe('choose');
    draw();
    ui.handleKey('Enter'); // RECOVERY KEY (the first card)
    expect(sc.page).toBe('simple');
    expect(sc.method).toBe('nsec');
    draw();
    // Before the acknowledgment SAVE and CHECK are disabled (skipped by the keys): the 2nd enabled action is
    // USE A PASSWORD INSTEAD, the Protected Key path.
    sc.index = 1;
    ui.handleKey('Enter');
    expect(sc.page).toBe('password');
    sc.go('choose');
    ui.handleKey('Enter');
    expect(sc.page).toBe('simple');
    expect(downloads).toEqual([]);
    sc.index = 0;
    ui.handleKey('Enter'); // tick "I understand"
    expect(sc.acknowledged).toBe(true);
    sc.index = 1;
    ui.handleKey('Enter'); // SAVE MY RECOVERY KEY
    await until(() => downloads.length > 0);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe(recoveryFileName(g.owner));
    expect(copies).toEqual([]);
    // The screen keeps no copy of the key.
    expect(JSON.stringify(sc)).not.toMatch(/nsec1/);
    draw(1);
    sc.index = 2;
    ui.handleKey('Enter'); // I SAVED IT: LET'S CHECK IT
    expect(sc.page).toBe('verify');
    sc.setLoaded(downloads[0].text);
    expect(sc.loadedKind()).toBe('nsec');
    draw(2);
    // file, paste, CHECK IT: no password row for a Recovery Key.
    sc.index = 2;
    ui.handleKey('Enter');
    await until(() => sc.page === 'consent');
    expect(sc.page).toBe('consent');
    expect(await s.vault.identity(g.owner)).toMatchObject({ backupKind: 'nsec' });
    draw(2.5);
    expect(s.relay.sent).toEqual([]); // nothing before SHARE
    ui.handleKey('Enter'); // SHARE MOMO
    await until(() => sc.page === 'reveal');
    expect(sc.page).toBe('reveal');
    for (const reduced of [false, true]) {
      ui.settings.reducedMotion = reduced;
      draw(3);
      ui.render(new PixelBuffer(320, 240), 3.5);
    }
    expect(s.relay.sent.length).toBe(2); // the in-memory rehearsal relay only
  });

  it('restoring on a fresh device: a password asked only for a Protected Key', async () => {
    const s = setup();
    const g = await bornGuest(s);
    const rec = await s.svc.makeRecoveryKey(g.owner, []);
    const prot = await s.svc.makeBackup(g.owner, PASSWORD, []);
    if (!rec.ok || !prot.ok) throw new Error('backup');
    const fresh = setup();
    const { ui, sc, draw } = flowScreen(fresh, () => ({ reserved: null, legacyLocal: false }));
    sc.start('restore');
    ui.open('identity');
    draw();
    sc.setLoaded(prot.value.text);
    expect(sc.loadedKind()).toBe('ncryptsec');
    draw();
    // file, paste, password, LOOK INSIDE (disabled until the password)
    sc.index = 3;
    ui.handleKey('Enter');
    expect(sc.page).toBe('restore');
    sc.setLoaded(rec.value.text);
    expect(sc.loadedKind()).toBe('nsec');
    sc.index = 2; // file, paste, LOOK INSIDE
    ui.handleKey('Enter');
    await until(() => sc.page === 'restorePreview');
    expect(sc.page).toBe('restorePreview');
    draw();
    ui.handleKey('Enter'); // RESTORE
    await until(() => sc.page === 'restoreDone');
    expect(sc.page).toBe('restoreDone');
    draw(1);
    expect(fresh.backend.records.size).toBe(1);
    expect(fresh.relay.sent).toEqual([]);
  });
});

describe('M11D.5: copy, and one invitation', () => {
  it('the briefed words in English, Portuguese and Spanish; "same character"; no em dash in anything new', () => {
    expect([en['identity.choose.title'], ptBR['identity.choose.title'], es['identity.choose.title']]).toEqual(['How would you like to keep your Blobbi safe?', 'Como você quer guardar a chave do seu Blobbi?', '¿Cómo quieres guardar la llave de tu Blobbi?']);
    expect([ptBR['identity.choose.simple'], ptBR['identity.choose.simpleSub'], ptBR['identity.choose.protected'], ptBR['identity.choose.protectedSub']]).toEqual(['Chave de recuperação', 'Simples, sem senha', 'Chave protegida', 'Proteção extra com senha']);
    expect([es['identity.choose.simple'], es['identity.choose.simpleSub'], es['identity.choose.protected'], es['identity.choose.protectedSub']]).toEqual(['Llave de recuperación', 'Simple, sin contraseña', 'Llave protegida', 'Protección extra con contraseña']);
    expect([en['identity.choose.simple'], en['identity.choose.simpleSub'], en['identity.choose.protected'], en['identity.choose.protectedSub']]).toEqual(['Recovery Key', 'Simple, no password', 'Protected Key', 'Extra protection with a password']);
    expect(en['identity.simple.body']).toBe('This key is yours. Anyone who has it can control your account and your Blobbis. Keep it somewhere private and never share it.');
    expect(en['identity.password.warning']).toBe('This key is protected by a password. Keep both the file and your password safe. If you forget the password and lose access to your account, this backup cannot help you.');
    expect([en['naming.question'], ptBR['naming.question'], es['naming.question']]).toEqual(['What should we call our new friend?', 'Como vamos chamar nosso novo amigo?', '¿Cómo llamaremos a nuestro nuevo amigo?']);
    expect(ptBR['identity.reveal.title']).toBe('Um pequeno segredo por trás desses mundos');
    expect(ptBR['identity.reveal.body1']).toBe('{name} pode viajar entre mundos conectados graças ao Nostr, uma rede aberta que permite que diferentes lugares reconheçam o mesmo personagem.');
    expect(ptBR['identity.reveal.body2']).toBe('Nenhum mundo é dono de {name}. A identidade dele pertence a você.');
    expect(en['identity.reveal.body1']).toMatch(/same character\.$/);
    expect(es['identity.reveal.body1']).toMatch(/mismo personaje\.$/);
    for (const cat of [en, ptBR, es] as Record<string, string>[]) {
      for (const [k, v] of Object.entries(cat)) if (/^(naming\.|invite\.|identity\.|account\.nameBlobbi)/.test(k)) expect(v, k).not.toMatch(/—/);
      expect(cat['identity.reveal.body1']).not.toMatch(/amiguinho|amiguito|little friend/);
      // Neither backup is called unbreakable.
      for (const k of ['identity.simple.body', 'identity.password.warning', 'identity.choose.compare']) expect(cat[k]).not.toMatch(/invulnerable|unbreakable|100%|inquebr|impossível|imposible/i);
    }
  });

  it('the M11C.5 invitation record carries over: an opt-out or a recent showing is still respected', () => {
    const store = memoryStore();
    saveInvite(store, { ...newInviteRecord(), optOut: true, activeSeconds: 9999 });
    const world = { visitor: false, tally: { petted: 1, fed: 0, played: 0, mealsFed: 0 }, objectives: { completed: { 'main.meet': 1, 'main.explore': 1, 'main.gather': 1 } as Record<string, number> } };
    expect(eligible(loadInvite(store), { now: 0, shownThisSession: false, connected: false, world })).toBe(false);
    const now = 10 * COOLDOWN_MS;
    expect(eligible({ ...newInviteRecord(), activeSeconds: 9999, shownAt: now - 1000 }, { now, shownThisSession: false, connected: false, world })).toBe(false);
  });
});
