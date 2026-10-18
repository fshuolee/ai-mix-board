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

  async function clickText(page, text) {
    await page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text)?.click(), text);
  }

  await run('locking removes rescue hints, images and pending discard confirmation immediately', async page => {
    await page.evaluate(() => window.renderProtectedRescue());
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '立即救回'));
    await clickText(page, '立即救回');
    await page.waitForSelector('[data-rescue-asset]');
    await page.click('[data-discard-selected]');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
    await page.evaluate(() => window.setRescueLocked(true));
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0);
    assert.equal(await page.$('[data-rescue-asset]'), null);
    assert.ok(await page.evaluate(() => !document.body.textContent.includes('立即救回') && !document.body.textContent.includes('keep-choice.png')));
    await page.evaluate(() => window.setRescueLocked(false));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '立即救回'));
    assert.equal(await page.$$eval('[role="dialog"]', items => items.length), 0);
    assert.equal(await page.evaluate(() => Boolean(window.protectedDiscardCalled)), false);
  });

  await run('rescue discard confirms, trashes Drive files, clears cache and retains failures for retry', async page => {
    await page.evaluate(() => window.renderAssetRescue());
    await page.waitForSelector('[data-discard-selected]');
    await page.click('[data-discard-selected]');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
    assert.deepEqual(await page.evaluate(() => window.rescueTrashRequests), []);
    await clickText(page, '捨棄 3 個');
    await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes('Fixture permission denied'));
    const result = await page.evaluate(async () => {
      const { getImage } = await import('/services/dbService.ts');
      return { requests: window.rescueTrashRequests, goodCached: Boolean(await getImage('fixture-drive-good')), badCached: Boolean(await getImage('fixture-drive-bad')), localCached: Boolean(await getImage('local-only')),
        cards: [...document.querySelectorAll('[data-rescue-asset]')].map(el => el.getAttribute('data-rescue-asset')) };
    });
    assert.deepEqual(result, { requests: [
      { url: 'https://www.googleapis.com/drive/v3/files/fixture-drive-good', method: 'PATCH', body: { trashed: true } },
      { url: 'https://www.googleapis.com/drive/v3/files/fixture-drive-bad', method: 'PATCH', body: { trashed: true } },
    ], goodCached: false, badCached: true, localCached: false, cards: ['drive_bad'] });
    await page.evaluate(() => { window.allowFailedRescue = true; });
    await page.click('[data-discard-selected]');
    await clickText(page, '捨棄 1 個');
    await page.waitForFunction(() => document.querySelectorAll('[data-rescue-asset]').length === 0);
    assert.equal(await page.evaluate(async () => Boolean(await (await import('/services/dbService.ts')).getImage('fixture-drive-bad'))), false);
    assert.equal(await page.evaluate(() => window.rescueTrashRequests.length), 3);
  });

  await run('rescue discard cancellation keeps files and filtered discard excludes hidden selections', async page => {
    await page.evaluate(() => window.renderAssetRescue());
    await page.waitForSelector('[data-discard-selected]');
    await page.click('[data-discard-selected]');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1);
    assert.deepEqual(await page.evaluate(() => window.rescueTrashRequests), []);
    await page.type('input[placeholder="搜尋檔案名稱..."]', 'keep-choice');
    await page.click('[data-discard-selected]');
    await clickText(page, '捨棄 1 個');
    await page.waitForFunction(() => document.querySelectorAll('[data-rescue-asset]').length === 0);
    assert.equal(await page.evaluate(() => window.rescueTrashRequests.length), 1);
    const remaining = await page.evaluate(async () => {
      const { getImage } = await import('/services/dbService.ts');
      return [Boolean(await getImage('fixture-drive-bad')), Boolean(await getImage('local-only'))];
    });
    assert.deepEqual(remaining, [true, true]);
  });

  await run('rescue discard respects individual selection and prevents competing actions while pending', async page => {
    await page.setViewport({ width: 390, height: 740 });
    await page.evaluate(async () => { await window.renderAssetRescue(); window.holdRescueTrash = true; });
    await page.waitForSelector('[data-rescue-asset="drive_bad"]');
    await page.click('[data-rescue-asset="drive_bad"]');
    await page.click('[data-rescue-asset="local-only"]');
    const actionBounds = await page.$eval('[data-discard-selected]', button => button.getBoundingClientRect().toJSON());
    assert.ok(actionBounds.left >= 0 && actionBounds.right <= 390, 'discard stays usable on narrow screens');
    await page.click('[data-discard-selected]');
    await clickText(page, '捨棄 1 個');
    await page.waitForFunction(() => typeof window.releaseRescueTrash === 'function');
    assert.equal(await page.$eval('[data-discard-selected]', button => button.disabled), true);
    assert.equal(await page.$eval('button[title="重新掃描本地與雲端硬碟"]', button => button.disabled), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.$$eval('[role="dialog"]', dialogs => dialogs.length), 1);
    await page.evaluate(() => window.releaseRescueTrash());
    await page.waitForFunction(() => !document.querySelector('[data-rescue-asset="drive_good"]'));
    assert.equal(await page.$eval('[data-discard-selected]', button => button.disabled), true, 'unselected remaining items must stay unselected');
    assert.equal(await page.evaluate(() => window.rescueTrashRequests.length), 1);
    await page.screenshot({ path: '/tmp/ai-mix-board-rescue-discard-mobile.png' });
  });

  await run('rescue discard without login or with a referenced asset never deletes its cache', async page => {
    const result = await page.evaluate(async () => {
      const { discardRescuableAssets } = await import('/services/assetRescueService.ts');
      const { getImage } = await import('/services/dbService.ts');
      await window.storeImage('guarded-drive', new Blob(['guarded']));
      const asset = { id: 'drive_guarded', source: 'drive', name: 'guarded.png', driveFileId: 'guarded-drive' };
      const loggedOut = await discardRescuableAssets([asset], null);
      const referenced = await discardRescuableAssets([asset], 'fixture-token', [{ id: 'node', type: 'image', content: 'guarded-drive', x: 0, y: 0, width: 1, height: 1, rotation: 0 }]);
      return { loggedOut: loggedOut.discardedIds, loginFailure: loggedOut.failures.length, referenced: referenced.discardedIds, referencedFailure: referenced.failures.length, cached: Boolean(await getImage('guarded-drive')) };
    });
    assert.deepEqual(result, { loggedOut: [], loginFailure: 1, referenced: [], referencedFailure: 1, cached: true });
  });

  await run('canvas notices stay below tools and model selection, including narrow screens', async page => {
    for (const width of [1280, 390]) {
      await page.setViewport({ width, height: 740 });
      await page.evaluate(async () => {
        await import('/index.css');
        window.renderApp();
      });
      await page.waitForSelector('button[title="清空畫布"]');
      await page.$eval('button[title="清空畫布"]', button => button.click());
      await page.waitForSelector('[role="status"]');
      const layout = await page.evaluate(() => {
        const notice = document.querySelector('[role="status"]');
        const tools = document.querySelector('button[title="清空畫布"]').closest('.fixed');
        const model = document.querySelector('.canvas-overlay-stack > div button');
        return { notice: notice.getBoundingClientRect().toJSON(), tools: tools.getBoundingClientRect().toJSON(), model: model?.getBoundingClientRect().toJSON(), height: innerHeight, width: innerWidth };
      });
      assert.ok(layout.notice.top >= layout.tools.bottom, 'notice must clear the toolbar');
      assert.ok(layout.model && layout.notice.top >= layout.model.bottom, 'notice must clear the model selector');
      assert.ok(layout.notice.bottom < layout.height / 2, 'notice should share the top notification area, clear of bottom tabs');
      assert.ok(layout.notice.left >= 0 && layout.notice.right <= layout.width, 'notice stays within viewport');
    }
  });

  await run('simultaneous rescue and status notices wrap without overlap and keep actions clickable', async page => {
    for (const width of [1280, 390]) {
      await page.setViewport({ width, height: 740 });
      await page.evaluate(() => window.renderCanvasNotices());
      await page.waitForSelector('button[title="關閉提示"]');
      const layout = await page.evaluate(() => {
        const stack = document.querySelector('.canvas-overlay-stack');
        const rectangles = [...stack.children].map(element => element.getBoundingClientRect().toJSON());
        const rescue = [...stack.querySelectorAll('button')].find(button => button.textContent.trim() === '立即救回');
        const r = rescue.getBoundingClientRect();
        return { rectangles, overflow: stack.scrollWidth > stack.clientWidth, rescueHit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === rescue };
      });
      assert.equal(layout.overflow, false, 'long errors and rescue text must not overflow horizontally');
      for (let index = 1; index < layout.rectangles.length; index++) {
        assert.ok(layout.rectangles[index].top >= layout.rectangles[index - 1].bottom, 'notices must not overlap');
      }
      assert.equal(layout.rescueHit, true, 'rescue action must be unobstructed');
      await clickText(page, '立即救回');
      await page.click('button[title="關閉提示"]');
      await page.click('button[aria-label="關閉錯誤提示"]');
      assert.deepEqual(await page.evaluate(() => [window.rescueClicked, window.rescueDismissed, window.errorDismissed]), [true, true, true]);
      if (width === 390) await page.screenshot({ path: '/tmp/ai-mix-board-notices-mobile.png' });
    }
  });

  await run('toolbar dropdowns stay above model selection on narrow screens', async page => {
    await page.setViewport({ width: 390, height: 740 });
    await page.evaluate(async () => { await import('/index.css'); window.renderApp(); });
    await page.waitForSelector('button .lucide-ruler');
    await page.$eval('button .lucide-ruler', icon => icon.closest('button').click());
    await page.waitForFunction(() => [...document.querySelectorAll('span')].some(span => span.textContent === 'Preset'));
    const result = await page.evaluate(() => {
      const menu = [...document.querySelectorAll('span')].find(span => span.textContent === 'Preset').parentElement.parentElement;
      const model = document.querySelector('.canvas-overlay-stack > div');
      const a = menu.getBoundingClientRect(), b = model.getBoundingClientRect();
      const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom);
      return { overlaps: right > left && bottom > top, menuOnTop: menu.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)) };
    });
    assert.equal(result.overlaps, true, 'fixture should exercise intersecting dropdown and model geometry');
    assert.equal(result.menuOnTop, true, 'toolbar dropdown must receive clicks above the model selector');
  });

  await run('variant deletion asks first, supports cancel, updates the representative and keeps the final image', async page => {
    await page.evaluate(() => window.renderGeneratedImageApp());
    await page.waitForSelector('button[title="檢視節點詳細資訊 (Info)"]');
    await page.$eval('button[title="檢視節點詳細資訊 (Info)"]', button => button.click());
    await clickText(page, '重新生成');
    await page.waitForFunction(() => document.querySelectorAll('[data-variant-id]').length === 2);
    await page.waitForSelector('button[aria-label="刪除此版本"]');
    await page.click('button[aria-label="刪除此版本"]');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
    assert.equal(await page.$$eval('[data-variant-id]', items => items.length), 2);
    assert.ok(await page.$('button[data-asset-delete-choice="keep"]'));
    assert.ok(await page.$('button[data-asset-delete-choice="trash"]'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1);
    assert.equal(await page.$$eval('[data-variant-id]', items => items.length), 2);
    await page.click('button[aria-label="刪除此版本"]');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
    await clickText(page, '只移除版本');
    await page.waitForFunction(() => document.querySelectorAll('[data-variant-id]').length === 1);
    assert.equal(await page.$('button[aria-label="刪除此版本"]'), null);
    assert.equal(await page.$$eval('[data-variant-representative="true"]', items => items.length), 1);
    await clickText(page, '關閉');
    await page.$eval('button[title="檢視節點詳細資訊 (Info)"]', button => button.click());
    assert.equal(await page.$$eval('[data-variant-id]', items => items.length), 1);
  });

  await run('compact variants preview supports narrow screens, keyboard selection and deleting an inactive version', async page => {
    await page.setViewport({ width: 390, height: 740 });
    await page.evaluate(() => window.renderVariantsPreview());
    await page.waitForSelector('[data-variant-id]');
    assert.equal(await page.$eval('details', element => element.open), false);
    const count = await page.$$eval('[data-variant-id]', items => items.length);
    await page.click('button[aria-label="下一版本"]');
    await page.waitForSelector('[data-variant-id="preview-variant-1"][aria-pressed="true"]');
    await page.click('button[aria-label="刪除此版本"]');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
    await clickText(page, '只移除版本');
    await page.waitForFunction(count => document.querySelectorAll('[data-variant-id]').length === count - 1, {}, count);
    assert.equal(await page.$('[data-variant-id="preview-variant-1"]'), null);
    assert.ok(await page.$('[data-variant-id="preview-variant-0"][data-variant-representative="true"]'));
    await page.focus('[data-variant-id="preview-variant-0"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-variant-id')), 'preview-variant-2');
    const bounds = await page.$eval('button[aria-label="刪除此版本"]', button => button.getBoundingClientRect().toJSON());
    assert.ok(bounds.left >= 0 && bounds.right <= 390);
    await page.screenshot({ path: '/tmp/ai-mix-board-variants-mobile.png' });
  });

  for (const choice of ['keep', 'trash']) {
    await run(`variant ${choice} uses the original storage choices and only trashes when selected`, async page => {
      await page.evaluate(() => window.renderCloudVariants());
      await page.waitForSelector('button[aria-label="刪除此版本"]');
      await page.click('button[aria-label="刪除此版本"]');
      await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
      assert.equal(await page.$eval('[data-asset-delete-choice="trash"]', button => button.disabled), false);
      assert.deepEqual(await page.evaluate(() => window.cloudVariantRequests), []);
      await page.click(`[data-asset-delete-choice="${choice}"]`);
      await page.waitForFunction(() => document.querySelectorAll('[data-variant-id]').length === 1);
      assert.equal(await page.evaluate(() => window.cloudVariantRequests.length), choice === 'trash' ? 1 : 0);
      assert.equal(await page.evaluate(() => window.cloudVariantNode.variants.length), 1);
    });
  }

  await run('variant trash failure keeps the version and allows retrying or removing only the reference', async page => {
    await page.evaluate(async () => { await window.renderCloudVariants(); window.failCloudVariantDelete = true; });
    await page.waitForSelector('button[aria-label="刪除此版本"]');
    await page.click('button[aria-label="刪除此版本"]');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
    await page.click('[data-asset-delete-choice="trash"]');
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Fixture trash refused'));
    assert.equal(await page.$$eval('[data-variant-id]', items => items.length), 2);
    await page.click('[data-asset-delete-choice="keep"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-variant-id]').length === 1);
    assert.equal(await page.evaluate(() => window.cloudVariantRequests.length), 1);
  });

  await run('variant cloud deletion honors keep, trash, shared references and Drive failures', async page => {
    const result = await page.evaluate(async () => {
      const { getVariantOrphanFiles, trashVariantFiles } = await import('/services/variantDeletionService.ts');
      const fileId = 'drive_variant_' + 'a'.repeat(24);
      const first = { id: 'first', content: fileId, driveFileId: fileId, width: 100, height: 100, createdAt: 1 };
      const second = { id: 'second', content: 'local-second', width: 100, height: 100, createdAt: 2 };
      const node = { ...first, id: 'node', type: 'image', x: 0, y: 0, rotation: 0, variants: [first, second], activeVariantId: 'first' };
      const realFetch = window.fetch;
      let fail = false;
      const calls = [];
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/drive/v3/files/')) {
          calls.push({ url, body: JSON.parse(init.body) });
          return new Response(fail ? JSON.stringify({ error: { message: 'Permission denied' } }) : '{}', { status: fail ? 403 : 200 });
        }
        return realFetch(input, init);
      };
      try {
        const eligible = getVariantOrphanFiles([node], node.id, first.id).length;
        const fileB = 'drive_variant_' + 'b'.repeat(24);
        const switched = { ...node, content: fileB, driveFileId: fileB, activeVariantId: 'second',
          variants: [{ ...first, id: node.id }, { ...second, content: fileB, driveFileId: fileB }] };
        const activeDeletable = getVariantOrphanFiles([switched], node.id, 'second').length;
        const shared = getVariantOrphanFiles([node, { ...node, id: 'shared', variants: undefined }], node.id, first.id).length;
        const aliasRecipe = getVariantOrphanFiles([node, { id: 'old-derived', type: 'text', content: 'description', generationSourceDetails: [{ id: 'old-source', type: 'image', driveFileId: 'first' }] }], node.id, first.id).length;
        const recipe = getVariantOrphanFiles([node, { id: 'derived', type: 'text', content: 'description', generationSourceDetails: [{ id: 'source', type: 'image', driveFileId: fileId }] }], node.id, first.id).length;
        let noToken = false;
        try { await trashVariantFiles([node], node.id, first.id, null); } catch { noToken = true; }
        await trashVariantFiles([node], node.id, first.id, 'fixture-token');
        const successCalls = calls.length;
        await trashVariantFiles([node, { ...node, id: 'shared', variants: undefined }], node.id, first.id, 'fixture-token');
        const sharedCalls = calls.length;
        fail = true;
        let failed = false;
        try { await trashVariantFiles([node], node.id, first.id, 'fixture-token'); } catch (error) { failed = error.message.includes('Permission denied'); }
        return { eligible, activeDeletable, shared, recipe, aliasRecipe, noToken, successCalls, sharedCalls, failed, body: calls[0].body };
      } finally { window.fetch = realFetch; }
    });
    assert.deepEqual(result, { eligible: 1, activeDeletable: 1, shared: 0, recipe: 0, aliasRecipe: 0, noToken: true, successCalls: 1, sharedCalls: 1, failed: true, body: { trashed: true } });
  });

  await run('removing a variant preserves independent edits and cannot remove the final image', async page => {
    const result = await page.evaluate(async () => {
      const { removeImageVariant, appendImageVariant } = await import('/utils/imageVariants.ts');
      const first = { id: 'first', type: 'image', content: 'first-image', x: 5, y: 10, width: 100, height: 80, rotation: 0,
        imageEdits: { strokes: [], crop: { x: .1, y: .1, width: .8, height: .8 } } };
      const two = appendImageVariant(first, { id: 'second', content: 'second-image', width: 100, height: 80, createdAt: 2000 });
      const deleteInactive = removeImageVariant(two, 'second');
      const deleteActive = removeImageVariant(two, 'first');
      return { inactiveContent: deleteInactive.content, editsKept: Boolean(deleteInactive.imageEdits), activeContent: deleteActive.content,
        overlayCleared: !deleteActive.imageEdits, count: deleteActive.variants.length,
        finalKept: removeImageVariant(deleteActive, 'second') === deleteActive, unknownKept: removeImageVariant(two, 'missing') === two };
    });
    assert.deepEqual(result, { inactiveContent: 'first-image', editsKept: true, activeContent: 'second-image', overlayCleared: true, count: 1, finalKept: true, unknownKept: true });
  });

  await run('drawing on a selected image then generating sends the actual annotation pixels from the App', async page => {
    await page.evaluate(() => window.renderGeneratedImageApp());
    await page.waitForSelector('button[aria-label="編輯圖片"]');
    await page.click('button[aria-label="編輯圖片"]');
    await page.waitForFunction(() => document.querySelector('canvas[aria-label="圖片編輯畫布"]')?.width === 160);
    const bounds = await page.$eval('canvas[aria-label="圖片編輯畫布"]', canvas => {
      const rect = canvas.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height * .3);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .75, bounds.y + bounds.height * .3, { steps: 10 });
    await page.mouse.up();
    await clickText(page, '套用修改');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift');
    await page.waitForFunction(() => window.lastGenerationPayload);
    const result = await page.evaluate(async () => {
      const imagePart = window.lastGenerationPayload.contents[0].parts.find(part => part.inlineData);
      if (!imagePart) return { hasImage: false };
      const blob = await (await fetch(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
      return { hasImage: true, width: bitmap.width, height: bitmap.height, markedPixel: Array.from(ctx.getImageData(80, 36, 1, 1).data),
        originalPixel: Array.from(ctx.getImageData(80, 90, 1, 1).data) };
    });
    assert.deepEqual(result, { hasImage: true, width: 160, height: 120, markedPixel: [239, 68, 68, 255], originalPixel: [0, 0, 255, 255] });
  });

  await run('Info regenerates a successful image as a retained variant and switches its representative', async page => {
    await page.evaluate(() => window.renderGeneratedImageApp());
    await page.waitForSelector('button[title="檢視節點詳細資訊 (Info)"]');
    await page.$eval('button[title="檢視節點詳細資訊 (Info)"]', button => button.click());
    await page.evaluate(() => {
      const id = document.querySelector('[role="dialog"] p.font-mono')?.textContent?.replace('ID: ', '');
      // Legacy generated nodes cached the original image under their board ID.
      const label = [...document.querySelectorAll('[role="dialog"] span')].find(el => el.textContent.startsWith('ID: '));
      const nodeId = id || label?.textContent.slice(4);
      if (nodeId) window.seedLegacyNodeCache(nodeId, document.querySelector('.node-renderer img').src);
    });
    await clickText(page, '重新生成');
    await page.waitForFunction(() => window.generationRequests > 0, { timeout: 1500 });
    await page.waitForFunction(() => document.querySelectorAll('[data-variant-id]').length === 2);
    assert.equal(await page.$$eval('[data-variant-representative="true"]', items => items.length), 1);
    const first = await page.$eval('[data-variant-representative="true"]', el => el.getAttribute('data-variant-id'));
    await page.$$eval('[data-variant-id]', items => items[1].click());
    await clickText(page, '設為代表圖片');
    await page.waitForFunction(first => document.querySelector('[data-variant-representative="true"]')?.getAttribute('data-variant-id') !== first, {}, first);
    await clickText(page, '關閉');
    await page.waitForFunction(() => {
      const image = document.querySelector('.node-renderer img');
      if (!image || !image.complete || !image.naturalWidth) return false;
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 1, 1);
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      return pixel[0] === 255 && pixel[2] === 0;
    });
    await page.$eval('button[title="檢視節點詳細資訊 (Info)"]', button => button.click());
    assert.equal(await page.$$eval('[data-variant-id]', items => items.length), 2);
    await page.$$eval('[data-variant-id]', items => items[0].click());
    await clickText(page, '設為代表圖片');
    await page.waitForFunction(first => document.querySelector('[data-variant-representative="true"]')?.getAttribute('data-variant-id') === first, {}, first);
    await page.screenshot({ path: '/tmp/ai-mix-board-variants.png' });
  });

  await run('failed variant generation keeps the previous representative and shows an actionable error', async page => {
    await page.evaluate(async () => { await window.renderGeneratedImageApp(); window.failVariantGeneration = true; });
    await page.waitForSelector('button[title="檢視節點詳細資訊 (Info)"]');
    await page.$eval('button[title="檢視節點詳細資訊 (Info)"]', button => button.click());
    await clickText(page, '重新生成');
    await page.waitForFunction(() => window.generationRequests > 0, { timeout: 1500 });
    await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes('Fixture generation failed'));
    assert.equal(await page.$$eval('[data-variant-id]', items => items.length), 1);
    assert.equal(await page.$eval('button[data-regenerate-image]', button => button.disabled), false);
  });

  await run('switching variants preserves each image overlay and retains all media asset references', async page => {
    const result = await page.evaluate(async () => {
      const { appendImageVariant, selectImageVariant, getImageVariants, expandImageVariantNodes } = await import('/utils/imageVariants.ts');
      const edits = { strokes: [], crop: { x: .1, y: .1, width: .8, height: .8 } };
      const original = { id: 'original', type: 'image', content: 'source-a', x: 1, y: 2, width: 100, height: 80, rotation: 0, imageEdits: edits };
      const withNew = appendImageVariant(original, { id: 'variant-b', content: 'source-b', width: 200, height: 100, createdAt: 1000 });
      const selected = selectImageVariant(withNew, 'variant-b');
      const restored = selectImageVariant(selected, 'original');
      return { count: getImageVariants(withNew).length, originalKept: withNew.content, selected: selected.content, noInheritedOverlay: !selected.imageEdits,
        restored: restored.imageEdits, assets: expandImageVariantNodes([restored]).map(asset => asset.content), position: [restored.x, restored.y] };
    });
    assert.deepEqual(result, { count: 2, originalKept: 'source-a', selected: 'source-b', noInheritedOverlay: true, restored: { strokes: [], crop: { x: .1, y: .1, width: .8, height: .8 } }, assets: ['source-a', 'source-b'], position: [1, 2] });
  });

  await run('Drive sync uploads every retained variant and keeps newer selection and edits', async page => {
    const result = await page.evaluate(async () => {
      const { syncUnuploadedImageNodes } = await import('/services/googleDriveService.ts');
      const { appendImageVariant, selectImageVariant, mergeSyncedImageAssets } = await import('/utils/imageVariants.ts');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#00ffff'; ctx.fillRect(0, 0, 2, 2);
      await window.storeImage('variant-cache-a', await new Promise(resolve => canvas.toBlob(resolve)));
      ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, 2, 2);
      await window.storeImage('variant-cache-b', await new Promise(resolve => canvas.toBlob(resolve)));
      const initial = { id: 'root', type: 'image', content: 'variant-cache-a', width: 100, height: 100, x: 5, y: 10, rotation: 0 };
      const root = appendImageVariant(initial, { id: 'variant-b', content: 'variant-cache-b', width: 100, height: 100, createdAt: 1000 });
      const realFetch = window.fetch;
      let uploads = 0;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
          uploads++;
          const id = `drive_variant_${String(uploads).repeat(20)}`;
          return new Response(JSON.stringify({ id, name: 'variant.png', webViewLink: `https://drive.google.com/file/d/${id}/view` }), { headers: { 'Content-Type': 'application/json' } });
        }
        return realFetch(input, init);
      };
      try {
        const synced = await syncUnuploadedImageNodes('fixture-token', 'fixture-folder', 'fixture-assets-folder', [root]);
        const later = { ...selectImageVariant(root, 'variant-b'), imageEdits: { strokes: [], crop: { x: 0, y: 0, width: .5, height: .5 } } };
        const merged = mergeSyncedImageAssets([later], [root], synced.updatedNodes)[0];
        return { uploads, count: merged.variants.length, active: merged.activeVariantId, content: merged.content, crop: merged.imageEdits.crop.width,
          assets: merged.variants.map(variant => Boolean(variant.driveFileId)) };
      } finally { window.fetch = realFetch; }
    });
    assert.deepEqual(result, { uploads: 2, count: 2, active: 'variant-b', content: `drive_variant_${'2'.repeat(20)}`, crop: .5, assets: [true, true] });
  });

  await run('Drive upload failure remains visible and does not trigger repeated background retries', async page => {
    const result = await page.evaluate(async () => {
      const { syncUnuploadedImageNodes } = await import('/services/googleDriveService.ts');
      const { appendImageVariant, expandImageVariantNodes, mergeSyncedImageAssets } = await import('/utils/imageVariants.ts');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
      await window.storeImage('failed-variant-upload', await new Promise(resolve => canvas.toBlob(resolve)));
      const root = appendImageVariant({ id: 'root-failed', type: 'image', content: '', width: 100, height: 100, x: 0, y: 0, rotation: 0 },
        { id: 'failed-asset', content: 'failed-variant-upload', width: 100, height: 100, createdAt: 1000 });
      const realFetch = window.fetch;
      let requests = 0;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
          requests++;
          return new Response(JSON.stringify({ error: { message: 'Storage quota exceeded' } }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        return realFetch(input, init);
      };
      try {
        const first = await syncUnuploadedImageNodes('fixture-token', 'fixture-folder', 'fixture-assets-folder', [root]);
        const merged = mergeSyncedImageAssets([root], [root], first.updatedNodes);
        await syncUnuploadedImageNodes('fixture-token', 'fixture-folder', 'fixture-assets-folder', merged);
        return { requests, error: Boolean(merged[0].variants[0].syncError), failedAssets: expandImageVariantNodes(merged).filter(asset => asset.status === 'error').length,
          representative: merged[0].content, visible: merged[0].status };
      } finally { window.fetch = realFetch; }
    });
    assert.deepEqual(result, { requests: 1, error: true, failedAssets: 1, representative: 'failed-variant-upload', visible: 'idle' });
  });

  await run('image edits can be applied, reopened, undone and cleared without replacing the original', async page => {
    await page.evaluate(() => window.renderEditableImage());
    await page.waitForSelector('button[aria-label="編輯圖片"]');
    await page.click('button[aria-label="編輯圖片"]');
    await page.waitForSelector('canvas[aria-label="圖片編輯畫布"]');
    const bounds = await page.$eval('canvas[aria-label="圖片編輯畫布"]', canvas => {
      const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height * .5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .75, bounds.y + bounds.height * .5, { steps: 10 });
    await page.mouse.up();
    await clickText(page, '復原');
    assert.equal(await page.$eval('button[aria-label="復原"]', button => button.disabled), true);
    await clickText(page, '重做');
    await clickText(page, '套用修改');
    await page.waitForFunction(() => window.editedImageNode.imageEdits?.strokes.length === 1);
    assert.equal(await page.evaluate(() => window.editedImageNode.content), 'fixture-edit-image');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.click('button[aria-label="編輯圖片"]');
    await page.waitForSelector('canvas[aria-label="圖片編輯畫布"]');
    await clickText(page, '清除所有修改');
    await clickText(page, '套用修改');
    await page.waitForFunction(() => !window.editedImageNode.imageEdits);
    assert.equal(await page.evaluate(() => window.editedImageNode.content), 'fixture-edit-image');
  });

  await run('locking a protected board closes the image editor without applying its draft', async page => {
    await page.evaluate(() => window.renderEditableImage());
    await page.waitForSelector('button[aria-label="編輯圖片"]');
    await page.click('button[aria-label="編輯圖片"]');
    await page.waitForSelector('canvas[aria-label="圖片編輯畫布"]');
    await page.evaluate(() => window.setImageLocked(true));
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(await page.evaluate(() => window.editedImageNode.imageEdits), undefined);
  });

  await run('cropping keeps fixed proportions and cancellation preserves saved edits', async page => {
    await page.evaluate(() => window.renderEditableImage());
    await page.waitForSelector('button[aria-label="編輯圖片"]');
    await page.click('button[aria-label="編輯圖片"]');
    await page.waitForSelector('canvas[aria-label="圖片編輯畫布"]');
    await clickText(page, '裁切');
    await page.select('select[aria-label="裁切比例"]', '1:1');
    const bounds = await page.$eval('canvas[aria-label="圖片編輯畫布"]', canvas => {
      const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await page.mouse.move(bounds.x + bounds.width * .1, bounds.y + bounds.height * .1);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .8, { steps: 6 });
    await page.mouse.up();
    await page.screenshot({ path: '/tmp/ai-mix-board-image-editor.png' });
    await clickText(page, '套用修改');
    await page.waitForFunction(() => window.editedImageNode.imageEdits?.crop);
    const saved = await page.evaluate(() => window.editedImageNode.imageEdits);
    assert.ok(Math.abs(saved.crop.width * 160 - saved.crop.height * 120) < 1);
    await page.click('button[aria-label="編輯圖片"]');
    await page.waitForSelector('canvas[aria-label="圖片編輯畫布"]');
    await clickText(page, '清除所有修改');
    await clickText(page, '取消');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.deepEqual(await page.evaluate(() => window.editedImageNode.imageEdits), saved);
  });

  await run('compositing applies annotation, transparency and crop at source resolution without changing cached bytes', async page => {
    const result = await page.evaluate(async () => {
      const { getEditedImageBlob } = await import('/utils/imageEditing.ts');
      const { getImage } = await import('/services/dbService.ts');
      await window.renderEditableImage();
      const source = await getImage('fixture-edit-image');
      const original = Array.from(new Uint8Array(await source.arrayBuffer()));
      const edited = await getEditedImageBlob(source, {
        strokes: [
          { tool: 'pen', color: '#ff0000', width: .1, points: [{ x: .25, y: .5 }, { x: .75, y: .5 }] },
          { tool: 'eraser', color: '#000000', width: .1, points: [{ x: .5, y: .25 }, { x: .5, y: .75 }] },
        ],
        crop: { x: .25, y: .25, width: .5, height: .5 },
      });
      const bitmap = await createImageBitmap(edited);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
      const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      return { width: bitmap.width, height: bitmap.height, red: pixel(15, 30), erased: pixel(40, 30), blue: pixel(15, 10),
        unchanged: JSON.stringify(original) === JSON.stringify(Array.from(new Uint8Array(await (await getImage('fixture-edit-image')).arrayBuffer()))),
        resetIsOriginal: await getEditedImageBlob(source, undefined) === source };
    });
    assert.deepEqual(result, { width: 80, height: 60, red: [255, 0, 0, 255], erased: [0, 0, 0, 0], blue: [0, 0, 255, 255], unchanged: true, resetIsOriginal: true });
  });

  for (const provider of ['gemini', 'atlas', 'atlas-original']) {
    await run(provider === 'atlas-original' ? 'Atlas uploads cached Drive image bytes instead of a Drive viewer URL' : `${provider} sends the cropped transparent composite and preserves the original asset`, async page => {
      const result = await page.evaluate(async provider => {
        const { generateFromNodes } = await import('/services/geminiService.ts');
        const { generateWithAtlasCloud } = await import('/services/atlasCloudService.ts');
        const { getImage } = await import('/services/dbService.ts');
        await window.renderEditableImage();
        const source = await getImage('fixture-edit-image');
        const originalBytes = await source.arrayBuffer();
        const originalData = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(source); });
        let sentBlob;
        let payload;
        const realFetch = window.fetch;
        localStorage.setItem('ai_mix_board_api_key', 'fixture-gemini-key');
        localStorage.setItem('ai_mix_board_atlascloud_api_key', 'fixture-atlas-key');
        const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
        window.fetch = async (input, init) => {
          const url = typeof input === 'string' ? input : input.url;
          if (url.includes('generativelanguage.googleapis.com')) {
            const request = new Request(input, init);
            payload = await request.json();
            const imagePart = payload.contents[0].parts.find(part => part.inlineData);
            sentBlob = await (await realFetch(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`)).blob();
            return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: originalData.split(',')[1] } }] } }] });
          }
          if (url.endsWith('/uploadMedia')) {
            sentBlob = init.body.get('file');
            return json({ data: { download_url: 'https://fixture.invalid/edited.png' } });
          }
          if (url.endsWith('/generateImage')) {
            payload = JSON.parse(init.body);
            return json({ outputs: [originalData] });
          }
          return realFetch(input, init);
        };
        const node = { ...window.editedImageNode, driveViewLink: 'https://drive.google.com/file/d/fixture-drive-id/view', imageEdits: provider === 'atlas-original' ? undefined : {
          strokes: [
            { tool: 'pen', color: '#ff0000', width: .1, points: [{ x: .3, y: .4 }, { x: .7, y: .4 }] },
            { tool: 'eraser', color: '#000000', width: .2, points: [{ x: .5, y: .5 }] },
          ],
          crop: { x: .25, y: .25, width: .5, height: .5 },
        } };
        try {
          if (provider === 'gemini') await generateFromNodes([node], 'gemini-3.1-flash-image');
          else await generateWithAtlasCloud([node], 'fixture-image-edit', { id: 'fixture-image-edit', capabilities: { supportsImageOutput: true } });
          const bitmap = await createImageBitmap(sentBlob);
          const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
          return { width: bitmap.width, height: bitmap.height, annotationPixel: Array.from(ctx.getImageData(24, 18, 1, 1).data), alpha: ctx.getImageData(40, 30, 1, 1).data[3],
            unchanged: JSON.stringify([...new Uint8Array(originalBytes)]) === JSON.stringify([...new Uint8Array(await (await getImage('fixture-edit-image')).arrayBuffer())]),
            referenceUsed: provider === 'gemini' ? true : payload.image === 'https://fixture.invalid/edited.png' };
        } finally { window.fetch = realFetch; }
      }, provider);
      assert.deepEqual(result, { width: provider === 'atlas-original' ? 160 : 80, height: provider === 'atlas-original' ? 120 : 60, annotationPixel: provider === 'atlas-original' ? [0, 0, 255, 255] : [255, 0, 0, 255], alpha: provider === 'atlas-original' ? 255 : 0, unchanged: true, referenceUsed: true });
    });
  }

  await run('Atlas keeps unedited remote URL references usable when browser CORS prevents fetching', async page => {
    const result = await page.evaluate(async () => {
      const { generateWithAtlasCloud } = await import('/services/atlasCloudService.ts');
      const realFetch = window.fetch;
      const reference = 'https://fixture.invalid/cors-blocked.png';
      const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      let sent;
      localStorage.setItem('ai_mix_board_atlascloud_api_key', 'fixture-atlas-key');
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url === reference) throw new TypeError('Failed to fetch');
        if (url.endsWith('/generateImage')) { sent = JSON.parse(init.body); return json({ outputs: ['data:image/png;base64,AA=='] }); }
        return realFetch(input, init);
      };
      try {
        await generateWithAtlasCloud([{ id: 'remote', type: 'image', content: reference, width: 100, height: 100 }], 'fixture-image-edit', { id: 'fixture-image-edit', capabilities: { supportsImageOutput: true } });
        return sent.image;
      } finally { window.fetch = realFetch; }
    });
    assert.equal(result, 'https://fixture.invalid/cors-blocked.png');
  });

  await run('project sheet round trip preserves edits, clear removes them, and legacy rows still load', async page => {
    const result = await page.evaluate(async () => {
      const { saveGraphToSheet, loadGraphFromSheet } = await import('/services/googleSheetsService.ts');
      await window.renderEditableImage();
      const edits = { strokes: [{ tool: 'pen', color: '#ff0000', width: .1, points: [{ x: .2, y: .3 }] }], crop: { x: .1, y: .2, width: .8, height: .6 } };
      const snapshot = [{ id: 'source-a', type: 'image', imageEdits: edits, content: 'x'.repeat(55000) }];
      const node = { ...window.editedImageNode, imageEdits: edits, generationSourceDetails: snapshot, generationModelId: 'fixture-model-id', generationParams: { seed: 42 },
        activeVariantId: 'variant-a', variants: [
          { id: 'variant-a', content: 'fixture-edit-image', width: 320, height: 240, createdAt: 1000, imageEdits: edits },
          { id: 'variant-b', content: 'variant-b-image', width: 240, height: 320, createdAt: 2000, generationModelId: 'other-model', generationParams: { seed: 99 } },
        ] };
      const tables = {};
      const realFetch = window.fetch;
      const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      window.fetch = async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.hostname !== 'sheets.googleapis.com') return realFetch(input, init);
        if (url.pathname.endsWith('/values:batchUpdate')) {
          for (const entry of JSON.parse(init.body).data) {
            const [sheet, range] = entry.range.split('!');
            const endColumn = range.split(':')[1].replace(/\d/g, '');
            // Model the API's range contract: values outside the requested columns are not stored.
            const columnCount = [...endColumn].reduce((count, char) => count * 26 + char.charCodeAt(0) - 64, 0);
            if (entry.values.some(row => row.some(cell => typeof cell === 'string' && cell.length > 50000))) throw new Error('Sheets cell exceeds 50000 characters');
            tables[sheet] = entry.values.map(row => row.slice(0, columnCount));
          }
          return json({});
        }
        if (url.pathname.endsWith('/values:batchGet')) {
          return json({ valueRanges: url.searchParams.getAll('ranges').map(range => {
            const [sheet, cells] = range.split('!');
            const endColumn = cells.split(':')[1].replace(/\d/g, '');
            const columnCount = [...endColumn].reduce((count, char) => count * 26 + char.charCodeAt(0) - 64, 0);
            return { values: (tables[sheet] || []).map(row => row.slice(0, columnCount)) };
          }) });
        }
        return json({ sheets: ['Boards', 'Nodes', 'Viewport', 'AssetReferences', 'Settings'].map((title, sheetId) => ({ properties: { title, sheetId, gridProperties: { columnCount: 26 } } })) });
      };
      try {
        const boards = [{ id: 'board_main', name: 'Main' }];
        await saveGraphToSheet('fixture-token', 'fixture-sheet', [node], boards);
        const loaded = (await loadGraphFromSheet('fixture-token', 'fixture-sheet')).nodes[0];
        await saveGraphToSheet('fixture-token', 'fixture-sheet', [{ ...loaded, imageEdits: undefined, generationSourceDetails: undefined, variants: undefined, activeVariantId: undefined }], boards);
        const cleared = (await loadGraphFromSheet('fixture-token', 'fixture-sheet')).nodes[0];
        tables.Nodes = tables.Nodes.map(row => row.slice(0, 19));
        const legacy = (await loadGraphFromSheet('fixture-token', 'fixture-sheet')).nodes[0];
        return { variantsPreserved: loaded.variants?.length === 2 && loaded.activeVariantId === 'variant-a' && loaded.variants[1].generationParams.seed === 99 && !loaded.variants[1].imageEdits, recipePreserved: loaded.generationModelId === 'fixture-model-id' && loaded.generationParams.seed === 42, saved: loaded.imageEdits, snapshotPreserved: JSON.stringify(loaded.generationSourceDetails) === JSON.stringify(snapshot), cleared: !cleared.imageEdits && !cleared.generationSourceDetails, legacy: !legacy.imageEdits, content: legacy.content };
      } finally { window.fetch = realFetch; }
    });
    assert.deepEqual(result, { variantsPreserved: true, recipePreserved: true, saved: { strokes: [{ tool: 'pen', color: '#ff0000', width: .1, points: [{ x: .2, y: .3 }] }], crop: { x: .1, y: .2, width: .8, height: .6 } }, snapshotPreserved: true, cleared: true, legacy: true, content: 'fixture-edit-image' });
  });

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
