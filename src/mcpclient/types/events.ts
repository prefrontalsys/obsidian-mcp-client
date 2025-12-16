import type { TransportType, NormalizedTool } from './plugin.js';

export interface ClientEvents {
  'client:initialized': { config: unknown };
  'client:connecting': { type: TransportType; config: unknown };
  'client:connected': { type: TransportType };
  'client:disconnecting': { type: TransportType };
  'client:disconnected': { type: TransportType };
  'client:error': { error: Error; context: string };
}

export interface ConnectionEvents {
  'connection:status-changed': {
    isConnected: boolean;
    type: TransportType | null;
    error?: string;
  };
  'connection:health-check': {
    healthy: boolean;
    type: TransportType;
    timestamp: number;
  };
}

export interface ToolEvents {
  'tool:call-started': { toolName: string; args: Record<string, unknown> };
  'tool:call-completed': { toolName: string; result: unknown; duration: number };
  'tool:call-failed': { toolName: string; error: Error; duration: number };
  'tools:list-updated': { tools: NormalizedTool[]; type: TransportType };
}

export interface RegistryEvents {
  'registry:plugin-registered': { type: TransportType; name: string };
  'registry:plugins-loaded': { types: TransportType[] };
}

export type AllEvents = ClientEvents & ConnectionEvents & ToolEvents & RegistryEvents & { [key: string]: unknown };

export type AllRegistryEvents = RegistryEvents & { [key: string]: unknown };
