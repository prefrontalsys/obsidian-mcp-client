# WebSocket Transport Plugin

A WebSocket transport implementation for the Model Context Protocol (MCP) in Obsidian.

## Features

- **Native WebSocket API**: Uses browser's built-in WebSocket for compatibility
- **Automatic Reconnection**: Configurable reconnection attempts with exponential backoff
- **Message Queuing**: Queues messages when disconnected and flushes on reconnection
- **JSON-RPC 2.0**: Full JSON-RPC 2.0 message validation and formatting
- **Connection State Management**: Track connection status and handle lifecycle events

## Architecture

### WebSocketTransport

The `WebSocketTransport` class implements the MCP SDK's `Transport` interface:

```typescript
interface Transport {
  start(): Promise<void>;
  close(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
}
```

**Key Features:**
- Validates JSON-RPC 2.0 message format on send and receive
- Automatically queues messages when WebSocket is not connected
- Implements exponential backoff for reconnection attempts
- Provides connection state checking via `isConnected()`

### WebSocketPlugin

The `WebSocketPlugin` class implements the `ITransportPlugin` interface, providing:

- Configuration validation
- Transport lifecycle management
- MCP client integration (tools, resources, prompts)
- Health checking

## Configuration

```typescript
interface WebSocketPluginConfig {
  url: string;                    // WebSocket URL (ws:// or wss://)
  protocols?: string[];           // WebSocket subprotocols (default: ['mcp'])
  reconnectAttempts?: number;     // Number of reconnect attempts (default: 3)
  reconnectDelay?: number;        // Base delay in ms (default: 1000)
}
```

## Usage

### Basic Setup

```typescript
import { WebSocketPlugin } from './plugins/websocket';

// Create plugin instance
const plugin = new WebSocketPlugin();

// Initialize with configuration
await plugin.initialize({
  url: 'ws://localhost:8080',
  protocols: ['mcp'],
  reconnectAttempts: 3,
  reconnectDelay: 1000,
});

// Connect and get transport
const transport = await plugin.connect({
  url: 'ws://localhost:8080',
});

// Use with MCP Client
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({
  name: 'obsidian-mcp-client',
  version: '1.0.0',
}, {
  capabilities: {}
});

await client.connect(transport);
```

### Using with MCP Client

```typescript
// Call a tool
const result = await plugin.callTool(client, 'tool_name', {
  arg1: 'value1',
  arg2: 'value2',
});

// Get all available primitives
const primitives = await plugin.getPrimitives(client);

// Filter by type
const tools = primitives.filter(p => p.type === 'tool');
const resources = primitives.filter(p => p.type === 'resource');
const prompts = primitives.filter(p => p.type === 'prompt');
```

### Connection Management

```typescript
// Check connection status
if (plugin.isConnected()) {
  console.log('Connected to WebSocket server');
}

// Check transport health
const healthy = await plugin.isHealthy();

// Get queued message count
const queueSize = plugin.getQueueSize();

// Disconnect
await plugin.disconnect();
```

### Event Handlers

```typescript
const transport = await plugin.connect(config);

// Handle incoming messages
transport.onmessage = (message) => {
  console.log('Received message:', message);
};

// Handle connection close
transport.onclose = () => {
  console.log('WebSocket connection closed');
};

// Handle errors
transport.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

## Reconnection Behavior

The transport implements exponential backoff for reconnection:

1. **First attempt**: Immediate (on disconnect)
2. **Second attempt**: `reconnectDelay * 2^0` ms (e.g., 1000ms)
3. **Third attempt**: `reconnectDelay * 2^1` ms (e.g., 2000ms)
4. **Fourth attempt**: `reconnectDelay * 2^2` ms (e.g., 4000ms)

After exhausting `reconnectAttempts`, the `onclose` callback is triggered.

## Message Queue

When the WebSocket is not connected (e.g., during reconnection), messages are queued in memory:

- Messages are queued on `send()` if WebSocket is not open
- Queue is automatically flushed when connection is re-established
- Queue is cleared on `close()`
- Queue size can be checked via `getQueueSize()`

## Error Handling

The transport validates messages and handles errors at multiple levels:

### Connection Errors
- Invalid URL format
- Connection refused
- Network errors
- WebSocket protocol errors

### Message Errors
- Invalid JSON parsing
- Invalid JSON-RPC 2.0 format
- Message send failures

All errors are reported via the `onerror` callback.

## JSON-RPC 2.0 Validation

The transport validates that all messages conform to JSON-RPC 2.0:

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "method_name",
  "params": {},
  "id": 1
}
```

**Notification:**
```json
{
  "jsonrpc": "2.0",
  "method": "method_name",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {},
  "id": 1
}
```

**Error Response:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  },
  "id": 1
}
```

## WebSocket Protocols

By default, the transport negotiates the `mcp` subprotocol. You can specify custom protocols:

```typescript
await plugin.initialize({
  url: 'ws://localhost:8080',
  protocols: ['mcp', 'custom-protocol'],
});
```

The server must support at least one of the specified protocols for the connection to succeed.

## Security Considerations

### Use WSS for Production

Always use `wss://` (WebSocket Secure) in production:

```typescript
await plugin.initialize({
  url: 'wss://api.example.com/mcp',
});
```

### URL Validation

The plugin validates that URLs start with `ws://` or `wss://` and rejects invalid formats.

### Message Validation

All incoming messages are validated against JSON-RPC 2.0 spec before being delivered to handlers.

## Testing

### Local Testing

```typescript
// Start a local WebSocket server on port 8080
// Then connect:
const plugin = new WebSocketPlugin();
await plugin.initialize({
  url: 'ws://localhost:8080',
});

const transport = await plugin.connect({
  url: 'ws://localhost:8080',
});
```

### Testing Reconnection

```typescript
// Configure shorter delays for testing
await plugin.initialize({
  url: 'ws://localhost:8080',
  reconnectAttempts: 5,
  reconnectDelay: 500, // 500ms base delay
});

// Monitor reconnection events
transport.onerror = (error) => {
  console.log('Reconnection error:', error.message);
};

transport.onclose = () => {
  console.log('All reconnection attempts exhausted');
};
```

## Troubleshooting

### Connection Refused

```
Error: WebSocket error: error
```

**Solution**: Verify the WebSocket server is running and accessible at the specified URL.

### Invalid URL

```
Error: Invalid WebSocket URL: must start with ws:// or wss://
```

**Solution**: Ensure the URL starts with `ws://` or `wss://`.

### Message Queue Growing

If `getQueueSize()` keeps growing, the connection is not being established. Check:

1. Server availability
2. Network connectivity
3. Reconnection configuration
4. Server-side WebSocket support

### Protocol Negotiation Failed

The connection closes immediately after opening. This may indicate:

1. Server doesn't support the specified protocols
2. Try connecting without protocols: `protocols: []`

## Implementation Notes

### Browser Compatibility

This implementation uses the browser's native `WebSocket` API, which is supported in:

- Chrome/Edge 16+
- Firefox 11+
- Safari 7+
- All modern browsers

### Memory Management

- Message queue is cleared on `close()`
- Reconnection timer is cleared on `close()`
- Event handlers should be removed when no longer needed

### Thread Safety

All operations are synchronous within the JavaScript event loop. The transport is not thread-safe across Web Workers.

## Future Enhancements

Potential improvements:

- [ ] Ping/pong heartbeat mechanism
- [ ] Custom timeout configuration
- [ ] Message size limits
- [ ] Compression support (WebSocket permessage-deflate)
- [ ] Binary message support
- [ ] Connection state events (connecting, connected, disconnecting)
- [ ] Persistent queue (survive page reloads)
- [ ] Metrics/telemetry (message count, error rates)

## License

MIT
