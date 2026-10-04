import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import tailwindcss from '@tailwindcss/vite';

const browserCandidates = [
  process.env.BROWSER_EXECUTABLE,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = (await Promise.all(browserCandidates.map(async candidate => {
  try { await access(candidate); return candidate; } catch { return null; }
}))).find(Boolean);
assert.ok(executablePath, 'Set BROWSER_EXECUTABLE to a Chrome/Chromium executable');

const server = await createServer({ configFile: false, plugins: [tailwindcss()], server: { host: '127.0.0.1', port: 0 }, esbuild: { jsx: 'automatic' }, optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react', '@google/genai'] } });
await server.listen();
let browser;
let failed = 0;
try {
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  async function run(name, test) {
    const page = await browser.newPage();
    const diagnostics = [];
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => console.error(`Browser: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'warn' || message.type() === 'error') diagnostics.push(message.text());
    });
    // Tests are fully local; prevent auth/model discovery from contacting external services.
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(origin) || request.url().startsWith('data:') || request.url().startsWith('blob:') ? request.continue() : request.abort());
    try {
      await page.goto(`${origin}/tests/fixtures/interactions.html`);
      await page.waitForFunction(() => typeof window.renderApp === 'function');
      await test(page);
      console.log(`PASS ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${name}: ${error.message}`);
      if (diagnostics.length) console.error(diagnostics.join('\n'));
    } finally { await page.close(); }
  }

  await run('video stays paused when mounted', async page => {
    await page.evaluate(() => window.renderVideo());
    await page.waitForSelector('video');
    await page.waitForFunction(() => document.querySelector('video')?.readyState > 0);
    assert.equal(await page.$eval('video', video => video.autoplay), false);
    assert.equal(await page.$eval('video', video => video.paused), true);
  });

  await run('reopened password dialog focuses the current password field', async page => {
    await page.evaluate(() => window.renderPassword(true, ''));
    await page.waitForFunction(() => document.activeElement?.getAttribute('autocomplete') === 'new-password');
    await page.evaluate(() => window.renderPassword(false, ''));
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.evaluate(() => window.renderPassword(true, 'secret'));
    await page.waitForSelector('input[autocomplete="current-password"]');
    await page.waitForFunction(() => document.activeElement?.getAttribute('autocomplete') === 'current-password', { timeout: 1500 });
  });

  await run('image copy starts writing during the initiating gesture and produces PNG', async page => {
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
      await window.storeImage('fixture-image', blob);
      let initiating = true;
      let output;
      // Enforce WebKit's gesture rule at the platform boundary; retain real PNG conversion.
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        write: async items => {
          if (!initiating) throw new DOMException('Gesture expired', 'NotAllowedError');
          output = await items[0].getType('image/png');
        },
        writeText: async () => {},
      } });
      const copying = window.clipboard.copyNodesToClipboard([{ id: 'fixture-image', type: 'image', content: 'stale-cache-key', driveFileId: 'uncached-drive-id', x: 0, y: 0, width: 2, height: 2, rotation: 0 }]);
      initiating = false;
      const copied = await copying;
      return { success: copied.success, mime: output?.type, bytes: output ? Array.from(new Uint8Array(await output.arrayBuffer()).slice(0, 8)) : [] };
    });
    assert.deepEqual(result, { success: true, mime: 'image/png', bytes: [137, 80, 78, 71, 13, 10, 26, 10] });
  });

  await run('denied image copy reports failure and preserves internal canvas paste', async page => {
    const result = await page.evaluate(async () => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        write: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
        writeText: async () => {},
      } });
      const copied = await window.clipboard.copyNodesToClipboard([{ id: 'missing', type: 'image', content: 'missing', x: 0, y: 0, width: 2, height: 2, rotation: 0 }]);
      return { success: copied.success, internalCount: window.clipboard.getInternalClipboardPayload()?.nodes.length };
    });
    assert.deepEqual(result, { success: false, internalCount: 1 });
  });

  await run('node copy button writes an image readable from the browser clipboard', async page => {
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      await window.storeImage('fixture-image', await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg')));
      window.renderImage();
    });
    await page.waitForSelector('button[aria-label="複製圖片到剪貼簿"]');
    await page.click('button[aria-label="複製圖片到剪貼簿"]');
    await page.waitForFunction(() => window.lastCopyResult);
    assert.equal(await page.evaluate(() => window.lastCopyResult.success), true);
    const result = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const item = items.find(item => item.types.includes('image/png'));
      const blob = await item.getType('image/png');
      const image = await createImageBitmap(blob);
      const marker = await (await item.getType('text/plain')).text();
      return { width: image.width, height: image.height, marker: window.clipboard.isInternalNodeClipboardText(marker) };
    });
    assert.deepEqual(result, { width: 2, height: 2, marker: true });
  });

  await run('protected canvas locks on window blur and remains locked on focus', async page => {
    await page.evaluate(() => window.renderApp());
    await page.waitForSelector('[data-board-menu-trigger]');
    await page.$eval('[data-board-menu-trigger]', button => button.click());
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('設為機敏保護')));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('設為機敏保護')).click());
    await page.waitForSelector('input[type="password"]');
    await page.evaluate(() => {
      for (const input of document.querySelectorAll('input[type="password"]')) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'secret');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.evaluate(() => document.querySelector('form').requestSubmit());
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('機敏已解鎖')));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('機敏已鎖定')), { timeout: 1500 });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('機敏已鎖定'))));

    // Visibility and page lifecycle events must also revoke an unlocked session.
    for (const reason of ['hidden', 'pagehide']) {
      await page.$eval('button[title^="Alt + L"]', button => button.click());
      await page.waitForSelector('input[autocomplete="current-password"]');
      await page.type('input[autocomplete="current-password"]', 'secret');
      await page.evaluate(() => document.querySelector('form').requestSubmit());
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('機敏已解鎖')));
      await page.evaluate(reason => {
        if (reason === 'hidden') {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        } else window.dispatchEvent(new Event('pagehide'));
      }, reason);
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('機敏已鎖定')));
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
  });

  await run('node details applies generation parameters to Inspector and closes', async page => {
    await page.evaluate(() => window.renderNodeInfo());
    await page.waitForSelector('[role="dialog"]');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('套用至 Inspector')).click());
    const result = await page.evaluate(() => ({ params: window.appliedNodeParams, closed: window.nodeInfoClosed }));
    assert.deepEqual(result, { params: { seed: 42, aspect_ratio: '16:9' }, closed: true });
  });

  const tabScroller = '[data-board-tab-id]';
  async function renderTabs(page) {
    await page.setViewport({ width: 900, height: 700 });
    await page.evaluate(() => window.renderBoardTabs());
    await page.waitForSelector(tabScroller);
    await page.waitForFunction(() => {
      const scroller = document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto');
      return scroller && scroller.scrollWidth > scroller.clientWidth;
    });
  }

  await run('tab wheel scrolling follows every delta immediately and consumes the event', async page => {
    await renderTabs(page);
    const result = await page.evaluate(() => {
      const el = document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto');
      const start = el.scrollLeft;
      const event = new WheelEvent('wheel', { deltaX: 80, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      const first = el.scrollLeft - start;
      for (let index = 0; index < 5; index++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, bubbles: true, cancelable: true }));
      return { first, total: el.scrollLeft - start, consumed: event.defaultPrevented };
    });
    assert.deepEqual(result, { first: 80, total: 180, consumed: true });
  });

  await run('tab scroller width stays stable when the left arrow becomes available', async page => {
    await renderTabs(page);
    const before = await page.evaluate(() => document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto').clientWidth);
    await page.evaluate(() => {
      const el = document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto');
      el.scrollTo({ left: 100, behavior: 'instant' });
    });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.title === '向左滾動畫布分頁' && !button.disabled));
    const after = await page.evaluate(() => document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto').clientWidth);
    assert.equal(after, before);
  });

  await run('native horizontal wheel input moves tabs once without drifting back', async page => {
    await renderTabs(page);
    const position = await page.evaluate(() => {
      const rect = document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(position.x, position.y);
    for (let index = 0; index < 3; index++) await page.mouse.wheel({ deltaX: 80 });
    await page.waitForFunction(() => document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto').scrollLeft >= 240);
    const actual = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto').scrollLeft;
    });
    assert.equal(actual, 240);
  });

  await run('rapid tab arrow clicks accumulate and resizing keeps controls usable', async page => {
    await renderTabs(page);
    await page.waitForFunction(() => !document.querySelector('button[title="向右滾動畫布分頁"]').disabled);
    const expected = await page.evaluate(() => {
      const el = document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto');
      const right = document.querySelector('button[title="向右滾動畫布分頁"]');
      right.click(); right.click(); right.click();
      return el.clientWidth * 0.8 * 3;
    });
    await page.waitForFunction(expected => Math.abs(document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto').scrollLeft - expected) <= 2, {}, expected);
    await page.setViewport({ width: 390, height: 700 });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto');
      return el.clientWidth > 0 && document.querySelector('button[title="向右滾動畫布分頁"]').getBoundingClientRect().right <= window.innerWidth;
    });
    await page.$eval('button[title="向左滾動畫布分頁"]', button => button.click());
    await page.waitForFunction(expected => document.querySelector('[data-board-tab-id]').parentElement.closest('.overflow-x-auto').scrollLeft < expected - 2, {}, expected);
  });
} finally {
  await browser?.close();
  await server.close();
}
if (failed) process.exitCode = 1;
