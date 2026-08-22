import type { Connector, ConnectorId } from './types';
import { githubConnector } from './github';
import { driveConnector } from './drive';

const connectors: Connector[] = [githubConnector, driveConnector];

export function listConnectors(): Connector[] {
  return connectors;
}

export function getConnector(id: ConnectorId): Connector | undefined {
  return connectors.find(c => c.id === id);
}

export { githubConnector, driveConnector };
export type { Connector, ConnectorId, ConnectorExportResult } from './types';
