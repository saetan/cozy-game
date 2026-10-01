// Event queue ordered by (time, insertion seq) so ties are deterministic.
import { MinHeap } from './heap';

export type SimEvent =
  | { kind: 'resident'; residentId: number; token: number }
  | { kind: 'plot'; plotId: number; stage: 'thirsty' | 'ripe' }
  | { kind: 'dispatch' };
export interface QueuedEvent { time: number; seq: number; event: SimEvent }
export interface EventQueue { heap: MinHeap<QueuedEvent>; seq: number }

const less = (a: QueuedEvent, b: QueuedEvent) => a.time < b.time || (a.time === b.time && a.seq < b.seq);

export const createEventQueue = (): EventQueue => ({ heap: new MinHeap(less), seq: 0 });
export function pushEvent(q: EventQueue, time: number, event: SimEvent): void {
  q.heap.push({ time, seq: q.seq++, event });
}
export const peekEvent = (q: EventQueue) => q.heap.peek();
export const popEvent = (q: EventQueue) => q.heap.pop();
export const sortedEvents = (q: EventQueue): QueuedEvent[] =>
  [...q.heap.items].sort((a, b) => (less(a, b) ? -1 : 1));
