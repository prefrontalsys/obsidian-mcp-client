import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  ITransportPlugin,
  PluginMetadata,
  PluginConfig,
  WebSocketPluginConfig,
  Primitive,
} from '../../types/plugin.js';
import { WebSocketTransport } from './WebSocketTransport.js';

/**
 * WebSocket transport plugin for MCP protocol.
 *
 * Supports:
 * - Native browser WebSocket API
 * - Automatic reconnection with configurable attempts and delays
 * - Message queuing when disconnected
 * - Configurable WebSocket protocols (defaults to ['mcp'])
 *
 * Configuration:
 * - url: WebSocket endpoint URL (ws:// or wss://)
 * - protocols: Optional array of WebSocket subprotocols
 * - reconnectAttempts: Number of reconnection attempts (default: 3)
 * - reconnectDelay: Base delay between reconnects in ms (default: 1000)
 */
export class WebSocketPlugin implements ITransportPlugin {
  readonly metadata: PluginMetadata = {
    name: 'WebSocket Transport Plugin',
    version: '1.0.0',
    transportType: 'websocket',
    description: 'WebSocket transport for MCP protocol with reconnection support',
  };

  private transport: WebSocketTransport | null = null;
  private config: WebSocketPluginConfig | null = null;

  /**
   * Initialize the plugin with configuration
   */
  async initialize(config: PluginConfig): Promise<void> {
    if (!this.isSupported(config)) {
      throw new Error('Invalid WebSocket configuration: missing required "url" field');
    }

    this.config = config as WebSocketPluginConfig;

    // Validate URL format
    const urlPattern = /^wss?:\/\/.+/i;
    if (!urlPattern.test(this.config.url)) {
      throw new Error('Invalid WebSocket URL: must start with ws:// or wss://');
    }
  }

  /**
   * Create and return a WebSocket transport connection
   */
  async connect(config: PluginConfig): Promise<Transport> {
    if (!this.isSupported(config)) {
      throw new Error('Invalid WebSocket configuration');
    }

    const wsConfig = config as WebSocketPluginConfig;

    // Create new transport instance
    this.transport = new WebSocketTransport({
      url: wsConfig.url,
      protocols: wsConfig.protocols,
      reconnectAttempts: wsConfig.reconnectAttempts,
      reconnectDelay: wsConfig.reconnectDelay,
    });

    // Start the transport (establishes connection)
    await this.transport.start();

    return this.transport;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.transport?.isConnected() ?? false;
  }

  /**
   * Check if this plugin supports the given config
   */
  isSupported(config: PluginConfig): boolean {
    const wsConfig = config as WebSocketPluginConfig;
    return typeof wsConfig.url === 'string' && wsConfig.url.length > 0;
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): WebSocketPluginConfig {
    return {
      url: 'ws://localhost:8080',
      protocols: ['mcp'],
      reconnectAttempts: 3,
      reconnectDelay: 1000,
    };
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    // Check if transport exists and is connected
    if (!this.transport) {
      return false;
    }

    return this.transport.isConnected();
  }

  /**
   * Call a tool via the MCP client
   */
  async callTool(
    client: Client,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      return result;
    } catch (error) {
      throw new Error(
        `Failed to call tool "${toolName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get all primitives (tools, resources, prompts) from the server
   */
  async getPrimitives(client: Client): Promise<Primitive[]> {
    const primitives: Primitive[] = [];

    try {
      // List all tools
      const toolsResponse = await client.listTools();
      if (toolsResponse.tools) {
        primitives.push(
          ...toolsResponse.tools.map((tool) => ({
            type: 'tool' as const,
            value: tool,
          }))
        );
      }

      // List all resources
      const resourcesResponse = await client.listResources();
      if (resourcesResponse.resources) {
        primitives.push(
          ...resourcesResponse.resources.map((resource) => ({
            type: 'resource' as const,
            value: resource,
          }))
        );
      }

      // List all prompts
      const promptsResponse = await client.listPrompts();
      if (promptsResponse.prompts) {
        primitives.push(
          ...promptsResponse.prompts.map((prompt) => ({
            type: 'prompt' as const,
            value: prompt,
          }))
        );
      }

      return primitives;
    } catch (error) {
      throw new Error(
        `Failed to get primitives: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the current transport instance
   */
  getTransport(): WebSocketTransport | null {
    return this.transport;
  }

  /**
   * Get the number of queued messages in the transport
   */
  getQueueSize(): number {
    return this.transport?.getQueueSize() ?? 0;
  }
}
