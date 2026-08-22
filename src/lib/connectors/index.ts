import type { Connector, ConnectorId } from './types';
import { githubConnector } from './github';
import { driveConnector } from './drive';
import { confluenceConnector } from './confluence';
import { notionConnector } from './notion';

const connectors: Connector[] = [githubConnector, driveConnector, confluenceConnector, notionConnector];

export function listConnectors(): Connector[] {
  return connectors;
}

export function getConnector(id: ConnectorId): Connector | undefined {
  return connectors.find(c => c.id === id);
}

export { githubConnector, driveConnector, confluenceConnector, notionConnector };
export type { Connector, ConnectorId, ConnectorExportResult } from './types';
