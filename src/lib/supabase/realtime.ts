import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';

export type ChannelEvent = 'presence' | 'broadcast' | 'postgres_changes';

export interface RealtimeOptions {
  sessionId: string;
  onPresenceSync?: (state: any) => void;
  onPresenceJoin?: (key: string, currentPresence: any, newPresence: any) => void;
  onPresenceLeave?: (key: string, leftPresence: any, currentPresence: any) => void;
  onBroadcast?: (payload: any) => void;
}

/**
 * Manages Supabase Realtime connections for multiplayer games
 */
export class RealtimeManager {
  private channel: RealtimeChannel | null = null;

  /**
   * Connect to a realtime channel for a game session
   */
  connect(options: RealtimeOptions): RealtimeChannel {
    // Create channel for this game session
    this.channel = supabase.channel(`game:${options.sessionId}`, {
      config: {
        presence: {
          key: '', // Will be set by track()
        },
        broadcast: {
          self: false, // Don't receive own broadcasts
        },
      },
    });

    // Setup presence tracking
    if (options.onPresenceSync) {
      this.channel.on('presence', { event: 'sync' }, () => {
        const state = this.channel!.presenceState();
        options.onPresenceSync!(state);
      });
    }

    if (options.onPresenceJoin) {
      this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        options.onPresenceJoin!(key, this.channel!.presenceState(), newPresences);
      });
    }

    if (options.onPresenceLeave) {
      this.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        options.onPresenceLeave!(key, leftPresences, this.channel!.presenceState());
      });
    }

    // Setup broadcast listener
    if (options.onBroadcast) {
      this.channel.on('broadcast', { event: 'game-event' }, ({ payload }) => {
        options.onBroadcast!(payload);
      });
    }

    // Subscribe to the channel
    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Connected to realtime channel');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Failed to connect to realtime channel');
      } else if (status === 'TIMED_OUT') {
        console.error('Realtime connection timed out');
      }
    });

    return this.channel;
  }

  /**
   * Track user presence in the channel
   */
  trackPresence(userId: string, metadata: any): void {
    if (!this.channel) throw new Error('Channel not connected');

    this.channel.track({
      user_id: userId,
      online_at: new Date().toISOString(),
      ...metadata,
    });
  }

  /**
   * Broadcast an event to all other clients
   */
  broadcast(event: string, payload: any): void {
    if (!this.channel) throw new Error('Channel not connected');

    this.channel.send({
      type: 'broadcast',
      event: 'game-event',
      payload: {
        event,
        data: payload,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Disconnect from the channel
   */
  disconnect(): void {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }
}
