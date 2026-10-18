/**
 * M11D.4, REGISTERING A BLOBBI (account activation's network part): publish its canonical 31124 state and its owner's
 * 11125 profile, idempotently and resumably, only after the player's explicit consent and (for a guest identity) a
 * VERIFIED backup.
 *
 *   preflight   ask the relays for this Blobbi (#d by its owner) and the owner's profile; a Blobbi already there is
 *               adopted (never overwritten, never created twice); a profile already listing it is left alone
 *   sign        the vault (guest identity) or the browser extension (an existing account) signs; the SIGNED events are
 *               stored before anything is sent, so every retry sends the very same events (same ids: no duplicates)
 *   publish     the Blobbi first, then the profile, each only to the relays that do not hold it yet (read back)
 *   confirm     read both back; only relays that RETURN the event count (see the policy in `relay-config.ts`)
 *   done        the caller makes the identity the player's account and marks the Blobbi registered
 *
 * M11D.6:
 * - THE POLICY (`relay-config.ts`). Both events read back from ONE relay is a share: the Blobbi is registered, and
 *   one relay down never holds the player back. Each event goes to every relay; the relays still missing one are
 *   owed it, and `spreadRegistration` later sends them those very events (never signed again) until each holds them
 *   or refuses them for good. Less than both events on one relay is PARTIAL (`partial`): the run stays open and TRY
 *   AGAIN sends the same events to the missing relays only. Nothing read back anywhere is a failure.
 * - NEVER A PROFILE FROM A GUESS. A new 11125 replaces the owner's old one everywhere (it is replaceable), so one is
 *   built from scratch only when no profile can exist elsewhere: a brand-new guest identity, or every relay answered.
 *   Otherwise a missing profile means "unreachable, try later", never "make an empty one" (that could drop Blobbis
 *   another app listed). Just before the profile is sent the relays are asked again: a newer profile made meanwhile
 *   (another app) is merged over, never replaced.
 * - REHEARSAL AND LIVE never mix. A rehearsal run (nothing left the device) is never taken for a live one: in a live
 *   build the registration starts afresh, and a rehearsal never marks a Blobbi registered (`identity.ts`).
 * - The d is the kit's (`getCanonicalBlobbiD`), never rebuilt by hand.
 *
 * Record `blobbi-pixel-lab:activation`: `{ version: 1, runs: { <d>: ActivationRun } }`: public data only (signed
 * events are public by nature, relay urls, times). It survives reloads; a run can be resumed at any step. Nothing here
 * touches an island, a Blobbi's look or its local record.
 */
import type { NostrEvent } from 'nostr-tools/pure';
import { verifyEvent } from 'nostr-tools/pure';
import type { KeyValueStore } from '../game/persistence';
import { babyStateTemplate, canonicalD, isCanonicalBlobbi, isProfile, profileFilter, profileTemplate, type BirthFacts, type EventTemplate } from './canonical-events';
import { accepted, type Publisher, type QueryResult, type RelayAck } from './publisher';
import { missingFrom, permanentRefusal, policyMet, PROFILE_REQUIRED_RELAYS } from './relay-config';

export const ACTIVATION_KEY = 'blobbi-pixel-lab:activation';

/** `published` is kept for runs stored by M11D.4/5; `publishing` is a run with some relays still missing. */
export type ActivationStage = 'consented' | 'signed' | 'publishing' | 'published' | 'confirmed' | 'done';

export interface ActivationRun {
  owner: string;
  d: string;
  stage: ActivationStage;
  mode: 'live' | 'rehearsal';
  blobbi: NostrEvent | null;
  profile: NostrEvent | null;
  /** Relays that accepted each event (OK true, or a duplicate). */
  accepted: { blobbi: string[]; profile: string[] };
  /** M11D.6: relays that returned each event when it was read back (the confirmation). */
  seenOn?: { blobbi: string[]; profile: string[] };
  /** The Blobbi was already on the relays (adopted, not published again). */
  adopted: boolean;
  /** M11D.6: why the last attempt stopped (public: a problem code), or null. */
  lastProblem?: ActivationProblem | null;
  /** After a share: the background deliveries to relays still missing an event (`spreadRegistration`). */
  spread?: SpreadState;
  consentAt: number;
  updatedAt: number;
}

export type ActivationProblem = 'no-consent' | 'no-backup' | 'sign-failed' | 'wrong-signer' | 'not-canonical' | 'publish-failed' | 'not-confirmed' | 'partial' | 'unreachable';

export class ActivationError extends Error {
  constructor(
    readonly problem: ActivationProblem,
    readonly run: ActivationRun | null,
  ) {
    super(problem);
  }
}

/** The deliveries owed after a share: how many tries so far, the relays that refused for good, a profile replaced since. */
export interface SpreadState {
  tries: number;
  refused: string[];
  profileSuperseded?: boolean;
}

/** How many background deliveries a share gets (each one a send to the missing relays, then a read back). */
export const SPREAD_MAX_TRIES = 8;

export interface ActivationDeps {
  store: KeyValueStore;
  publisher: Publisher;
  /** Signs a template as the owner (the vault, or the browser extension). */
  sign: (template: EventTemplate) => Promise<NostrEvent>;
  now: () => number;
  /** Per request (ms). */
  timeoutMs?: number;
  /** Waits before reading back again (relays may need a moment); tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

export interface ActivationRequest {
  facts: BirthFacts;
  /** The player pressed SHARE (explicit consent to publish). */
  consent: boolean;
  /** A guest identity's backup was verified (loaded back and opened); an existing account needs none. */
  backupVerified: boolean;
  ownerKind: 'guest' | 'account';
  /**
   * M11D.6: the owner may already have a profile somewhere (an existing account, or a guest identity that registered
   * another Blobbi before). Then a profile is never built from scratch unless every relay answered.
   */
  mayHaveProfile?: boolean;
}

function readRuns(store: KeyValueStore): Record<string, ActivationRun> {
  try {
    const v = JSON.parse(store.get(ACTIVATION_KEY) ?? 'null') as { version?: unknown; runs?: unknown } | null;
    return v?.version === 1 && v.runs && typeof v.runs === 'object' ? (v.runs as Record<string, ActivationRun>) : {};
  } catch {
    return {};
  }
}

/** The run for a Blobbi (in `mode` only, when given: a rehearsal run is not a live one). */
export function activationRun(store: KeyValueStore, d: string, mode?: 'live' | 'rehearsal'): ActivationRun | null {
  const run = readRuns(store)[d] ?? null;
  return run && (!mode || run.mode === mode) ? run : null;
}

/** Every run of an owner (any Blobbi), in `mode`. */
export function ownerRuns(store: KeyValueStore, owner: string, mode: 'live' | 'rehearsal'): ActivationRun[] {
  return Object.values(readRuns(store)).filter((r) => r.owner === owner && r.mode === mode);
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

/**
 * M11D.7: a Blobbi of a restored identity FOUND out there (read back after the restore, never sent from here) is
 * recorded as a finished LIVE run that ADOPTED that event, as `activate` adopts one it finds: so it reads as shared,
 * is never published again, and never passes for practice. Only the newest validly signed 31124 by its owner for that
 * d counts. A live run already here is left as it is (a share under way finishes its own way). Returns whether a
 * finished live run stands behind the Blobbi now.
 */
export function adoptFoundBlobbi(store: KeyValueStore, owner: string, d: string, events: readonly unknown[], now: number): boolean {
  const known = activationRun(store, d, 'live');
  if (known) return known.stage === 'done';
  const found = newest(events.filter((e): e is NostrEvent => !!e && typeof e === 'object' && typeof (e as NostrEvent).id === 'string'), owner, 31124, d);
  if (!found) return false;
  saveRun(store, { owner, d, stage: 'done', mode: 'live', blobbi: found, profile: null, accepted: { blobbi: [], profile: [] }, seenOn: { blobbi: [], profile: [] }, adopted: true, lastProblem: null, consentAt: now, updatedAt: now });
  return true;
}

const valid = (e: NostrEvent, owner: string, kind: number, d?: string) => e.kind === kind && e.pubkey === owner && (d === undefined || e.tags.some((t) => t[0] === 'd' && t[1] === d)) && verifyEvent(e);
/** NIP-01 replaceable order: the newest created_at; on a tie, the lowest id. */
const newest = (events: readonly NostrEvent[], owner: string, kind: number, d?: string) => events.filter((e) => valid(e, owner, kind, d)).sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0] ?? null;
/**
 * The owner's profile as the kit reads it: the newest valid 11125 (with the ecosystem marker), else the newest legacy
 * 31125 (carried over when merged).
 */
const newestProfile = (events: readonly NostrEvent[], owner: string) => newest(events.filter(isProfile), owner, 11125) ?? newest(events.filter(isProfile), owner, 31125);
const lists = (profile: NostrEvent | null, d: string) => !!profile?.tags.some((t) => t[0] === 'has' && t[1] === d);
const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];

/** The relays whose answer holds the Blobbi (this event, or a newer valid one with the same d by the owner). */
function holdersOfBlobbi(q: QueryResult, ours: NostrEvent): string[] {
  return Object.entries(q.byRelay)
    .filter(([, evs]) => evs && evs.some((e) => e.id === ours.id || (valid(e, ours.pubkey, 31124, tagD(ours)) && e.created_at >= ours.created_at)))
    .map(([url]) => url);
}

/** The relays whose newest profile of the owner lists the Blobbi. */
function holdersOfListing(q: QueryResult, owner: string, d: string): string[] {
  return Object.entries(q.byRelay)
    .filter(([, evs]) => evs && lists(newestProfile(evs, owner), d))
    .map(([url]) => url);
}

const tagD = (e: NostrEvent) => e.tags.find((t) => t[0] === 'd')?.[1];

/** Every relay that must answer for a profile read to be complete did (`PROFILE_REQUIRED_RELAYS`; else every relay). */
function profileReadComplete(publisher: Publisher, q: QueryResult): boolean {
  const required = PROFILE_REQUIRED_RELAYS.filter((u) => publisher.relays.includes(u));
  return (required.length ? required : publisher.relays).every((u) => q.byRelay[u] != null);
}

/** Run (or resume) a registration. Returns the confirmed run; throws `ActivationError` with the run as it stands. */
export async function activate(req: ActivationRequest, deps: ActivationDeps): Promise<ActivationRun> {
  const { store, publisher } = deps;
  const timeout = deps.timeoutMs ?? 8000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // Delivered: one relay holds BOTH events (the Blobbi and the profile that lists it), read back.
  const delivered = () => policyMet(publisher.relays, run.seenOn!.blobbi.filter((r) => run.seenOn!.profile.includes(r)));
  const f = req.facts;
  const d = canonicalD(f.owner, f.petId);
  if (!req.consent) throw new ActivationError('no-consent', activationRun(store, d, publisher.mode));
  if (req.ownerKind === 'guest' && !req.backupVerified) throw new ActivationError('no-backup', activationRun(store, d, publisher.mode));
  const nowS = () => Math.floor(deps.now() / 1000);
  const fresh = (): ActivationRun => ({ owner: f.owner, d, stage: 'consented', mode: publisher.mode, blobbi: null, profile: null, accepted: { blobbi: [], profile: [] }, seenOn: { blobbi: [], profile: [] }, adopted: false, lastProblem: null, consentAt: deps.now(), updatedAt: deps.now() });
  // A run of the other mode (a rehearsal, in a live build) is not this one: start afresh.
  let run: ActivationRun = activationRun(store, d, publisher.mode) ?? fresh();
  if (run.stage === 'done' || run.stage === 'confirmed') return run;
  run.seenOn ??= { blobbi: [], profile: [] };
  const save = (change: Partial<ActivationRun>) => {
    run = { ...run, ...change, updatedAt: deps.now() };
    saveRun(store, run);
  };
  const stop = (problem: ActivationProblem): never => {
    save({ lastProblem: problem });
    throw new ActivationError(problem, run);
  };
  const signAs = async (t: EventTemplate) => {
    let e: NostrEvent;
    try {
      e = await deps.sign(t);
    } catch {
      return stop('sign-failed');
    }
    if (e.pubkey !== f.owner || !verifyEvent(e)) return stop('wrong-signer');
    return e;
  };
  // Companion sync: a companion chosen elsewhere AFTER the player consented to this registration is the newer act. A
  // profile built over it (a resumed run, or one merged over just before sending) lists the Blobbi but keeps that
  // choice; a profile from before the consent is the one this registration's Blobbi replaces as the current one.
  const chosenSince = (p: NostrEvent | null) => {
    const current = p?.tags.find((t) => t[0] === 'current_companion')?.[1];
    return !!p && !!current && current !== d && p.created_at * 1000 > run.consentAt;
  };
  const buildProfile = (over: NostrEvent | null) => profileTemplate(f.owner, d, over ? Math.max(nowS(), over.created_at + 1) : nowS(), over, { keepCompanion: chosenSince(over) });
  const askBlobbi = () => publisher.query({ kinds: [31124], authors: [f.owner], '#d': [d], limit: 10 }, timeout);
  const askProfile = () => publisher.query(profileFilter(f.owner), timeout);
  save({});

  // 1. PREFLIGHT (and SIGN, once): what the relays already hold decides what is signed.
  if (!run.blobbi || !run.profile) {
    const [blobbiAnswer, profileAnswer] = await Promise.all([askBlobbi(), askProfile()]);
    if (!blobbiAnswer.reachable && !profileAnswer.reachable) stop('unreachable');
    const existingBlobbi = newest(blobbiAnswer.events, f.owner, 31124, d);
    const existingProfile = newestProfile(profileAnswer.events, f.owner);
    // A profile is built from scratch only when none can exist out of sight.
    if (!existingProfile && req.mayHaveProfile && profileAnswer.reachable < publisher.relays.length) stop('unreachable');
    // Companion sync audit: a profile built OVER an existing one needs a complete read too (each relay every Blobbi
    // app writes profiles to answered); a newer profile on a silent relay would otherwise lose what it lists.
    const needsProfile = !run.profile && !(existingProfile?.kind === 11125 && lists(existingProfile, d));
    if (needsProfile && existingProfile && !profileReadComplete(publisher, profileAnswer)) stop('unreachable');
    const blobbi = run.blobbi ?? existingBlobbi ?? (await signAs(babyStateTemplate(f, nowS())));
    if (!isCanonicalBlobbi(blobbi)) stop('not-canonical');
    const profile = run.profile ?? (existingProfile?.kind === 11125 && lists(existingProfile, d) ? existingProfile : await signAs(buildProfile(existingProfile)));
    // What the relays already hold counts as held (an adopted Blobbi or profile is not sent again where it is).
    const seenOn = { blobbi: union(run.seenOn!.blobbi, holdersOfBlobbi(blobbiAnswer, blobbi)), profile: union(run.seenOn!.profile, holdersOfListing(profileAnswer, f.owner, d)) };
    save({ blobbi, profile, seenOn, adopted: run.adopted || (!!existingBlobbi && existingBlobbi.id === blobbi.id), stage: 'signed', lastProblem: null });
  }

  // 2. PUBLISH the stored signed events (the same ones on every retry), each only where it is still missing.
  const missing = (have: readonly string[]) => publisher.relays.filter((r) => !have.includes(r));
  const look = async () => {
    const [b, p] = await Promise.all([askBlobbi(), askProfile()]);
    save({ seenOn: { blobbi: union(run.seenOn!.blobbi, holdersOfBlobbi(b, run.blobbi!)), profile: union(run.seenOn!.profile, holdersOfListing(p, f.owner, d)) } });
  };
  // A retry first looks at what the relays already hold, so nothing they keep is sent again.
  if (run.accepted.blobbi.length || run.accepted.profile.length) await look();
  // Missing means not READ BACK there yet: a relay that said OK and then did not keep it is sent the event again.
  if (missing(run.seenOn!.blobbi).length) {
    const acks = await publisher.publish(run.blobbi!, timeout, missing(run.seenOn!.blobbi));
    save({ accepted: { ...run.accepted, blobbi: union(run.accepted.blobbi, accepted(acks)) } });
  }
  // The Blobbi must be somewhere before its owner's profile points at it.
  if (!run.accepted.blobbi.length && !run.seenOn!.blobbi.length) stop('publish-failed');
  if (missing(run.seenOn!.profile).length) {
    if (!run.accepted.profile.length) {
      // Just before the profile goes out: a newer one made meanwhile (another app) is merged over, never replaced.
      const again = await askProfile();
      const latest = newestProfile(again.events, f.owner);
      if (latest && latest.id !== run.profile!.id && latest.created_at >= run.profile!.created_at) save({ profile: latest.kind === 11125 && lists(latest, d) ? latest : await signAs(buildProfile(latest)) });
    }
    const acks = await publisher.publish(run.profile!, timeout, missing(run.seenOn!.profile));
    save({ accepted: { ...run.accepted, profile: union(run.accepted.profile, accepted(acks)) } });
  }
  if (!run.accepted.profile.length && !run.seenOn!.profile.length) stop('publish-failed');
  save({ stage: 'publishing' });

  // 3. CONFIRM: read both back; only relays that return them count. Relays may need a moment: one more look. Every
  // relay holding both is complete; one is a share, and the rest are owed (`spreadRegistration`).
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(1500);
    await look();
    if (!missing(run.seenOn!.blobbi).length && !missing(run.seenOn!.profile).length) break;
  }
  if (delivered()) {
    save({ stage: 'confirmed', lastProblem: null });
    return run;
  }
  return stop(run.seenOn!.blobbi.length || run.seenOn!.profile.length ? 'partial' : 'not-confirmed');
}

// ─── After a share: the relays still owed an event ───

/** The relays still owed each event of a finished share (not read back there, not refused for good). */
export function owedRelays(run: ActivationRun, relays: readonly string[]): { blobbi: string[]; profile: string[] } {
  // Only a share made here (both events signed or adopted by it) owes anything: a Blobbi merely FOUND after a restore
  // (`adoptFoundBlobbi`, no profile) is already out there, and was never this device's to deliver.
  if (!run.blobbi || !run.profile) return { blobbi: [], profile: [] };
  const refused = run.spread?.refused ?? [];
  const seen = run.seenOn ?? { blobbi: [], profile: [] };
  const owed = (have: readonly string[]) => missingFrom(relays, have).filter((r) => !refused.includes(r));
  return { blobbi: owed(seen.blobbi), profile: run.spread?.profileSuperseded ? [] : owed(seen.profile) };
}

/** The Blobbis (d) whose share is done in `mode` and still owes a relay an event, with tries left. */
export function registrationsToSpread(store: KeyValueStore, mode: 'live' | 'rehearsal', relays: readonly string[]): string[] {
  return Object.values(readRuns(store))
    .filter((r) => r.mode === mode && (r.stage === 'done' || r.stage === 'confirmed') && !!r.blobbi && !!r.profile && (r.spread?.tries ?? 0) < SPREAD_MAX_TRIES)
    .filter((r) => {
      const o = owedRelays(r, relays);
      return o.blobbi.length + o.profile.length > 0;
    })
    .map((r) => r.d);
}

/**
 * One background delivery for a finished share: look at what the relays hold now, send the STORED signed events to
 * the relays still missing them (nothing is signed here: there is no signer), read back, keep what was seen. A relay
 * refusing for good (`permanentRefusal`) is no longer owed. A profile replaced since by a newer one of the owner is
 * never sent again (the newer one is its writer's to deliver). Returns the relays still owed something.
 */
export async function spreadRegistration(store: KeyValueStore, d: string, deps: { publisher: Publisher; now: () => number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<string[]> {
  const { publisher } = deps;
  const timeout = deps.timeoutMs ?? 8000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let run = activationRun(store, d, publisher.mode);
  if (!run || (run.stage !== 'done' && run.stage !== 'confirmed') || !run.blobbi || !run.profile) return [];
  const spread: SpreadState = { tries: 0, refused: [], ...run.spread };
  if (spread.tries >= SPREAD_MAX_TRIES) return [];
  const owner = run.owner;
  const save = () => {
    run = { ...run!, spread: { ...spread }, updatedAt: deps.now() };
    saveRun(store, run);
  };
  const look = async () => {
    const [b, p] = await Promise.all([publisher.query({ kinds: [31124], authors: [owner], '#d': [d], limit: 10 }, timeout), publisher.query(profileFilter(owner), timeout)]);
    const seen = run!.seenOn ?? { blobbi: [], profile: [] };
    run = { ...run!, seenOn: { blobbi: union(seen.blobbi, holdersOfBlobbi(b, run!.blobbi!)), profile: union(seen.profile, holdersOfListing(p, owner, d)) } };
    const top = newestProfile(p.events, owner);
    if (top && top.id !== run.profile!.id && top.created_at > run.profile!.created_at) spread.profileSuperseded = true;
  };
  const owed = () => owedRelays({ ...run!, spread }, publisher.relays);
  spread.tries++;
  await look();
  const before = owed();
  const refusals = (acks: RelayAck[]) => acks.filter((a) => !a.ok && permanentRefusal(a.reason)).map((a) => a.relay);
  if (before.blobbi.length) spread.refused = union(spread.refused, refusals(await publisher.publish(run.blobbi!, timeout, before.blobbi)));
  const profileTo = owed().profile;
  if (profileTo.length) spread.refused = union(spread.refused, refusals(await publisher.publish(run.profile!, timeout, profileTo)));
  if (before.blobbi.length || profileTo.length) {
    await sleep(1500);
    await look();
  }
  save();
  const left = owed();
  return union(left.blobbi, left.profile);
}
