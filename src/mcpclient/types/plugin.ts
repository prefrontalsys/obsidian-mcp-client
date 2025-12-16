import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export type TransportType = 'stdio' | 'websocket' | 'sse' | 'streamable-http';

export interface PluginConfig {
  [key: string]: unknown;
}

export interface StdioPluginConfig extends PluginConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
}

export interface WebSocketPluginConfig extends PluginConfig {
  url: string;
  protocols?: string[];
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface HttpPluginConfig extends PluginConfig {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface PluginMetadata {
  readonly name: string;
  readonly version: string;
  readonly transportType: TransportType;
  readonly description?: string;
}

export interface ITransportPlugin {
  readonly metadata: PluginMetadata;

  /**
   * Initialize the plugin with configuration
   */
  initialize(config: PluginConfig): Promise<void>;

  /**
   * Create and return a transport connection
   * For stdio: spawns process
   * For websocket/http: creates connection
   */
  connect(config: PluginConfig): Promise<Transport>;

  /**
   * Disconnect and cleanup
   */
  disconnect(): Promise<void>;

  /**
   * Check if currently connected
   */
  isConnected(): boolean;

  /**
   * Check if this plugin supports the given config
   */
  isSupported(config: PluginConfig): boolean;

  /**
   * Get default configuration
   */
  getDefaultConfig(): PluginConfig;

  /**
   * Health check
   */
  isHealthy(): Promise<boolean>;

  /**
   * Call a tool via the MCP client
   */
  callTool(client: Client, toolName: string, args: Record<string, unknown>): Promise<unknown>;

  /**
   * Get all primitives (tools, resources, prompts)
   */
  getPrimitives(client: Client): Promise<Primitive[]>;
}

export interface Primitive {
  type: 'tool' | 'resource' | 'prompt';
  value: unknown;
}

export interface NormalizedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface NormalizedResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface NormalizedPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}
