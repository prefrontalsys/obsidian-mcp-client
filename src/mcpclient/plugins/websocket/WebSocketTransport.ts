import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export interface WebSocketTransportConfig {
  url: string;
  protocols?: string[];
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

/**
 * WebSocket transport implementation for MCP protocol.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Message queuing when disconnected
 * - JSON-RPC 2.0 message formatting
 * - Connection state management
 */
export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketTransportConfig>;
  private messageQueue: JSONRPCMessage[] = [];
  private reconnectCount = 0;
  private reconnectTimer: number | null = null;
  private isStarted = false;
  private isClosed = false;

  // Transport interface callbacks
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(config: WebSocketTransportConfig) {
    // Set defaults for optional config
    this.config = {
      url: config.url,
      protocols: config.protocols || ['mcp'],
      reconnectAttempts: config.reconnectAttempts ?? 3,
      reconnectDelay: config.reconnectDelay ?? 1000,
    };
  }

  /**
   * Start the WebSocket connection
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    this.isClosed = false;
    await this.connect();
  }

  /**
   * Establish WebSocket connection
   */
  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket connection
        this.ws = new WebSocket(this.config.url, this.config.protocols);

        // Handle connection open
        this.ws.onopen = () => {
          this.reconnectCount = 0;
          this.flushMessageQueue();
          resolve();
        };

        // Handle incoming messages
        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const message = JSON.parse(event.data) as JSONRPCMessage;

            // Validate JSON-RPC 2.0 format
            if (!this.isValidJSONRPCMessage(message)) {
              this.handleError(new Error('Invalid JSON-RPC message received'));
              return;
            }

            // Deliver message to handler
            if (this.onmessage) {
              this.onmessage(message);
            }
          } catch (error) {
            this.handleError(new Error(`Failed to parse message: ${error instanceof Error ? error.message : String(error)}`));
          }
        };

        // Handle connection close
        this.ws.onclose = (event: CloseEvent) => {
          this.ws = null;

          // If not intentionally closed, attempt reconnection
          if (!this.isClosed && this.reconnectCount < this.config.reconnectAttempts) {
            this.scheduleReconnect();
          } else {
            // Notify that connection is closed
            if (this.onclose) {
              this.onclose();
            }
          }
        };

        // Handle WebSocket errors
        this.ws.onerror = (event: Event) => {
          const error = new Error(`WebSocket error: ${event.type}`);
          this.handleError(error);
          reject(error);
        };

      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }

    this.reconnectCount++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectCount - 1);

    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;

      try {
        await this.connect();
      } catch (error) {
        this.handleError(new Error(`Reconnection attempt ${this.reconnectCount} failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }, delay);
  }

  /**
   * Send a JSON-RPC message over the WebSocket
   */
  async send(message: JSONRPCMessage): Promise<void> {
    // Validate message format
    if (!this.isValidJSONRPCMessage(message)) {
      throw new Error('Invalid JSON-RPC message format');
    }

    // Queue message if not connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.messageQueue.push(message);
      return;
    }

    // Send message
    try {
      const data = JSON.stringify(message);
      this.ws.send(data);
    } catch (error) {
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Flush queued messages when connection is established
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message).catch(error => {
          this.handleError(new Error(`Failed to flush message: ${error instanceof Error ? error.message : String(error)}`));
        });
      }
    }
  }

  /**
   * Close the WebSocket connection
   */
  async close(): Promise<void> {
    this.isClosed = true;
    this.isStarted = false;

    // Clear reconnect timer
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clear message queue
    this.messageQueue = [];

    // Notify close
    if (this.onclose) {
      this.onclose();
    }
  }

  /**
   * Handle errors and notify error handler
   */
  private handleError(error: Error): void {
    if (this.onerror) {
      this.onerror(error);
    }
  }

  /**
   * Validate that a message conforms to JSON-RPC 2.0
   */
  private isValidJSONRPCMessage(message: any): message is JSONRPCMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }

    // Must have jsonrpc: "2.0"
    if (message.jsonrpc !== '2.0') {
      return false;
    }

    // Must be either a request, notification, or response
    const hasMethod = 'method' in message;
    const hasId = 'id' in message;
    const hasResult = 'result' in message;
    const hasError = 'error' in message;

    // Request: has method and id
    // Notification: has method, no id
    // Response: has id and either result or error
    const isRequest = hasMethod && hasId;
    const isNotification = hasMethod && !hasId;
    const isResponse = hasId && (hasResult || hasError);

    return isRequest || isNotification || isResponse;
  }

  /**
   * Get current connection state
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get the number of queued messages
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }
}
