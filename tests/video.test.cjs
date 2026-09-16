const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'video/index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'video/app.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('home page links to the frame viewer', () => assert.match(home, /href="video\/"/));
test('picker accepts MP4 and provides touch controls', () => {
  assert.match(html, /accept="video\/mp4,.mp4"/);
  for (const id of ['previous', 'next', 'backTen', 'forwardTen', 'timeline', 'fps']) assert.match(html, new RegExp(`id="${id}"`));
});
test('paused video has no center play overlay', () => {
  assert.doesNotMatch(html, /id="centerPlay"/);
  assert.doesNotMatch(js, /centerPlay/);
});
test('viewer assets are cache-versioned so HTML and JavaScript stay compatible', () => {
  assert.match(html, /src="app\.js\?v=\d+"/);
  assert.match(html, /href="styles\.css\?v=\d+"/);
});
test('video remains local and stepping uses the selected frame rate', () => {
  assert.match(js, /URL\.createObjectURL/);
  assert.match(js, /1 \/ fps\(\)/);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|FormData/);
});
