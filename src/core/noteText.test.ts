import {parseDeck} from './deckParser';
import {Card, NEW_REVIEW} from './model';
import {cardNoteText, notePlan, textHeight} from './noteText';

const card = (
  front: string,
  back: string,
  extra: Partial<Card> = {},
): Card => ({
  id: front,
  deckId: 'd',
  front,
  back,
  review: NEW_REVIEW,
  starred: false,
  ...extra,
});

const MANTA = {width: 1920, height: 2560};

test('a card is written as Q:/A:, which Make card reads back as the same card', () => {
  const c = card('The **mens rea**?', 'Intent,\nor *recklessness*');
  const text = cardNoteText(c);
  expect(text).toBe('Q: The mens rea?\nA: Intent,\nor recklessness');
  expect(parseDeck('note.txt', text).cards).toEqual([
    ['The mens rea?', 'Intent,\nor recklessness'],
  ]);
});

test('a picture-only side says so', () => {
  const pic = {file: 'page-1.png', width: 10, height: 10};
  expect(cardNoteText(card('', 'Mitochondria', {frontImage: pic}))).toBe(
    'Q: [picture]\nA: Mitochondria',
  );
});

test('the box sits across the top of the page and is as tall as the text', () => {
  const plan = notePlan([card('Q1', 'A1')], MANTA);
  expect(plan.included).toBe(1);
  expect(plan.rect.left).toBeGreaterThan(0);
  expect(plan.rect.right).toBeLessThan(MANTA.width);
  expect(plan.rect.top).toBeLessThan(MANTA.height * 0.1);
  expect(plan.rect.bottom - plan.rect.top).toBe(
    textHeight(plan.text, plan.rect.right - plan.rect.left, plan.fontSize),
  );
});

test('many cards: smaller text first, then only as many as fit', () => {
  const few = Array.from({length: 8}, (_, i) => card(`Q${i}`, `A${i}`));
  const fewPlan = notePlan(few, MANTA);
  expect(fewPlan.included).toBe(8);

  const long = 'a fairly long answer that wraps over a line or two '.repeat(4);
  const many = Array.from({length: 80}, (_, i) => card(`Question ${i}`, long));
  const plan = notePlan(many, MANTA);
  expect(plan.included).toBeGreaterThan(0);
  expect(plan.included).toBeLessThan(80);
  expect(plan.fontSize).toBeLessThan(fewPlan.fontSize);
  expect(plan.rect.bottom).toBeLessThanOrEqual(MANTA.height);
  expect(plan.text.split('\n\n')).toHaveLength(plan.included);
});
