import type { Connector, ConnectorExportResult } from './types';

export const driveConnector: Connector = {
  id: 'drive',
  displayName: 'Google Drive',
  isAvailable() {
    return false;
  },
  listCapabilities() {
    return [];
  },
  async exportFile(): Promise<ConnectorExportResult> {
    return {
      ok: false,
      code: 'NOT_IMPLEMENTED',
      error: 'Google Drive is not implemented in Phase 1. The file was not saved to Drive.',
    };
  },
};
