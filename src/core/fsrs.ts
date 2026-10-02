import {DAY_MS, MINUTE_MS, ReviewState, isNew} from './model';

/** How well the card was remembered. Values match FSRS grades. */
export enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const MAX_INTERVAL_DAYS = 36_500;
export const RELEARN_DELAY_MS = 10 * MINUTE_MS;

const clampD = (d: number) => Math.min(10, Math.max(1, d));
const initDifficulty = (g: number) => W[4] - (g - 3) * W[5];

/**
 * FSRS-4.5 spaced-repetition scheduler with the published default weights.
 * It estimates how stable each memory is and schedules the next review for
 * when you are predicted to still have a `targetRetention` chance of recalling
 * it. A line-for-line port of Cards' Fsrs.kt, so a card scheduled on either
 * app lands on the same day.
 */
export class Fsrs {
  constructor(private readonly targetRetention = 0.9) {}

  next(state: ReviewState, rating: Rating, now: number): ReviewState {
    const g = rating as number;
    let stability: number;
    let difficulty: number;
    if (isNew(state)) {
      stability = W[g - 1];
      difficulty = clampD(initDifficulty(g));
    } else {
      const elapsedDays = Math.max(0, (now - state.lastReview) / DAY_MS);
      const r = this.retrievability(elapsedDays, state.stability);
      difficulty = nextDifficulty(state.difficulty, g);
      stability =
        rating === Rating.Again
          ? forgetStability(state.difficulty, state.stability, r)
          : recallStability(state.difficulty, state.stability, r, g);
    }
    const due =
      rating === Rating.Again
        ? now + RELEARN_DELAY_MS
        : now + this.intervalDays(stability) * DAY_MS;
    return {
      due,
      stability,
      difficulty,
      reps: state.reps + 1,
      lapses: state.lapses + (rating === Rating.Again && !isNew(state) ? 1 : 0),
      lastReview: now,
    };
  }

  /** Short label for a rating button's hint, e.g. "10m", "4d", "3w". */
  previewLabel(state: ReviewState, rating: Rating, now: number): string {
    return formatInterval(this.next(state, rating, now).due - now);
  }

  retrievability(elapsedDays: number, stability: number): number {
    return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
  }

  intervalDays(stability: number): number {
    const days =
      (stability / FACTOR) * (Math.pow(this.targetRetention, 1 / DECAY) - 1);
    return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));
  }
}

function nextDifficulty(d: number, g: number): number {
  const updated = d - W[6] * (g - 3);
  return clampD(W[7] * initDifficulty(3) + (1 - W[7]) * updated);
}

function recallStability(d: number, s: number, r: number, g: number): number {
  const hardPenalty = g === 2 ? W[15] : 1;
  const easyBonus = g === 4 ? W[16] : 1;
  return (
    s *
    (1 +
      Math.exp(W[8]) *
        (11 - d) *
        Math.pow(s, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus)
  );
}

function forgetStability(d: number, s: number, r: number): number {
  const sNew =
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r));
  return Math.min(sNew, s);
}

/** "5m", "3h", "4d", "3w", "2mo", "1.1y". */
export function formatInterval(ms: number): string {
  const minutes = Math.trunc(ms / MINUTE_MS);
  const days = ms / DAY_MS;
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  if (days < 1) return `${Math.trunc(minutes / 60)}h`;
  if (days < 14) return `${Math.round(days)}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = days / 365;
  if (years < 10) return `${years.toFixed(1)}y`.replace('.0y', 'y');
  return `${Math.round(years)}y`;
}
