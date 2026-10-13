/**
 * SETTINGS AND HELP: presentation preferences (day and night lighting, the goal box, sound, motion, UI scale) and
 * the audio mix, kept per browser by the playground, and the controls. Nothing here touches the world or the save.
 * Three pages, GAME, SOUND and ACCOUNT (Tab or the buttons switch); on a volume row LEFT and RIGHT change the level.
 *
 * ACCOUNT (M11B) is optional and read-only: connect a browser extension signer to tell the game who you are. It
 * never saves islands to the account, publishes, or asks for a secret key; it talks to the account only through
 * the `AccountPort` (the Nostr module itself is never imported here).
 */
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';
import type { AudioSettings } from '../../audio/engine';
import type { AccountPort, AccountSnapshot, ConnectProblem, ProfileStatus } from '../../nostr/port';

const CONTROLS = [
  'WASD / ARROWS  MOVE',
  'E / SPACE  PICK UP, FARM, USE',
  'I BAG  K CRAFT  J JOURNAL',
  'U BLOBBI  N MAP  L GROWTH',
  'F FEED  H PET  R REST',
  'T SEED OR STYLE  Q TOOL',
  'B BUILD  M MOVE MODE',
  'MOVE MODE: E MOVE  X TO BAG',
  'C V G  AXE PICKAXE HOE',
  'Z CAMERA  O GOAL BOX  Y WORLDS',
  '1 HOME  ? OR F1 GUIDE',
];

type Row = { label: string; run: () => void; adjust?: (d: number) => void };
const pct = (v: number) => (v <= 0 ? 'OFF' : `${Math.round(v * 100)}%`);
const VOLUME_STEP = 0.1;
type Page = 'game' | 'sound' | 'account';
const PAGES: readonly Page[] = ['game', 'sound', 'account'];

const PROBLEM_TEXT: Record<ConnectProblem, string> = {
  'no-signer': 'No account extension was found in this browser. Nothing changed.',
  rejected: 'The extension said no. Nothing changed; you can try again any time.',
  timeout: 'The extension did not answer. Nothing changed.',
  'invalid-key': 'The extension answered with something that is not an account. Nothing changed.',
  failed: 'Connecting did not work. Nothing changed.',
};
const PROFILE_TEXT: Record<ProfileStatus, string> = {
  idle: 'not read yet',
  loading: 'reading...',
  found: 'found',
  missing: 'no public profile yet',
  invalid: 'the relays sent nothing valid',
  unavailable: 'relays out of reach (try later)',
};

export class SettingsScreen implements Screen {
  readonly id = 'settings' as const;
  index = 0;
  page: Page = 'game';
  /** Called after a change (the playground stores the settings). */
  onChange: (() => void) | null = null;
  /** The audio mix to edit (the playground's engine settings); without it the SOUND page says so. */
  audio: AudioSettings | null = null;
  /** The player's account (optional; without it the ACCOUNT page says accounts are not available). */
  account: AccountPort | null = null;
  /** The ACCOUNT page's details (public key, signer, relays) are shown. */
  advanced = false;
  /** The ACCOUNT page's short explanation is shown. */
  explain = false;

  opened(): void {
    if (this.page === 'account') this.account?.refreshProfile();
  }

  private setPage(page: Page): void {
    this.page = page;
    this.index = 0;
    if (page === 'account') this.account?.refreshProfile();
  }

  title(): string {
    return 'Settings and controls';
  }

  rows(ui: GameUI): Row[] {
    const s = ui.settings;
    const change = (f: () => void) => () => {
      f();
      this.onChange?.();
    };
    if (this.page === 'game')
      return [
        { label: `DAY AND NIGHT LIGHT: ${s.daylight ? 'ON' : 'OFF'}`, run: change(() => (s.daylight = !s.daylight)) },
        { label: `GOAL BOX: ${s.goals ? 'ON' : 'OFF'}`, run: change(() => (s.goals = !s.goals)) },
        { label: `SOUND: ${s.sound ? 'ON' : 'OFF'}`, run: change(() => (s.sound = !s.sound)) },
        { label: `REDUCED MOTION: ${s.reducedMotion ? 'ON' : 'OFF'}`, run: change(() => (s.reducedMotion = !s.reducedMotion)) },
        { label: `LARGE HUD TEXT: ${s.largeText ? 'ON' : 'OFF'}`, run: change(() => (s.largeText = !s.largeText)) },
        { label: `MENU SCALE: ${s.scale ? `${s.scale}X` : 'AUTO'}`, run: change(() => (s.scale = (s.scale + 1) % 4)) },
        // Tips belong to the island (saved with it), so a new island starts with them on.
        ...(ui.live && !ui.live.visitor ? [{ label: `TIPS ON THIS ISLAND: ${ui.live.tutorial.skipped ? 'OFF' : 'ON'}`, run: () => ui.live!.setTips(ui.live!.tutorial.skipped) }] : []),
      ];
    if (this.page === 'account') return this.accountRows(ui);
    const a = this.audio;
    if (!a) return [];
    const volume = (name: string, key: 'master' | 'music' | 'sfx' | 'ambient'): Row => {
      const adjust = (d: number) => change(() => (a[key] = Math.round(Math.max(0, Math.min(1, a[key] + d)) * 10) / 10))();
      // A click steps up and wraps to off, so the row works with a pointer alone.
      return { label: `${name}: ${pct(a[key])}`, run: () => (a[key] >= 1 ? change(() => (a[key] = 0))() : adjust(VOLUME_STEP * 2)), adjust };
    };
    return [
      volume('VOLUME', 'master'),
      volume('MUSIC', 'music'),
      volume('EFFECTS', 'sfx'),
      volume('AMBIENCE', 'ambient'),
      { label: `MUSIC: ${a.musicOn ? 'ON' : 'OFF'}`, run: change(() => (a.musicOn = !a.musicOn)) },
      { label: `SOFTER SOUND: ${a.reduced ? 'ON' : 'OFF'}`, run: change(() => (a.reduced = !a.reduced)) },
      { label: `MUTE ALL: ${a.muted ? 'ON' : 'OFF'}`, run: change(() => (a.muted = !a.muted)) },
    ];
  }

  /** The ACCOUNT page's buttons: CONNECT as a guest; DISCONNECT, CHECK AGAIN and ADVANCED when connected. */
  private accountRows(ui: GameUI): Row[] {
    const acc = this.account;
    if (!acc) return [];
    const s = acc.snapshot();
    const help: Row = { label: this.explain ? 'HIDE THE EXPLANATION' : 'WHAT IS THIS?', run: () => (this.explain = !this.explain) };
    if (s.status !== 'connected')
      return [
        {
          label: s.status === 'connecting' ? 'WAITING FOR THE EXTENSION...' : 'CONNECT WITH A BROWSER EXTENSION',
          run: () => {
            if (s.status === 'connecting') return;
            if (!s.signerAvailable) ui.say('No account extension found in this browser.', false);
            void acc.connect();
          },
        },
        help,
      ];
    return [
      { label: 'DISCONNECT', run: () => (acc.disconnect(), (this.index = 0), ui.say('Disconnected. Your islands are all still here.')) },
      { label: 'CHECK THE ACCOUNT AGAIN', run: () => void acc.connect() },
      { label: this.advanced ? 'HIDE DETAILS' : 'ADVANCED DETAILS', run: () => (this.advanced = !this.advanced) },
      help,
    ];
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    if (code === 'Tab') {
      this.setPage(PAGES[(PAGES.indexOf(this.page) + 1) % PAGES.length]);
      return true;
    }
    const rows = this.rows(ui);
    const row = rows[this.index];
    if (row?.adjust && (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD')) {
      row.adjust(code === 'ArrowLeft' || code === 'KeyA' ? -VOLUME_STEP : VOLUME_STEP);
      return true;
    }
    const moved = moveSelection(code, this.index, rows.length, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (isConfirm(code)) {
      row?.run();
      return true;
    }
    return false;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number): void {
    const tab = (label: string, page: Page, tx: number) => g.button(label, tx, y + 1, () => this.setPage(page), { w: 72, primary: this.page === page });
    tab('GAME', 'game', x);
    tab('SOUND', 'sound', x + 78);
    tab('ACCOUNT', 'account', x + 156);
    if (this.page === 'account') return this.drawAccount(g, ui, x, y + 16, w);
    let cy = y + 16;
    this.rows(ui).forEach((it, i) => {
      g.button(it.label, x, cy, () => ((this.index = i), it.run()), { w: 150, primary: i === this.index });
      cy += 13;
    });
    const note =
      this.page === 'game'
        ? 'Lighting, sound and motion are presentation only: the island, its time and your progress are the same either way. TAB: NEXT PAGE.'
        : this.audio
          ? 'LEFT and RIGHT change a volume. Music and effects are separate. Softer sound calms the island. TAB: NEXT PAGE.'
          : 'Audio is not available in this browser.';
    g.para(note, x, cy + 3, 150, UI.muted, 6);
    const cx = x + 160;
    g.text('CONTROLS', cx, y + 2, UI.accent);
    CONTROLS.forEach((line, i) => g.text(line, cx, y + 14 + i * 9, UI.ink));
    g.para('Menus pause the island. Click or tap slots and buttons; outside a menu closes it.', cx, y + 14 + CONTROLS.length * 9 + 6, w - 162, UI.muted, 4);
  }

  /** The ACCOUNT page: a friendly status, the buttons, and (on request) an explanation or the technical details. */
  private drawAccount(g: Gfx, ui: GameUI, x: number, y: number, w: number): void {
    const acc = this.account;
    if (!acc) {
      g.para('Accounts are not available in this version of the game.', x, y, w, UI.muted);
      return;
    }
    const s = acc.snapshot();
    let cy = y;
    if (s.status === 'connected') {
      g.text('CONNECTED', x, cy, UI.good);
      g.text(accountName(s), x + 44, cy, UI.ink);
      cy += 8;
      g.text(s.npubShort ?? '', x + 44, cy, UI.muted);
      cy += 10;
      cy += g.para('Your islands are still saved only in this browser. Nothing is posted to your account.', x, cy, w, UI.muted) + 3;
    } else {
      cy += g.para('Connect your account to bring your Blobbi between compatible worlds.', x, cy, w, UI.ink) + 2;
      cy += g.para('Playing never needs an account, and your islands stay saved in this browser either way.', x, cy, w, UI.muted) + 3;
    }
    const rows = this.rows(ui);
    this.index = Math.min(this.index, Math.max(0, rows.length - 1));
    rows.forEach((it, i) => {
      g.button(it.label, x, cy, () => ((this.index = i), it.run()), { w: 150, primary: i === this.index });
      cy += 13;
    });
    if (s.problem && s.status !== 'connected') cy += g.para(PROBLEM_TEXT[s.problem], x, cy + 1, w, UI.bad) + 3;
    if (s.status !== 'connected' && !s.signerAvailable)
      cy += g.para('No extension here? Remote signer apps are not supported yet.', x, cy + 1, w, UI.muted) + 3;
    if (this.explain)
      cy += g.para('Your account is a Nostr identity kept by a signer, such as a browser extension. The game only asks it for your public key and reads your public profile name. It never sees your secret key and never posts anything.', x, cy + 1, w, UI.muted, 4) + 3;
    if (this.advanced && s.status === 'connected' && s.pubkey) {
      g.text('PUBLIC KEY', x, cy + 1, UI.accent);
      g.text(s.pubkey.slice(0, 32), x + 44, cy + 1, UI.ink);
      g.text(s.pubkey.slice(32), x + 44, cy + 8, UI.ink);
      g.text('SIGNER', x, cy + 16, UI.accent);
      g.text('BROWSER EXTENSION (NIP-07)', x + 44, cy + 16, UI.ink);
      g.text('PROFILE', x, cy + 24, UI.accent);
      g.text(PROFILE_TEXT[s.profile], x + 44, cy + 24, UI.ink);
      g.text('RELAYS', x, cy + 32, UI.accent);
      g.text(s.relays.map((r) => r.replace(/^wss:\/\//, '')).join(', '), x + 44, cy + 32, UI.ink);
      g.text('READ ONLY: NOTHING IS EVER PUBLISHED.', x, cy + 41, UI.muted);
    }
  }
}

/** The account's friendly name: its profile name, or "no profile name" (the short npub is shown under it). */
export function accountName(s: AccountSnapshot): string {
  return s.displayName ?? (s.profile === 'loading' ? 'LOOKING FOR YOUR PROFILE...' : 'NO PROFILE NAME');
}
