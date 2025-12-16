import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from 'obsidian';
import type MCPClientPlugin from '../main.js';
import type { NormalizedTool, NormalizedResource } from '../mcpclient/types/plugin.js';
import { ToolParameterModal } from './ToolParameterModal.js';

export const VIEW_TYPE_MCP = 'mcp-client-view';

export class MCPView extends ItemView {
  plugin: MCPClientPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: MCPClientPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MCP;
  }

  getDisplayText(): string {
    return 'MCP Client';
  }

  getIcon(): string {
    return 'plug';
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('mcp-view-container');

    // Header
    const headerEl = container.createDiv('mcp-header');
    headerEl.createEl('h2', { text: 'MCP Client' });

    // Global controls
    const controlsEl = headerEl.createDiv('mcp-global-controls');

    const connectAllBtn = controlsEl.createEl('button', { text: 'Connect All' });
    connectAllBtn.addEventListener('click', () => this.plugin.connectAllServers());

    const disconnectAllBtn = controlsEl.createEl('button', { text: 'Disconnect All' });
    disconnectAllBtn.addEventListener('click', () => this.plugin.disconnectAllServers());

    const refreshBtn = controlsEl.createEl('button', { text: 'Refresh' });
    refreshBtn.addEventListener('click', () => this.refresh());

    // Servers
    const serversEl = container.createDiv('mcp-servers');

    for (const server of this.plugin.settings.servers) {
      if (!server.enabled) continue;

      await this.renderServer(serversEl, server);
    }

    if (this.plugin.settings.servers.filter((s) => s.enabled).length === 0) {
      serversEl.createEl('p', {
        text: 'No servers configured. Add servers in settings.',
        cls: 'mcp-no-servers',
      });
    }
  }

  private async renderServer(
    container: HTMLElement,
    server: { id: string; name: string; type: string }
  ) {
    const serverEl = container.createDiv('mcp-server');

    // Server header
    const headerEl = serverEl.createDiv('mcp-server-header');
    headerEl.createEl('h3', { text: server.name });

    const client = this.plugin.mcpClients.get(server.id);
    const isConnected = client?.isConnected() ?? false;

    // Status badge
    const statusEl = headerEl.createDiv('mcp-status-badge');
    statusEl.addClass(isConnected ? 'status-connected' : 'status-disconnected');
    statusEl.setText(isConnected ? 'Connected' : 'Disconnected');

    // Server info
    const infoEl = serverEl.createDiv('mcp-server-info');
    infoEl.createEl('span', { text: `Type: ${server.type}`, cls: 'mcp-server-type' });

    // Server controls
    const controlsEl = serverEl.createDiv('mcp-server-controls');

    const toggleBtn = controlsEl.createEl('button', {
      text: isConnected ? 'Disconnect' : 'Connect',
    });
    toggleBtn.addEventListener('click', async () => {
      if (isConnected) {
        await this.plugin.disconnectServer(server.id);
      } else {
        await this.plugin.connectServer(server.id);
      }
      await this.refresh();
    });

    // If connected, show primitives
    if (isConnected && client) {
      try {
        const primitives = await client.getPrimitives();

        // Tools section
        if (primitives.tools.length > 0) {
          this.renderToolsSection(serverEl, primitives.tools, client);
        }

        // Resources section
        if (primitives.resources.length > 0) {
          this.renderResourcesSection(serverEl, primitives.resources, client);
        }

        // Prompts section
        if (primitives.prompts.length > 0) {
          this.renderPromptsSection(serverEl, primitives.prompts);
        }
      } catch (error) {
        serverEl.createEl('p', {
          text: `Error loading primitives: ${error}`,
          cls: 'mcp-error',
        });
      }
    }
  }

  private renderToolsSection(
    container: HTMLElement,
    tools: NormalizedTool[],
    client: InstanceType<typeof import('../mcpclient/core/McpClient.js').McpClient>
  ) {
    const sectionEl = container.createDiv('mcp-section');
    sectionEl.createEl('h4', { text: `Tools (${tools.length})` });

    const listEl = sectionEl.createDiv('mcp-tool-list');

    for (const tool of tools) {
      const itemEl = listEl.createDiv('mcp-tool-item');

      const nameEl = itemEl.createEl('strong', { text: tool.name });

      if (tool.description) {
        itemEl.createEl('p', { text: tool.description, cls: 'mcp-tool-desc' });
      }

      const btnContainer = itemEl.createDiv('mcp-tool-buttons');

      const callBtn = btnContainer.createEl('button', { text: 'Call' });
      callBtn.addEventListener('click', () => {
        this.openToolModal(tool, client);
      });

      const insertBtn = btnContainer.createEl('button', { text: 'Insert Result' });
      insertBtn.addEventListener('click', () => {
        this.openToolModal(tool, client, true);
      });
    }
  }

  private renderResourcesSection(
    container: HTMLElement,
    resources: NormalizedResource[],
    client: InstanceType<typeof import('../mcpclient/core/McpClient.js').McpClient>
  ) {
    const sectionEl = container.createDiv('mcp-section');
    sectionEl.createEl('h4', { text: `Resources (${resources.length})` });

    const listEl = sectionEl.createDiv('mcp-resource-list');

    for (const resource of resources) {
      const itemEl = listEl.createDiv('mcp-resource-item');

      itemEl.createEl('strong', { text: resource.name });
      itemEl.createEl('code', { text: resource.uri, cls: 'mcp-resource-uri' });

      if (resource.description) {
        itemEl.createEl('p', { text: resource.description });
      }
    }
  }

  private renderPromptsSection(
    container: HTMLElement,
    prompts: Array<{ name: string; description?: string }>
  ) {
    const sectionEl = container.createDiv('mcp-section');
    sectionEl.createEl('h4', { text: `Prompts (${prompts.length})` });

    const listEl = sectionEl.createDiv('mcp-prompt-list');

    for (const prompt of prompts) {
      const itemEl = listEl.createDiv('mcp-prompt-item');
      itemEl.createEl('strong', { text: prompt.name });
      if (prompt.description) {
        itemEl.createEl('p', { text: prompt.description });
      }
    }
  }

  private openToolModal(
    tool: NormalizedTool,
    client: InstanceType<typeof import('../mcpclient/core/McpClient.js').McpClient>,
    insertResult = false
  ) {
    new ToolParameterModal(this.app, tool, async (params) => {
      try {
        new Notice(`Calling ${tool.name}...`);
        const result = await client.callTool(tool.name, params);

        console.log(`[MCP] Tool result:`, result);

        if (insertResult) {
          await this.insertIntoActiveDocument(tool.name, result);
        } else {
          new Notice(`${tool.name} completed successfully`);
        }
      } catch (error) {
        new Notice(`Tool call failed: ${error}`);
        console.error(`[MCP] Tool call failed:`, error);
      }
    }).open();
  }

  private async insertIntoActiveDocument(toolName: string, result: unknown) {
    const formattedContent = this.formatResult(result);
    const content = `## ${toolName} Output\n\n${formattedContent}\n\n`;

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (activeView?.editor) {
      const cursor = activeView.editor.getCursor();
      activeView.editor.replaceRange(content, cursor);
      new Notice('Result inserted into document');
    } else {
      // Create new file
      const fileName = `MCP Output ${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.md`;
      const newFile = await this.app.vault.create(fileName, content);
      const leaf = this.app.workspace.getLeaf(false);
      if (leaf) {
        await leaf.openFile(newFile);
      }
      new Notice(`Result saved to ${fileName}`);
    }
  }

  private formatResult(result: unknown): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result && typeof result === 'object') {
      const obj = result as Record<string, unknown>;

      // Handle MCP content array format
      if (Array.isArray(obj.content)) {
        return obj.content
          .map((item: unknown) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const contentItem = item as Record<string, unknown>;
              if (contentItem.text) return String(contentItem.text);
              if (contentItem.content) return String(contentItem.content);
            }
            return JSON.stringify(item, null, 2);
          })
          .join('\n\n');
      }

      if (obj.text) return String(obj.text);
      if (obj.content && typeof obj.content === 'string') return obj.content;

      return '```json\n' + JSON.stringify(result, null, 2) + '\n```';
    }

    return String(result);
  }

  async onClose() {
    // Cleanup
  }
}
