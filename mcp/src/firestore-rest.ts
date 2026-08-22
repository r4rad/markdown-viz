import type { FolderDoc, FirestorePort, WorkspaceFileDoc } from './tools.js';

function projectId(env: NodeJS.ProcessEnv): string {
  return env.MARKDOWNVIZ_FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT || '';
}

function docsUrl(env: NodeJS.ProcessEnv, uid: string, col: 'files' | 'folders', id?: string): string {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId(env)}/databases/(default)/documents/users/${uid}/${col}`;
  return id ? `${base}/${id}` : base;
}

function fieldsToFile(id: string, fields: Record<string, any>): WorkspaceFileDoc {
  const originField = fields.origin?.mapValue?.fields;
  let origin: WorkspaceFileDoc['origin'] = { kind: 'local' };
  if (originField?.kind?.stringValue === 'github') {
    origin = {
      kind: 'github',
      owner: originField.owner?.stringValue || '',
      repo: originField.repo?.stringValue || '',
      ref: originField.ref?.stringValue || '',
      path: originField.path?.stringValue || '',
      sha: originField.sha?.stringValue || '',
    };
  }
  return {
    id,
    name: fields.name?.stringValue || 'Untitled.md',
    content: fields.content?.stringValue || '',
    folderId: fields.folderId?.nullValue !== undefined ? null : (fields.folderId?.stringValue ?? null),
    origin,
    updatedAt: Number(fields.updatedAt?.integerValue || Date.now()),
    createdAt: Number(fields.createdAt?.integerValue || Date.now()),
  };
}

export function createFirestorePort(env: NodeJS.ProcessEnv): FirestorePort {
  const token = env.MARKDOWNVIZ_FIREBASE_ID_TOKEN || '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  return {
    async listFiles(uid) {
      const res = await fetch(docsUrl(env, uid, 'files'), { headers });
      if (!res.ok) throw new Error(`Firestore list files failed (${res.status})`);
      const data = await res.json() as { documents?: Array<{ name: string; fields: Record<string, any> }> };
      return (data.documents ?? []).map(d => fieldsToFile(d.name.split('/').pop()!, d.fields));
    },
    async listFolders(uid) {
      const res = await fetch(docsUrl(env, uid, 'folders'), { headers });
      if (!res.ok) throw new Error(`Firestore list folders failed (${res.status})`);
      const data = await res.json() as { documents?: Array<{ name: string; fields: Record<string, any> }> };
      return (data.documents ?? []).map((d): FolderDoc => {
        const f = d.fields;
        const link = f.repoLink?.mapValue?.fields;
        return {
          id: d.name.split('/').pop()!,
          name: f.name?.stringValue || 'Untitled',
          parentId: f.parentId?.nullValue !== undefined ? null : (f.parentId?.stringValue ?? null),
          repoLink: link ? {
            owner: link.owner?.stringValue || '',
            repo: link.repo?.stringValue || '',
            ref: link.ref?.stringValue,
            pathPrefix: link.pathPrefix?.stringValue,
          } : null,
        };
      });
    },
    async getFile(uid, id) {
      const res = await fetch(docsUrl(env, uid, 'files', id), { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Firestore get file failed (${res.status})`);
      const data = await res.json() as { fields: Record<string, any> };
      return fieldsToFile(id, data.fields);
    },
    async writeFile(uid, file) {
      const fields: Record<string, any> = {
        name: { stringValue: file.name },
        content: { stringValue: file.content },
        updatedAt: { integerValue: String(file.updatedAt) },
        createdAt: { integerValue: String(file.createdAt) },
        origin: { mapValue: { fields: file.origin.kind === 'github'
          ? {
              kind: { stringValue: 'github' },
              owner: { stringValue: file.origin.owner },
              repo: { stringValue: file.origin.repo },
              ref: { stringValue: file.origin.ref },
              path: { stringValue: file.origin.path },
              sha: { stringValue: file.origin.sha },
            }
          : { kind: { stringValue: 'local' } } } },
      };
      if (file.folderId) fields.folderId = { stringValue: file.folderId };
      else fields.folderId = { nullValue: null };
      const res = await fetch(`${docsUrl(env, uid, 'files', file.id)}?key=`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) throw new Error(`Firestore write failed (${res.status})`);
    },
  };
}
