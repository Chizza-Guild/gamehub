# TODO

## Current Stuff

### lobby

-   Fix the mouse request thingy on other pages STILL DOESNT WORK

### maze

-   Fix chat focus

### unruined

-   Step 2:Create the db - lobby_id / player_id / round_id / original_prompt / modified_prompt / acquired_points - include the original prompts as their own rows to prevent bugs
-   Step 3: Have like 100 prompts beforehand, and prevent duplicate picks in the same game
-   Step 4: Decide how many rounds will it be, lets imagine we have 5 players playing, we have to make everyone play equally, so one player will be free each round (which will be 30 secs), we can just have round amount as the same of player amount
-   Step 5: The prompts will be given to the groups of two players, so if 6 players we get 3 different prompts, if 5 players 2 different prompts and one free player, etc. The player will need to ruin the prompt by adding some text at the end of it in 30 seconds. This will be the "Ruin Round 1". Then after the 30 seconds, we will have the "Ruin Voting 1" phase. Everyone will be able to vote on the prompts except the two players who created them. Per vote: 5 points. Victory: 5 points. Draw: 2 points. Lose: 0 points.
-   Step 6: After the voting, the leaderboard will be updated (Unique for each game).
-   Step 7: The "Unruin Round 1" starts, giving 30 seconds for the players to unruin the ruined prompt (The prompts will be swapped, If there are two groups (4ppl), they will swap ruined prompts, if there are more, they will swap the prompts in a circular way (1 --> 2 --> 3 --> 1))
-   Step 8: The game continues until the player amount == round amount, after that the leaderboard is shown for 15 seconds (which will be accessible next to the in-game chat. Then, the players will be redirected to their lobby.)

### others

-   Remove unnecessary files to clean up code
-   Merge pinks db tables to main
-   Add selectable profile pictures using supabase bucket
-   Create RLS for all DB's
-   Move is_system column into player_id column, just use "system" as string

## Future Ideas

What to do:

-   Snake
-   Pong (Ai to start)
-   Connect 4
-   Flappy bird
-   2048
-   Battleship
-   Checkers

Ive always wanted to make a chess bot so maybe chess

3D Stuff:

-   Like a tower defence game but 3d
-   Maybe a coop puzzle game like "we were here"
