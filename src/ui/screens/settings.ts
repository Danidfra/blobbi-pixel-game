/**
 * SETTINGS AND HELP: presentation preferences (language, text size, day and night lighting, the goal box, sound,
 * motion) and the audio mix, kept per browser by the playground, and the controls. Nothing here touches the world or
 * the save. Three pages, GAME, SOUND and ACCOUNT (Tab or the buttons switch); on a cycling row (a volume, the language,
 * the text size) LEFT and RIGHT change it, ENTER steps it.
 *
 * ACCOUNT (M11B) is optional and read-only: connect a browser extension signer to tell the game who you are. It
 * never saves islands to the account, publishes, or asks for a secret key; it talks to the account only through
 * the `AccountPort` (the Nostr module itself is never imported here).
 */
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, TEXT_SIZES, type GameUI, type Screen, type TextSize } from '../game-ui';
import type { AudioSettings } from '../../audio/engine';
import type { AccountPort, AccountSnapshot } from '../../nostr/port';
import { getLocale, LOCALES, setLocale, t, type MessageKey } from '../../i18n';

const CONTROLS: readonly MessageKey[] = ['controls.move', 'controls.use', 'controls.menus1', 'controls.menus2', 'controls.care', 'controls.seed', 'controls.build', 'controls.moveMode', 'controls.tools', 'controls.view', 'controls.home'];

type Row = { label: string; run: () => void; adjust?: (d: number) => void };
const onOff = (v: boolean) => t(v ? 'common.on' : 'common.off');
const pct = (v: number) => (v <= 0 ? t('common.off') : `${Math.round(v * 100)}%`);
const VOLUME_STEP = 0.1;
type Page = 'game' | 'sound' | 'account';
const PAGES: readonly Page[] = ['game', 'sound', 'account'];

/** The next language in the list (wrapping), for LEFT/RIGHT and ENTER on the language row. */
export function nextLocale(d: number): void {
  const i = LOCALES.findIndex((l) => l.id === getLocale());
  setLocale(LOCALES[(i + d + LOCALES.length) % LOCALES.length].id);
}

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
    if (this.page === 'account') void this.account?.refreshProfile();
  }

  private setPage(page: Page): void {
    this.page = page;
    this.index = 0;
    if (page === 'account') void this.account?.refreshProfile();
  }

  title(): string {
    return t('settings.title');
  }

  rows(ui: GameUI): Row[] {
    const s = ui.settings;
    const change = (f: () => void) => () => {
      f();
      this.onChange?.();
    };
    if (this.page === 'game') {
      const size = (d: number) => change(() => (s.textSize = TEXT_SIZES[(TEXT_SIZES.indexOf(s.textSize) + d + TEXT_SIZES.length) % TEXT_SIZES.length] as TextSize))();
      const language = (d: number) => change(() => nextLocale(d))();
      return [
        { label: t('settings.language', { language: LOCALES.find((l) => l.id === getLocale())!.name }), run: () => language(1), adjust: (d) => language(Math.sign(d)) },
        { label: t('settings.textSize', { size: t(`settings.textSize.${s.textSize}`) }), run: () => size(1), adjust: (d) => size(Math.sign(d)) },
        { label: t('settings.daylight', { state: onOff(s.daylight) }), run: change(() => (s.daylight = !s.daylight)) },
        { label: t('settings.goals', { state: onOff(s.goals) }), run: change(() => (s.goals = !s.goals)) },
        { label: t('settings.sound', { state: onOff(s.sound) }), run: change(() => (s.sound = !s.sound)) },
        { label: t('settings.reducedMotion', { state: onOff(s.reducedMotion) }), run: change(() => (s.reducedMotion = !s.reducedMotion)) },
        // Tips belong to the island (saved with it), so a new island starts with them on.
        ...(ui.live && !ui.live.visitor ? [{ label: t('settings.tips', { state: onOff(!ui.live.tutorial.skipped) }), run: () => ui.live!.setTips(ui.live!.tutorial.skipped) }] : []),
      ];
    }
    if (this.page === 'account') return this.accountRows(ui);
    const a = this.audio;
    if (!a) return [];
    const volume = (key: 'master' | 'music' | 'sfx' | 'ambient', label: MessageKey): Row => {
      const adjust = (d: number) => change(() => (a[key] = Math.round(Math.max(0, Math.min(1, a[key] + d)) * 10) / 10))();
      // A click steps up and wraps to off, so the row works with a pointer alone.
      return { label: t(label, { level: pct(a[key]) }), run: () => (a[key] >= 1 ? change(() => (a[key] = 0))() : adjust(VOLUME_STEP * 2)), adjust };
    };
    return [
      volume('master', 'settings.volume'),
      volume('music', 'settings.music'),
      volume('sfx', 'settings.effects'),
      volume('ambient', 'settings.ambience'),
      { label: t('settings.musicOn', { state: onOff(a.musicOn) }), run: change(() => (a.musicOn = !a.musicOn)) },
      { label: t('settings.softer', { state: onOff(a.reduced) }), run: change(() => (a.reduced = !a.reduced)) },
      { label: t('settings.muteAll', { state: onOff(a.muted) }), run: change(() => (a.muted = !a.muted)) },
    ];
  }

  /** The ACCOUNT page's buttons: CONNECT as a guest; DISCONNECT, CHECK AGAIN and ADVANCED when connected. */
  private accountRows(ui: GameUI): Row[] {
    const acc = this.account;
    if (!acc) return [];
    const s = acc.snapshot();
    const help: Row = { label: t(this.explain ? 'account.hideExplanation' : 'account.whatIsThis'), run: () => (this.explain = !this.explain) };
    if (s.status !== 'connected')
      return [
        {
          label: t(s.status === 'connecting' ? 'account.connecting' : 'account.connect'),
          run: () => {
            if (s.status === 'connecting') return;
            if (!s.signerAvailable) ui.say(t('account.noSignerShort'), false);
            void acc.connect();
          },
        },
        help,
      ];
    return [
      { label: t('account.disconnect'), run: () => (acc.disconnect(), (this.index = 0), ui.say(t('account.disconnected'))) },
      { label: t('account.checkAgain'), run: () => void acc.connect() },
      { label: t(this.advanced ? 'account.hideAdvanced' : 'account.advanced'), run: () => (this.advanced = !this.advanced) },
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
    tab(t('settings.tab.game'), 'game', x);
    tab(t('settings.tab.sound'), 'sound', x + 78);
    tab(t('settings.tab.account'), 'account', x + 156);
    if (this.page === 'account') return this.drawAccount(g, ui, x, y + 16, w);
    let cy = y + 16;
    const rows = this.rows(ui);
    rows.forEach((it, i) => {
      g.button(it.label, x, cy, () => ((this.index = i), it.run()), { w: 150, primary: i === this.index });
      // A cycling row shows its arrows inside the button (the pointer steps it, LEFT and RIGHT from the keyboard).
      if (it.adjust && i === this.index) {
        g.text('<', x + 3, cy + 3, UI.accent, 'title');
        g.text('>', x + 144, cy + 3, UI.accent, 'title');
      }
      cy += 13;
    });
    const note = this.page === 'game' ? t('settings.note.game') : this.audio ? t('settings.note.sound') : t('settings.note.noAudio');
    g.para(note, x, cy + 3, 150, UI.muted, 6);
    const cx = x + 172;
    g.heading(t('settings.controls'), cx, y + 18, UI.accent);
    CONTROLS.forEach((k, i) => g.text(t(k), cx, y + 30 + i * 9, UI.ink));
    g.para(t('settings.controls.note'), cx, y + 30 + CONTROLS.length * 9 + 4, w - 174, UI.muted, 4);
  }

  /** The ACCOUNT page: a friendly status, the buttons, and (on request) an explanation or the technical details. */
  private drawAccount(g: Gfx, ui: GameUI, x: number, y: number, w: number): void {
    const acc = this.account;
    if (!acc) {
      g.para(t('account.unavailable'), x, y, w, UI.muted);
      return;
    }
    const s = acc.snapshot();
    let cy = y;
    if (s.status === 'connected') {
      const lw = g.heading(t('account.connected'), x, cy, UI.good) + 8;
      g.text(accountName(s), x + lw, cy, UI.ink);
      cy += 8;
      g.text(s.npubShort ?? '', x + lw, cy, UI.muted);
      cy += 10;
      cy += g.para(t('account.localOnly'), x, cy, w, UI.muted) + 3;
    } else {
      cy += g.para(t('account.pitch'), x, cy, w, UI.ink) + 2;
      cy += g.para(t('account.optional'), x, cy, w, UI.muted) + 3;
    }
    const rows = this.rows(ui);
    this.index = Math.min(this.index, Math.max(0, rows.length - 1));
    rows.forEach((it, i) => {
      g.button(it.label, x, cy, () => ((this.index = i), it.run()), { w: 170, primary: i === this.index });
      cy += 13;
    });
    if (s.problem && s.status !== 'connected') cy += g.para(t(`account.problem.${s.problem}`), x, cy + 1, w, UI.bad) + 3;
    if (s.status !== 'connected' && !s.signerAvailable) cy += g.para(t('account.noSignerHint'), x, cy + 1, w, UI.muted) + 3;
    if (this.explain) cy += g.para(t('account.explanation'), x, cy + 1, w, UI.muted, 4) + 3;
    if (this.advanced && s.status === 'connected' && s.pubkey) {
      const rows2: [MessageKey, string][] = [
        ['account.publicKey', s.pubkey.slice(0, 32)],
        ['account.publicKey', s.pubkey.slice(32)],
        ['account.signer', t('account.signer.nip07')],
        ['account.profile', t(`account.profile.${s.profile}`)],
        ['account.relays', s.relays.map((r) => r.replace(/^wss:\/\//, '')).join(', ')],
      ];
      const lw = Math.max(...rows2.map(([k]) => g.measure(t(k)))) + 6;
      rows2.forEach(([k, v], i) => {
        if (i !== 1) g.text(t(k), x, cy + 1 + i * 8, UI.accent);
        g.text(v, x + lw, cy + 1 + i * 8, UI.ink);
      });
      g.text(t('account.readOnly'), x, cy + 2 + rows2.length * 8, UI.muted);
    }
  }
}

/** The account's friendly name: its profile name, or "no profile name" (the short npub is shown under it). */
export function accountName(s: AccountSnapshot): string {
  return s.displayName ?? t(s.profile === 'loading' ? 'account.lookingForProfile' : 'account.noProfileName');
}
