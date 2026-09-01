import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_PATH = '/Users/farl/.gemini/antigravity-cli/brain/a1726cae-f818-43dd-8e29-ed7d1c402447/canvas_verification.png';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  // Authenticate
  await page.evaluate(() => {
    const authBtn = document.querySelector('header button[title*="Google 帳號"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('登入'));
    if (authBtn) authBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    const gcloudBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('讀取本機 gcloud Token'));
    if (gcloudBtn) gcloudBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Close modal
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 1000));

  // Add 2 Text Nodes via Top Navigation
  console.log('➕ Adding Text Node via Nav button...');
  await page.evaluate(() => {
    const addTextBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('文字'));
    if (addTextBtn) addTextBtn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Edit node text
  await page.evaluate(() => {
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.value = '賽博龐克風格的浮空城市，周圍漂浮著粉色櫻花與全息投影招牌';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.blur();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Add a second node
  await page.mouse.click(350, 450, { clickCount: 2 });
  await new Promise(r => setTimeout(r, 500));
  await page.keyboard.type('吉卜力宮崎駿手繪動畫風格，溫暖日落光影', { delay: 15 });
  await page.mouse.click(100, 100);
  await new Promise(r => setTimeout(r, 1500));

  // Capture canvas screenshot
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  console.log('📸 Canvas screenshot saved to:', SCREENSHOT_PATH);

  await browser.close();
}

run().catch(console.error);
