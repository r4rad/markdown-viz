import { randomUUID } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';

export type PubSubMessageHandler = (documentId: string, update: Uint8Array) => void;

/**
 * Cross-instance Yjs update transport.
 * Production: Redis/Memorystore. Local/CI: MemoryPubSub (optionally shared).
 */
export interface PubSubAdapter {
  readonly instanceId: string;
  publish(documentId: string, update: Uint8Array): Promise<void>;
  start(onRemoteUpdate: PubSubMessageHandler): Promise<void>;
  stop(): Promise<void>;
}

export function channelForDoc(documentId: string): string {
  return `collab:yjs:${encodeURIComponent(documentId)}`;
}

export function documentIdFromChannel(channel: string): string | null {
  const prefix = 'collab:yjs:';
  if (!channel.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(channel.slice(prefix.length));
  } catch {
    return channel.slice(prefix.length);
  }
}

type WireMessage = {
  instanceId: string;
  update: string; // base64
};

function encodeWire(instanceId: string, update: Uint8Array): string {
  const payload: WireMessage = {
    instanceId,
    update: Buffer.from(update).toString('base64'),
  };
  return JSON.stringify(payload);
}

function decodeWire(raw: string): { instanceId: string; update: Uint8Array } | null {
  try {
    const parsed = JSON.parse(raw) as WireMessage;
    if (!parsed?.instanceId || typeof parsed.update !== 'string') return null;
    return {
      instanceId: parsed.instanceId,
      update: new Uint8Array(Buffer.from(parsed.update, 'base64')),
    };
  } catch {
    return null;
  }
}

/** Shared in-process bus for tests and local multi-instance without Redis. */
export class MemoryPubSubBus {
  private readonly listeners = new Set<(channel: string, message: string) => void>();

  publish(channel: string, message: string): void {
    for (const listener of this.listeners) {
      listener(channel, message);
    }
  }

  subscribe(listener: (channel: string, message: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export class MemoryPubSub implements PubSubAdapter {
  readonly instanceId: string;
  private unsubscribe: (() => void) | null = null;
  private handler: PubSubMessageHandler | null = null;

  constructor(
    private readonly bus: MemoryPubSubBus = new MemoryPubSubBus(),
    instanceId: string = randomUUID(),
  ) {
    this.instanceId = instanceId;
  }

  async publish(documentId: string, update: Uint8Array): Promise<void> {
    this.bus.publish(channelForDoc(documentId), encodeWire(this.instanceId, update));
  }

  async start(onRemoteUpdate: PubSubMessageHandler): Promise<void> {
    this.handler = onRemoteUpdate;
    this.unsubscribe = this.bus.subscribe((channel, message) => {
      const docId = documentIdFromChannel(channel);
      if (!docId) return;
      const wire = decodeWire(message);
      if (!wire || wire.instanceId === this.instanceId) return;
      this.handler?.(docId, wire.update);
    });
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.handler = null;
  }
}

export class RedisPubSub implements PubSubAdapter {
  readonly instanceId: string;
  private publisher: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private handler: PubSubMessageHandler | null = null;

  constructor(
    private readonly url: string,
    instanceId: string = randomUUID(),
  ) {
    this.instanceId = instanceId;
  }

  async start(onRemoteUpdate: PubSubMessageHandler): Promise<void> {
    this.handler = onRemoteUpdate;
    this.publisher = createClient({ url: this.url });
    this.subscriber = this.publisher.duplicate();
    this.publisher.on('error', (err) => console.error('redis publisher', err));
    this.subscriber.on('error', (err) => console.error('redis subscriber', err));
    await this.publisher.connect();
    await this.subscriber.connect();
    await this.subscriber.pSubscribe('collab:yjs:*', (message, channel) => {
      const docId = documentIdFromChannel(channel);
      if (!docId) return;
      const wire = decodeWire(message);
      if (!wire || wire.instanceId === this.instanceId) return;
      this.handler?.(docId, wire.update);
    });
  }

  async publish(documentId: string, update: Uint8Array): Promise<void> {
    if (!this.publisher?.isOpen) return;
    await this.publisher.publish(channelForDoc(documentId), encodeWire(this.instanceId, update));
  }

  async stop(): Promise<void> {
    this.handler = null;
    if (this.subscriber?.isOpen) {
      try {
        await this.subscriber.pUnsubscribe('collab:yjs:*');
      } catch {
        /* ignore */
      }
      await this.subscriber.quit().catch(() => undefined);
    }
    if (this.publisher?.isOpen) {
      await this.publisher.quit().catch(() => undefined);
    }
    this.subscriber = null;
    this.publisher = null;
  }
}

/** Create adapter from env: REDIS_URL → Redis, else null (single-instance local broadcast only). */
export async function createPubSubFromEnv(
  instanceId: string = randomUUID(),
): Promise<PubSubAdapter | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  const adapter = new RedisPubSub(url, instanceId);
  return adapter;
}
