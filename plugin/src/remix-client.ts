import { PluginClient } from '@remixproject/plugin';
import { createClient } from '@remixproject/plugin-webview';

type StatusType = 'success' | 'error' | 'info' | 'warning';

class AztecPluginClient extends PluginClient {
  private fileChangeCallbacks: ((path: string) => void)[] = [];

  constructor() {
    super();
    this.methods = ['compile'];
  }

  onActivation() {
    // Listen for theme changes
    this.on('theme' as any, 'themeChanged' as any, (theme: { brightness: string }) => {
      const isDark = theme.brightness === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    });

    // Listen for file saves (.nr files)
    this.on('fileManager', 'fileSaved' as any, (path: string) => {
      if (path.endsWith('.nr')) {
        for (const cb of this.fileChangeCallbacks) {
          cb(path);
        }
      }
    });
  }

  // ── File change listener ──

  onNrFileSaved(callback: (path: string) => void): void {
    this.fileChangeCallbacks.push(callback);
  }

  offNrFileSaved(callback: (path: string) => void): void {
    this.fileChangeCallbacks = this.fileChangeCallbacks.filter((cb) => cb !== callback);
  }

  // ── Status badge ──

  emitStatus(key: string, type: StatusType, title: string): void {
    try {
      this.emit('statusChanged' as any, { key, type, title });
    } catch {
      // Ignore if not connected
    }
  }

  clearStatus(): void {
    try {
      this.emit('statusChanged' as any, { key: 'none' });
    } catch {
      // Ignore
    }
  }

  // ── File system ──

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

  // ── Terminal ──

  async logToTerminal(message: string, type: string = 'info'): Promise<void> {
    await this.call('terminal', 'log' as any, { type, value: message });
  }

  // ── Editor ──

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
