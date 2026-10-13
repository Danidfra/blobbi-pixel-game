/**
 * M11D.4, REGISTERING A BLOBBI (account activation's network part): publish its canonical 31124 state and its owner's
 * 11125 profile, idempotently and resumably, only after the player's explicit consent and (for a guest identity) a
 * VERIFIED backup.
 *
 *   preflight   ask the relays for this Blobbi (#d by its owner) and the owner's profile; a Blobbi already there is
 *               adopted (never overwritten, never created twice); a profile already listing it is left alone
 *   sign        the vault (guest identity) or the browser extension (an existing account) signs; the SIGNED events are
 *               stored before anything is sent, so every retry sends the very same events (same ids: no duplicates)
 *   publish     the Blobbi first, then the profile; a step that no relay accepted stops the run (resumable)
 *   confirm     read both back; only events the relays return count
 *   done        the caller makes the identity the player's account and marks the Blobbi registered
 *
 * Record `blobbi-pixel-lab:activation`: `{ version: 1, runs: { <d>: ActivationRun } }`: public data only (signed
 * events are public by nature). It survives reloads; a run can be resumed at any step. Nothing here touches an island,
 * a Blobbi's look or its local record.
 */
import type { NostrEvent } from 'nostr-tools/pure';
import { verifyEvent } from 'nostr-tools/pure';
import type { KeyValueStore } from '../game/persistence';
import { babyStateTemplate, isCanonicalBlobbi, profileTemplate, type BirthFacts, type EventTemplate } from './canonical-events';
import type { Publisher } from './publisher';

export const ACTIVATION_KEY = 'blobbi-pixel-lab:activation';

export type ActivationStage = 'consented' | 'signed' | 'published' | 'confirmed' | 'done';

export interface ActivationRun {
  owner: string;
  d: string;
  stage: ActivationStage;
  mode: 'live' | 'rehearsal';
  blobbi: NostrEvent | null;
  profile: NostrEvent | null;
  /** Relays that accepted each event. */
  accepted: { blobbi: string[]; profile: string[] };
  /** The Blobbi was already on the relays (adopted, not published again). */
  adopted: boolean;
  consentAt: number;
  updatedAt: number;
}

export type ActivationProblem = 'no-consent' | 'no-backup' | 'sign-failed' | 'wrong-signer' | 'not-canonical' | 'publish-failed' | 'not-confirmed' | 'unreachable';

export class ActivationError extends Error {
  constructor(
    readonly problem: ActivationProblem,
    readonly run: ActivationRun | null,
  ) {
    super(problem);
  }
}

export interface ActivationDeps {
  store: KeyValueStore;
  publisher: Publisher;
  /** Signs a template as the owner (the vault, or the browser extension). */
  sign: (template: EventTemplate) => Promise<NostrEvent>;
  now: () => number;
  /** Event times are seconds. */
  timeoutMs?: number;
}

export interface ActivationRequest {
  facts: BirthFacts;
  /** The player pressed SHARE (explicit consent to publish). */
  consent: boolean;
  /** A guest identity's backup was verified (loaded back and opened); an existing account needs none. */
  backupVerified: boolean;
  ownerKind: 'guest' | 'account';
}

function readRuns(store: KeyValueStore): Record<string, ActivationRun> {
  try {
    const v = JSON.parse(store.get(ACTIVATION_KEY) ?? 'null') as { version?: unknown; runs?: unknown } | null;
    return v?.version === 1 && v.runs && typeof v.runs === 'object' ? (v.runs as Record<string, ActivationRun>) : {};
  } catch {
    return {};
  }
}

export function activationRun(store: KeyValueStore, d: string): ActivationRun | null {
  return readRuns(store)[d] ?? null;
}

function saveRun(store: KeyValueStore, run: ActivationRun): void {
  const runs = readRuns(store);
  runs[run.d] = run;
  store.set(ACTIVATION_KEY, JSON.stringify({ version: 1, runs }));
}

/** Mark a confirmed run done (the caller has made the account local and marked the Blobbi registered). */
export function finishActivation(store: KeyValueStore, d: string, now: number): void {
  const run = activationRun(store, d);
  if (run && (run.stage === 'confirmed' || run.stage === 'done')) saveRun(store, { ...run, stage: 'done', updatedAt: now });
}

const newest = (events: NostrEvent[], owner: string, kind: number, d?: string) =>
  events
    .filter((e) => e.kind === kind && e.pubkey === owner && (d === undefined || e.tags.some((t) => t[0] === 'd' && t[1] === d)) && verifyEvent(e))
    .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0] ?? null;

/** Run (or resume) a registration. Returns the confirmed run; throws `ActivationError` with the run as it stands. */
export async function activate(req: ActivationRequest, deps: ActivationDeps): Promise<ActivationRun> {
  const { store, publisher } = deps;
  const timeout = deps.timeoutMs ?? 8000;
  const f = req.facts;
  const d = `blobbi-${f.owner.slice(0, 12)}-${f.petId}`;
  if (!req.consent) throw new ActivationError('no-consent', activationRun(store, d));
  if (req.ownerKind === 'guest' && !req.backupVerified) throw new ActivationError('no-backup', activationRun(store, d));
  const nowS = () => Math.floor(deps.now() / 1000);
  let run: ActivationRun = activationRun(store, d) ?? { owner: f.owner, d, stage: 'consented', mode: publisher.mode, blobbi: null, profile: null, accepted: { blobbi: [], profile: [] }, adopted: false, consentAt: deps.now(), updatedAt: deps.now() };
  if (run.stage === 'done' || run.stage === 'confirmed') return run;
  const save = (change: Partial<ActivationRun>) => {
    run = { ...run, ...change, updatedAt: deps.now() };
    saveRun(store, run);
  };
  save({});

  // 1. PREFLIGHT (and SIGN, once): what the relays already hold decides what is signed.
  if (!run.blobbi || !run.profile) {
    const [blobbiAnswer, profileAnswer] = await Promise.all([publisher.query({ kinds: [31124], authors: [f.owner], '#d': [d], limit: 10 }, timeout), publisher.query({ kinds: [11125], authors: [f.owner], limit: 10 }, timeout)]);
    if (!blobbiAnswer.reachable && !profileAnswer.reachable) throw new ActivationError('unreachable', run);
    const existingBlobbi = newest(blobbiAnswer.events, f.owner, 31124, d);
    const existingProfile = newest(profileAnswer.events, f.owner, 11125);
    const signAs = async (t: EventTemplate) => {
      let e: NostrEvent;
      try {
        e = await deps.sign(t);
      } catch {
        throw new ActivationError('sign-failed', run);
      }
      if (e.pubkey !== f.owner || !verifyEvent(e)) throw new ActivationError('wrong-signer', run);
      return e;
    };
    const blobbi = run.blobbi ?? existingBlobbi ?? (await signAs(babyStateTemplate(f, nowS())));
    if (!isCanonicalBlobbi(blobbi)) throw new ActivationError('not-canonical', run);
    const listed = existingProfile?.tags.some((t) => t[0] === 'has' && t[1] === d) ?? false;
    const profile = run.profile ?? (listed ? existingProfile! : await signAs(profileTemplate(f.owner, d, nowS(), existingProfile)));
    save({ blobbi, profile, adopted: run.adopted || (!!existingBlobbi && existingBlobbi.id === blobbi.id), stage: 'signed' });
  }

  // 2. PUBLISH the stored signed events (the same ones on every retry): the Blobbi, then the profile.
  if (run.stage === 'signed' || run.stage === 'consented') {
    if (!run.accepted.blobbi.length) {
      const ok = await publisher.publish(run.blobbi!, timeout);
      save({ accepted: { ...run.accepted, blobbi: ok } });
      if (!ok.length) throw new ActivationError('publish-failed', run);
    }
    if (!run.accepted.profile.length) {
      const ok = await publisher.publish(run.profile!, timeout);
      save({ accepted: { ...run.accepted, profile: ok } });
      if (!ok.length) throw new ActivationError('publish-failed', run);
    }
    save({ stage: 'published' });
  }

  // 3. CONFIRM: both must come back from the relays (the same events, or newer ones by the owner).
  const [b, p] = await Promise.all([publisher.query({ kinds: [31124], authors: [f.owner], '#d': [d], limit: 10 }, timeout), publisher.query({ kinds: [11125], authors: [f.owner], limit: 10 }, timeout)]);
  const back = newest(b.events, f.owner, 31124, d);
  const prof = newest(p.events, f.owner, 11125);
  if (!back || back.created_at < run.blobbi!.created_at || !prof || !prof.tags.some((t) => t[0] === 'has' && t[1] === d)) throw new ActivationError('not-confirmed', run);
  save({ stage: 'confirmed' });
  return run;
}
