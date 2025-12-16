import { App, Plugin, Notice, WorkspaceLeaf } from 'obsidian';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { McpClient } from './mcpclient/core/McpClient.js';
import { PluginRegistry } from './mcpclient/core/PluginRegistry.js';
import type { ServerConfig, TransportType, MCPConfigFile } from './mcpclient/types/index.js';
import { MCPView, VIEW_TYPE_MCP } from './ui/MCPView.js';
import { MCPSettingsTab } from './ui/MCPSettingsTab.js';

// Import plugins (will be available after agents complete)
// These imports are dynamic - we'll create placeholder files if needed

interface MCPClientSettings {
  configFilePath: string;
  servers: ServerConfig[];
}

const DEFAULT_SETTINGS: MCPClientSettings = {
  configFilePath: join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.mcp-config.json'
  ),
  servers: [],
};

export default class MCPClientPlugin extends Plugin {
  settings: MCPClientSettings = DEFAULT_SETTINGS;
  mcpClients: Map<string, McpClient> = new Map();
  private registry: PluginRegistry = new PluginRegistry();

  async onload() {
    console.log('[MCP Client] Loading plugin...');

    await this.loadSettings();
    await this.registerTransportPlugins();

    // Register view
    this.registerView(VIEW_TYPE_MCP, (leaf) => new MCPView(leaf, this));

    // Add ribbon icon
    this.addRibbonIcon('plug', 'MCP Client', () => {
      this.activateView();
    });

    // Add commands
    this.addCommand({
      id: 'open-mcp-view',
      name: 'Open MCP Client View',
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: 'connect-all-servers',
      name: 'Connect to All MCP Servers',
      callback: () => this.connectAllServers(),
    });

    this.addCommand({
      id: 'disconnect-all-servers',
      name: 'Disconnect from All MCP Servers',
      callback: () => this.disconnectAllServers(),
    });

    this.addCommand({
      id: 'refresh-mcp-tools',
      name: 'Refresh MCP Tools',
      callback: () => this.refreshAllPrimitives(),
    });

    // Add settings tab
    this.addSettingTab(new MCPSettingsTab(this.app, this));

    // Auto-connect servers
    setTimeout(() => this.autoConnectServers(), 1000);

    console.log('[MCP Client] Plugin loaded');
  }

  async onunload() {
    console.log('[MCP Client] Unloading plugin...');
    await this.disconnectAllServers();
  }

  private async registerTransportPlugins() {
    try {
      // Dynamically import plugins
      const { StdioPlugin } = await import('./mcpclient/plugins/stdio/StdioPlugin.js');
      await this.registry.register(new StdioPlugin());
      console.log('[MCP Client] Registered STDIO plugin');
    } catch (error) {
      console.warn('[MCP Client] STDIO plugin not available:', error);
    }

    try {
      const { WebSocketPlugin } = await import('./mcpclient/plugins/websocket/WebSocketPlugin.js');
      await this.registry.register(new WebSocketPlugin());
      console.log('[MCP Client] Registered WebSocket plugin');
    } catch (error) {
      console.warn('[MCP Client] WebSocket plugin not available:', error);
    }

    try {
      const { SSEPlugin } = await import('./mcpclient/plugins/sse/SSEPlugin.js');
      await this.registry.register(new SSEPlugin());
      console.log('[MCP Client] Registered SSE plugin');
    } catch (error) {
      console.warn('[MCP Client] SSE plugin not available:', error);
    }

    try {
      const { StreamableHttpPlugin } = await import('./mcpclient/plugins/streamable-http/StreamableHttpPlugin.js');
      await this.registry.register(new StreamableHttpPlugin());
      console.log('[MCP Client] Registered Streamable HTTP plugin');
    } catch (error) {
      console.warn('[MCP Client] Streamable HTTP plugin not available:', error);
    }
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

    // Load servers from config file
    await this.loadConfigFromFile();
  }

  async saveSettings() {
    // Save to Obsidian data
    await this.saveData({
      configFilePath: this.settings.configFilePath,
    });

    // Save servers to config file
    this.saveConfigToFile();
  }

  async loadConfigFromFile() {
    try {
      if (!existsSync(this.settings.configFilePath)) {
        console.log('[MCP Client] Config file not found, using defaults');
        return;
      }

      const content = readFileSync(this.settings.configFilePath, 'utf-8');
      const config: MCPConfigFile = JSON.parse(content);

      this.settings.servers = Object.entries(config.mcpServers || {}).map(
        ([id, serverConfig]): ServerConfig => {
          // Determine type from config
          let type: TransportType = 'stdio';
          if (serverConfig.connectionType) {
            type = serverConfig.connectionType;
          } else if (serverConfig.url) {
            type = serverConfig.url.startsWith('ws') ? 'websocket' : 'streamable-http';
          }

          // Build config based on type
          const pluginConfig = type === 'stdio'
            ? {
                command: serverConfig.command || '',
                args: serverConfig.args,
                env: serverConfig.env,
                cwd: serverConfig.cwd,
              }
            : {
                url: serverConfig.url || '',
              };

          return {
            id,
            name: id,
            enabled: serverConfig.enabled !== false,
            autoConnect: serverConfig.autoConnect || false,
            type,
            config: pluginConfig,
          };
        }
      );

      console.log(`[MCP Client] Loaded ${this.settings.servers.length} servers from config`);
    } catch (error) {
      console.error('[MCP Client] Error loading config file:', error);
    }
  }

  private saveConfigToFile() {
    try {
      const config: MCPConfigFile = {
        mcpServers: {},
      };

      for (const server of this.settings.servers) {
        const serverConfig: MCPConfigFile['mcpServers'][string] = {
          connectionType: server.type,
          enabled: server.enabled,
          autoConnect: server.autoConnect,
        };

        if (server.type === 'stdio') {
          const stdioConfig = server.config as { command?: string; args?: string[]; env?: Record<string, string>; cwd?: string };
          serverConfig.command = stdioConfig.command;
          serverConfig.args = stdioConfig.args;
          serverConfig.env = stdioConfig.env;
          serverConfig.cwd = stdioConfig.cwd;
        } else {
          const httpConfig = server.config as { url?: string };
          serverConfig.url = httpConfig.url;
        }

        config.mcpServers[server.id] = serverConfig;
      }

      writeFileSync(this.settings.configFilePath, JSON.stringify(config, null, 2));
      console.log('[MCP Client] Saved config to file');
    } catch (error) {
      console.error('[MCP Client] Error saving config file:', error);
    }
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_MCP);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_MCP, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  private refreshView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MCP);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MCPView) {
        view.refresh();
      }
    }
  }

  private async autoConnectServers() {
    const autoConnectServers = this.settings.servers.filter(
      (s) => s.enabled && s.autoConnect
    );

    for (const server of autoConnectServers) {
      try {
        await this.connectServer(server.id);
      } catch (error) {
        console.error(`[MCP Client] Auto-connect failed for ${server.name}:`, error);
      }
    }
  }

  async connectAllServers() {
    const enabledServers = this.settings.servers.filter((s) => s.enabled);
    new Notice(`Connecting to ${enabledServers.length} servers...`);

    const results = await Promise.allSettled(
      enabledServers.map((s) => this.connectServer(s.id))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    new Notice(`Connected: ${succeeded}, Failed: ${failed}`);
    this.refreshView();
  }

  async disconnectAllServers() {
    const clients = Array.from(this.mcpClients.values());

    await Promise.allSettled(clients.map((c) => c.disconnect()));

    this.mcpClients.clear();
    new Notice('Disconnected from all servers');
    this.refreshView();
  }

  async connectServer(serverId: string) {
    const server = this.settings.servers.find((s) => s.id === serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // Check if plugin is available
    if (!this.registry.isRegistered(server.type)) {
      throw new Error(`Transport plugin for ${server.type} not available`);
    }

    // Create new client if needed
    let client = this.mcpClients.get(serverId);
    if (!client) {
      client = new McpClient();

      // Copy registered plugins to client
      const registry = client.getRegistry();
      const plugin = await this.registry.getPlugin(server.type);
      if (plugin) {
        await registry.register(plugin);
      }

      this.mcpClients.set(serverId, client);
    }

    new Notice(`Connecting to ${server.name}...`);

    try {
      await client.connect({
        type: server.type,
        config: server.config,
      });

      new Notice(`Connected to ${server.name}`);
      this.refreshView();
    } catch (error) {
      new Notice(`Failed to connect to ${server.name}: ${error}`);
      throw error;
    }
  }

  async disconnectServer(serverId: string) {
    const client = this.mcpClients.get(serverId);
    const server = this.settings.servers.find((s) => s.id === serverId);

    if (client) {
      await client.disconnect();
      new Notice(`Disconnected from ${server?.name || serverId}`);
      this.refreshView();
    }
  }

  async refreshAllPrimitives() {
    const connected = Array.from(this.mcpClients.entries()).filter(
      ([, client]) => client.isConnected()
    );

    for (const [id, client] of connected) {
      try {
        await client.getPrimitives(true);
      } catch (error) {
        console.error(`[MCP Client] Failed to refresh primitives for ${id}:`, error);
      }
    }

    this.refreshView();
    new Notice('Refreshed all tools');
  }
}
