import * as Y from 'yjs';
import type { WebSocket } from 'ws';
import { persistSnapshotStub } from './snapshot.js';

export type RoomClient = {
  ws: WebSocket;
  uid: string;
};

export type Room = {
  documentId: string;
  ydoc: Y.Doc;
  clients: Set<RoomClient>;
};

/** Per-gateway room map so multiple instances in one process stay isolated. */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();

  getOrCreateRoom(documentId: string): Room {
    let room = this.rooms.get(documentId);
    if (!room) {
      room = { documentId, ydoc: new Y.Doc(), clients: new Set() };
      this.rooms.set(documentId, room);
    }
    return room;
  }

  getRoom(documentId: string): Room | undefined {
    return this.rooms.get(documentId);
  }

  joinRoom(documentId: string, client: RoomClient): Room {
    const room = this.getOrCreateRoom(documentId);
    room.clients.add(client);
    return room;
  }

  leaveRoom(documentId: string, client: RoomClient): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    room.clients.delete(client);
    if (room.clients.size === 0) {
      room.ydoc.destroy();
      this.rooms.delete(documentId);
    }
  }

  /** Apply a Yjs update from one local client and broadcast to local peers. */
  applyAndBroadcast(room: Room, update: Uint8Array, from: RoomClient): void {
    Y.applyUpdate(room.ydoc, update, from);
    for (const peer of room.clients) {
      if (peer === from) continue;
      if (peer.ws.readyState === peer.ws.OPEN) {
        peer.ws.send(update);
      }
    }
    persistSnapshotStub(room.documentId, room.ydoc, room.clients.size);
  }

  /**
   * Apply an update that arrived via Redis (or another instance).
   * Broadcasts to local sockets only — does not re-publish.
   */
  applyFromRemote(documentId: string, update: Uint8Array): void {
    const room = this.getOrCreateRoom(documentId);
    Y.applyUpdate(room.ydoc, update, 'redis');
    for (const peer of room.clients) {
      if (peer.ws.readyState === peer.ws.OPEN) {
        peer.ws.send(update);
      }
    }
    persistSnapshotStub(documentId, room.ydoc, room.clients.size);
  }

  encodeRoomState(room: Room): Uint8Array {
    return Y.encodeStateAsUpdate(room.ydoc);
  }

  clear(): void {
    for (const room of this.rooms.values()) {
      room.ydoc.destroy();
    }
    this.rooms.clear();
  }
}

/** Default registry used when createServer is called without options (single-instance). */
const defaultRegistry = new RoomRegistry();

export function getOrCreateRoom(documentId: string): Room {
  return defaultRegistry.getOrCreateRoom(documentId);
}

export function getRoom(documentId: string): Room | undefined {
  return defaultRegistry.getRoom(documentId);
}

export function joinRoom(documentId: string, client: RoomClient): Room {
  return defaultRegistry.joinRoom(documentId, client);
}

export function leaveRoom(documentId: string, client: RoomClient): void {
  defaultRegistry.leaveRoom(documentId, client);
}

export function applyAndBroadcast(
  room: Room,
  update: Uint8Array,
  from: RoomClient,
): void {
  defaultRegistry.applyAndBroadcast(room, update, from);
}

export function applyFromRemote(documentId: string, update: Uint8Array): void {
  defaultRegistry.applyFromRemote(documentId, update);
}

export function encodeRoomState(room: Room): Uint8Array {
  return defaultRegistry.encodeRoomState(room);
}

export function clearRooms(): void {
  defaultRegistry.clear();
}
