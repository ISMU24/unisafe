import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../src/utils/csv.js';

test('CSV export quotes fields and neutralizes spreadsheet formulas and control prefixes', () => {
  for (const value of ['=1+1', '+cmd', '-1+2', '@SUM(A1)', '  =1', '\tplain', '\r=1', '\n@cmd']) {
    assert.equal(csvCell(value), `"'${value}"`);
  }
  assert.equal(csvCell('Report "quoted", text'), '"Report ""quoted"", text"');
  assert.equal(csvCell('Security'), '"Security"');
  assert.equal(csvCell(null), '""');
});
