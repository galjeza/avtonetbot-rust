import http from 'node:http';

export const DEBUG_PORT = 9222;
const POLL_INTERVAL_MS = 250;

export function isPortOpen(port: number = DEBUG_PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/json/version', timeout: 1000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function waitForDebugPort(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

/** Waits for Chrome to release the port after being told to close. */
export async function waitForPortClosed(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && (await isPortOpen())) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

export function fetchBrowserWSEndpoint(): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: DEBUG_PORT, path: '/json/version' }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const { webSocketDebuggerUrl } = JSON.parse(body);
            if (!webSocketDebuggerUrl) {
              reject(new Error('Manjka webSocketDebuggerUrl v /json/version'));
              return;
            }
            resolve(webSocketDebuggerUrl);
          } catch (e) {
            reject(e as Error);
          }
        });
      })
      .on('error', reject);
  });
}
