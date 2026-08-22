const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseJson } = require('../src/utils/json');
const { newId } = require('../src/utils/uuid');

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
