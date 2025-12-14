'use client';

import { useEffect, useState } from 'react';

interface CountdownProps {
  startTime: number; // Synced start time
  duration: number; // Countdown duration in milliseconds
  onComplete?: () => void;
}

export function Countdown({ startTime, duration, onComplete }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = startTime - now;

      if (remaining <= 0) {
        clearInterval(interval);
        onComplete?.();
        setTimeLeft(0);
      } else {
        setTimeLeft(remaining);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [startTime, onComplete]);

  const secondsLeft = Math.ceil(timeLeft / 1000);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900">
      <div className="text-center">
        <div className="text-9xl font-bold text-white animate-pulse mb-4">
          {secondsLeft > 0 ? secondsLeft : 'GO!'}
        </div>
        <div className="text-2xl text-gray-400">
          {secondsLeft > 0 ? 'Get Ready...' : "Let's Dance!"}
        </div>
      </div>
    </div>
  );
}
