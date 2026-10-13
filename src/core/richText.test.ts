import {parseRich, plainText, richRuns, toggleMarker} from './richText';

// The Android app's fixtures (CoreLogicTest.kt, Cards 1.0.6).
test('markers are hidden, and bold, italic and both are found', () => {
  const r = parseRich('The **mens rea** is *malice*, not ***intent***.');
  expect(r.text).toBe('The mens rea is malice, not intent.');
  const found = new Set(
    r.spans.map(s => `${r.text.slice(s.start, s.end)}|${s.bold}|${s.italic}`),
  );
  expect(found).toEqual(
    new Set([
      'mens rea|true|false',
      'malice|false|true',
      'intent|true|true',
      'intent|true|false',
    ]),
  );
});

test('lone asterisks are left alone', () => {
  const s = '5 * 3 = 15\n* not a list\nfootnote*';
  expect(plainText(s)).toBe(s);
  expect(plainText('a ** b')).toBe('a ** b');
});

test('runs combine bold and italics for drawing', () => {
  expect(richRuns('a **b *c*** d')).toEqual([
    {text: 'a ', bold: false, italic: false},
    {text: 'b ', bold: true, italic: false},
    {text: 'c', bold: true, italic: true},
    {text: ' d', bold: false, italic: false},
  ]);
});

test('B and I wrap or unwrap the selection', () => {
  expect(toggleMarker('one two', {start: 4, end: 7}, '**')).toEqual({
    text: 'one **two**',
    selection: {start: 6, end: 9},
  });
  expect(toggleMarker('one **two**', {start: 6, end: 9}, '**')).toEqual({
    text: 'one two',
    selection: {start: 4, end: 7},
  });
  // Nothing selected: an empty pair with the cursor inside.
  expect(toggleMarker('ab', {start: 1, end: 1}, '*')).toEqual({
    text: 'a**b',
    selection: {start: 2, end: 2},
  });
});
