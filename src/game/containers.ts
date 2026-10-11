/**
 * CONTAINERS: chests and cabinets with their own inventories, separate from the bag. A container is keyed by the
 * placed record it belongs to (island: `island/<id>`, room: `room/<shelter id>/<id>`), so it survives reloads and
 * moving the chest; it holds at most `capacity` distinct stacks, each under the item's normal stack limit.
 *
 * Every move goes through `transfer`: it takes from one inventory exactly what it puts in the other, in one call,
 * so nothing is ever created or lost; asking for more than fits moves what fits (a partial stack).
 */
import { Inventory } from './inventory';
import { stackLimit } from './items';

export interface Container {
  inventory: Inventory;
  /** Distinct stacks it can hold. */
  capacity: number;
}

export function newContainer(key: string, capacity: number): Container {
  return { inventory: new Inventory(key, stackLimit), capacity };
}

/** How many of an item an inventory can still take (stack room, and a free stack slot when it has none yet). */
export function roomFor(inv: Inventory, item: string, capacity = Infinity): number {
  const have = inv.count(item);
  if (have === 0 && inv.entries().length >= capacity) return 0;
  return Math.max(0, inv.limit(item) - have);
}

/**
 * Move up to `quantity` of an item from one inventory to another. Returns how many moved (0 when nothing fits or
 * nothing is there). Atomic: the source loses exactly what the target gains.
 */
export function transfer(from: Inventory, to: Inventory, item: string, quantity: number, toCapacity = Infinity): number {
  if (!Number.isInteger(quantity) || quantity <= 0 || from === to) return 0;
  const n = Math.min(quantity, from.count(item), roomFor(to, item, toCapacity));
  if (n <= 0) return 0;
  const taken = from.remove(item, n);
  const put = to.add(item, taken);
  if (put !== taken) {
    // Cannot happen after the room check; if it did, give back what did not fit.
    to.remove(item, put);
    from.add(item, taken);
    return 0;
  }
  return n;
}
