import { App, PluginSettingTab, Setting, Modal, Notice } from 'obsidian';
import type MCPClientPlugin from '../main.js';
import type { ServerConfig, TransportType } from '../mcpclient/types/index.js';

export class MCPSettingsTab extends PluginSettingTab {
  plugin: MCPClientPlugin;

  constructor(app: App, plugin: MCPClientPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('mcp-settings');

    containerEl.createEl('h2', { text: 'MCP Client Settings' });

    // Config file path
    new Setting(containerEl)
      .setName('Config File Path')
      .setDesc('Path to MCP configuration JSON file (Claude Desktop compatible)')
      .addText((text) =>
        text.setValue(this.plugin.settings.configFilePath).onChange(async (value) => {
          this.plugin.settings.configFilePath = value;
          await this.plugin.saveSettings();
        })
      )
      .addButton((button) =>
        button.setButtonText('Reload').onClick(async () => {
          await this.plugin.loadConfigFromFile();
          this.display();
          new Notice('Config reloaded');
        })
      );

    // Add server buttons
    new Setting(containerEl)
      .setName('Add Server')
      .setDesc('Add a new MCP server configuration')
      .addButton((button) =>
        button.setButtonText('Add STDIO Server').onClick(() => this.addServer('stdio'))
      )
      .addButton((button) =>
        button.setButtonText('Add WebSocket Server').onClick(() => this.addServer('websocket'))
      )
      .addButton((button) =>
        button.setButtonText('Add HTTP Server').onClick(() => this.addServer('streamable-http'))
      );

    // Preset servers
    new Setting(containerEl)
      .setName('Presets')
      .setDesc('Quick-add common MCP servers')
      .addButton((button) =>
        button.setButtonText('Add Preset...').onClick(() => this.showPresetModal())
      );

    containerEl.createEl('h3', { text: 'Configured Servers' });

    // Server list
    if (this.plugin.settings.servers.length === 0) {
      containerEl.createEl('p', {
        text: 'No servers configured. Add a server above.',
        cls: 'mcp-no-servers',
      });
    }

    for (let i = 0; i < this.plugin.settings.servers.length; i++) {
      this.renderServerSettings(containerEl, i);
    }
  }

  private renderServerSettings(container: HTMLElement, index: number) {
    const server = this.plugin.settings.servers[index];
    const serverEl = container.createDiv('mcp-server-settings');

    // Server header with toggle and delete
    new Setting(serverEl)
      .setName(server.name)
      .setDesc(`Type: ${server.type}`)
      .addToggle((toggle) =>
        toggle
          .setValue(server.enabled)
          .setTooltip('Enable/disable server')
          .onChange(async (value) => {
            server.enabled = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton((button) =>
        button
          .setButtonText('Delete')
          .setWarning()
          .onClick(async () => {
            await this.plugin.disconnectServer(server.id);
            this.plugin.settings.servers.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // Expandable details
    const detailsEl = serverEl.createEl('details');
    detailsEl.createEl('summary', { text: 'Configuration' });
    const configEl = detailsEl.createDiv('mcp-server-config');

    // Name
    new Setting(configEl).setName('Name').addText((text) =>
      text.setValue(server.name).onChange(async (value) => {
        server.name = value;
        await this.plugin.saveSettings();
      })
    );

    // Type
    new Setting(configEl).setName('Connection Type').addDropdown((dropdown) =>
      dropdown
        .addOption('stdio', 'STDIO (Local Command)')
        .addOption('websocket', 'WebSocket')
        .addOption('sse', 'SSE (HTTP)')
        .addOption('streamable-http', 'Streamable HTTP')
        .setValue(server.type)
        .onChange(async (value) => {
          server.type = value as TransportType;
          await this.plugin.saveSettings();
          this.display();
        })
    );

    // Type-specific config
    if (server.type === 'stdio') {
      this.renderStdioConfig(configEl, server);
    } else if (server.type === 'websocket') {
      this.renderWebSocketConfig(configEl, server);
    } else {
      this.renderHttpConfig(configEl, server);
    }

    // Auto-connect
    new Setting(configEl).setName('Auto-connect on startup').addToggle((toggle) =>
      toggle.setValue(server.autoConnect).onChange(async (value) => {
        server.autoConnect = value;
        await this.plugin.saveSettings();
      })
    );
  }

  private renderStdioConfig(container: HTMLElement, server: ServerConfig) {
    const config = server.config as { command?: string; args?: string[]; env?: Record<string, string>; cwd?: string };

    new Setting(container)
      .setName('Command')
      .setDesc('Executable to run (e.g., npx, node, python)')
      .addText((text) =>
        text
          .setValue(config.command || '')
          .setPlaceholder('npx')
          .onChange(async (value) => {
            config.command = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName('Arguments')
      .setDesc('Command arguments (one per line)')
      .addTextArea((textarea) =>
        textarea
          .setValue((config.args || []).join('\n'))
          .setPlaceholder('-y\n@modelcontextprotocol/server-memory')
          .onChange(async (value) => {
            config.args = value.split('\n').filter((arg) => arg.trim());
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName('Environment Variables')
      .setDesc('KEY=value format, one per line')
      .addTextArea((textarea) =>
        textarea
          .setValue(
            Object.entries(config.env || {})
              .map(([k, v]) => `${k}=${v}`)
              .join('\n')
          )
          .setPlaceholder('API_KEY=xxx')
          .onChange(async (value) => {
            config.env = {};
            value.split('\n').forEach((line) => {
              const [key, ...rest] = line.split('=');
              if (key && rest.length > 0) {
                config.env![key.trim()] = rest.join('=').trim();
              }
            });
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName('Working Directory')
      .setDesc('Optional working directory for the command')
      .addText((text) =>
        text.setValue(config.cwd || '').onChange(async (value) => {
          config.cwd = value || undefined;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderWebSocketConfig(container: HTMLElement, server: ServerConfig) {
    const config = server.config as { url?: string };

    new Setting(container)
      .setName('WebSocket URL')
      .setDesc('WebSocket server URL (ws:// or wss://)')
      .addText((text) =>
        text
          .setValue(config.url || '')
          .setPlaceholder('ws://localhost:3000')
          .onChange(async (value) => {
            config.url = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderHttpConfig(container: HTMLElement, server: ServerConfig) {
    const config = server.config as { url?: string };

    new Setting(container)
      .setName('HTTP URL')
      .setDesc('HTTP server URL')
      .addText((text) =>
        text
          .setValue(config.url || '')
          .setPlaceholder('http://localhost:3000/mcp')
          .onChange(async (value) => {
            config.url = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private addServer(type: TransportType) {
    const id = `server-${Date.now()}`;
    const newServer: ServerConfig = {
      id,
      name: `New ${type} Server`,
      enabled: true,
      autoConnect: false,
      type,
      config: type === 'stdio'
        ? { command: '', args: [], env: {} }
        : { url: '' },
    };

    this.plugin.settings.servers.push(newServer);
    this.plugin.saveSettings();
    this.display();
  }

  private showPresetModal() {
    new PresetModal(this.app, async (preset) => {
      this.plugin.settings.servers.push(preset);
      await this.plugin.saveSettings();
      this.display();
      new Notice(`Added ${preset.name}`);
    }).open();
  }
}

class PresetModal extends Modal {
  private onSelect: (server: ServerConfig) => void;

  constructor(app: App, onSelect: (server: ServerConfig) => void) {
    super(app);
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Add Preset Server' });

    const presets: Array<{ name: string; config: Omit<ServerConfig, 'id'> }> = [
      {
        name: 'Memory Server',
        config: {
          name: 'Memory',
          enabled: true,
          autoConnect: false,
          type: 'stdio',
          config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-memory'],
          },
        },
      },
      {
        name: 'Filesystem Server',
        config: {
          name: 'Filesystem',
          enabled: true,
          autoConnect: false,
          type: 'stdio',
          config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/directory'],
          },
        },
      },
      {
        name: 'Sequential Thinking',
        config: {
          name: 'Sequential Thinking',
          enabled: true,
          autoConnect: false,
          type: 'stdio',
          config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
          },
        },
      },
      {
        name: 'Claude Code',
        config: {
          name: 'Claude Code',
          enabled: true,
          autoConnect: false,
          type: 'stdio',
          config: {
            command: 'claude',
            args: ['mcp', 'serve'],
          },
        },
      },
      {
        name: 'Fetch Server',
        config: {
          name: 'Fetch',
          enabled: true,
          autoConnect: false,
          type: 'stdio',
          config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-fetch'],
          },
        },
      },
    ];

    const listEl = contentEl.createDiv('mcp-preset-list');

    for (const preset of presets) {
      const itemEl = listEl.createDiv('mcp-preset-item');
      const btn = itemEl.createEl('button', { text: preset.name });
      btn.addEventListener('click', () => {
        this.onSelect({
          id: `server-${Date.now()}`,
          ...preset.config,
        } as ServerConfig);
        this.close();
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
