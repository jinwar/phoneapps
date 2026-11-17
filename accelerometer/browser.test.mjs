import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const base = 'http://localhost:8000/accelerometer/';
async function pageWithPermission(permission = 'granted') {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(permission => { window.DeviceMotionEvent.requestPermission = async () => permission; }, permission);
  await page.goto(base);
  return page;
}
async function motion(page, axes = {x: 1.25, y: -2.5, z: 9.81}) {
  await page.evaluate(axes => {
    const e = new Event('devicemotion');
    Object.defineProperty(e, 'accelerationIncludingGravity', {value: axes});
    window.dispatchEvent(e);
  }, axes);
}
try {
  await test('record, stop, export CSV, and confirm before replacing data', async () => {
    const page = await pageWithPermission();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.click('#start');
    await motion(page); await motion(page, {x: 0, y: 0, z: 0}); await motion(page, {x: null, y: 1, z: 2});
    await page.click('#stop');
    assert.equal(await page.textContent('#count'), '2');
    assert.equal(await page.textContent('#x'), '0.000');
    await motion(page); assert.equal(await page.textContent('#count'), '2');
    const downloadEvent = page.waitForEvent('download'); await page.click('#download');
    const download = await downloadEvent;
    const csv = await readFile(await download.path(), 'utf8');
    assert.equal(csv.trim().split('\r\n').length, 3);
    assert.match(csv, /,1.25,-2.5,9.81,true/);
    page.once('dialog', dialog => dialog.dismiss()); await page.click('#start');
    assert.equal(await page.textContent('#count'), '2');
    assert.equal(await page.locator('#stop').isDisabled(), true);
    await page.click('#share');
    assert.match(await page.textContent('#export-status'), /File sharing is unavailable/);
    await page.click('#drive'); assert.equal(await page.locator('details').getAttribute('open'), '');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: '/tmp/accelerometer-mobile.png', fullPage: true});
    assert.deepEqual(errors, []); await page.close();
  });
  await test('denied permission leaves recording stopped and explains recovery', async () => {
    const page = await pageWithPermission('denied'); await page.click('#start');
    assert.match(await page.textContent('#status'), /permission denied/);
    assert.equal(await page.locator('#stop').isDisabled(), true);
    assert.equal(await page.locator('#download').isDisabled(), true); await page.close();
  });
  await test('missing sensor and background transitions stop safely', async () => {
    const page = await pageWithPermission(); await page.clock.install(); await page.click('#start');
    await page.clock.fastForward(5100);
    assert.match(await page.textContent('#status'), /No valid three-axis data/);
    await page.click('#start'); await motion(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', {value: true}); document.dispatchEvent(new Event('visibilitychange')); });
    assert.match(await page.textContent('#status'), /page was hidden/);
    assert.equal(await page.locator('#download').isEnabled(), true); await page.close();
  });
  await test('Drive requests narrow scope, uploads CSV, and retains data after failure', async () => {
    const page = await pageWithPermission();
    await page.evaluate(() => {
      window.google = { accounts: { oauth2: { initTokenClient(options) {
        window.requestedScope = options.scope;
        return { requestAccessToken() { options.callback({access_token: 'test-token'}); } };
      } } } };
    });
    await page.click('#start'); await motion(page); await page.click('#stop');
    await page.locator('summary').click(); await page.fill('#client-id', 'test.apps.googleusercontent.com');
    let uploads = 0;
    await page.route('https://www.googleapis.com/upload/**', async route => {
      uploads++;
      const request = route.request();
      assert.equal(request.headers().authorization, 'Bearer test-token');
      assert.match(request.postData(), /timestamp_utc,elapsed_s,x_m_s2/);
      assert.match(request.postData(), /1.25,-2.5,9.81,true/);
      await route.fulfill({status: uploads === 1 ? 200 : 403, contentType: 'application/json', body: uploads === 1 ? '{"id":"test-file"}' : '{"error":"denied"}'});
    });
    await page.click('#drive'); await page.locator('#drive-link').waitFor({state:'visible'});
    assert.equal(await page.locator('#drive-link').getAttribute('href'), 'https://drive.google.com/file/d/test-file/view');
    assert.equal(await page.evaluate(() => window.requestedScope), 'https://www.googleapis.com/auth/drive.file');
    await page.click('#drive');
    await page.waitForFunction(() => document.getElementById('export-status').textContent.includes('403'));
    assert.equal(await page.locator('#download').isEnabled(), true);
    assert.equal(await page.textContent('#count'), '1'); await page.close();
  });
} finally { await browser.close(); }
