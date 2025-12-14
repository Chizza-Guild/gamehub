# Music Files for Dodo Re Mi Game

This directory should contain music files for the rhythm game.

## Required Files

Add the following music files to this directory:

1. `test-track.mp3` - A 30-40 second music track for the test chart (120 BPM recommended)
2. `medium-track.mp3` - A medium difficulty track (140 BPM recommended)
3. `hard-track.mp3` - A hard difficulty track (160 BPM recommended)

## Where to Get Music

You can use:
- Royalty-free music from sites like:
  - Free Music Archive (freemusicarchive.org)
  - Incompetech (incompetech.com)
  - YouTube Audio Library
- Your own music files
- Creative Commons licensed music

## Format Requirements

- Format: MP3 or OGG (web-compatible)
- Length: 30-60 seconds recommended for testing
- Sample rate: 44.1kHz or 48kHz recommended
- Stereo or mono

## Testing Without Music

The game will work without music files, but:
- No audio will play during gameplay
- The timing will still work (notes will fall based on BPM)
- You can test all game mechanics silently

## Adding Your Own Music

1. Place your music file in this directory
2. Update the `musicUrl` field in the note charts at:
   `src/app/games/dance/lib/notePatterns.ts`

Example:
```typescript
return {
  id: 'my_chart',
  name: 'My Song',
  bpm: 120,
  duration: 40000,
  difficulty: 'easy',
  notes,
  musicUrl: '/music/my-song.mp3', // Your file here
};
```
