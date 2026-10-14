/**
 * M11D.4, A BLOBBI'S TRUE BEGINNING: the in-game account flow. It speaks of the player's Blobbi and its worlds first
 * and of Nostr only at the end, once the player has done it all:
 *
 *   intro      "Your Blobbi's world is growing!": what an account gives (other worlds, another device), never more
 *   name       the Blobbi's name (other worlds will know it by it); skipped when the player already chose it (M11D.5)
 *   choose     M11D.5: "How would you like to keep your Blobbi safe?": two illustrated cards, the RECOVERY KEY (simple,
 *              no password: the plain nsec) and the PROTECTED KEY (extra protection with a password: NIP-49)
 *   simple     the Recovery Key: what it is, an explicit acknowledgment, then SAVE MY RECOVERY KEY (a file; the key is
 *              never shown on screen, never copied to the clipboard, and dropped once the file was offered)
 *   password   the Protected Key: a password, twice, and plain words about what it can and cannot do
 *   save       the Protected Key file (or its text) offered to the player
 *   verify     the player loads the backup BACK (the file, or its pasted text; the password only for a Protected
 *              Key): only a backup that opens as this very identity counts. A started download never does.
 *   consent    what other worlds will see, and SHARE <name> / NOT YET (nothing is published before this press)
 *   working    the registration (resumable; see `nostr/activation.ts`)
 *   failed     what got in the way, TRY AGAIN (it resumes; nothing is published twice)
 *   reveal     the little secret behind the worlds: Nostr, in a few warm words
 *   restore    "Bring a Blobbi back" from either backup or a pasted nsec (the kind is told by the text; a password only
 *              when it is a Protected Key): look inside first, then restore (never overwriting, never sharing)
 *   legacy     a Blobbi born before identities existed (M11D.3) stays on this device: said kindly, never changed
 *
 * The screen never sees a secret: it hands the password and the loaded backup text to the `IdentityPort` and keeps
 * them only while its page is open (cleared on every page change and on close). It imports the Nostr port as types.
 * The one exception is the Recovery Key file the player asked for: its text passes through on its way to the
 * download and the reference is dropped right after.
 *
 * M11D.5 LOOK: the player's own Blobbi stands big on the left of every page, looking at the player; it beams when a
 * backup checks out and celebrates the reveal among little connected islands. REDUCED MOTION keeps it all still.
 */
import { Gfx, UI } from '../gfx';
import { isConfirm, type GameUI, type Screen } from '../game-ui';
import { t, upper, type MessageKey } from '../../i18n';
import type { PixelBuffer } from '../../core/pixel';
import type { BackupKind, BackupPreview, IdentityPort, IdentityProblem, ReservedBlobbi } from '../../nostr/port';
import { KEY_ICON, LOCK_ICON, drawConnectedWorlds, drawPortrait, drawTwinkles } from '../portrait';
import type { Expression } from '../../blobbi/sprite';
import type { PixelBlobbiIdentity } from '../../blobbi/identity';

/** One action of a page: a button, an illustrated card (the two backups) or a tick box (an acknowledgment). */
interface Action {
  label: string;
  run: () => void;
  primary?: boolean;
  enabled?: boolean;
  card?: { icon: PixelBuffer; sub: string; tag?: string };
  tick?: boolean;
}

export type IdentityPage = 'intro' | 'name' | 'choose' | 'simple' | 'password' | 'save' | 'verify' | 'consent' | 'working' | 'failed' | 'reveal' | 'restore' | 'restorePreview' | 'restoreDone' | 'legacy' | 'nothing';
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
  /**
   * M11D.6: CONTINUE after a restore: the host takes the player on (the restored Blobbi, when there is one, as the
   * obvious companion: the islands to choose from, or a new adventure). Never creates an island by itself.
   */
  continueAfterRestore?(d: string | null): void;
  /** M11D.6: how a restored Blobbi looks (its canonical identity and size), to show it before it walks anywhere. */
  portraitOf?(d: string): { identity: PixelBlobbiIdentity; size: number } | null;
  /** M11D.6: another account (not this Blobbi's owner) is connected now: it stays, and the screen says so. */
  otherAccountConnected?(owner: string): boolean;
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
  /** M11D.5: the backup the player chose (a Recovery Key or a Protected Key). */
  method: BackupKind | null = null;
  /** M11D.5: the Recovery Key's acknowledgment is ticked (cleared with its page). */
  acknowledged = false;
  /** M11D.5: when a happy moment began (a backup checked out), in UI seconds; -1 none. */
  private celebrateAt = -1;
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
      this.acknowledged = false;
      if (page === 'simple' || page === 'password') this.saved = false;
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
    const kind = this.loadedKind();
    this.message = !this.loaded ? null : kind === 'nsec' ? { key: 'identity.loadedRecovery', good: true } : kind === 'ncryptsec' ? { key: 'identity.loaded', good: true } : { key: 'identity.problem.corrupt', good: false };
  }

  /** What the loaded text is: a Recovery Key (no password), a Protected Key (a password), or nothing usable. */
  loadedKind(): BackupKind | null {
    return this.loaded ? (this.identity?.backupKind(this.loaded) ?? null) : null;
  }

  /** The loaded backup can be opened now (a Recovery Key at once; a Protected Key once its password is typed). */
  private ready(): boolean {
    const kind = this.loadedKind();
    return kind === 'nsec' || (kind === 'ncryptsec' && !!this.fields.backupPassword);
  }

  // ─── Actions (buttons and keys) ───────────────────────────────────────────────────────────────────────

  private actions(ui: GameUI): Action[] {
    const name = this.nameOf();
    const id = this.identity;
    // The password row appears only when the loaded backup needs one (or, before loading, for a Protected Key).
    const needsPassword = this.loadedKind() === 'ncryptsec' || (!this.loaded && this.method === 'ncryptsec');
    const load: Action[] = [
      { label: t('identity.verify.file'), run: () => this.host?.pickFile((text) => this.setLoaded(text)) },
      { label: t('identity.verify.paste'), run: () => this.host?.pasteText((text) => this.setLoaded(text)) },
      ...(needsPassword ? [{ label: t('identity.verify.password'), run: () => this.edit('backupPassword', true) }] : []),
    ];
    switch (this.page) {
      case 'intro':
        return [
          { label: t('identity.intro.go'), primary: true, run: () => void this.afterIntro() },
          { label: t('identity.notNow'), run: () => ui.close() },
        ];
      case 'name':
        return [
          { label: t('identity.name.edit'), run: () => this.edit('name', false) },
          { label: t('identity.continue'), primary: true, run: () => (this.subject && this.fields.name.trim() ? (id?.rename(this.subject, this.fields.name), this.go('choose')) : this.say('identity.name.empty', false)) },
        ];
      case 'choose':
        return [
          { label: t('identity.choose.simple'), card: { icon: KEY_ICON, sub: t('identity.choose.simpleSub') }, run: () => ((this.method = 'nsec'), this.go('simple')) },
          { label: t('identity.choose.protected'), card: { icon: LOCK_ICON, sub: t('identity.choose.protectedSub'), tag: t('identity.choose.safer') }, run: () => ((this.method = 'ncryptsec'), this.go('password')) },
          { label: t('identity.notNow'), run: () => ui.close() },
        ];
      case 'simple':
        return [
          { label: t('identity.simple.ack'), tick: this.acknowledged, run: () => (this.acknowledged = !this.acknowledged) },
          { label: t('identity.simple.save'), primary: !this.saved, enabled: this.acknowledged && !this.pending, run: () => void this.saveRecoveryKey() },
          { label: t('identity.save.check'), primary: this.saved, enabled: this.saved, run: () => this.go('verify') },
          { label: t('identity.simple.other'), run: () => ((this.method = 'ncryptsec'), this.go('password')) },
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
        return [...load, { label: t('identity.verify.check'), primary: true, enabled: !this.pending && this.ready(), run: () => void this.verify(ui) }];
      case 'consent':
        return [
          { label: t('identity.consent.share', { name }), primary: true, enabled: !this.pending, run: () => void this.register(ui) },
          { label: t('identity.consent.notYet'), run: () => ui.close() },
        ];
      case 'working':
        return [];
      case 'failed':
        return [
          { label: t('identity.failed.retry'), primary: true, enabled: !this.pending, run: () => (this.problem === 'no-backup' ? this.go('choose') : void this.register(ui)) },
          { label: t('identity.failed.later'), run: () => ui.close() },
        ];
      case 'reveal':
        return [{ label: t('identity.reveal.ok'), primary: true, run: () => ui.close() }];
      case 'restore':
        return [...load, { label: t('identity.restore.look'), primary: true, enabled: !this.pending && this.ready(), run: () => void this.inspect() }];
      case 'restorePreview':
        return [
          { label: t('identity.restore.go'), primary: true, enabled: !this.pending, run: () => void this.restore(ui) },
          { label: t('identity.cancel'), run: () => this.go('restore') },
        ];
      case 'restoreDone': {
        // M11D.6: one clear way on. The host decides where (the islands, or a new adventure with this Blobbi).
        const first = this.preview?.blobbis[0] ?? null;
        const on = () => {
          ui.close();
          if (this.host?.continueAfterRestore) this.host.continueAfterRestore(first?.d ?? null);
          else if (first) this.host?.bring(first.d);
        };
        return [{ label: first ? t('identity.restore.continueWith', { name: first.name }) : t('identity.restore.continue'), primary: true, run: on }, { label: t('identity.restore.later'), run: () => ui.close() }];
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

  /**
   * After the intro: an account's Blobbi goes to consent; M11D.6: so does one whose backup is already checked (a
   * restored identity proved its backup by being restored); else the name (unless chosen) and the two backups.
   */
  private async afterIntro(): Promise<void> {
    const b = this.subjectBlobbi();
    if (b?.ownerKind === 'account') return this.go('consent');
    if (b && (await this.identity?.backupVerified(b.owner))) return this.go('consent');
    this.go(b?.named ? 'choose' : 'name');
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

  /**
   * THE RECOVERY KEY, only now that the player asked for it and ticked the acknowledgment: the file is made, offered
   * to the browser at once, and its text dropped. It is never drawn, never copied to the clipboard, never kept.
   */
  private async saveRecoveryKey(): Promise<void> {
    const b = this.subjectBlobbi();
    if (!b || !this.identity || !this.acknowledged) return;
    this.pending = true;
    const file = await this.identity.makeRecoveryKey(b.owner, recoveryLines(b.name));
    this.pending = false;
    if (!file.ok) return this.say(problemKey(file.problem), false);
    // Offered and forgotten: `file` is local, so the screen holds no copy of the key's text after this line.
    this.host?.download(file.value.fileName, file.value.text);
    this.saved = true;
    this.say('identity.simple.offered', true);
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

  private async verify(ui?: GameUI): Promise<void> {
    const b = this.subjectBlobbi();
    if (!b || !this.identity) return;
    this.pending = true;
    const r = await this.identity.verifyBackup(b.owner, this.loaded, this.loadedKind() === 'nsec' ? '' : this.fields.backupPassword);
    this.pending = false;
    if (!r.ok) return this.say(problemKey(r.problem), false);
    this.backupFile = null;
    this.go('consent');
    this.say('identity.verify.ok', true);
    this.celebrateAt = ui?.now ?? -1;
  }

  async register(ui?: GameUI): Promise<void> {
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
    this.celebrateAt = ui?.now ?? -1;
  }

  private async inspect(): Promise<void> {
    if (!this.identity) return;
    this.pending = true;
    const r = await this.identity.previewBackup(this.loaded, this.loadedKind() === 'nsec' ? '' : this.fields.backupPassword);
    this.pending = false;
    if (!r.ok) return this.say(problemKey(r.problem), false);
    const keep = { text: this.loaded, password: this.fields.backupPassword };
    this.preview = r.value;
    this.go('restorePreview');
    // The confirmed restore needs them once more: kept on this page only.
    this.loaded = keep.text;
    this.fields.backupPassword = keep.password;
  }

  private async restore(ui?: GameUI): Promise<void> {
    if (!this.identity) return;
    this.pending = true;
    const r = await this.identity.restoreBackup(this.loaded, this.loadedKind() === 'nsec' ? '' : this.fields.backupPassword);
    this.pending = false;
    if (!r.ok) return this.say(problemKey(r.problem), false);
    this.preview = r.value;
    this.go('restoreDone');
    this.celebrateAt = ui?.now ?? -1;
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

  /** How the Blobbi looks on each page, and whether it celebrates. */
  private mood(ui: GameUI): { expression: Expression; party: boolean } {
    const fresh = this.celebrateAt >= 0 && ui.now - this.celebrateAt < 2.2;
    switch (this.page) {
      case 'reveal':
      case 'restoreDone':
        return { expression: 'excited', party: true };
      case 'consent':
        return { expression: 'happy', party: fresh };
      case 'failed':
        return { expression: 'sad', party: false };
      case 'simple':
      case 'password':
      case 'save':
      case 'verify':
      case 'working':
        return { expression: 'neutral', party: false };
      default:
        return { expression: 'happy', party: false };
    }
  }

  private actionHeight(g: Gfx, a: Action, tw: number): number {
    return a.card ? 26 : a.tick !== undefined ? 4 + 7 * g.lines(a.label, tw - 12).length : 14;
  }

  /** The page's words (heading, paragraphs, fields, message) from `top`; returns where they end. */
  private drawText(g: Gfx, ui: GameUI, tx: number, tw: number, top: number): number {
    const name = this.nameOf();
    const p = (key: MessageKey, cy: number, c = UI.ink, lines = 6, vars: Record<string, string | number> = {}) => cy + g.para(t(key, { name, ...vars }), tx, cy, tw, c, lines) + 4;
    let cy = top;
    const head = (key: MessageKey, vars: Record<string, string | number> = {}) => {
      cy += g.para(upper(t(key, { name, ...vars })), tx, cy, tw, UI.accent, 3) + 4;
    };
    const field = (label: MessageKey, value: string, secret: boolean) => {
      g.text(t(label), tx, cy, UI.muted);
      g.box(tx + 70, cy - 2, Math.min(120, tw - 70), 11, UI.bg, UI.line);
      g.text(secret ? '*'.repeat(Math.min(20, value.length)) : value, tx + 73, cy, UI.ink);
      cy += 13;
    };
    const loadedField = () => {
      const kind = this.loadedKind();
      field('identity.verify.loadedLabel', !this.loaded ? t('identity.verify.loadedNo') : kind === 'nsec' ? t('identity.choose.simple') : kind === 'ncryptsec' ? t('identity.choose.protected') : '?', false);
      if (kind === 'ncryptsec') field('identity.password.label', this.fields.backupPassword, true);
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
      case 'choose':
        head('identity.choose.title');
        cy = p('identity.choose.body', cy, UI.ink, 3);
        break;
      case 'simple':
        head('identity.simple.title');
        cy = p('identity.simple.body', cy, UI.ink, 5);
        break;
      case 'password':
        head('identity.password.title');
        cy = p('identity.password.warning', cy, UI.ink, 5);
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
        cy = p('identity.verify.bodyAny', cy, UI.ink, 4);
        loadedField();
        break;
      case 'consent':
        head('identity.consent.title');
        cy = p('identity.consent.body', cy);
        // M11D.7: a live build says plainly that this share is real, may last forever, and what never leaves the device.
        if (this.identity?.publishMode === 'rehearsal') cy = p('identity.consent.rehearsal', cy, UI.muted, 3);
        else {
          cy = p('identity.consent.live', cy, UI.accent, 3);
          cy = p('identity.consent.liveLasting', cy, UI.bad, 3);
          cy = p('identity.consent.livePrivate', cy, UI.good, 3);
        }
        if (this.subjectBlobbi()?.ownerKind === 'account') cy = p('identity.consent.account', cy, UI.muted, 3);
        else if (this.subjectBlobbi() && this.host?.otherAccountConnected?.(this.subjectBlobbi()!.owner)) cy = p('identity.consent.keepAccount', cy, UI.muted, 3);
        break;
      case 'working':
        head('identity.working.title');
        cy = p(this.identity?.publishMode === 'rehearsal' ? 'identity.working.rehearsal' : 'identity.working.body', cy, UI.muted);
        break;
      case 'failed':
        head('identity.failed.title');
        cy = p(problemKey(this.problem ?? 'storage'), cy);
        cy = p('identity.failed.safe', cy, UI.muted, 3);
        break;
      case 'reveal':
        // M11D.6: practice is never told as sharing: its own page, and Nostr is not revealed for a rehearsal.
        if (this.identity?.publishMode === 'rehearsal') {
          head('identity.practice.title');
          cy = p('identity.practice.body1', cy);
          cy = p('identity.practice.body2', cy, UI.muted);
          break;
        }
        head('identity.reveal.title');
        cy = p('identity.reveal.body1', cy);
        cy = p('identity.reveal.body2', cy, UI.good);
        // Little connected islands, a light travelling between them.
        drawConnectedWorlds(g, ui, tx, cy + 8, Math.min(tw, 150));
        cy += 14;
        break;
      case 'restore':
        head('identity.restore.title');
        cy = p('identity.restore.bodyAny', cy, UI.ink, 4);
        loadedField();
        break;
      case 'restorePreview': {
        head('identity.restore.previewTitle');
        const pv = this.preview!;
        cy = p(pv.kind === 'nsec' ? 'identity.restore.kindNsec' : 'identity.restore.kindNcryptsec', cy, UI.muted, 2);
        cy = p('identity.restore.owner', cy, UI.ink, 2, { who: pv.npubShort });
        if (pv.alreadyHere) cy = p('identity.restore.ownerHere', cy, UI.muted, 2);
        if (pv.blobbis.length) cy = p('identity.restore.blobbis', cy, UI.ink, 3, { names: pv.blobbis.map((b) => b.name + (b.alreadyHere ? ` (${t('identity.restore.here')})` : '')).join(', ') });
        else cy = p('identity.restore.noBlobbis', cy, UI.muted, 3);
        if (pv.otherAccount) cy = p('identity.restore.otherAccount', cy, UI.muted, 3);
        cy = p('identity.restore.nothingShared', cy, UI.muted, 2);
        break;
      }
      case 'restoreDone': {
        const first = this.preview?.blobbis[0];
        head(first ? 'identity.restore.doneTitle' : 'identity.restore.welcome', { name: first?.name ?? '' });
        cy = p(first ? 'identity.restore.doneBody' : 'identity.restore.doneIdentity', cy, UI.ink, 4, { name: first?.name ?? '' });
        break;
      }
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
    return cy;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const name = this.nameOf();
    // The Blobbi on the left (or the key, when there is no Blobbi yet: restoring from the main menu).
    const left = Math.min(84, Math.floor(w * 0.3));
    const lx = x + Math.floor(left / 2);
    const k = h >= 130 ? 3 : 2;
    const ground = y + Math.floor(h / 2) + 10 * k - 8;
    const mood = this.mood(ui);
    g.box(x, y, left, h, UI.slot, UI.line);
    if (mood.party) drawTwinkles(g, ui, lx, ground - 12 * k, 12 * k, 9);
    // M11D.6: after a restore, the restored Blobbi itself (it may not walk anywhere yet).
    const restored = this.page === 'restoreDone' && this.preview?.blobbis[0] ? this.preview.blobbis[0] : null;
    const subject = restored ? (this.host?.portraitOf?.(restored.d) ?? undefined) : undefined;
    if (ui.live || subject) {
      const shown = restored ? restored.name : name;
      drawPortrait(g, ui, lx, ground, { scale: k, expression: mood.expression, hop: mood.party, island: true, islandMax: Math.floor(left / 2) - 6, subject });
      g.text(shown, lx - Math.floor(g.measure(shown) / 2), ground + 12, mood.party ? UI.accent : UI.ink);
    } else g.buf.blit(LOCK_ICON.scaled(3), lx - Math.floor((LOCK_ICON.width * 3) / 2), ground - LOCK_ICON.height * 3);

    const tx = x + left + 8;
    const tw = w - left - 8;
    // The words and the actions as one block, centred in the column (no wide empty band between them).
    const acts = this.actions(ui);
    const probe = new Gfx(w, h, 1);
    const actsH = acts.reduce((n, a) => n + this.actionHeight(probe, a, tw), 0) + (acts.some((a) => a.card) ? 3 + probe.lines(t('identity.choose.compare'), tw).length * 7 : 0);
    const textH = this.drawText(probe, ui, 0, tw, 0);
    const top = y + Math.max(1, Math.floor((h - textH - 6 - actsH) / 2));
    const cy = this.drawText(g, ui, tx, tw, top);
    // Actions: illustrated cards, then tick boxes and buttons.
    const enabled = acts.filter((a) => a.enabled !== false);
    let by = Math.min(cy + 6, y + h - actsH);
    for (const a of acts) {
      const on = a.enabled !== false;
      const selected = on && enabled.indexOf(a) === this.index;
      const press = () => {
        this.index = Math.max(0, enabled.indexOf(a));
        a.run();
      };
      if (a.card) {
        this.drawCard(g, tx, by, tw, a, selected, press);
        if (a === acts.filter((c) => c.card).at(-1)) {
          by += 26;
          // Never presented as equally safe: one plain line under the cards.
          by += g.para(t('identity.choose.compare'), tx, by, tw, UI.muted, 2) + 3;
          continue;
        }
      } else if (a.tick !== undefined) {
        g.box(tx, by, 7, 7, UI.bg, selected ? UI.accent : UI.muted);
        if (a.tick) g.buf.fillRect(tx + 2, by + 2, 3, 3, UI.good);
        const lines = g.lines(a.label, tw - 12);
        lines.forEach((l, i) => g.text(l, tx + 11, by + i * 7, selected ? UI.ink : UI.muted));
        g.hit(tx - 2, by - 2, tw, lines.length * 7 + 3, press);
      } else g.button(a.label, tx, by, press, { w: Math.min(tw, 180), primary: a.primary || selected, enabled: on });
      by += this.actionHeight(g, a, tw);
    }
  }

  /** One of the two backup cards: its icon in a little frame, its name, what it means, and a tag. */
  private drawCard(g: Gfx, x: number, y: number, w: number, a: Action, selected: boolean, press: () => void): void {
    const c = a.card!;
    const hover = g.hovered(x, y, w, 23);
    g.box(x, y, w, 23, selected || hover ? UI.slotHi : UI.slot, selected ? UI.accent : UI.line);
    g.box(x + 3, y + 3, 17, 17, UI.bg, UI.line);
    g.buf.blit(c.icon, x + 3 + Math.floor((17 - c.icon.width) / 2), y + 3 + Math.floor((17 - c.icon.height) / 2));
    g.text(a.label, x + 25, y + 4, selected ? UI.accent : UI.ink);
    g.text(c.sub, x + 25, y + 13, UI.muted);
    if (c.tag) {
      const tw = g.measure(c.tag) + 6;
      g.box(x + w - tw - 3, y + 3, tw, 9, UI.bg, UI.good);
      g.text(c.tag, x + w - tw, y + 5, UI.good);
    }
    g.hit(x, y, w, 23, press);
  }
}

/** The human words at the top of a backup file (in the player's language). */
export function backupLines(name: string): string[] {
  return [t('identity.file.l1', { name }), '', t('identity.file.l2', { name }), t('identity.file.l3'), t('identity.file.l4', { name }), t('identity.file.l5')];
}

/** The words at the top of a Recovery Key file (in the player's language): what it is, and that it must stay private. */
export function recoveryLines(name: string): string[] {
  return [t('identity.rfile.l1', { name }), '', t('identity.rfile.l2'), '', t('identity.rfile.l3', { name }), t('identity.rfile.l4')];
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
    partial: 'identity.problem.partial',
    'sign-failed': 'identity.problem.sign',
    'wrong-signer': 'identity.problem.sign',
    'no-backup': 'identity.problem.backup',
  };
  return map[p] ?? 'identity.problem.other';
}
