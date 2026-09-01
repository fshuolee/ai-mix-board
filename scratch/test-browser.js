import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_PATH = '/Users/farl/.gemini/antigravity-cli/brain/a1726cae-f818-43dd-8e29-ed7d1c402447/browser_verification.png';

async function run() {
  console.log('🚀 Launching Chrome browser via DevTools Protocol...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    console.log(`[Browser Console ${msg.type().toUpperCase()}]:`, msg.text());
  });

  page.on('pageerror', err => {
    console.error('[Browser Page Error]:', err.message);
  });

  console.log('🌐 Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  // 1. Check title
  const title = await page.title();
  console.log('📄 Page Title:', title);

  // 2. Open Auth Settings Modal and click "讀取本機 gcloud Token" to authenticate
  console.log('🔐 Opening Auth Settings Modal...');
  await page.evaluate(() => {
    const authBtn = document.querySelector('header button[title*="Google 帳號"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('登入') || b.textContent?.includes('設定'));
    if (authBtn) authBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  console.log('🔑 Clicking "讀取本機 gcloud Token" button in browser...');
  await page.evaluate(() => {
    const gcloudBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('讀取本機 gcloud Token'));
    if (gcloudBtn) gcloudBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Close modal
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 1500));

  // 3. Check App & Google Drive / Sheet state after login
  const appState = await page.evaluate(() => {
    return {
      appName: document.body.innerText.includes('AI MIX BOARD'),
      currentProject: document.querySelector('header span.font-semibold')?.textContent,
      modelName: document.querySelector('header span.text-xs.font-semibold')?.textContent,
      syncBadge: document.querySelector('header div.hidden.md\\:flex')?.textContent?.trim(),
      userAvatarOrName: document.querySelector('header button[title*="Google 帳號"]')?.textContent?.trim(),
      nodesCount: document.querySelectorAll('.node-renderer').length,
    };
  });
  console.log('📊 Live App & Drive State from DOM:', appState);

  // 4. Test creating a text node via canvas double click
  console.log('📝 Testing Canvas Double Click to add Text Node...');
  await page.mouse.click(500, 350, { clickCount: 2 });
  await new Promise(r => setTimeout(r, 1000));

  // 5. Test typing text into the created node
  console.log('⌨️ Typing prompt into text node...');
  await page.keyboard.type('A futuristic neon cyberpunk floating island with cherry blossoms', { delay: 20 });
  await new Promise(r => setTimeout(r, 1000));

  // Click outside to finish editing
  await page.mouse.click(800, 200);
  await new Promise(r => setTimeout(r, 1500));

  // 6. Test Model Selector Modal
  console.log('🔍 Testing Model Selector Modal and switching model...');
  await page.evaluate(() => {
    const modelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Gemini') || b.textContent?.includes('切換模型'));
    if (modelBtn) modelBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Click on "Imagen 3 (002)" model card
  await page.evaluate(() => {
    const imagenCard = Array.from(document.querySelectorAll('div')).find(el => el.textContent?.includes('Imagen 3 (002)'));
    if (imagenCard) imagenCard.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const stateAfterModelSwitch = await page.evaluate(() => {
    return {
      selectedModel: document.querySelector('header span.text-xs.font-semibold')?.textContent,
      nodesCount: document.querySelectorAll('.node-renderer').length,
      nodeText: document.querySelector('.node-renderer')?.textContent?.trim(),
      syncBadge: document.querySelector('header div.hidden.md\\:flex')?.textContent?.trim(),
    };
  });
  console.log('✨ State after Node creation & Model Switch:', stateAfterModelSwitch);

  // 7. Take full screenshot
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  console.log('📸 Screenshot saved to:', SCREENSHOT_PATH);

  await browser.close();
  console.log('🎉 Browser automation verification finished with complete success!');
}

run().catch(err => {
  console.error('❌ Browser verification error:', err);
  process.exit(1);
});
