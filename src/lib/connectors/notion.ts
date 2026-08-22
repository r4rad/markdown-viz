import type { Connector, ConnectorExportResult } from './types';
import { getNotionToken } from '../wiki-tokens';

export const notionConnector: Connector = {
  id: 'notion',
  displayName: 'Notion',
  isAvailable() {
    return !!getNotionToken();
  },
  listCapabilities() {
    return ['import', 'export', 'sync'];
  },
  async exportFile(): Promise<ConnectorExportResult> {
    if (!getNotionToken()) {
      return { ok: false, code: 'AUTH', error: 'Notion token missing. Re-authenticate in Settings. Mapping was kept.' };
    }
    return { ok: false, code: 'USE_SYNC', error: 'Use wiki sync (pull/push/two-way) for Notion.' };
  },
};
