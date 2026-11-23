# no problem: auto problem

A Super Auto Pets style auto battler built from the No Problem lore.

## Run it
- **Executable:** `dist/NoProblemAutoProblem-win32-x64/NoProblemAutoProblem.exe`
- **From source:** `npm install`, then `npm start`
- **Rebuild the exe** after changing anything: `npm run dist`
- **In a browser (quick testing):** `python -m http.server 8766` in this folder, then open http://localhost:8766

Keys: `r` roll, `f` freeze, `s` sell, `Enter` end turn, `Esc` deselect, `F11` fullscreen.

## Online play
Press **play online**. One person hosts and gets a 4-letter room code, and up to 7 friends join with it. Everyone shops at the same time (90 seconds a turn), then the host pairs players up for battles. An odd player out fights a ghost. Win = +1 trophy, loss = -1 life (5 lives). First to 10 trophies, or the last one standing, ends the line.
- Connections are direct between PCs. PeerJS's free public server only introduces them (it sees random IDs, nothing else).
- Some strict networks (certain school, work or mobile hotspot networks) block direct connections. If someone can't join, try a different network.
- Everyone should run the same version of the game, otherwise battles can play out differently on each PC.
- If the host leaves, the game ends for everyone.

## Endless mode and the final wave
- Start it from **endless run** on the title screen, or after winning 10 trophies in a normal run (you can end the run with a win, or keep going).
- Levels keep growing (level 3 at 5 merges, then +1 level per 3 merges) and the stat cap goes from 50 to 150.
- "nike inc status" counts every enemy unit your team kills. At 104 dead, the **final wave** is next: Giuseppe and the Nike Inc. militia.
- Before the final wave you choose: **keep** your team (every unit gets +30/+30 and +5 levels, once per run, then a normal 10-gold shop) or **rebuild**: sell the team, get 100 gold and a veterans market (tier 5-6 characters at level 4 with +50/+50).
- Clones can go past 5 units on the field (up to 10 per side). Giuseppe creatore also calls his clones when he falls.
- Beat the final wave to win. Lose and you lose a life and face it again.
- Tuning knobs, both in `js/engine.js`: `BOSS` (the boss team's stats and level), `KEEP_BONUS` (the keep bonus), `REBUILD` (gold, veteran bonus and level) and `MAX_FIELD` (units per side).

## Volume
PC: a slider next to the speaker (the speaker button mutes and restores). Phones and touch screens: the speaker button steps 100 > 75 > 50 > 25 > 0 > 100. The menu has a slider everywhere. The level is saved.

## Songs and death sounds
- `assets/music/songs/`: normal songs. Every shop phase and battle phase plays the next song from a shuffled list, with no repeats until all have played. Online, the host picks so both players hear the same song.
- `assets/music/win/` and `assets/music/lose/`: played after a battle, once every death sound has finished.
- `assets/music/suddendeath.mp3`: plays for the whole online sudden death round.
- `assets/sfx/death/`: a random one plays on every death, and they stack.
- `assets/sfx/special/`: comeback, landslide, rare (15%), No Problem's 2nd kill (plays alone) and the sudden death last death.

After adding or removing files in these folders, run `node tools/manifest.js` (or just `npm run dist`, which does it for you).

## Sudden death (online)
When only 2 players are left and both are on 1 life, the next round is sudden death:
1. The shop plays as normal, so both players can prepare. The sudden death song plays.
2. After both end their turn, the battle screen shows both teams frozen, with the choices underneath.
3. Both vote within 15 seconds: **remove a buff** or **ban a card**. Card bans only happen if both choose them.
4. Within 20 seconds, each player clicks an opponent's card: for buff removal, then one of its buffs (or its held item); for a ban, the card itself. Running out of time picks at random.
5. A 3-2-1 countdown, then the battle. Banned cards die first, and faint abilities still trigger.
6. Only the basic death sound plays. On the last death the song stops and only the sudden death last-death sound plays. A draw means another sudden death round.

## Adding your own sounds (no code needed)
Put files in `assets/sfx/` with these names. For the built exe, that folder is `dist/NoProblemAutoProblem-win32-x64/resources/app/assets/sfx/` (or put them in the source `assets/sfx/` and run `npm run dist`). `.mp3`, `.ogg` or `.wav` all work. Any file that's missing falls back to a built-in synth sound.

| file | plays when |
|---|---|
| `buy` | you buy a character |
| `sell` | you sell |
| `roll` | you roll the shop |
| `merge` | two copies merge |
| `levelup` | a character levels up ("goes ssj") |
| `hit` | the front units attack |
| `faint` | someone is died |
| `nuke` | negev, 480V, a reebok car bomb |
| `start` | a battle starts |
| `win` / `lose` | after a battle |
| `giuseppe` | giuseppe's theme (start of battle, respawn) |
| `freeze`, `click`, `item` | UI sounds |

Music goes in `assets/music/`: `title`, `shop` and `battle` (loops).

## Swapping character art
Portraits are in `assets/units/`, named by character id (for example `john.png`, `giuseppe.png`). Replace a file and keep the name.

## Where things live
- `js/data.js`: every character, ability, item, team name and caption. Edit stats and abilities here.
- `js/engine.js`: the battle simulation (deterministic from a seed, ready for online play later) and bot teams.
- `js/game.js`: shop, battle playback, menus, saving.
- `js/audio.js`: sound loading and synth fallbacks.
- `style.css`: the look.

Note: the portraits are the photo cutouts from the lore deck. They're fine for playing with friends, but a public release would need original art (see the rights note in the lore bible).
