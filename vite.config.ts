import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      tailwindcss(),
      react(),
      {
        name: 'gcloud-token-helper',
        configureServer(server) {
          server.middlewares.use('/api/gcloud-token', async (req, res) => {
            try {
              const { stdout } = await execPromise('gcloud auth print-access-token');
              const token = stdout.trim();
              if (!token) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'NO_TOKEN', message: '找不到 gcloud token，請先執行 gcloud auth login' }));
              }

              // Validate token scopes
              const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
              if (!infoRes.ok) {
                res.statusCode = 401;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'INVALID_TOKEN', message: 'Token 無效或已過期' }));
              }

              const tokenInfo = await infoRes.json();
              const scopes = (tokenInfo.scope || '').split(' ');
              const hasDrive = scopes.some((s: string) => s.includes('drive'));
              const hasSheets = scopes.some((s: string) => s.includes('spreadsheets') || s.includes('drive'));

              if (!hasDrive) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                return res.end(
                  JSON.stringify({
                    error: 'INSUFFICIENT_SCOPES',
                    hasDrive: false,
                    message:
                      '本機 gcloud 尚未開啟 Google Drive 存取權限。請在終端機執行：\ngcloud auth login --enable-gdrive-access',
                  })
                );
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ token, expiresIn: Number(tokenInfo.expires_in) || 3600, email: tokenInfo.email }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'GCLOUD_ERROR', message: err.message || 'Failed to get gcloud token' }));
            }
          });

          // Proxy endpoint to bypass CORS when downloading generated images (e.g. Aliyun OSS, Atlas Cloud)
          server.middlewares.use('/api/proxy-image', async (req, res) => {
            try {
              if (req.method === 'OPTIONS') {
                res.statusCode = 204;
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', '*');
                return res.end();
              }

              const urlObj = new URL(req.url || '', 'http://localhost:3000');
              const targetUrl = urlObj.searchParams.get('url');
              if (!targetUrl) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Missing url parameter' }));
              }

              const rangeHeader = req.headers.range || undefined;
              const remoteRes = await fetch(targetUrl, {
                headers: rangeHeader ? { Range: rangeHeader, 'User-Agent': 'Mozilla/5.0 (compatible; AIMixBoardProxy/1.0)' } : { 'User-Agent': 'Mozilla/5.0 (compatible; AIMixBoardProxy/1.0)' },
              });
              if (!remoteRes.ok) {
                res.statusCode = remoteRes.status;
                return res.end(`Failed to fetch media: ${remoteRes.statusText}`);
              }

              const contentType = remoteRes.headers.get('content-type') || 'application/octet-stream';
              const responseHeaders = new Headers(remoteRes.headers);
              responseHeaders.set('Access-Control-Allow-Origin', '*');
              responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
              responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Content-Type, Accept-Ranges');
              responseHeaders.set('Content-Disposition', 'inline');
              responseHeaders.delete('x-oss-force-download');

              res.statusCode = remoteRes.status;
              for (const [key, value] of responseHeaders.entries()) {
                if (value) res.setHeader(key, value);
              }

              const arrayBuffer = await remoteRes.arrayBuffer();
              res.end(Buffer.from(arrayBuffer));
            } catch (proxyErr: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: proxyErr.message || 'Image proxy failed' }));
            }
          });
        },
      },
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
      'process.env.ATLAS_CLOUD_API_KEY': JSON.stringify(env.ATLAS_CLOUD_API_KEY || ''),
      'process.env.VITE_CORS_PROXY_URL': JSON.stringify(env.VITE_CORS_PROXY_URL || ''),
      'import.meta.env.VITE_CORS_PROXY_URL': JSON.stringify(env.VITE_CORS_PROXY_URL || ''),
      'process.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || '244200756201-evcta7f45agj41ei70cnal8jr7ur1q17.apps.googleusercontent.com'),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || '244200756201-evcta7f45agj41ei70cnal8jr7ur1q17.apps.googleusercontent.com'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
