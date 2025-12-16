# Obsidian MCP Client

An [Obsidian](https://obsidian.md) plugin for connecting to [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers.

## Features

- **Multiple Transport Types**: Connect to MCP servers via:
  - STDIO (local command execution)
  - WebSocket
  - Server-Sent Events (SSE)
  - Streamable HTTP

- **Plugin Architecture**: Extensible transport system with hot-swappable plugins

- **Claude Desktop Compatible**: Uses the same config format as Claude Desktop (`~/.mcp-config.json`)

- **Built-in Presets**: Quick-add common MCP servers (Memory, Filesystem, Sequential Thinking, etc.)

## Installation

### From Obsidian Community Plugins (Coming Soon)

Search for "MCP Client" in Obsidian's community plugin browser.

### Manual Installation

1. Download the latest release from the [Releases](https://github.com/simplemindedbot/obsidian-mcp-client/releases) page
2. Extract to your vault's `.obsidian/plugins/obsidian-mcp-client/` directory
3. Enable the plugin in Obsidian settings

### Build from Source

```bash
git clone https://github.com/simplemindedbot/obsidian-mcp-client.git
cd obsidian-mcp-client
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugins directory.

## Usage

1. Open the MCP Client view via the ribbon icon or command palette
2. Configure MCP servers in Settings > MCP Client
3. Connect to servers and browse available tools, resources, and prompts

### Configuration

The plugin reads from `~/.mcp-config.json` by default (Claude Desktop compatible format):

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Development build with watch
npm run dev

# Production build
npm run build
```

## Architecture

```
src/
├── main.ts                    # Plugin entry point
├── mcpclient/
│   ├── core/
│   │   ├── McpClient.ts       # Main client wrapper
│   │   ├── PluginRegistry.ts  # Transport plugin registry
│   │   └── EventEmitter.ts    # Type-safe event system
│   ├── plugins/
│   │   ├── stdio/             # STDIO transport
│   │   ├── websocket/         # WebSocket transport
│   │   ├── sse/               # SSE transport
│   │   └── streamable-http/   # Streamable HTTP transport
│   └── types/                 # TypeScript definitions
└── ui/
    ├── MCPView.ts             # Sidebar view
    ├── MCPSettingsTab.ts      # Settings tab
    └── ToolParameterModal.ts  # Tool parameter input modal
```

## License

MIT

## Author

[simplemindedbot](https://github.com/simplemindedbot)
