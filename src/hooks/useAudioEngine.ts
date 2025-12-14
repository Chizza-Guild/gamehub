'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '@/lib/audio/AudioEngine';

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    engineRef.current = new AudioEngine();

    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
      }
    };
  }, []);

  const initialize = async () => {
    if (!engineRef.current || initialized) return;

    try {
      await engineRef.current.initialize();
      setInitialized(true);
    } catch (err) {
      console.error('Failed to initialize audio:', err);
    }
  };

  const loadMusic = async (url: string) => {
    if (!engineRef.current) return;

    setLoading(true);
    try {
      await engineRef.current.loadMusic(url);
    } catch (err) {
      console.error('Failed to load music:', err);
    } finally {
      setLoading(false);
    }
  };

  const play = (syncedStartTime: number) => {
    if (!engineRef.current) return;
    engineRef.current.play(syncedStartTime);
  };

  const stop = () => {
    if (!engineRef.current) return;
    engineRef.current.stop();
  };

  const getCurrentTime = () => {
    if (!engineRef.current) return 0;
    return engineRef.current.getCurrentTime();
  };

  return {
    engine: engineRef.current,
    initialized,
    loading,
    initialize,
    loadMusic,
    play,
    stop,
    getCurrentTime,
  };
}
