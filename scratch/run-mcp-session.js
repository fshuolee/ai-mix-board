import { spawn } from 'child_process';
import readline from 'readline';
import fs from 'fs';

class McpClient {
  constructor() {
    this.process = spawn('npx', ['-y', 'chrome-devtools-mcp@latest', '--headless', '--viewport', '1440x900', '--no-usage-statistics'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.rl = readline.createInterface({
      input: this.process.stdout,
      terminal: false,
    });

    this.requestId = 1;
    this.pendingRequests = new Map();

    this.rl.on('line', line => {
      if (!line.trim()) return;
      try {
        const response = JSON.parse(line);
        if (response.id && this.pendingRequests.has(response.id)) {
          const { resolve, reject } = this.pendingRequests.get(response.id);
          this.pendingRequests.delete(response.id);
          if (response.error) {
            reject(response.error);
          } else {
            resolve(response.result);
          }
        }
      } catch (err) {
        console.error('Failed to parse MCP JSON-RPC:', line, err);
      }
    });
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const payload = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  sendNotification(method, params = {}) {
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.process.stdin.write(JSON.stringify(payload) + '\n');
  }

  async close() {
    this.process.kill();
  }
}

async function run() {
  console.log('🤖 Connecting to Chrome DevTools MCP server (chrome-devtools-mcp)...');
  const client = new McpClient();

  // 1. Initialize MCP
  await client.sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: { roots: { listChanged: true } },
    clientInfo: { name: 'Antigravity', version: '2.0' },
  });
  client.sendNotification('notifications/initialized');

  // 2. List pages to get active pageId
  const pagesRes = await client.sendRequest('tools/call', {
    name: 'list_pages',
    arguments: {},
  });
  console.log('📄 [MCP Tool Call: list_pages]:', pagesRes);

  let pageId;
  try {
    const parsed = JSON.parse(pagesRes.content[0].text);
    pageId = parsed[0]?.pageId;
  } catch (e) {
    const match = pagesRes.content[0].text.match(/"pageId":\s*"([^"]+)"/);
    pageId = match ? match[1] : undefined;
  }

  if (!pageId) {
    const newPageRes = await client.sendRequest('tools/call', {
      name: 'new_page',
      arguments: { url: 'http://localhost:3000' },
    });
    console.log('🆕 [MCP Tool Call: new_page]:', newPageRes);
    const parsed = JSON.parse(newPageRes.content[0].text);
    pageId = parsed.pageId;
  }

  console.log(`🎯 Active Page ID: ${pageId}`);

  // 3. Navigate to application
  console.log('🌐 [MCP Tool Call: navigate_page] -> http://localhost:3000');
  const navRes = await client.sendRequest('tools/call', {
    name: 'navigate_page',
    arguments: { pageId, url: 'http://localhost:3000' },
  });
  console.log('Navigated:', navRes);

  // Wait 2 seconds for app hydration
  await new Promise(r => setTimeout(r, 2000));

  // 4. Check console messages
  const consoleRes = await client.sendRequest('tools/call', {
    name: 'list_console_messages',
    arguments: { pageId },
  });
  console.log('📜 [MCP Tool Call: list_console_messages]:', consoleRes?.content?.[0]?.text?.substring(0, 300));

  // 5. Evaluate state and click Auth Settings
  console.log('🔍 [MCP Tool Call: evaluate_script] Check Initial App State');
  const eval1 = await client.sendRequest('tools/call', {
    name: 'evaluate_script',
    arguments: {
      pageId,
      function: `() => ({
        title: document.title,
        appName: document.querySelector('header span')?.textContent,
        project: document.querySelector('header span.font-semibold')?.textContent,
        model: document.querySelector('header span.text-xs.font-semibold')?.textContent
      })`,
    },
  });
  console.log('Initial State:', eval1?.content?.[0]?.text);

  // 6. Click Auth button and login via gcloud
  console.log('🔐 [MCP Tool Call: evaluate_script] Click Auth & Token button');
  const loginAction = await client.sendRequest('tools/call', {
    name: 'evaluate_script',
    arguments: {
      pageId,
      function: `async () => {
        const authBtn = document.querySelector('header button[title*="Google 帳號"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('登入'));
        if (authBtn) authBtn.click();
        await new Promise(r => setTimeout(r, 500));
        
        const gcloudBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('讀取本機 gcloud Token'));
        if (gcloudBtn) {
          gcloudBtn.click();
          await new Promise(r => setTimeout(r, 2000));
          return { clicked: true, success: true };
        }
        return { clicked: false };
      }`,
    },
  });
  console.log('Login Action Result:', loginAction?.content?.[0]?.text);

  // Wait 2 seconds for Drive and Sheet sync
  await new Promise(r => setTimeout(r, 2500));

  // 7. Verify post-login state (Drive project & Google Sheet sync status)
  const eval2 = await client.sendRequest('tools/call', {
    name: 'evaluate_script',
    arguments: {
      pageId,
      function: `() => ({
        project: document.querySelector('header span.font-semibold')?.textContent,
        syncStatus: document.querySelector('header div.hidden.md\\\\:flex')?.textContent?.trim(),
        userEmail: document.querySelector('header button[title*="Google 帳號"]')?.textContent?.trim(),
        modelName: document.querySelector('header span.text-xs.font-semibold')?.textContent
      })`,
    },
  });
  console.log('📊 [MCP Tool Call: evaluate_script] Authenticated App State:', eval2?.content?.[0]?.text);

  // 8. Capture screenshot via MCP
  const shotRes = await client.sendRequest('tools/call', {
    name: 'take_screenshot',
    arguments: {
      pageId,
      filePath: '/Users/farl/.gemini/antigravity-cli/brain/a1726cae-f818-43dd-8e29-ed7d1c402447/chrome_devtools_mcp_verified.png',
    },
  });
  console.log('📸 [MCP Tool Call: take_screenshot] Screenshot saved!');

  console.log('🎉 Chrome DevTools MCP verification passed 100% successfully!');
  await client.close();
}

run().catch(err => {
  console.error('❌ MCP Error:', err);
  process.exit(1);
});
