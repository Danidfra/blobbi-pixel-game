/**
 * M11D.4, A BLOBBI'S TRUE BEGINNING: the in-game account flow. It speaks of the player's Blobbi and its worlds first
 * and of Nostr only at the end, once the player has done it all:
 *
 *   intro      "Your Blobbi's world is growing!": what an account gives (other worlds, another device), never more
 *   name       the Blobbi's name (other worlds will know it by it)
 *   password   "Create a secret backup so you can find <name> again": a password, twice, and plain words about loss
 *   save       the backup file (or its text) offered to the player
 *   verify     the player loads the backup BACK (the file, or its pasted text) and types the password: only a backup
 *              that opens counts. A started download never does.
 *   consent    what other worlds will see, and SHARE <name> / NOT YET (nothing is published before this press)
 *   working    the registration (resumable; see `nostr/activation.ts`)
 *   failed     what got in the way, TRY AGAIN (it resumes; nothing is published twice)
 *   reveal     the little secret behind the worlds: Nostr, in a few warm words
 *   restore    "Bring a Blobbi back" from a backup: look inside first, then restore (never overwriting, never sharing)
 *   legacy     a Blobbi born before identities existed (M11D.3) stays on this device: said kindly, never changed
 *
 * The screen never sees a secret: it hands the password and the loaded backup text to the `IdentityPort` and keeps
 * them only while its page is open (cleared on every page change and on close). It imports the Nostr port as types.
 */
import { Gfx, UI } from '../gfx';
import { isConfirm, type GameUI, type Screen } from '../game-ui';
import { t, upper, type MessageKey } from '../../i18n';
import type { BackupPreview, IdentityPort, IdentityProblem, ReservedBlobbi } from '../../nostr/port';

export type IdentityPage = 'intro' | 'name' | 'password' | 'save' | 'verify' | 'consent' | 'working' | 'failed' | 'reveal' | 'restore' | 'restorePreview' | 'restoreDone' | 'legacy' | 'nothing';
export type IdentityField = 'name' | 'password' | 'password2' | 'backupPassword';

/** What the host (the playground) does for the screen: text fields, files, downloads, the walking Blobbi. */
export interface IdentityHost {
  /** Focus a hidden input for a field; every change comes back through `set`. */
  editText(field: IdentityField, current: string, secret: boolean, set: (value: string) => void): void;
  /** Let the player choose a file; its text comes back (at most a few kilobytes). */
  pickFile(done: (text: string) => void): void;
  /** Let the player paste text (a hidden text area); it comes back. */
  pasteText(done: (text: string) => void): void;
  /** Offer a file to the browser (a download). */
  download(fileName: string, text: string): void;
  copy(text: string): Promise<boolean>;
  /** The Blobbi walking now: a reserved one (its d), a legacy local one, or neither. */
  walking(): { reserved: ReservedBlobbi | null; legacyLocal: boolean };
  /** Bring a restored Blobbi to the island (the usual explicit choice). */
  bring(d: string): void;
}

export class IdentityScreen implements Screen {
  readonly id = 'identity' as const;
  page: IdentityPage = 'intro';
  identity: IdentityPort | null = null;
  host: IdentityHost | null = null;
  /** The Blobbi this flow is about (its d). */
  subject: string | null = null;
  fields: Record<IdentityField, string> = { name: '', password: '', password2: '', backupPassword: '' };
  /** The backup text the player loaded back (file or paste), held only on its page. */
  private loaded = '';
  private backupFile: { fileName: string; text: string } | null = null;
  private saved = false;
  private message: { key: MessageKey; good: boolean } | null = null;
  private preview: BackupPreview | null = null;
  private problem: IdentityProblem | null = null;
  private pending = false;
  index = 0;

  title(): string {
    return t('identity.title');
  }

  /** Open on the right page for the walking Blobbi (or on RESTORE). */
  start(page: 'activate' | 'restore'): void {
    const walking = this.host?.walking() ?? { reserved: null, legacyLocal: false };
    this.clear();
    if (page === 'restore') return this.go('restore');
    if (walking.reserved) {
      this.subject = walking.reserved.d;
      this.fields.name = walking.reserved.name;
      const reg = this.identity?.registration(walking.reserved.d);
      if (walking.reserved.activatedAt || reg?.stage === 'done') return this.go('reveal');
      if (reg && reg.stage !== 'none') return this.go('consent'); // a registration under way resumes at consent
      return this.go('intro');
    }
    this.go(walking.legacyLocal ? 'legacy' : 'nothing');
  }

  opened(): void {
    this.index = 0;
  }

  private subjectBlobbi(): ReservedBlobbi | null {
    return this.identity?.reserved().find((b) => b.d === this.subject) ?? null;
  }

  private nameOf(): string {
    return this.subjectBlobbi()?.name ?? (this.fields.name || 'Blobbi');
  }

  private clear(): void {
    this.fields = { name: this.fields.name, password: '', password2: '', backupPassword: '' };
    this.loaded = '';
    this.message = null;
    this.problem = null;
  }

  go(page: IdentityPage): void {
    // Secrets live only on their page.
    if (page !== this.page) {
      this.fields.password = '';
      this.fields.password2 = '';
      this.fields.backupPassword = '';
      this.loaded = '';
      if (page !== 'save' && page !== 'verify') this.backupFile = null;
      this.message = null;
    }
    this.page = page;
    this.index = 0;
  }

  /** Set a field (the host's hidden input mirrors here; tests set it directly). */
  setField(field: IdentityField, value: string): void {
    this.fields[field] = field === 'name' ? value.slice(0, 24) : value.slice(0, 128);
  }

  /** The backup text the player loaded back (file or paste). */
  setLoaded(text: string): void {
    this.loaded = text.slice(0, 16_384);
    this.message = this.loaded ? { key: 'identity.loaded', good: true } : null;
  }

  // ─── Actions (buttons and keys) ───────────────────────────────────────────────────────────────────────

  private actions(ui: GameUI): { label: string; run: () => void; primary?: boolean; enabled?: boolean }[] {
    const name = this.nameOf();
    const id = this.identity;
    const b = this.subjectBlobbi();
    switch (this.page) {
      case 'intro':
        return [
          { label: t('identity.intro.go'), primary: true, run: () => this.go(b?.ownerKind === 'account' ? 'consent' : 'name') },
          { label: t('identity.notNow'), run: () => ui.close() },
        ];
      case 'name':
        return [
          { label: t('identity.name.edit'), run: () => this.edit('name', false) },
          { label: t('identity.continue'), primary: true, run: () => (this.subject && this.fields.name.trim() ? (id?.rename(this.subject, this.fields.name), this.go('password')) : this.say('identity.name.empty', false)) },
        ];
      case 'password':
        return [
          { label: t('identity.password.edit'), run: () => this.edit('password', true) },
          { label: t('identity.password.again'), run: () => this.edit('password2', true) },
          { label: t('identity.password.create'), primary: true, enabled: !this.pending, run: () => void this.makeBackup() },
        ];
      case 'save':
        return [
          { label: t('identity.save.file'), primary: !this.saved, run: () => this.saveFile() },
          { label: t('identity.save.copy'), run: () => void this.copyText() },
          { label: t('identity.save.check'), primary: this.saved, enabled: this.saved, run: () => this.go('verify') },
        ];
      case 'verify':
        return [
          { label: t('identity.verify.file'), run: () => this.host?.pickFile((text) => this.setLoaded(text)) },
          { label: t('identity.verify.paste'), run: () => this.host?.pasteText((text) => this.setLoaded(text)) },
          { label: t('identity.verify.password'), run: () => this.edit('backupPassword', true) },
          { label: t('identity.verify.check'), primary: true, enabled: !this.pending && !!this.loaded && !!this.fields.backupPassword, run: () => void this.verify() },
        ];
      case 'consent':
        return [
          { label: t('identity.consent.share', { name }), primary: true, enabled: !this.pending, run: () => void this.register() },
          { label: t('identity.consent.notYet'), run: () => ui.close() },
        ];
      case 'working':
        return [];
      case 'failed':
        return [
          { label: t('identity.failed.retry'), primary: true, enabled: !this.pending, run: () => (this.problem === 'no-backup' ? this.go('password') : void this.register()) },
          { label: t('identity.failed.later'), run: () => ui.close() },
        ];
      case 'reveal':
        return [{ label: t('identity.reveal.ok'), primary: true, run: () => ui.close() }];
      case 'restore':
        return [
          { label: t('identity.verify.file'), run: () => this.host?.pickFile((text) => this.setLoaded(text)) },
          { label: t('identity.verify.paste'), run: () => this.host?.pasteText((text) => this.setLoaded(text)) },
          { label: t('identity.verify.password'), run: () => this.edit('backupPassword', true) },
          { label: t('identity.restore.look'), primary: true, enabled: !this.pending && !!this.loaded && !!this.fields.backupPassword, run: () => void this.inspect() },
        ];
      case 'restorePreview':
        return [
          { label: t('identity.restore.go'), primary: true, enabled: !this.pending, run: () => void this.restore() },
          { label: t('identity.cancel'), run: () => this.go('restore') },
        ];
      case 'restoreDone': {
        const first = this.preview?.blobbis[0];
        return [...(first ? [{ label: t('identity.restore.bring', { name: first.name }), primary: true, run: () => (this.host?.bring(first.d), ui.close()) }] : []), { label: t('identity.close'), run: () => ui.close() }];
      }
      case 'legacy':
      case 'nothing':
        return [
          { label: t('identity.close'), primary: true, run: () => ui.close() },
          { label: t('identity.restore.open'), run: () => this.go('restore') },
        ];
    }
  }

  private say(key: MessageKey, good: boolean): void {
    this.message = { key, good };
  }

  private edit(field: IdentityField, secret: boolean): void {
    this.host?.editText(field, this.fields[field], secret, (v) => this.setField(field, v));
  }

  private async makeBackup(): Promise<void> {
    const b = this.subjectBlobbi();
    if (!b || !this.identity) return;
    const p = this.fields.password;
    if (p.length < 8) return this.say('identity.password.short', false);
    if (p !== this.fields.password2) return this.say('identity.password.different', false);
    this.pending = true;
    const r = await this.identity.makeBackup(b.owner, p, backupLines(b.name));
    this.pending = false;
    if (!r.ok) return this.say(problemKey(r.problem), false);
    this.backupFile = r.value;
    this.saved = false;
    this.go('save');
  }

  private saveFile(): void {
    if (!this.backupFile) return;
    this.host?.download(this.backupFile.fileName, this.backupFile.text);
    this.saved = true;
    this.say('identity.save.offered', true);
  }

  private async copyText(): Promise<void> {
    if (!this.backupFile) return;
    const ok = (await this.host?.copy(this.backupFile.text)) ?? false;
    if (ok) this.saved = true;
    this.say(ok ? 'identity.save.copied' : 'identity.save.copyFailed', ok);
  }

  private async verify(): Promise<void> {
    const b = this.subjectBlobbi();
    if (!b || !this.identity) return;
    this.pending = true;
    const r = await this.identity.verifyBackup(b.owner, this.loaded, this.fields.backupPassword);
    this.pending = false;
    if (!r.ok) return this.say(problemKey(r.problem), false);
    this.backupFile = null;
    this.go('consent');
    this.say('identity.verify.ok', true);
  }

  async register(): Promise<void> {
    if (!this.subject || !this.identity) return;
    this.pending = true;
    this.go('working');
    const r = await this.identity.register(this.subject, true);
    this.pending = false;
    if (!r.ok) {
      this.problem = r.problem;
      this.go('failed');
      return;
    }
    this.go('reveal');
  }

  private async inspect(): Promise<void> {
    if (!this.identity) return;
    this.pending = true;
    const r = await this.identity.previewBackup(this.loaded, this.fields.backupPassword);
    this.pending = false;
    if (!r.ok) return this.say(problemKey(r.problem), false);
    const keep = { text: this.loaded, password: this.fields.backupPassword };
    this.preview = r.value;
    this.go('restorePreview');
    // The confirmed restore needs them once more: kept on this page only.
    this.loaded = keep.text;
    this.fields.backupPassword = keep.password;
  }

  private async restore(): Promise<void> {
    if (!this.identity) return;
    this.pending = true;
    const r = await this.identity.restoreBackup(this.loaded, this.fields.backupPassword);
    this.pending = false;
    if (!r.ok) return this.say(problemKey(r.problem), false);
    this.preview = r.value;
    this.go('restoreDone');
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const acts = this.actions(ui).filter((a) => a.enabled !== false);
    if (code === 'ArrowDown' || code === 'KeyS' || code === 'Tab') this.index = acts.length ? (this.index + 1) % acts.length : 0;
    else if (code === 'ArrowUp' || code === 'KeyW') this.index = acts.length ? (this.index + acts.length - 1) % acts.length : 0;
    else if (isConfirm(code) || code === 'KeyE') acts[Math.min(this.index, acts.length - 1)]?.run();
    // Every other key is the flow's own (no menu opens over it by accident).
    return true;
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────────────────────────────────

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const name = this.nameOf();
    const p = (key: MessageKey, cy: number, c = UI.ink, lines = 6, vars: Record<string, string | number> = {}) => cy + g.para(t(key, { name, ...vars }), x, cy, w, c, lines) + 4;
    let cy = y;
    const head = (key: MessageKey) => {
      g.heading(upper(t(key, { name })), x, cy, UI.accent);
      cy += 10;
    };
    const field = (label: MessageKey, value: string, secret: boolean) => {
      g.text(t(label), x, cy, UI.muted);
      g.box(x + 92, cy - 2, 120, 11, UI.bg, UI.line);
      g.text(secret ? '*'.repeat(Math.min(20, value.length)) : value, x + 95, cy, UI.ink);
      cy += 13;
    };
    switch (this.page) {
      case 'intro':
        head('identity.intro.title');
        cy = p('identity.intro.body1', cy);
        cy = p('identity.intro.body2', cy, UI.good);
        break;
      case 'name':
        head('identity.name.title');
        cy = p('identity.name.body', cy);
        field('identity.name.label', this.fields.name, false);
        break;
      case 'password':
        head('identity.password.title');
        cy = p('identity.password.body', cy);
        cy = p('identity.password.warning', cy, UI.muted, 4);
        field('identity.password.label', this.fields.password, true);
        field('identity.password.label2', this.fields.password2, true);
        break;
      case 'save':
        head('identity.save.title');
        cy = p('identity.save.body', cy);
        if (this.identity?.publishMode === 'rehearsal') cy = p('identity.save.fileName', cy, UI.muted, 2, { file: this.backupFile?.fileName ?? '' });
        break;
      case 'verify':
        head('identity.verify.title');
        cy = p('identity.verify.body', cy);
        field('identity.verify.loadedLabel', this.loaded ? t('identity.verify.loadedYes') : t('identity.verify.loadedNo'), false);
        field('identity.password.label', this.fields.backupPassword, true);
        break;
      case 'consent':
        head('identity.consent.title');
        cy = p('identity.consent.body', cy);
        if (this.identity?.publishMode === 'rehearsal') cy = p('identity.consent.rehearsal', cy, UI.muted, 3);
        if (this.subjectBlobbi()?.ownerKind === 'account') cy = p('identity.consent.account', cy, UI.muted, 3);
        break;
      case 'working':
        head('identity.working.title');
        cy = p('identity.working.body', cy, UI.muted);
        break;
      case 'failed':
        head('identity.failed.title');
        cy = p(problemKey(this.problem ?? 'storage'), cy);
        cy = p('identity.failed.safe', cy, UI.muted, 3);
        break;
      case 'reveal':
        head('identity.reveal.title');
        cy = p('identity.reveal.body1', cy);
        cy = p('identity.reveal.body2', cy, UI.good);
        if (this.identity?.publishMode === 'rehearsal') cy = p('identity.reveal.rehearsal', cy, UI.muted, 3);
        break;
      case 'restore':
        head('identity.restore.title');
        cy = p('identity.restore.body', cy);
        field('identity.verify.loadedLabel', this.loaded ? t('identity.verify.loadedYes') : t('identity.verify.loadedNo'), false);
        field('identity.password.label', this.fields.backupPassword, true);
        break;
      case 'restorePreview': {
        head('identity.restore.previewTitle');
        const pv = this.preview!;
        cy = p('identity.restore.owner', cy, UI.ink, 2, { who: pv.npubShort });
        if (pv.alreadyHere) cy = p('identity.restore.ownerHere', cy, UI.muted, 2);
        if (pv.blobbis.length) cy = p('identity.restore.blobbis', cy, UI.ink, 3, { names: pv.blobbis.map((b) => b.name + (b.alreadyHere ? ` (${t('identity.restore.here')})` : '')).join(', ') });
        else cy = p('identity.restore.noBlobbis', cy, UI.muted, 3);
        cy = p('identity.restore.nothingShared', cy, UI.muted, 2);
        break;
      }
      case 'restoreDone':
        head('identity.restore.doneTitle');
        cy = p(this.preview?.blobbis.length ? 'identity.restore.doneBody' : 'identity.restore.doneIdentity', cy, UI.ink, 4, { name: this.preview?.blobbis[0]?.name ?? '' });
        break;
      case 'legacy':
        head('identity.legacy.title');
        cy = p('identity.legacy.body', cy);
        cy = p('identity.legacy.next', cy, UI.muted);
        break;
      case 'nothing':
        head('identity.nothing.title');
        cy = p('identity.nothing.body', cy);
        break;
    }
    if (this.message) cy = p(this.message.key, cy, this.message.good ? UI.good : UI.bad, 3);
    // Buttons, stacked at the bottom of the panel.
    const acts = this.actions(ui);
    const bw = Math.min(w, 180);
    let by = Math.max(cy + 2, y + h - acts.length * 14);
    let k = 0;
    for (const a of acts) {
      const enabled = a.enabled !== false;
      const selected = enabled && acts.filter((x) => x.enabled !== false).indexOf(a) === this.index;
      g.button(a.label, x, by, () => {
        this.index = Math.max(0, acts.filter((x) => x.enabled !== false).indexOf(a));
        a.run();
      }, { w: bw, primary: a.primary || selected, enabled });
      by += 14;
      k++;
    }
    void k;
  }
}

/** The human words at the top of a backup file (in the player's language). */
export function backupLines(name: string): string[] {
  return [t('identity.file.l1', { name }), '', t('identity.file.l2', { name }), t('identity.file.l3'), t('identity.file.l4', { name }), t('identity.file.l5')];
}

export function problemKey(p: IdentityProblem): MessageKey {
  const map: Partial<Record<IdentityProblem, MessageKey>> = {
    'wrong-password': 'identity.problem.password',
    'corrupt-backup': 'identity.problem.corrupt',
    mismatch: 'identity.problem.mismatch',
    unavailable: 'identity.problem.unavailable',
    unreachable: 'identity.problem.unreachable',
    'publish-failed': 'identity.problem.publish',
    'not-confirmed': 'identity.problem.confirm',
    'sign-failed': 'identity.problem.sign',
    'wrong-signer': 'identity.problem.sign',
    'no-backup': 'identity.problem.backup',
  };
  return map[p] ?? 'identity.problem.other';
}
