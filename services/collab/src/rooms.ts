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

const rooms = new Map<string, Room>();

export function getOrCreateRoom(documentId: string): Room {
  let room = rooms.get(documentId);
  if (!room) {
    room = { documentId, ydoc: new Y.Doc(), clients: new Set() };
    rooms.set(documentId, room);
  }
  return room;
}

export function getRoom(documentId: string): Room | undefined {
  return rooms.get(documentId);
}

export function joinRoom(documentId: string, client: RoomClient): Room {
  const room = getOrCreateRoom(documentId);
  room.clients.add(client);
  return room;
}

export function leaveRoom(documentId: string, client: RoomClient): void {
  const room = rooms.get(documentId);
  if (!room) return;
  room.clients.delete(client);
  if (room.clients.size === 0) {
    room.ydoc.destroy();
    rooms.delete(documentId);
  }
}

/** Apply a Yjs update from one client and broadcast binary frames to peers. */
export function applyAndBroadcast(
  room: Room,
  update: Uint8Array,
  from: RoomClient,
): void {
  Y.applyUpdate(room.ydoc, update, from);
  for (const peer of room.clients) {
    if (peer === from) continue;
    if (peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(update);
    }
  }
  persistSnapshotStub(room.documentId, room.ydoc, room.clients.size);
}

/** Encode current room state for a newly joined client. */
export function encodeRoomState(room: Room): Uint8Array {
  return Y.encodeStateAsUpdate(room.ydoc);
}

export function clearRooms(): void {
  for (const room of rooms.values()) {
    room.ydoc.destroy();
  }
  rooms.clear();
}
