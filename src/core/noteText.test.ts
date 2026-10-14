import {parseDeck} from './deckParser';
import {Card, NEW_REVIEW} from './model';
import {cardBlock, cardNoteText, notePlan, textHeight} from './noteText';

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

test('a picture card is a block: Q:, the picture, A:, scaled to fit the page', () => {
  const pic = {file: 'shot-1.png', width: 10, height: 10};
  const c = card('Name this organ', 'The heart', {frontImage: pic});
  const block = cardBlock(c, MANTA, {front: {width: 3000, height: 1000}});
  expect(block.texts.map(t => t.text)).toEqual([
    'Q: Name this organ',
    'A: The heart',
  ]);
  const [q, a] = block.texts;
  const p = block.pictures[0].rect;
  expect(block.pictures[0].side).toBe('front');
  // Under the question, above the answer, no wider than the text column.
  expect(p.top).toBeGreaterThanOrEqual(q.rect.bottom);
  expect(a.rect.top).toBeGreaterThanOrEqual(p.bottom);
  expect(p.right - p.left).toBeLessThanOrEqual(q.rect.right - q.rect.left);
  // Its shape is kept (3:1).
  expect((p.right - p.left) / (p.bottom - p.top)).toBeCloseTo(3, 1);
  expect(block.bounds).toEqual({
    left: q.rect.left,
    top: q.rect.top,
    right: q.rect.right,
    bottom: block.bounds.bottom,
  });
  expect(block.bounds.bottom).toBeGreaterThan(a.rect.bottom - 1);
});

test('a small picture is not enlarged; a text card is one box from `top`', () => {
  const pic = {file: 'page-1.png', width: 10, height: 10};
  const c = card('', 'Mitochondria', {frontImage: pic});
  const block = cardBlock(c, MANTA, {front: {width: 200, height: 100}});
  const p = block.pictures[0].rect;
  expect([p.right - p.left, p.bottom - p.top]).toEqual([200, 100]);
  expect(block.texts[0].text).toBe('Q:');

  const plain = cardBlock(card('Q1', 'A1'), MANTA, {}, 900);
  expect(plain.texts).toHaveLength(1);
  expect(plain.texts[0].text).toBe('Q: Q1\nA: A1');
  expect(plain.bounds.top).toBe(900);
});
