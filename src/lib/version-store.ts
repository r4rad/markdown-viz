import type { DocVersion, VersionSource } from '../types';
import { appendVersion, assignHistoryStoragePaths, buildVersion } from './versions';
import { computeChecksum } from './crdt';
import { isFirebaseConfigured } from './firebase-config';
import { getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { getStorage, ref, uploadString } from 'firebase/storage';

function db() {
  if (!isFirebaseConfigured()) return null;
  try { return getFirestore(getApp()); } catch { return null; }
}

export async function listVersions(workspaceId: string, fileId: string): Promise<DocVersion[]> {
  const firestore = db();
  if (!firestore) return [];
  const snap = await getDocs(collection(firestore, 'workspaces', workspaceId, 'versions'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as DocVersion))
    .filter(v => v.fileId === fileId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function recordVersion(input: {
  workspaceId: string;
  fileId: string;
  authorId: string;
  source: VersionSource;
  content: string;
}): Promise<{ skipped: boolean; version?: DocVersion }> {
  const firestore = db();
  if (!firestore) return { skipped: true };
  const checksum = await computeChecksum(input.content);
  const existing = await listVersions(input.workspaceId, input.fileId);
  const built = buildVersion({
    fileId: input.fileId,
    workspaceId: input.workspaceId as DocVersion['workspaceId'],
    authorId: input.authorId,
    source: input.source,
    checksum,
    content: input.content,
  });
  const result = appendVersion(existing, built.version);
  if (result.skipped) return { skipped: true };

  const contentBytes = new TextEncoder().encode(input.content).length;
  let version = assignHistoryStoragePaths(existing, built.version, contentBytes);

  // Large payloads: upload blob to Storage and drop inline content.
  // Smaller payloads keep content in Firestore metadata; storagePath is the
  // planned history blob key (snap/delta) for compaction / backend use.
  if (built.storagePathNeeded) {
    try {
      const storage = getStorage(getApp());
      const path =
        version.storagePath ||
        `workspaces/${input.workspaceId}/versions/${input.fileId}/${version.id}.md`;
      await uploadString(ref(storage, path), input.content);
      version = { ...version, storagePath: path, content: undefined };
    } catch {
      console.warn('Version snapshot exceeds size; stored metadata only.');
    }
  }

  // Unlimited retention: append only — never delete prior history events.
  await setDoc(doc(firestore, 'workspaces', input.workspaceId, 'versions', version.id), version);
  return { skipped: false, version };
}
