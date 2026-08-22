import type { WikiMapping } from '../types';
import { isFirebaseConfigured } from './firebase-config';
import { getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';

export function mappingWithoutSecrets(mapping: WikiMapping): WikiMapping {
  const remote = { ...mapping.remote };
  delete remote.token;
  delete remote.apiToken;
  delete remote.secret;
  return { ...mapping, remote };
}

export async function saveMapping(mapping: WikiMapping): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const firestore = getFirestore(getApp());
  const safe = mappingWithoutSecrets(mapping);
  await setDoc(doc(firestore, 'workspaces', mapping.workspaceId, 'mappings', mapping.id), safe);
}

export async function listMappings(workspaceId: string): Promise<WikiMapping[]> {
  if (!isFirebaseConfigured()) return [];
  const firestore = getFirestore(getApp());
  const snap = await getDocs(collection(firestore, 'workspaces', workspaceId, 'mappings'));
  return snap.docs.map(d => mappingWithoutSecrets({ id: d.id, ...d.data() } as WikiMapping));
}
