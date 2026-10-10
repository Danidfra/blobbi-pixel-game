/**
 * THE LOCAL INVENTORY. Item ids and quantities with a stack limit per item, add and remove that report what
 * was actually moved, and a plain snapshot for persistence. No protocol here: the shape mirrors what
 * `@nostr-games/inventory` holds in a kind:31633 event (an inventory context, item references with positive
 * integer quantities, an advisory revision), so a later adapter can map a snapshot to that library's
 * builders (item ids become `31632:<issuer>:<d>` addresses, the context becomes the `d` tag) without this
 * class knowing about events, signing or relays.
 */

export interface InventoryEntry {
  /** Item id in the `game:category:name` style the inventory protocol uses for `d` tags. */
  item: string;
  /** Positive integer. */
  quantity: number;
}

export interface InventorySnapshot {
  version: 1;
  /** The inventory context: which world (and nothing else) this inventory belongs to. */
  context: string;
  /** Advisory revision, incremented on every change that moved at least one item. */
  revision: number;
  items: InventoryEntry[];
}

export const DEFAULT_STACK = 99;

export class Inventory {
  private readonly stacks = new Map<string, number>();
  revision = 0;

  constructor(
    readonly context: string,
    private readonly maxStack: (item: string) => number = () => DEFAULT_STACK,
  ) {}

  /** Add up to `quantity` of an item; returns how many fit under the stack limit (0 when the stack is full). */
  add(item: string, quantity = 1): number {
    if (!Number.isInteger(quantity) || quantity <= 0) return 0;
    const have = this.stacks.get(item) ?? 0;
    const room = Math.max(0, this.maxStack(item) - have);
    const moved = Math.min(room, quantity);
    if (moved > 0) {
      this.stacks.set(item, have + moved);
      this.revision++;
    }
    return moved;
  }

  /** Remove up to `quantity`; returns how many were actually removed. Empty stacks disappear. */
  remove(item: string, quantity = 1): number {
    if (!Number.isInteger(quantity) || quantity <= 0) return 0;
    const have = this.stacks.get(item) ?? 0;
    const moved = Math.min(have, quantity);
    if (moved > 0) {
      if (have - moved === 0) this.stacks.delete(item);
      else this.stacks.set(item, have - moved);
      this.revision++;
    }
    return moved;
  }

  count(item: string): number {
    return this.stacks.get(item) ?? 0;
  }

  limit(item: string): number {
    return this.maxStack(item);
  }

  isFull(item: string): boolean {
    return this.count(item) >= this.maxStack(item);
  }

  /** Entries in item-id order, so a snapshot is the same whatever the insertion order. */
  entries(): InventoryEntry[] {
    return [...this.stacks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([item, quantity]) => ({ item, quantity }));
  }

  total(): number {
    let n = 0;
    for (const q of this.stacks.values()) n += q;
    return n;
  }

  snapshot(): InventorySnapshot {
    return { version: 1, context: this.context, revision: this.revision, items: this.entries() };
  }

  /** Rebuild from a snapshot; entries over the stack limit are clamped, invalid ones dropped. */
  static fromSnapshot(snapshot: InventorySnapshot, maxStack?: (item: string) => number): Inventory {
    const inv = new Inventory(snapshot.context, maxStack);
    for (const e of snapshot.items ?? []) {
      if (typeof e.item !== 'string' || !Number.isInteger(e.quantity) || e.quantity <= 0) continue;
      inv.stacks.set(e.item, Math.min(e.quantity, inv.maxStack(e.item)));
    }
    inv.revision = Number.isInteger(snapshot.revision) ? snapshot.revision : 0;
    return inv;
  }
}
