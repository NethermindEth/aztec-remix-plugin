import { PluginClient } from '@remixproject/plugin';
import { createClient } from '@remixproject/plugin-webview';

class AztecPluginClient extends PluginClient {
  constructor() {
    super();
    this.methods = ['compile'];
  }

  async getCurrentFile(): Promise<string> {
    return await this.call('fileManager', 'getCurrentFile');
  }

  async readFile(path: string): Promise<string> {
    return await this.call('fileManager', 'readFile', path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.call('fileManager', 'writeFile', path, content);
  }

  async readDir(path: string): Promise<Record<string, { isDirectory: boolean }>> {
    return await this.call('fileManager' as any, 'readdir', path);
  }

  async logToTerminal(message: string, type: string = 'info'): Promise<void> {
    await this.call('terminal', 'log' as any, { type, value: message });
  }

  async addAnnotation(annotation: {
    row: number;
    column: number;
    text: string;
    type: 'error' | 'warning' | 'info';
  }): Promise<void> {
    await this.call('editor', 'addAnnotation' as any, annotation);
  }

  async clearAnnotations(): Promise<void> {
    await this.call('editor', 'clearAnnotations' as any);
  }
}

const client = new AztecPluginClient();
createClient(client);

export default client;
