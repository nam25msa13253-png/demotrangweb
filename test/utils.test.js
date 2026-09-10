const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseJson } = require('../src/utils/json');
const { newId } = require('../src/utils/uuid');
const { requireInt, requireString } = require('../src/utils/validate');

test('parseJson: parse chuoi JSON hop le thanh object/array', () => {
  assert.deepEqual(parseJson('{"code":"A"}'), { code: 'A' });
  assert.deepEqual(parseJson('[1,2,3]'), [1, 2, 3]);
});

test('parseJson: giu nguyen neu da la object/array (Postgres JSONB tra ve san)', () => {
  const obj = { code: 'A' };
  assert.equal(parseJson(obj), obj);
});

test('parseJson: null/undefined tra ve nguyen ban', () => {
  assert.equal(parseJson(null), null);
  assert.equal(parseJson(undefined), undefined);
});

test('parseJson: chuoi khong phai JSON hop le -> tra ve nguyen chuoi (khong throw)', () => {
  assert.equal(parseJson('khong-phai-json'), 'khong-phai-json');
});

test('newId: sinh UUID v4 hop le, moi lan goi khac nhau', () => {
  const id1 = newId();
  const id2 = newId();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(id1, uuidPattern);
  assert.match(id2, uuidPattern);
  assert.notEqual(id1, id2);
});

test('requireInt: chap nhan so nguyen duong (ke ca truyen vao dang chuoi tu req.body)', () => {
  assert.equal(requireInt(5, 'x'), 5);
  assert.equal(requireInt('12', 'x'), 12);
});

test('requireInt: tu choi undefined/null/chuoi rong/0/am/khong phai so', () => {
  for (const bad of [undefined, null, '', 0, -1, 'abc', NaN]) {
    assert.throws(() => requireInt(bad, 'Truong X'), /Truong X/);
  }
});

test('requireString: tra ve chuoi da trim', () => {
  assert.equal(requireString('  Nguyễn Văn A  ', 'x'), 'Nguyễn Văn A');
});

test('requireString: tu choi rong/chi co khoang trang/khong phai chuoi', () => {
  for (const bad of ['', '   ', undefined, null, 123]) {
    assert.throws(() => requireString(bad, 'Ho ten'), /Ho ten/);
  }
});
