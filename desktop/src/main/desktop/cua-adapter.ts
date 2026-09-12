import type { CuaDriverLike, CuaDriverSessionLike, ToolResult } from '@trycua/cua-driver';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { shell } from 'electron';

const runFile = promisify(execFile);

export interface ComputerResult {
  data: Record<string, unknown>;
  images: { mimeType: string; dataBase64: string }[];
}
export interface ComputerWindow {
  id: string;
  pid: number;
  windowId: number;
  application: string;
  title: string;
  onScreen: boolean;
  onCurrentSpace: boolean;
  zIndex: number;
}
export interface ComputerLease {
  call(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ComputerResult>;
  close(): void;
}
export interface ComputerAdapter {
  permissions(prompt: boolean): Promise<{ accessibility: boolean; screenRecording: boolean }>;
  openSettings(permission: 'accessibility' | 'screenRecording'): Promise<void>;
  launchApplication(application: string, signal: AbortSignal): Promise<void>;
  windows(signal: AbortSignal): Promise<ComputerWindow[]>;
  lease(id: string): Promise<ComputerLease>;
  dispose(): Promise<void>;
}

function result(value: ToolResult): ComputerResult {
  if (value.isError) throw new Error('The native tool returned an error.', { cause: value.text });
  const data: unknown = JSON.parse(value.structuredJson ?? '{}');
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Cua returned an invalid response.');
  return { data: data as Record<string, unknown>, images: value.images };
}

function windowRecord(value: unknown): ComputerWindow[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.pid) || !Number.isSafeInteger(row.window_id)) return [];
  if (typeof row.app_name !== 'string' || typeof row.title !== 'string') return [];
  return [
    {
      id: `${row.pid}:${row.window_id}`,
      pid: Number(row.pid),
      windowId: Number(row.window_id),
      application: row.app_name,
      title: row.title,
      onScreen: row.is_on_screen !== false,
      onCurrentSpace: row.on_current_space !== false,
      zIndex: Number.isFinite(row.z_index) ? Number(row.z_index) : Number.MAX_SAFE_INTEGER,
    },
  ];
}

export class CuaLease implements ComputerLease {
  constructor(private session: CuaDriverSessionLike) {}
  async call(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    // Native-only AX extensions have no typed SDK method; this allowlist is not agent extensible.
    if (
      ![
        'launch_app',
        'bring_to_front',
        'get_window_state',
        'click',
        'type_text',
        'press_key',
      ].includes(name)
    )
      throw new Error('Unsupported computer action.');
    try {
      return result(await this.session.callTool(name, JSON.stringify(args), { signal }));
    } catch (error) {
      signal.throwIfAborted();
      // Some AppKit utility windows (including Calculator) become the verified
      // focused window without being classified as the frontmost "ordinary"
      // window. That is sufficient for exact pid/window-scoped input.
      if (
        name === 'bring_to_front' &&
        String((error as { cause?: unknown }).cause).includes('focused=true')
      )
        return { data: { focused: true }, images: [] };
      throw new Error(
        name === 'launch_app'
          ? 'Could not launch that application. Check that it is installed and try again.'
          : name === 'get_window_state'
            ? 'Could not inspect the desktop. Check Computer use permissions and try again.'
            : name === 'bring_to_front'
              ? 'Could not bring the target window to the front. Make sure it is open and try again.'
              : 'Computer input did not return a verified result. Inspect the desktop before repeating the action.',
        { cause: error },
      );
    }
  }
  close() {
    try {
      this.session.close();
    } catch (error) {
      throw new Error(
        'Could not confirm that the native desktop session closed. Restart Dext before using Computer use again.',
        { cause: error },
      );
    }
  }
}

/** Lazy native adapter: merely starting Dext never requests permissions or captures a screen. */
export class CuaAdapter implements ComputerAdapter {
  private driver?: Promise<CuaDriverLike>;
  private closed = false;
  private runtime() {
    if (this.closed) throw new Error('Computer use has shut down.');
    // Concurrent reviewed operations share one native runtime, including during import.
    this.driver ??= this.createRuntime().catch((error) => {
      this.driver = undefined;
      throw new Error(
        'Computer use could not start. Check Settings → Computer use and try again.',
        {
          cause: error,
        },
      );
    });
    return this.driver;
  }
  private async createRuntime() {
    const sdk = await import('@trycua/cua-driver');
    return sdk.CuaDriver.createConfigured({
      claudeCodeCompatibility: false,
      authorization: {
        allowedModes: [sdk.SessionPermissionMode.Standard],
        compatibilityMode: sdk.SessionPermissionMode.Standard,
        unrestrictedAcknowledged: false,
        maxSessionTtlSeconds: 900n,
        maxIdleTtlSeconds: 300n,
      },
    });
  }
  async permissions(prompt: boolean) {
    if (process.platform !== 'darwin')
      throw new Error(
        'This computer-use trial currently supports macOS. Windows and Linux validation is pending.',
      );
    try {
      const sdk = await import('@trycua/cua-driver');
      return await (prompt ? sdk.requestMacOsPermissions() : sdk.currentMacOsPermissionStatus());
    } catch (error) {
      throw new Error(
        'Could not check Computer use permissions. Review Accessibility and Screen Recording in System Settings.',
        { cause: error },
      );
    }
  }
  async openSettings(permission: 'accessibility' | 'screenRecording') {
    if (process.platform !== 'darwin')
      throw new Error('Computer-use permission settings are currently available on macOS.');
    if (permission === 'screenRecording') {
      const sdk = await import('@trycua/cua-driver/electron');
      await sdk.openMacOSScreenRecordingSettings();
      return;
    }
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    );
  }
  async launchApplication(application: string, signal: AbortSignal) {
    if (process.platform !== 'darwin')
      throw new Error('Application launch currently requires macOS.');
    try {
      // LaunchServices resolves display names and existing instances. execFile
      // avoids a shell, so the agent-controlled application name is never evaluated.
      await runFile('/usr/bin/open', ['-a', application], { signal });
    } catch (error) {
      signal.throwIfAborted();
      throw new Error(
        `Could not launch ${application}. Check that it is installed and try again.`,
        {
          cause: error,
        },
      );
    }
  }
  /** Internal teaching support only; the agent-facing computer provider never exposes this list. */
  async windows(signal: AbortSignal) {
    const driver = await this.runtime();
    try {
      const output = result(await driver.callTool('list_windows', '{}', { signal }));
      if (!Array.isArray(output.data.windows)) throw new Error('Window listing is unavailable.');
      return output.data.windows
        .flatMap(windowRecord)
        .filter((window) => window.pid !== process.pid);
    } catch (error) {
      signal.throwIfAborted();
      throw new Error('Could not list application windows. Check Computer use permissions.', {
        cause: error,
      });
    }
  }
  async lease(id: string) {
    const sdk = await import('@trycua/cua-driver');
    let session: CuaDriverSessionLike | undefined;
    try {
      session = sdk.createTrustedSession(await this.runtime(), {
        publicSession: id,
        mode: sdk.SessionPermissionMode.Standard,
        ttlSeconds: 900n,
        idleTtlSeconds: 300n,
      });
      // Dext owns a branded cursor shared with its in-app browser. Suppress the
      // native driver's differently styled cursor so only that visual appears.
      await session.setAgentCursorEnabled(
        { session: id, enabled: false },
        { signal: new AbortController().signal },
      );
      return new CuaLease(session);
    } catch (error) {
      session?.close();
      throw new Error(
        'Could not start the native desktop session. Check Settings → Computer use and try again.',
        { cause: error },
      );
    }
  }
  async dispose() {
    this.closed = true;
    const pending = this.driver;
    this.driver = undefined;
    const driver = await pending;
    if (!driver) return;
    await driver.shutdown();
    if ('uniffiDestroy' in driver && typeof driver.uniffiDestroy === 'function')
      driver.uniffiDestroy();
  }
}
