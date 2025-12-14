import { GAME_CONFIG } from './constants';
import type { JudgementType } from '../types';

/**
 * Calculate judgement based on timing error
 */
export function calculateJudgement(timingError: number): JudgementType {
  const absError = Math.abs(timingError);

  if (absError <= GAME_CONFIG.TIMING_WINDOWS.PERFECT) {
    return 'perfect';
  } else if (absError <= GAME_CONFIG.TIMING_WINDOWS.GREAT) {
    return 'great';
  } else if (absError <= GAME_CONFIG.TIMING_WINDOWS.GOOD) {
    return 'good';
  } else {
    return 'miss';
  }
}

/**
 * Calculate score for a single hit
 */
export function calculateHitScore(
  judgement: JudgementType,
  combo: number
): number {
  const baseScore =
    GAME_CONFIG.SCORE_VALUES[
      judgement.toUpperCase() as keyof typeof GAME_CONFIG.SCORE_VALUES
    ];

  // Combo multiplier (capped at 4x)
  const multiplier = Math.min(1 + combo * 0.01, 4);

  return Math.floor(baseScore * multiplier);
}

/**
 * Calculate overall accuracy percentage
 */
export function calculateAccuracy(
  perfect: number,
  great: number,
  good: number,
  miss: number
): number {
  const total = perfect + great + good + miss;
  if (total === 0) return 0;

  const weightedScore =
    perfect * 1.0 + great * 0.8 + good * 0.5 + miss * 0;
  return (weightedScore / total) * 100;
}
