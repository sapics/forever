const { expect } = require('chai');

const formatting = require('../../../lib/util/cli-format');

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/g, '');
}

describe('cli-format', () => {
  it('returns an empty string when no rows are supplied', () => {
    expect(formatting.stringifyRows([], ['white'])).to.equal('');
  });

  it('aligns colored rows using visible width', () => {
    const output = formatting.stringifyRows([
      ['id', 'name'],
      ['[0]', 'alpha'],
      ['[1]', 'beta']
    ], ['white', 'green']).split('\n');

    const plainRows = output.map(stripAnsi);
    const headerNameIndex = plainRows[0].indexOf('name');

    expect(plainRows[1].indexOf('alpha')).to.equal(headerNameIndex);
    expect(plainRows[2].indexOf('beta')).to.equal(headerNameIndex);
  });

  it('toggles util.inspect colors explicitly', () => {
    const value = { answer: 42, nested: { ok: true } };
    const plain = formatting.inspect(value, false);
    const colored = formatting.inspect(value, true);

    expect(plain).to.contain('answer');
    expect(plain).to.not.contain('\u001b[');
    expect(colored).to.contain('answer');
    expect(colored).to.contain('\u001b[');
  });
});