var util = require('util');

function stripAnsi(value) {
  var input = String(value);
  var output = '';
  var index = 0;

  while (index < input.length) {
    if (input.charCodeAt(index) === 27 && input[index + 1] === '[') {
      index += 2;

      while (index < input.length && /[0-9;]/.test(input[index])) {
        index += 1;
      }

      if (input[index] === 'm') {
        index += 1;
        continue;
      }

      output += '\u001b[';
      continue;
    }

    output += input[index];
    index += 1;
  }

  return output;
}

function visibleLength(value) {
  return stripAnsi(value).length;
}

function padRight(value, width) {
  var text = String(value);
  var padding = width - visibleLength(text);

  while (padding-- > 0) {
    text += ' ';
  }

  return text;
}

function colorize(value, color) {
  var text = value === null || value === undefined ? '' : String(value);

  if (!color || typeof text[color] !== 'function') {
    return text;
  }

  return text[color]();
}

function inspect(value, useColors) {
  return util.inspect(value, {
    colors: !!useColors,
    depth: null,
    compact: false
  });
}

function stringifyRows(rows, colors) {
  if (!rows || !rows.length) {
    return '';
  }

  var widths = [];

  rows.forEach(function (row) {
    row.forEach(function (cell, index) {
      var text = cell === null || cell === undefined ? '' : String(cell);

      widths[index] = Math.max(widths[index] || 0, visibleLength(text));
    });
  });

  return rows.map(function (row) {
    return row.map(function (cell, index) {
      var color = colors && colors[index];
      var text = colorize(cell, color);

      return padRight(text, widths[index] || 0);
    }).join('  ');
  }).join('\n');
}

module.exports = {
  inspect: inspect,
  stringifyRows: stringifyRows
};