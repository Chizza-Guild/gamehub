export const GAME_CONFIG = {
  // Timing windows in milliseconds
  TIMING_WINDOWS: {
    PERFECT: 50, // ±50ms (easier to hit)
    GREAT: 100, // ±100ms
    GOOD: 150, // ±150ms (more forgiving)
  },

  // Scoring
  SCORE_VALUES: {
    PERFECT: 300,
    GREAT: 200,
    GOOD: 100,
    MISS: 0,
  },

  // Visual
  NOTE_SPEED: 400, // Pixels per second (reduced from 800 for slower gameplay)
  LANE_WIDTH: 120,
  NOTE_SIZE: 80,
  HIT_ZONE_Y: 600, // Y position of hit zone from top

  // Gameplay
  MAX_PLAYERS: 8,
  MIN_PLAYERS: 2,
  COUNTDOWN_DURATION: 3000, // 3 seconds
  VISUAL_OFFSET: 0, // Milliseconds to show notes earlier/later

  // Keys mapping
  KEY_BINDINGS: {
    up: ['ArrowUp', 'w', 'W'],
    down: ['ArrowDown', 's', 'S'],
    left: ['ArrowLeft', 'a', 'A'],
    right: ['ArrowRight', 'd', 'D'],
  },
} as const;

export const LANE_POSITIONS = {
  left: 0,
  down: 1,
  up: 2,
  right: 3,
} as const;
