import assert from 'node:assert/strict';
import test from 'node:test';
import { compareBrowseMonthKeys } from '../src/lib/browseMonthOrder.js';

test('browse month keys sort in calendar order, not by race count', () => {
  const shuffled = ['10', '09', '12', '11', '05', '01'];
  assert.deepEqual([...shuffled].sort(compareBrowseMonthKeys), ['01', '05', '09', '10', '11', '12']);
});
