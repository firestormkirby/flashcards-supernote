import {splitRecognisedText} from './lassoCard';

test('"front :: back" fills both sides', () => {
  expect(splitRecognisedText('Mitosis :: Cell division')).toEqual({
    front: 'Mitosis',
    back: 'Cell division',
  });
});

test('Q:/A: lines fill both sides', () => {
  expect(
    splitRecognisedText(
      'Q: Three branches?\nA: Legislative, executive, judicial',
    ),
  ).toEqual({
    front: 'Three branches?',
    back: 'Legislative, executive, judicial',
  });
});

test('anything else goes on the front, keeping its lines', () => {
  expect(splitRecognisedText('  What is\nphotosynthesis?\r\n')).toEqual({
    front: 'What is\nphotosynthesis?',
    back: '',
  });
  // Two cards' worth is not one card: keep it all for the user to sort out.
  expect(splitRecognisedText('a :: 1\nb :: 2')).toEqual({
    front: 'a :: 1\nb :: 2',
    back: '',
  });
});
