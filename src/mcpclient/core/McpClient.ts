import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { EventEmitter } from './EventEmitter.js';
import { PluginRegistry } from './PluginRegistry.js';
import type {
  TransportType,
  ITransportPlugin,
  PluginConfig,
  Primitive,
  NormalizedTool,
  NormalizedResource,
  NormalizedPrompt,
} from '../types/plugin.js';
import type { ClientConfig, ConnectionRequest, DEFAULT_CLIENT_CONFIG } from '../types/config.js';
import type { AllEvents } from '../types/events.js';

export interface PrimitivesResponse {
  tools: NormalizedTool[];
  resources: NormalizedResource[];
  prompts: NormalizedPrompt[];
  timestamp: number;
}

export class McpClient extends EventEmitter<AllEvents> {
  private registry: PluginRegistry;
  private config: ClientConfig;
  private client: Client | null = null;
  private activePlugin: ITransportPlugin | null = null;
  private activeTransport: Transport | null = null;
  private isConnectedFlag = false;
  private connectionPromise: Promise<void> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private primitivesCache: PrimitivesResponse | null = null;
  private primitivesCacheTime = 0;
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(config: Partial<ClientConfig> = {}) {
    super();

    const defaultConfig: ClientConfig = {
      global: {
        healthCheckInterval: 30000,
        requestTimeout: 30000,
        maxRetries: 3,
      },
      plugins: {
        stdio: { command: '', args: [], env: {}, timeout: 10000 },
        websocket: { url: '', protocols: ['mcp'], reconnectAttempts: 3, reconnectDelay: 1000 },
        sse: { url: '', timeout: 30000 },
        'streamable-http': { url: '', timeout: 30000 },
      },
    };

    this.config = {
      ...defaultConfig,
      ...config,
      global: { ...defaultConfig.global, ...config.global },
      plugins: { ...defaultConfig.plugins, ...config.plugins },
    };

    this.registry = new PluginRegistry();

    // Forward registry events
    this.registry.on('registry:plugin-registered', (data) => {
      this.emit('registry:plugin-registered', data);
    });

    console.log('[McpClient] Initialized');
    this.emit('client:initialized', { config: this.config });
  }

  getRegistry(): PluginRegistry {
    return this.registry;
  }

  async registerPlugin(plugin: ITransportPlugin): Promise<void> {
    await this.registry.register(plugin);
  }

  async connect(request: ConnectionRequest): Promise<void> {
    const { type, config } = request;

    // If already connected with same type, skip
    if (this.isConnectedFlag && this.activePlugin?.metadata.transportType === type) {
      console.log(`[McpClient] Already connected via ${type}, skipping`);
      return;
    }

    // Wait for existing connection attempt
    if (this.connectionPromise) {
      console.log('[McpClient] Connection in progress, waiting...');
      try {
        await this.connectionPromise;
        if (this.isConnectedFlag && this.activePlugin?.metadata.transportType === type) {
          return;
        }
      } catch {
        this.connectionPromise = null;
      }
    }

    // Disconnect if switching transport types
    if (this.isConnectedFlag && this.activePlugin?.metadata.transportType !== type) {
      console.log(`[McpClient] Switching from ${this.activePlugin?.metadata.transportType} to ${type}`);
      await this.disconnect();
    }

    this.connectionPromise = this.performConnection(request);

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async performConnection(request: ConnectionRequest): Promise<void> {
    const { type, config } = request;

    try {
      console.log(`[McpClient] Connecting via ${type}...`);
      this.emit('client:connecting', { type, config });

      // Get plugin configuration
      const finalConfig = {
        ...this.config.plugins[type],
        ...config,
      };

      // Get and initialize the plugin
      const plugin = await this.registry.getInitializedPlugin(type, finalConfig);

      if (!plugin.isSupported(finalConfig)) {
        throw new Error(`Plugin ${type} does not support the provided configuration`);
      }

      // Get transport from plugin
      const transport = await plugin.connect(finalConfig);

      // Create MCP client
      this.client = new Client(
        {
          name: 'obsidian-mcp-client',
          version: '0.2.0',
        },
        { capabilities: {} }
      );

      // Connect client to transport with timeout
      const connectionTimeout = 30000;
      const connectionPromise = this.client.connect(transport);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Connection timeout after ${connectionTimeout}ms`));
        }, connectionTimeout);
      });

      await Promise.race([connectionPromise, timeoutPromise]);

      // Store connection state
      this.activePlugin = plugin;
      this.activeTransport = transport;
      this.isConnectedFlag = true;

      // Clear cache
      this.clearPrimitivesCache();

      // Start health monitoring
      this.startHealthMonitoring();

      console.log(`[McpClient] Connected via ${type}`);
      this.emit('client:connected', { type });
      this.emit('connection:status-changed', {
        isConnected: true,
        type,
        error: undefined,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[McpClient] Connection failed:`, error);

      await this.cleanup();

      this.emit('client:error', {
        error: error instanceof Error ? error : new Error(errorMessage),
        context: 'connection',
      });
      this.emit('connection:status-changed', {
        isConnected: false,
        type,
        error: errorMessage,
      });

      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnectedFlag) {
      console.log('[McpClient] Already disconnected');
      return;
    }

    const currentType = this.activePlugin?.metadata.transportType;
    console.log(`[McpClient] Disconnecting from ${currentType || 'unknown'}...`);

    if (currentType) {
      this.emit('client:disconnecting', { type: currentType });
    }

    try {
      await this.cleanup();
      console.log('[McpClient] Disconnected');

      if (currentType) {
        this.emit('client:disconnected', { type: currentType });
      }
      this.emit('connection:status-changed', {
        isConnected: false,
        type: currentType || null,
      });
    } catch (error) {
      console.error('[McpClient] Error during disconnect:', error);
      this.emit('client:error', {
        error: error instanceof Error ? error : new Error(String(error)),
        context: 'disconnect',
      });
    }
  }

  private async cleanup(): Promise<void> {
    this.stopHealthMonitoring();

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.warn('[McpClient] Error closing client:', error);
      }
      this.client = null;
    }

    if (this.activePlugin) {
      try {
        await this.activePlugin.disconnect();
      } catch (error) {
        console.warn('[McpClient] Error disconnecting plugin:', error);
      }
      this.activePlugin = null;
    }

    this.activeTransport = null;
    this.isConnectedFlag = false;
    this.clearPrimitivesCache();
  }

  async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.isConnectedFlag || !this.activePlugin || !this.client) {
      throw new Error('Not connected to any MCP server');
    }

    const startTime = Date.now();
    this.emit('tool:call-started', { toolName, args });

    try {
      console.log(`[McpClient] Calling tool: ${toolName}`);
      const result = await this.activePlugin.callTool(this.client, toolName, args);

      const duration = Date.now() - startTime;
      this.emit('tool:call-completed', { toolName, result, duration });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const toolError = error instanceof Error ? error : new Error(String(error));

      this.emit('tool:call-failed', { toolName, error: toolError, duration });

      // Check connection health after error
      if (!(await this.isHealthy())) {
        this.isConnectedFlag = false;
        this.emit('connection:status-changed', {
          isConnected: false,
          type: this.activePlugin?.metadata.transportType || null,
          error: 'Connection lost during tool call',
        });
      }

      throw toolError;
    }
  }

  async getPrimitives(forceRefresh = false): Promise<PrimitivesResponse> {
    if (!this.isConnectedFlag || !this.activePlugin || !this.client) {
      throw new Error('Not connected to any MCP server');
    }

    // Check cache
    if (!forceRefresh && this.primitivesCache && this.isCacheValid()) {
      console.log('[McpClient] Returning cached primitives');
      return this.primitivesCache;
    }

    try {
      console.log('[McpClient] Fetching primitives...');
      const primitives = await this.activePlugin.getPrimitives(this.client);

      // Normalize primitives
      const tools = this.normalizeTools(primitives.filter((p) => p.type === 'tool'));
      const resources = this.normalizeResources(primitives.filter((p) => p.type === 'resource'));
      const prompts = this.normalizePrompts(primitives.filter((p) => p.type === 'prompt'));

      const response: PrimitivesResponse = {
        tools,
        resources,
        prompts,
        timestamp: Date.now(),
      };

      // Cache response
      this.primitivesCache = response;
      this.primitivesCacheTime = Date.now();

      // Emit update
      this.emit('tools:list-updated', {
        tools,
        type: this.activePlugin.metadata.transportType,
      });

      console.log(
        `[McpClient] Retrieved ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts`
      );
      return response;
    } catch (error) {
      console.error('[McpClient] Failed to get primitives:', error);

      if (!(await this.isHealthy())) {
        this.isConnectedFlag = false;
        this.emit('connection:status-changed', {
          isConnected: false,
          type: this.activePlugin?.metadata.transportType || null,
          error: 'Connection lost while getting primitives',
        });
      }

      throw error;
    }
  }

  private normalizeTools(primitives: Primitive[]): NormalizedTool[] {
    return primitives.map((p) => {
      const tool = p.value as Record<string, unknown>;
      return {
        name: String(tool.name || ''),
        description: String(tool.description || ''),
        inputSchema: (tool.inputSchema || tool.input_schema || {}) as Record<string, unknown>,
      };
    });
  }

  private normalizeResources(primitives: Primitive[]): NormalizedResource[] {
    return primitives.map((p) => {
      const resource = p.value as Record<string, unknown>;
      return {
        uri: String(resource.uri || ''),
        name: String(resource.name || ''),
        description: resource.description ? String(resource.description) : undefined,
        mimeType: resource.mimeType ? String(resource.mimeType) : undefined,
      };
    });
  }

  private normalizePrompts(primitives: Primitive[]): NormalizedPrompt[] {
    return primitives.map((p) => {
      const prompt = p.value as Record<string, unknown>;
      return {
        name: String(prompt.name || ''),
        description: prompt.description ? String(prompt.description) : undefined,
        arguments: prompt.arguments as NormalizedPrompt['arguments'],
      };
    });
  }

  private clearPrimitivesCache(): void {
    this.primitivesCache = null;
    this.primitivesCacheTime = 0;
  }

  private isCacheValid(): boolean {
    return Date.now() - this.primitivesCacheTime < this.CACHE_TTL;
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isConnectedFlag || !this.activePlugin) {
      return false;
    }

    try {
      return await this.activePlugin.isHealthy();
    } catch (error) {
      console.warn('[McpClient] Health check failed:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.isConnectedFlag && (this.activePlugin?.isConnected() ?? false);
  }

  getConnectionInfo(): {
    isConnected: boolean;
    type: TransportType | null;
    pluginInfo: unknown;
  } {
    return {
      isConnected: this.isConnectedFlag,
      type: this.activePlugin?.metadata.transportType || null,
      pluginInfo: this.activePlugin?.metadata || null,
    };
  }

  getAvailableTransports(): TransportType[] {
    return this.registry.listAvailable();
  }

  private startHealthMonitoring(): void {
    const interval = this.config.global.healthCheckInterval;
    if (interval <= 0) return;

    this.healthCheckTimer = setInterval(async () => {
      if (!this.isConnectedFlag) {
        this.stopHealthMonitoring();
        return;
      }

      try {
        const healthy = await this.isHealthy();
        const type = this.activePlugin?.metadata.transportType || null;

        if (type) {
          this.emit('connection:health-check', {
            healthy,
            type,
            timestamp: Date.now(),
          });
        }

        if (!healthy) {
          console.warn(`[McpClient] Health check failed for ${type}`);
          this.isConnectedFlag = false;
          this.emit('connection:status-changed', {
            isConnected: false,
            type,
            error: 'Health check failed',
          });
        }
      } catch (error) {
        console.error('[McpClient] Health check error:', error);
      }
    }, interval);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  getConfig(): ClientConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<ClientConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      global: { ...this.config.global, ...newConfig.global },
      plugins: { ...this.config.plugins, ...newConfig.plugins },
    };
    console.log('[McpClient] Configuration updated');
  }
}
