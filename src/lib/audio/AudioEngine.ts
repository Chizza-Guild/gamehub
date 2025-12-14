/**
 * Web Audio API wrapper for rhythm game
 * Handles music playback with precise timing
 */
export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private isPaused: boolean = false;

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async initialize(): Promise<void> {
    if (this.audioContext) return;

    this.audioContext = new AudioContext({
      latencyHint: 'interactive', // Request low latency
    });

    // Resume context if suspended (required by browser policies)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    console.log(
      `Audio initialized. Base latency: ${this.audioContext.baseLatency * 1000}ms`
    );
    console.log(
      `Output latency: ${this.audioContext.outputLatency * 1000}ms`
    );
  }

  /**
   * Load music file from URL
   */
  async loadMusic(url: string): Promise<void> {
    if (!this.audioContext) throw new Error('Audio context not initialized');

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.musicBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    console.log(`Music loaded. Duration: ${this.musicBuffer.duration}s`);
  }

  /**
   * Start music playback at a specific synchronized time
   * @param syncedStartTime - The synchronized time when music should start
   */
  play(syncedStartTime: number): void {
    if (!this.audioContext || !this.musicBuffer) {
      throw new Error('Audio not initialized or music not loaded');
    }

    // Stop any existing playback
    this.stop();

    // Create new source node
    this.musicSource = this.audioContext.createBufferSource();
    this.musicSource.buffer = this.musicBuffer;
    this.musicSource.connect(this.audioContext.destination);

    // Calculate when to start relative to AudioContext time
    const now = Date.now();
    const delay = Math.max(0, syncedStartTime - now) / 1000;
    const contextStartTime = this.audioContext.currentTime + delay;

    // Start playback
    this.musicSource.start(contextStartTime);
    this.startTime = syncedStartTime;
    this.isPaused = false;

    console.log(`Music scheduled to start in ${delay * 1000}ms`);
  }

  /**
   * Stop music playback
   */
  stop(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.musicSource.disconnect();
      this.musicSource = null;
    }
    this.isPaused = false;
  }

  /**
   * Get current playback time in milliseconds
   */
  getCurrentTime(): number {
    if (!this.startTime || this.isPaused) return this.pauseTime;
    return Date.now() - this.startTime;
  }

  /**
   * Get output latency in milliseconds (for calibration)
   */
  getLatency(): number {
    if (!this.audioContext) return 0;
    return (
      (this.audioContext.baseLatency + this.audioContext.outputLatency) * 1000
    );
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
