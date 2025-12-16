import type { ITransportPlugin, TransportType, PluginConfig } from '../types/plugin.js';
import { EventEmitter } from './EventEmitter.js';
import type { AllRegistryEvents } from '../types/events.js';

export class PluginRegistry extends EventEmitter<AllRegistryEvents> {
  private plugins = new Map<TransportType, ITransportPlugin>();
  private initialized = new Map<TransportType, boolean>();

  async register(plugin: ITransportPlugin): Promise<void> {
    const type = plugin.metadata.transportType;

    if (this.plugins.has(type)) {
      console.warn(`Plugin for transport type '${type}' already registered, replacing...`);
    }

    this.plugins.set(type, plugin);
    this.initialized.set(type, false);

    console.log(`[PluginRegistry] Registered plugin: ${plugin.metadata.name} (${type})`);

    this.emit('registry:plugin-registered', {
      type,
      name: plugin.metadata.name,
    });
  }

  async getPlugin(type: TransportType): Promise<ITransportPlugin | undefined> {
    return this.plugins.get(type);
  }

  async getInitializedPlugin(type: TransportType, config: PluginConfig): Promise<ITransportPlugin> {
    const plugin = this.plugins.get(type);

    if (!plugin) {
      throw new Error(`No plugin registered for transport type: ${type}`);
    }

    if (!this.initialized.get(type)) {
      await plugin.initialize(config);
      this.initialized.set(type, true);
    }

    return plugin;
  }

  listAvailable(): TransportType[] {
    return Array.from(this.plugins.keys());
  }

  isRegistered(type: TransportType): boolean {
    return this.plugins.has(type);
  }

  async unregister(type: TransportType): Promise<void> {
    const plugin = this.plugins.get(type);

    if (plugin) {
      try {
        await plugin.disconnect();
      } catch (error) {
        console.warn(`Error disconnecting plugin ${type}:`, error);
      }

      this.plugins.delete(type);
      this.initialized.delete(type);
    }
  }

  async unregisterAll(): Promise<void> {
    const types = this.listAvailable();
    await Promise.all(types.map((type) => this.unregister(type)));
  }
}
