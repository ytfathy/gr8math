// Checks the grading engine and the question bank inside index.html. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = start => { const i = html.indexOf(start); return html.slice(i + '<script>'.length, html.indexOf('</script>', i)); };
const win = {};
vm.runInNewContext(script('<script>// Question bank'), { window: win });
const mod = { exports: {} };
vm.runInNewContext(script('<script>// Deterministic grading engine'), { module: mod, window: {} });
const G = mod.exports, Q = win.QUESTIONS, byId = id => Q.find(q => q.id === id);
const plain = v => JSON.parse(JSON.stringify(v)); // objects from the vm context have foreign prototypes

test('the whole question bank is valid (keys parse, systems solve on both lines)', () => {
  assert.deepEqual(plain(G.validateBank(win.UNITS, Q)), []);
  assert.equal(Q.filter(q => q.unit === 'u7').length, 18);
  assert.equal(Q.filter(q => q.unit === 'u9').length, 21);
  assert.equal(Q.filter(q => q.unit === 'u8').length, 10);
  assert.deepEqual(plain(win.UNITS.filter(u => u.quarter === 2).map(u => u.id)), ['u9', 'u7', 'u8']);
});

test('graph a line: any two correct points get full credit', () => {
  const q = byId('q2g-14'); // y = 5x - 10
  assert.equal(G.grade(q, [[0, -10], [2, 0]]).status, 'right');
  assert.equal(G.grade(q, [[3, 5], [1, -5]]).status, 'right');
  assert.equal(G.grade(q, [[0, -10]]).status, 'empty');
  assert.equal(G.grade(q, [[1, 1], [1, 1]]).status, 'empty');
});

test('graph a line: wrong answers say whether slope or intercept is right', () => {
  const q = byId('q2g-11'); // y = -6x + 6
  assert.deepEqual(plain(G.grade(q, [[0, 0], [1, -6]])), { status: 'wrong', msg: 'slopeOk' });
  assert.deepEqual(plain(G.grade(q, [[0, 6], [1, 5]])), { status: 'wrong', msg: 'interceptOk' });
  assert.deepEqual(plain(G.grade(q, [[0, 0], [1, 1]])), { status: 'wrong' });
  assert.equal(G.grade(q, [[2, 0], [2, 5]]).status, 'wrong'); // vertical line
});

test('fractional slopes and a horizontal line are graded exactly', () => {
  assert.equal(G.grade(byId('q2g-20'), [[0, -1], [8, -8]]).status, 'right'); // y = -7/8x - 1
  assert.equal(G.grade(byId('q2g-20'), [[0, -1], [8, -7]]).status, 'wrong');
  const s8 = byId('q2s-08'); // y = -x + 8 and y = 6
  assert.equal(G.grade(s8, { a: [[0, 8], [8, 0]], b: [[-4, 6], [5, 6]], x: '2', y: '6' }).status, 'right');
});

test('system: both lines (either order) and the solution must be right', () => {
  const q = byId('q2s-12'); // y = -x + 5, y = 4x -> (1, 4)
  const a = [[0, 5], [5, 0]], b = [[0, 0], [2, 8]];
  assert.equal(G.grade(q, { a, b, x: '1', y: '4' }).status, 'right');
  assert.equal(G.grade(q, { a: b, b: a, x: '1', y: '4' }).status, 'right');
  assert.deepEqual(plain(G.grade(q, { a, b, x: '4', y: '1' })), { status: 'wrong', parts: [true, true, false] });
  assert.deepEqual(plain(G.grade(q, { a, b: [[0, 0], [1, 1]], x: '1', y: '4' })), { status: 'wrong', parts: [true, false, true] });
  assert.equal(G.grade(q, { a, b, x: '1', y: '' }).status, 'empty');
  assert.equal(G.grade(q, { a: [[0, 5]], b, x: '1', y: '4' }).status, 'empty');
  assert.equal(G.grade(q, { a, b, x: 'abc', y: '4' }).status, 'invalid');
});

test('every system key really is the intersection of its two lines', () => {
  for (const q of Q.filter(q => q.type === 'sys')) {
    const [x, y] = q.answer.sol.map(Number);
    for (const l of q.answer.lines) {
      const [mn, md = 1] = l.m.split('/').map(Number);
      assert.ok(Math.abs(y - (mn / md * x + Number(l.b))) < 1e-9, q.id);
    }
  }
});

test('Q2 solve-for keys match the worksheet answers', () => {
  const keys = ['-11', '-3', '1', '7', '14', '3', '15', '16', '-4', '20', '9', '5', '8', '1', '-5', '3', '-6', '12', '4', '4', '4'];
  keys.forEach((k, i) => assert.equal(G.grade(byId(`q2e-${String(i + 1).padStart(2, '0')}`), k).status, 'right', `#${i + 1}`));
  assert.equal(G.grade(byId('q2e-08'), '17').status, 'wrong');
});
