import https from 'https';

export const REQUEST_TIMEOUT_MS = 15000; // 15 seconds timeout for GitHub API

/**
 * Fetch the latest GitHub release for a given owner/repo.
 * Returns raw release JSON on success.
 */
export async function fetchGitHubRelease(
  owner: string,
  repo: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    const doGet = (url: string, redirects = 0) => {
      if (redirects > 5) {
        resolve({ success: false, error: 'Too many redirects' });
        return;
      }
      const urlObj = new URL(url);
      const opts = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: { 'User-Agent': 'MioSub-Updater' },
        timeout: REQUEST_TIMEOUT_MS,
      };
      const req = https
        .get(opts, (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            doGet(res.headers.location, redirects + 1);
            return;
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                resolve({
                  success: false,
                  error: `GitHub API ${res.statusCode}: ${data.slice(0, 200)}`,
                });
                return;
              }
              resolve({ success: true, data: JSON.parse(data) });
            } catch (err: any) {
              resolve({ success: false, error: err.message });
            }
          });
        })
        .on('error', (err) => resolve({ success: false, error: err.message }))
        .on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: 'Request timeout' });
        });
    };
    doGet(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
  });
}
