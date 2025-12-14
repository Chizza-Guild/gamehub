'use client';

import type { PlayerScore } from '../types';

interface ScoreDisplayProps {
  score: PlayerScore;
  isLocalPlayer?: boolean;
}

export function ScoreDisplay({ score, isLocalPlayer }: ScoreDisplayProps) {
  return (
    <div
      className={`p-4 rounded-lg ${
        isLocalPlayer
          ? 'bg-blue-900 border-2 border-blue-400'
          : 'bg-gray-800'
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold text-white">{score.playerName}</span>
        <span className="text-2xl font-mono text-white">
          {score.score.toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm text-white">
        <div>
          <div className="text-gray-400">Accuracy</div>
          <div className="font-mono">{score.accuracy.toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-gray-400">Combo</div>
          <div className="font-mono">
            {score.combo}x (Max: {score.maxCombo})
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 mt-2 text-xs">
        <div className="text-center">
          <div className="text-cyan-400">Perfect</div>
          <div className="text-white">{score.judgements.perfect}</div>
        </div>
        <div className="text-center">
          <div className="text-green-400">Great</div>
          <div className="text-white">{score.judgements.great}</div>
        </div>
        <div className="text-center">
          <div className="text-yellow-400">Good</div>
          <div className="text-white">{score.judgements.good}</div>
        </div>
        <div className="text-center">
          <div className="text-red-400">Miss</div>
          <div className="text-white">{score.judgements.miss}</div>
        </div>
      </div>
    </div>
  );
}
