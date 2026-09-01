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
        },
      },
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
      'process.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
