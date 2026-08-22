import type { Connector, ConnectorExportResult } from './types';
import { getConfluenceToken } from '../wiki-tokens';

export const confluenceConnector: Connector = {
  id: 'confluence',
  displayName: 'Confluence Cloud',
  isAvailable() {
    return !!getConfluenceToken();
  },
  listCapabilities() {
    return ['import', 'export', 'sync'];
  },
  async exportFile(): Promise<ConnectorExportResult> {
    if (!getConfluenceToken()) {
      return { ok: false, code: 'AUTH', error: 'Confluence token missing. Re-authenticate in Settings. Mapping was kept.' };
    }
    return { ok: false, code: 'USE_SYNC', error: 'Use wiki sync (pull/push/two-way) for Confluence.' };
  },
};
