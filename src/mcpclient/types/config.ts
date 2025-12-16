import type { TransportType, PluginConfig, StdioPluginConfig, WebSocketPluginConfig, HttpPluginConfig } from './plugin.js';

export interface ServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  autoConnect: boolean;
  type: TransportType;
  config: StdioPluginConfig | WebSocketPluginConfig | HttpPluginConfig;
}

export interface ClientConfig {
  global: {
    healthCheckInterval: number;
    requestTimeout: number;
    maxRetries: number;
  };
  plugins: {
    stdio: StdioPluginConfig;
    websocket: WebSocketPluginConfig;
    sse: HttpPluginConfig;
    'streamable-http': HttpPluginConfig;
  };
}

export const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  global: {
    healthCheckInterval: 30000,
    requestTimeout: 30000,
    maxRetries: 3,
  },
  plugins: {
    stdio: {
      command: '',
      args: [],
      env: {},
      timeout: 10000,
    },
    websocket: {
      url: '',
      protocols: ['mcp'],
      reconnectAttempts: 3,
      reconnectDelay: 1000,
    },
    sse: {
      url: '',
      timeout: 30000,
    },
    'streamable-http': {
      url: '',
      timeout: 30000,
    },
  },
};

export interface ConnectionRequest {
  type: TransportType;
  config: PluginConfig;
}

export interface MCPConfigFile {
  mcpServers: Record<string, {
    // STDIO servers (Claude Desktop compatible)
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    // Extended for Obsidian
    connectionType?: TransportType;
    url?: string;
    enabled?: boolean;
    autoConnect?: boolean;
  }>;
}
