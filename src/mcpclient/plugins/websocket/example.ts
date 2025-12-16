/**
 * Example usage of the WebSocket transport plugin for MCP
 *
 * This file demonstrates how to use the WebSocketPlugin with the MCP SDK
 * to connect to a WebSocket-based MCP server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketPlugin } from './WebSocketPlugin.js';
import type { WebSocketPluginConfig } from '../../types/plugin.js';

/**
 * Example 1: Basic WebSocket connection
 */
async function basicExample() {
  // Create plugin instance
  const plugin = new WebSocketPlugin();

  // Configure the plugin
  const config: WebSocketPluginConfig = {
    url: 'ws://localhost:8080',
    protocols: ['mcp'],
    reconnectAttempts: 3,
    reconnectDelay: 1000,
  };

  // Initialize the plugin
  await plugin.initialize(config);

  // Create and connect transport
  const transport = await plugin.connect(config);

  // Set up event handlers
  transport.onmessage = (message) => {
    console.log('Received message:', message);
  };

  transport.onerror = (error) => {
    console.error('Transport error:', error);
  };

  transport.onclose = () => {
    console.log('Transport closed');
  };

  // Create MCP client
  const client = new Client(
    {
      name: 'obsidian-mcp-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  // Connect client to transport
  await client.connect(transport);

  console.log('Connected to MCP server via WebSocket');

  // List available tools
  const toolsResponse = await client.listTools();
  console.log('Available tools:', toolsResponse.tools);

  // Cleanup
  await plugin.disconnect();
}

/**
 * Example 2: Using the plugin with reconnection
 */
async function reconnectionExample() {
  const plugin = new WebSocketPlugin();

  const config: WebSocketPluginConfig = {
    url: 'ws://localhost:8080',
    protocols: ['mcp'],
    reconnectAttempts: 5, // Try 5 times
    reconnectDelay: 2000, // 2 second base delay
  };

  await plugin.initialize(config);
  const transport = await plugin.connect(config);

  // Track reconnection attempts
  let reconnectCount = 0;

  transport.onerror = (error) => {
    if (error.message.includes('Reconnection attempt')) {
      reconnectCount++;
      console.log(`Reconnection attempt ${reconnectCount}`);
    } else {
      console.error('Error:', error);
    }
  };

  transport.onclose = () => {
    console.log('Connection closed after all reconnection attempts');
  };

  // The transport will automatically reconnect if connection is lost
  console.log('Monitoring connection...');
}

/**
 * Example 3: Calling tools through the plugin
 */
async function toolCallExample() {
  const plugin = new WebSocketPlugin();

  await plugin.initialize({
    url: 'ws://localhost:8080',
  });

  const transport = await plugin.connect({
    url: 'ws://localhost:8080',
  });

  const client = new Client(
    {
      name: 'obsidian-mcp-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  // Call a tool using the plugin's helper method
  try {
    const result = await plugin.callTool(client, 'example_tool', {
      param1: 'value1',
      param2: 42,
    });

    console.log('Tool result:', result);
  } catch (error) {
    console.error('Tool call failed:', error);
  }

  await plugin.disconnect();
}

/**
 * Example 4: Getting all primitives (tools, resources, prompts)
 */
async function primitivesExample() {
  const plugin = new WebSocketPlugin();

  await plugin.initialize({
    url: 'ws://localhost:8080',
  });

  const transport = await plugin.connect({
    url: 'ws://localhost:8080',
  });

  const client = new Client(
    {
      name: 'obsidian-mcp-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  // Get all primitives
  const primitives = await plugin.getPrimitives(client);

  // Filter by type
  const tools = primitives.filter((p) => p.type === 'tool');
  const resources = primitives.filter((p) => p.type === 'resource');
  const prompts = primitives.filter((p) => p.type === 'prompt');

  console.log('Tools:', tools.length);
  console.log('Resources:', resources.length);
  console.log('Prompts:', prompts.length);

  await plugin.disconnect();
}

/**
 * Example 5: Secure WebSocket (WSS) connection
 */
async function secureExample() {
  const plugin = new WebSocketPlugin();

  const config: WebSocketPluginConfig = {
    url: 'wss://api.example.com/mcp', // Use wss:// for secure connections
    protocols: ['mcp'],
    reconnectAttempts: 3,
    reconnectDelay: 1000,
  };

  await plugin.initialize(config);
  const transport = await plugin.connect(config);

  const client = new Client(
    {
      name: 'obsidian-mcp-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  console.log('Connected to secure MCP server');

  await plugin.disconnect();
}

/**
 * Example 6: Monitoring connection health and queue
 */
async function healthMonitoringExample() {
  const plugin = new WebSocketPlugin();

  await plugin.initialize({
    url: 'ws://localhost:8080',
  });

  const transport = await plugin.connect({
    url: 'ws://localhost:8080',
  });

  // Monitor connection health
  const healthCheckInterval = setInterval(async () => {
    const isHealthy = await plugin.isHealthy();
    const queueSize = plugin.getQueueSize();

    console.log('Health:', isHealthy ? 'OK' : 'UNHEALTHY');
    console.log('Queue size:', queueSize);

    if (!isHealthy) {
      console.warn('Connection unhealthy, messages are being queued');
    }
  }, 5000);

  // Run for 30 seconds
  setTimeout(() => {
    clearInterval(healthCheckInterval);
    plugin.disconnect();
  }, 30000);
}

/**
 * Example 7: Error handling and recovery
 */
async function errorHandlingExample() {
  const plugin = new WebSocketPlugin();

  try {
    // Attempt to connect to invalid URL
    await plugin.initialize({
      url: 'invalid-url', // This will fail validation
    });
  } catch (error) {
    console.error('Initialization failed:', error);
  }

  try {
    // Connect to non-existent server
    await plugin.initialize({
      url: 'ws://nonexistent.example.com:9999',
    });

    const transport = await plugin.connect({
      url: 'ws://nonexistent.example.com:9999',
    });

    // This will timeout or fail
  } catch (error) {
    console.error('Connection failed:', error);
    // Implement retry logic or fallback here
  }
}

/**
 * Example 8: Custom protocol negotiation
 */
async function customProtocolExample() {
  const plugin = new WebSocketPlugin();

  const config: WebSocketPluginConfig = {
    url: 'ws://localhost:8080',
    protocols: ['mcp', 'mcp-v2', 'custom-protocol'], // Multiple protocols
    reconnectAttempts: 3,
    reconnectDelay: 1000,
  };

  await plugin.initialize(config);
  const transport = await plugin.connect(config);

  // The WebSocket will negotiate and use one of these protocols
  // The server must support at least one of them

  console.log('Connected with protocol negotiation');

  await plugin.disconnect();
}

// Export examples for use
export {
  basicExample,
  reconnectionExample,
  toolCallExample,
  primitivesExample,
  secureExample,
  healthMonitoringExample,
  errorHandlingExample,
  customProtocolExample,
};

// Run basic example if this file is executed directly
if (require.main === module) {
  basicExample()
    .then(() => console.log('Example completed'))
    .catch((error) => console.error('Example failed:', error));
}
