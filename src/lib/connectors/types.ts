import type { FileOrigin } from '../../types';

export type ConnectorId = 'github' | 'drive';
export type ConnectorCapability = 'export' | 'import' | 'list';

export type ConnectorExportResult =
  | { ok: true; sha: string }
  | { ok: false; error: string; code: string };

export interface ConnectorExportInput {
  content: string;
  path: string;
  message: string;
  origin?: FileOrigin;
  target?: { owner: string; repo: string; ref: string };
}

export interface Connector {
  id: ConnectorId;
  displayName: string;
  isAvailable(): boolean;
  listCapabilities(): ConnectorCapability[];
  exportFile(input: ConnectorExportInput): Promise<ConnectorExportResult>;
}
