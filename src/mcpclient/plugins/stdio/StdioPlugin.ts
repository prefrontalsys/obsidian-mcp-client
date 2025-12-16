import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { spawn, ChildProcess } from 'child_process';
import type {
  ITransportPlugin,
  PluginMetadata,
  PluginConfig,
  StdioPluginConfig,
  Primitive,
} from '../../types/plugin.js';

/**
 * STDIO Transport Plugin for MCP Client
 *
 * Spawns MCP servers as child processes and communicates via STDIO.
 * Handles process lifecycle management, health checks, and cleanup.
 */
export class StdioPlugin implements ITransportPlugin {
  public readonly metadata: PluginMetadata = {
    name: 'stdio',
    version: '1.0.0',
    transportType: 'stdio',
    description: 'STDIO transport for MCP servers via child process spawning',
  };

  private _transport: StdioClientTransport | null = null;
  private _process: ChildProcess | null = null;
  private _connected: boolean = false;
  private _config: StdioPluginConfig | null = null;

  /**
   * Initialize the plugin with configuration
   */
  async initialize(config: PluginConfig): Promise<void> {
    if (!this.isSupported(config)) {
      throw new Error('Invalid STDIO configuration: missing required "command" field');
    }

    this._config = config as StdioPluginConfig;
  }

  /**
   * Create and return a STDIO transport connection
   * Spawns the MCP server process and creates transport
   */
  async connect(config: PluginConfig): Promise<Transport> {
    if (this._connected && this._transport) {
      return this._transport;
    }

    if (!this.isSupported(config)) {
      throw new Error('Invalid STDIO configuration: missing required "command" field');
    }

    const stdioConfig = config as StdioPluginConfig;

    try {
      // Spawn the MCP server process
      const { command, args = [], env = {}, cwd, timeout = 10000 } = stdioConfig;

      // Merge environment variables with process.env, filtering out undefined values
      const processEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          processEnv[key] = value;
        }
      }
      Object.assign(processEnv, env);

      // Create spawn options
      const spawnOptions: any = {
        env: processEnv,
        stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
      };

      if (cwd) {
        spawnOptions.cwd = cwd;
      }

      // Spawn the process
      this._process = spawn(command, args, spawnOptions);

      // Handle process errors
      this._process.on('error', (error) => {
        console.error(`[StdioPlugin] Process error:`, error);
        this._connected = false;
      });

      // Handle process exit
      this._process.on('exit', (code, signal) => {
        console.log(`[StdioPlugin] Process exited with code ${code}, signal ${signal}`);
        this._connected = false;
      });

      // Log stderr for debugging (don't throw, as some servers use stderr for logging)
      if (this._process.stderr) {
        this._process.stderr.on('data', (data) => {
          console.error(`[StdioPlugin] Server stderr: ${data}`);
        });
      }

      // Create the STDIO transport
      this._transport = new StdioClientTransport({
        command,
        args,
        env: processEnv,
        stderr: 'pipe', // Pipe stderr to console
      });

      // Wait for connection with timeout
      await Promise.race([
        new Promise((resolve) => {
          // Consider connected once transport is created
          // The SDK will handle the actual connection negotiation
          this._connected = true;
          resolve(undefined);
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), timeout)
        ),
      ]);

      this._config = stdioConfig;
      return this._transport;
    } catch (error) {
      // Cleanup on failure
      await this.disconnect();
      throw new Error(`Failed to connect STDIO transport: ${error}`);
    }
  }

  /**
   * Disconnect and cleanup resources
   * Kills the spawned process and cleans up transport
   */
  async disconnect(): Promise<void> {
    this._connected = false;

    // Close the transport
    if (this._transport) {
      try {
        await this._transport.close();
      } catch (error) {
        console.error('[StdioPlugin] Error closing transport:', error);
      }
      this._transport = null;
    }

    // Kill the process
    if (this._process) {
      try {
        // Try graceful termination first
        this._process.kill('SIGTERM');

        // Wait a bit for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Force kill if still running
        if (!this._process.killed) {
          this._process.kill('SIGKILL');
        }
      } catch (error) {
        console.error('[StdioPlugin] Error killing process:', error);
      }
      this._process = null;
    }

    this._config = null;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this._connected && this._process !== null && !this._process.killed;
  }

  /**
   * Check if this plugin supports the given config
   * STDIO requires a "command" field
   */
  isSupported(config: PluginConfig): boolean {
    return (
      typeof config === 'object' &&
      config !== null &&
      'command' in config &&
      typeof config.command === 'string' &&
      config.command.length > 0
    );
  }

  /**
   * Get default configuration for STDIO transport
   */
  getDefaultConfig(): PluginConfig {
    return {
      command: '',
      args: [],
      env: {},
      timeout: 10000,
    } as StdioPluginConfig;
  }

  /**
   * Health check - verify process is still running
   */
  async isHealthy(): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    // Check if process is still alive
    if (this._process) {
      // Process exists and hasn't been killed
      return !this._process.killed && this._process.exitCode === null;
    }

    return false;
  }

  /**
   * Call a tool via the MCP client
   * Delegates to the SDK Client's callTool method
   */
  async callTool(
    client: Client,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.isConnected()) {
      throw new Error('Not connected - cannot call tool');
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to call tool "${toolName}": ${error}`);
    }
  }

  /**
   * Get all primitives (tools, resources, prompts) from the MCP server
   * Delegates to the SDK Client's list methods
   */
  async getPrimitives(client: Client): Promise<Primitive[]> {
    if (!this.isConnected()) {
      throw new Error('Not connected - cannot get primitives');
    }

    const primitives: Primitive[] = [];

    try {
      // Get tools
      const toolsResult = await client.listTools();
      if (toolsResult.tools) {
        for (const tool of toolsResult.tools) {
          primitives.push({
            type: 'tool',
            value: tool,
          });
        }
      }

      // Get resources
      const resourcesResult = await client.listResources();
      if (resourcesResult.resources) {
        for (const resource of resourcesResult.resources) {
          primitives.push({
            type: 'resource',
            value: resource,
          });
        }
      }

      // Get prompts
      const promptsResult = await client.listPrompts();
      if (promptsResult.prompts) {
        for (const prompt of promptsResult.prompts) {
          primitives.push({
            type: 'prompt',
            value: prompt,
          });
        }
      }

      return primitives;
    } catch (error) {
      throw new Error(`Failed to get primitives: ${error}`);
    }
  }
}
