/**
 * A room between tabs of this browser (PROTOTYPE): a BroadcastChannel named for the room. Nothing leaves the
 * browser. For trying two players on one machine without the room relay (two tabs, or two windows).
 */
import type { MpTransport, TransportStatus } from './session';

export interface ChannelLike {
  postMessage(data: unknown): void;
  close(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export function channelTransport(room: string, make: (name: string) => ChannelLike = (name) => new BroadcastChannel(name) as unknown as ChannelLike): MpTransport {
  const channel = make(`pixel-mp:${room}`);
  const messageListeners: ((text: string) => void)[] = [];
  const statusListeners: ((s: TransportStatus) => void)[] = [];
  let closed = false;
  channel.onmessage = (e) => {
    if (!closed && typeof e.data === 'string') for (const l of messageListeners) l(e.data);
  };
  // Open at once, after the session has subscribed
  queueMicrotask(() => {
    if (!closed) for (const l of statusListeners) l('open');
  });
  return {
    send: (text) => {
      if (!closed) channel.postMessage(text);
    },
    onMessage: (l) => void messageListeners.push(l),
    onStatus: (l) => void statusListeners.push(l),
    close: () => {
      if (closed) return;
      closed = true;
      channel.close();
      for (const l of statusListeners) l('closed');
    },
  };
}
