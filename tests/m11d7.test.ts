// M11D.7: the consent page of a LIVE build says plainly that the share is real (not practice), that it is public and
// may stay public forever, and that the island, the bag and the secret key never leave the device. A rehearsal keeps
// its own practice line and never shows the live words. Every language, every text size, nothing hidden by the buttons.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyVault, memoryVaultBackend } from '../src/nostr/keystore';
import { IdentityService } from '../src/nostr/identity';
import { memoryRelay, relayGroup, type Publisher } from '../src/nostr/publisher';
import { PUBLISH_RELAYS } from '../src/nostr/relay-config';
import { guestBlobbi, updateGuestBlobbi } from '../src/game/guest-blobbis';
import { memoryStore } from '../src/game/persistence';
import { IdentityScreen } from '../src/ui/screens/identity';
import { GameUI, type TextSize } from '../src/ui/game-ui';
import { Gfx } from '../src/ui/gfx';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { loadLocale, setLocale, type Locale, type MessageKey } from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';

const PASSWORD = 'bubbles and stars';
const noSleep = async () => {};
const LIVE_KEYS: MessageKey[] = ['identity.consent.live', 'identity.consent.liveLasting', 'identity.consent.livePrivate'];
const CATALOGS: Record<Locale, Record<string, string>> = { en, 'pt-BR': ptBR, es } as unknown as Record<Locale, Record<string, string>>;

afterEach(() => {
  vi.restoreAllMocks();
  setLocale('en');
});

/** The consent page of a born guest Blobbi with a checked backup, drawn once; what it wrote and where. */
async function consentPage(publisher: Publisher, locale: Locale, textSize: TextSize) {
  const store = memoryStore();
  const vault = new KeyVault(memoryVaultBackend());
  let now = 1_760_000_000_000;
  const svc = new IdentityService({ store, vault, publisher, now: () => (now += 1000), currentAccount: () => null, sleep: noSleep });
  const r = await svc.reserve({ kind: 'guest' }, 'island-1');
  if (!r.ok) throw new Error(r.problem);
  updateGuestBlobbi(store, r.value.d, { born: true });
  const file = await svc.makeBackup(r.value.owner, PASSWORD, ['Backup']);
  if (!file.ok) throw new Error(file.problem);
  expect((await svc.verifyBackup(r.value.owner, file.value.text, PASSWORD)).ok).toBe(true);
  const g = guestBlobbi(store, r.value.d)!;

  await loadLocale(locale);
  setLocale(locale);
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
  const ui = new GameUI(() => live, () => paletteFor('cozy'));
  ui.settings.textSize = textSize;
  const sc = new IdentityScreen();
  sc.identity = svc;
  sc.host = { editText: () => {}, pickFile: () => {}, pasteText: () => {}, download: () => {}, copy: async () => false, walking: () => ({ reserved: svc.reserved().find((x) => x.d === g.d)!, legacyLocal: false }), bring: () => {} };
  ui.register(sc);
  sc.start('activate');
  ui.open('identity');
  ui.handleKey('Enter'); // LET'S DO IT: the backup is already checked, so straight to consent
  for (let i = 0; i < 100 && sc.page !== 'consent'; i++) await new Promise((res) => setTimeout(res, 10));
  expect(sc.page).toBe('consent');

  // Only the real drawing (the layout probe draws the same words at x = 0 first).
  const paras: { text: string; bottom: number; cut: boolean }[] = [];
  const buttons: { label: string; y: number }[] = [];
  const para = Gfx.prototype.para;
  const button = Gfx.prototype.button;
  vi.spyOn(Gfx.prototype, 'para').mockImplementation(function (this: Gfx, text, x, y, ...rest) {
    const used = para.call(this, text, x, y, ...rest);
    if (x > 0) paras.push({ text, bottom: y + used, cut: this.lines(text, rest[0]).length * 7 > used });
    return used;
  });
  vi.spyOn(Gfx.prototype, 'button').mockImplementation(function (this: Gfx, label, x, y, ...rest) {
    if (x > 0) buttons.push({ label, y });
    return button.call(this, label, x, y, ...rest);
  });
  ui.render(new PixelBuffer(960, 540), 0);
  vi.restoreAllMocks();
  return { paras, buttons, cat: CATALOGS[locale] };
}

/** Whether the page wrote this message (matched on its words before the first placeholder). */
const wrote = (paras: { text: string }[], message: string) => paras.some((p) => p.text.startsWith(message.split('{')[0]));

describe('M11D.7: the live consent page', () => {
  for (const locale of ['en', 'pt-BR', 'es'] as Locale[])
    it(`a live build says it is real, lasting and public, and what stays private (${locale})`, async () => {
      const members = PUBLISH_RELAYS.map((url) => memoryRelay({ url, mode: 'live' }));
      for (const size of ['normal', 'large'] as TextSize[]) {
        const { paras, buttons, cat } = await consentPage(relayGroup(members, 'live'), locale, size);
        for (const k of LIVE_KEYS) expect(wrote(paras, cat[k]), `${k} ${size}`).toBe(true);
        // Every line is shown whole: no warning is cut short by its line limit.
        expect(paras.filter((p) => p.cut).map((p) => p.text), size).toEqual([]);
        expect(wrote(paras, cat['identity.consent.rehearsal']), size).toBe(false);
        // The words end above the SHARE button: nothing is hidden behind it.
        const share = buttons.filter((b) => b.label.startsWith(cat['identity.consent.share'].split('{')[0]) || b.label === cat['identity.consent.notYet']);
        expect(share.length, size).toBe(2);
        expect(Math.max(...paras.map((p) => p.bottom)), size).toBeLessThanOrEqual(Math.min(...share.map((b) => b.y)));
      }
      // Drawing the page sends nothing.
      expect(members.every((m) => m.sent.length === 0)).toBe(true);
    }, 60_000);

  it('a rehearsal keeps its practice line and never shows the live words', async () => {
    const { paras, cat } = await consentPage(memoryRelay(), 'en', 'normal');
    expect(wrote(paras, cat['identity.consent.rehearsal'])).toBe(true);
    for (const k of LIVE_KEYS) expect(wrote(paras, cat[k]), k).toBe(false);
  }, 60_000);

  it('the live words name what matters, in every language, with no em dash', () => {
    expect(en['identity.consent.live']).toMatch(/real, not practice/);
    expect(en['identity.consent.liveLasting']).toMatch(/forever/);
    expect(en['identity.consent.livePrivate']).toMatch(/island.*bag.*secret key/);
    expect(ptBR['identity.consent.liveLasting']).toMatch(/para sempre/);
    expect(es['identity.consent.liveLasting']).toMatch(/para siempre/);
    for (const cat of Object.values(CATALOGS))
      for (const k of LIVE_KEYS) {
        expect(cat[k], k).toBeTruthy();
        expect(cat[k], k).not.toMatch(/—/);
      }
    // The practice line is still there, unchanged in meaning.
    expect(en['identity.consent.rehearsal']).toMatch(/^Practice mode:/);
  });
});
