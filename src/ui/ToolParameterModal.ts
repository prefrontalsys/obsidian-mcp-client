import { App, Modal, Setting, Notice } from 'obsidian';
import type { NormalizedTool } from '../mcpclient/types/plugin.js';

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: JsonSchema;
}

export class ToolParameterModal extends Modal {
  private tool: NormalizedTool;
  private onSubmit: (params: Record<string, unknown>) => void;
  private params: Record<string, unknown> = {};

  constructor(
    app: App,
    tool: NormalizedTool,
    onSubmit: (params: Record<string, unknown>) => void
  ) {
    super(app);
    this.tool = tool;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mcp-tool-modal');

    contentEl.createEl('h2', { text: this.tool.name });

    if (this.tool.description) {
      contentEl.createEl('p', {
        text: this.tool.description,
        cls: 'mcp-tool-description',
      });
    }

    const schema = this.tool.inputSchema as JsonSchema;
    const properties = schema?.properties || {};
    const required = schema?.required || [];

    if (Object.keys(properties).length === 0) {
      contentEl.createEl('p', {
        text: 'This tool has no parameters.',
        cls: 'mcp-no-params',
      });
    } else {
      // Create form fields for each property
      for (const [key, propSchema] of Object.entries(properties)) {
        this.createField(contentEl, key, propSchema, required.includes(key));
      }
    }

    // Advanced: Raw JSON input
    const advancedEl = contentEl.createDiv('mcp-advanced');
    const detailsEl = advancedEl.createEl('details');
    detailsEl.createEl('summary', { text: 'Advanced: Raw JSON' });

    const textareaContainer = detailsEl.createDiv('mcp-json-container');
    const textarea = textareaContainer.createEl('textarea', {
      cls: 'mcp-json-input',
      attr: { rows: '5', placeholder: '{}' },
    });
    textarea.value = JSON.stringify(this.params, null, 2);

    textarea.addEventListener('input', () => {
      try {
        this.params = JSON.parse(textarea.value);
      } catch {
        // Invalid JSON, ignore
      }
    });

    // Buttons
    const buttonContainer = contentEl.createDiv('mcp-button-container');

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = buttonContainer.createEl('button', {
      text: 'Execute',
      cls: 'mod-cta',
    });
    submitBtn.addEventListener('click', () => {
      this.onSubmit(this.params);
      this.close();
    });
  }

  private createField(
    container: HTMLElement,
    key: string,
    schema: JsonSchema,
    isRequired: boolean
  ) {
    const setting = new Setting(container)
      .setName(key + (isRequired ? ' *' : ''))
      .setDesc(schema.description || '');

    const type = schema.type || 'string';

    if (schema.enum && Array.isArray(schema.enum)) {
      // Dropdown for enum
      setting.addDropdown((dropdown) => {
        schema.enum!.forEach((value) => {
          dropdown.addOption(String(value), String(value));
        });
        if (schema.default !== undefined) {
          dropdown.setValue(String(schema.default));
          this.params[key] = schema.default;
        }
        dropdown.onChange((value) => {
          this.params[key] = value;
        });
      });
    } else if (type === 'boolean') {
      setting.addToggle((toggle) => {
        if (typeof schema.default === 'boolean') {
          toggle.setValue(schema.default);
          this.params[key] = schema.default;
        }
        toggle.onChange((value) => {
          this.params[key] = value;
        });
      });
    } else if (type === 'number' || type === 'integer') {
      setting.addText((text) => {
        text.setPlaceholder('Enter number...');
        if (schema.default !== undefined) {
          text.setValue(String(schema.default));
          this.params[key] = schema.default;
        }
        text.onChange((value) => {
          const num = type === 'integer' ? parseInt(value, 10) : parseFloat(value);
          if (!isNaN(num)) {
            this.params[key] = num;
          }
        });
      });
    } else if (type === 'array') {
      setting.addTextArea((textarea) => {
        textarea.setPlaceholder('Enter JSON array...');
        if (Array.isArray(schema.default)) {
          textarea.setValue(JSON.stringify(schema.default));
          this.params[key] = schema.default;
        }
        textarea.onChange((value) => {
          try {
            this.params[key] = JSON.parse(value);
          } catch {
            // Invalid JSON
          }
        });
      });
    } else if (type === 'object') {
      setting.addTextArea((textarea) => {
        textarea.setPlaceholder('Enter JSON object...');
        if (typeof schema.default === 'object') {
          textarea.setValue(JSON.stringify(schema.default));
          this.params[key] = schema.default;
        }
        textarea.onChange((value) => {
          try {
            this.params[key] = JSON.parse(value);
          } catch {
            // Invalid JSON
          }
        });
      });
    } else {
      // Default: string input
      setting.addText((text) => {
        text.setPlaceholder('Enter value...');
        if (schema.default !== undefined) {
          text.setValue(String(schema.default));
          this.params[key] = schema.default;
        }
        text.onChange((value) => {
          this.params[key] = value;
        });
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
