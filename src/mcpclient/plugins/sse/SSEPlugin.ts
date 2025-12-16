import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type {
  ITransportPlugin,
  PluginMetadata,
  PluginConfig,
  HttpPluginConfig,
  Primitive,
} from '../../types/plugin.js';

/**
 * SSE (Server-Sent Events) Transport Plugin
 *
 * Connects to MCP servers over HTTP using Server-Sent Events for server-to-client
 * communication and standard HTTP POST for client-to-server communication.
 */
export class SSEPlugin implements ITransportPlugin {
  readonly metadata: PluginMetadata = {
    name: 'SSE Transport Plugin',
    version: '1.0.0',
    transportType: 'sse',
    description: 'Server-Sent Events (SSE) transport for MCP servers',
  };

  private transport: Transport | null = null;
  private currentConfig: HttpPluginConfig | null = null;
  private connected = false;

  /**
   * Initialize the plugin with configuration
   */
  async initialize(config: PluginConfig): Promise<void> {
    if (!this.isSupported(config)) {
      throw new Error('Invalid SSE plugin configuration');
    }

    this.currentConfig = config as HttpPluginConfig;
    console.log(`[SSEPlugin] Initialized with URL: ${this.currentConfig.url}`);
  }

  /**
   * Create and return a transport connection
   */
  async connect(config: PluginConfig): Promise<Transport> {
    if (!this.isSupported(config)) {
      throw new Error('Invalid SSE plugin configuration');
    }

    const httpConfig = config as HttpPluginConfig;

    try {
      console.log(`[SSEPlugin] Connecting to ${httpConfig.url}...`);

      // Create SSE transport
      const transport = new SSEClientTransport(
        new URL(httpConfig.url)
      );

      this.transport = transport;
      this.connected = true;
      this.currentConfig = httpConfig;

      console.log(`[SSEPlugin] Successfully connected to ${httpConfig.url}`);
      return transport;
    } catch (error) {
      this.connected = false;
      console.error('[SSEPlugin] Connection failed:', error);
      throw new Error(`Failed to connect to SSE server: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        console.log('[SSEPlugin] Disconnecting...');
        await this.transport.close();
        this.transport = null;
        this.connected = false;
        console.log('[SSEPlugin] Disconnected successfully');
      } catch (error) {
        console.error('[SSEPlugin] Error during disconnect:', error);
        throw error;
      }
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connected && this.transport !== null;
  }

  /**
   * Check if this plugin supports the given config
   */
  isSupported(config: PluginConfig): boolean {
    const httpConfig = config as HttpPluginConfig;

    if (!httpConfig.url || typeof httpConfig.url !== 'string') {
      return false;
    }

    try {
      const url = new URL(httpConfig.url);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): PluginConfig {
    return {
      url: 'http://localhost:3000/sse',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    } satisfies HttpPluginConfig;
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    if (!this.isConnected() || !this.currentConfig) {
      return false;
    }

    try {
      // Attempt a simple fetch to check if the server is responsive
      const response = await fetch(this.currentConfig.url, {
        method: 'HEAD',
        headers: this.currentConfig.headers,
        signal: AbortSignal.timeout(this.currentConfig.timeout || 5000),
      });

      return response.ok;
    } catch (error) {
      console.warn('[SSEPlugin] Health check failed:', error);
      return false;
    }
  }

  /**
   * Call a tool via the MCP client
   */
  async callTool(
    client: Client,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.isConnected()) {
      throw new Error('Not connected to SSE server');
    }

    try {
      console.log(`[SSEPlugin] Calling tool: ${toolName}`, args);
      const result = await client.callTool({ name: toolName, arguments: args });
      console.log(`[SSEPlugin] Tool call successful: ${toolName}`);
      return result;
    } catch (error) {
      console.error(`[SSEPlugin] Tool call failed: ${toolName}`, error);
      throw new Error(
        `Tool call failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get all primitives (tools, resources, prompts)
   */
  async getPrimitives(client: Client): Promise<Primitive[]> {
    if (!this.isConnected()) {
      throw new Error('Not connected to SSE server');
    }

    try {
      const primitives: Primitive[] = [];

      // Fetch tools
      const toolsResult = await client.listTools();
      if (toolsResult.tools) {
        primitives.push(
          ...toolsResult.tools.map((tool) => ({
            type: 'tool' as const,
            value: tool,
          }))
        );
      }

      // Fetch resources
      const resourcesResult = await client.listResources();
      if (resourcesResult.resources) {
        primitives.push(
          ...resourcesResult.resources.map((resource) => ({
            type: 'resource' as const,
            value: resource,
          }))
        );
      }

      // Fetch prompts
      const promptsResult = await client.listPrompts();
      if (promptsResult.prompts) {
        primitives.push(
          ...promptsResult.prompts.map((prompt) => ({
            type: 'prompt' as const,
            value: prompt,
          }))
        );
      }

      console.log(`[SSEPlugin] Retrieved ${primitives.length} primitives`);
      return primitives;
    } catch (error) {
      console.error('[SSEPlugin] Failed to get primitives:', error);
      throw new Error(
        `Failed to retrieve primitives: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
