# Dodo Re Mi - Multiplayer Rhythm Game Setup Guide

This guide will help you set up the Dodo Re Mi multiplayer rhythm game.

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works fine)
- Music files (optional for testing)

## Step 1: Supabase Setup

### 1.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in project details:
   - **Name**: Choose any name (e.g., "rhythm-game")
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to you
5. Wait for project to finish setting up (~2 minutes)

### 1.2 Execute Database Schema

1. In your Supabase project dashboard, click "SQL Editor" in the left sidebar
2. Click "New Query"
3. Copy the entire contents of `supabase-schema.sql` from the project root
4. Paste into the SQL editor
5. Click "Run" or press `Ctrl+Enter`
6. You should see "Success. No rows returned" - this is expected

### 1.3 Get Your Supabase Credentials

1. In your Supabase project, click "Settings" (gear icon) in the left sidebar
2. Click "API" under "Project Settings"
3. Copy two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

### 1.4 Configure Environment Variables

1. Open `.env.local` in the project root
2. Replace the placeholder values:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```
3. Save the file

## Step 2: Install Dependencies

If you haven't already installed dependencies:

```bash
npm install
```

## Step 3: Add Music Files (Optional)

The game can run without music files for testing, but for the full experience:

1. Add MP3 or OGG music files to `public/music/`
2. See `public/music/README.md` for recommendations
3. Update chart configurations in `src/app/games/dance/lib/notePatterns.ts` if using custom tracks

## Step 4: Run the Development Server

```bash
npm run dev
```

The app will start at http://localhost:3000

## Step 5: Test the Game

### Single Player Test (Without Multiplayer)

1. Navigate to http://localhost:3000/games/dance
2. You'll be redirected to a new session
3. Click "Ready" then "Start Game" (host controls)
4. The game will start after a 3-second countdown
5. Use arrow keys or WASD to hit notes as they reach the target zone

### Multiplayer Test

1. Open the game in your primary browser window
2. Click "Ready" but DON'T start yet
3. Copy the URL (it will look like `/games/dance?session=xxxxx`)
4. Open a new browser window in **Incognito/Private mode** (to simulate different player)
5. Paste the URL to join the same session
6. In the second window, click "Ready"
7. In the first window (host), click "Start Game"
8. Both players should see the countdown and start playing simultaneously

### Test Checklist

- [ ] Can create a new game session
- [ ] Can see yourself in the player list
- [ ] Can join existing session via URL
- [ ] Can see all players in lobby
- [ ] Ready status updates in real-time
- [ ] Start button enabled when 2+ players ready
- [ ] Countdown synchronized across clients
- [ ] Notes fall down lanes smoothly
- [ ] Keyboard input registers hits
- [ ] Score updates in real-time
- [ ] Can see other players' scores
- [ ] Game completes and shows results

## Architecture Overview

### New Infrastructure (Reusable)

The following components can be reused for future multiplayer games:

```
src/lib/
├── supabase/          - Supabase client and realtime manager
├── multiplayer/       - Clock synchronization
└── audio/             - Web Audio API engine

src/hooks/
├── useGameSession.ts  - Session management
└── useAudioEngine.ts  - Audio playback
```

### Game-Specific Code

```
src/app/games/dance/
├── page.tsx           - Main game orchestrator
├── types.ts           - Game type definitions
├── components/        - React components
│   ├── RhythmLane.tsx
│   ├── ScoreDisplay.tsx
│   └── Countdown.tsx
└── lib/              - Game logic
    ├── constants.ts   - Configuration
    ├── scoring.ts     - Hit detection & scoring
    └── notePatterns.ts - Chart generation
```

## How It Works

### Multiplayer Synchronization

1. **Clock Sync**: When game starts, clients measure network latency and calculate time offset
2. **Synchronized Start**: Host broadcasts a future start time to all players
3. **Local Simulation**: Each client calculates hits locally for instant feedback
4. **Score Sync**: Scores are batched and synced to database every 1-2 seconds

### Game Flow

1. **Lobby Phase**:
   - Players join session via URL
   - See real-time player list
   - Set ready status
   - Host starts when ready

2. **Countdown Phase**:
   - 3-second countdown synchronized across all clients
   - Music scheduled to start at exact synchronized time

3. **Playing Phase**:
   - Notes fall down 4 lanes (left, down, up, right)
   - Players hit arrows when notes reach target zone
   - Timing judged as Perfect (±30ms), Great (±60ms), Good (±90ms), or Miss
   - Score = base points × combo multiplier
   - Real-time score updates shown for all players

4. **Results Phase**:
   - Final rankings displayed
   - Detailed stats for each player
   - Option to play again

## Troubleshooting

### "Missing Supabase environment variables"

- Make sure `.env.local` exists in project root
- Check that both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Restart the dev server after changing `.env.local`

### "Failed to load session" or database errors

- Verify database schema was executed successfully
- Check Supabase project is active and not paused
- Check browser console for detailed error messages
- Verify realtime is enabled in Supabase (should be by default)

### Realtime not working

- In Supabase dashboard, go to Database → Replication
- Ensure `game_sessions`, `game_players`, and `game_state` tables are enabled for realtime
- The schema file should have done this, but verify if issues persist

### Players not seeing each other

- Make sure both players have the same session ID in the URL
- Check that both players' data appears in Supabase:
  - Go to Table Editor → `game_players`
  - You should see entries for both players with the same `session_id`

### Notes not falling smoothly

- This is a performance issue - try:
  - Closing other browser tabs
  - Using a different browser (Chrome/Edge recommended)
  - Reducing browser zoom to 100%

### No music playing

- Check browser console for audio loading errors
- Verify music file exists at the path specified in the chart
- Some browsers block audio autoplay - you may need to click something first
- Music is optional for testing - the game works without it

## Next Steps

### Customization

1. **Add New Charts**: Edit `src/app/games/dance/lib/notePatterns.ts`
2. **Adjust Difficulty**: Modify timing windows in `src/app/games/dance/lib/constants.ts`
3. **Change Visuals**: Update Tailwind classes in components
4. **Add Sound Effects**: Extend AudioEngine to play hit sounds

### Building for Production

```bash
npm run build
npm start
```

Deploy to Vercel, Netlify, or any Next.js hosting platform.

### Creating More Multiplayer Games

The infrastructure in `src/lib/` and `src/hooks/` is reusable:

1. Create new game directory: `src/app/games/your-game/`
2. Import and use:
   - `useGameSession` for lobby and player management
   - `RealtimeManager` for real-time events
   - `SyncManager` for synchronized timing

The database schema supports any game type via the `game_type` field.

## Support

If you encounter issues:

1. Check the browser console for errors
2. Check Supabase logs in the dashboard
3. Verify all setup steps were completed
4. Review the code comments for implementation details

## Architecture Decisions

### Why Supabase Realtime?
- No custom WebSocket server needed
- Built-in presence, broadcast, and database subscriptions
- Generous free tier
- Easy to set up and scale

### Why Web Audio API?
- Native browser support
- Sample-accurate timing (critical for rhythm games)
- Low latency (10-40ms typical)
- No external dependencies

### Why React Components vs Canvas?
- Simpler to implement and maintain
- Easier to style with Tailwind CSS
- Adequate performance for 4-lane rhythm game
- Can upgrade to Canvas later for advanced visual effects

## Performance Tips

- Game is optimized for 2-8 players
- Each game session uses ~50-100 realtime messages (very affordable)
- Score updates are debounced to reduce database writes
- Local gameplay simulation provides instant feedback

Enjoy playing Dodo Re Mi!
