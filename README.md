# Horse Meadow

A tap-to-play horse game for one specific six-year-old. Find a horse, earn its
trust, name it, ride it. No timers, no fail states, no reading required.

## Run it

```bash
npm install
npm run dev
```

Vite prints a `Network:` URL. Open that on the iPad — same Wi-Fi, no build step,
and every save you make reloads on her screen instantly. This is the loop you
want on a Saturday.

## Two environments

**Production — what she plays.** https://vio2003.github.io/horse-meadow/

Open that in Safari on the iPad → Share → Add to Home Screen. She gets a real
icon, no browser chrome, and it works with the Wi-Fi off.

**Development — your laptop.** `npm run dev`, exactly as above. Nothing you do
here can reach her: it's a different origin, so it has its own service worker and
its own `localStorage`. Her horses are safe no matter what you break.

### Promoting a version to production

Deliberately **not** automatic. Pushing to `main` does nothing — otherwise the
next half-finished feature you push would change the game she's mid-way through.
Promotion is an explicit act:

```bash
git tag v2 && git push origin v2
```

or press **Run workflow** on the Deploy to production action in GitHub. Either
one builds and publishes; the tag doubles as a record of what she's playing.

Her installed app updates itself on next launch (the service worker is set to
`autoUpdate`), so she never reinstalls — which also means **a bad deploy reaches
her**. Two things guard against that.

**The checks run automatically before a tag can leave your machine.**
`.githooks/pre-push` runs `npm test` whenever you push a `v*` tag, and refuses
the push if anything fails. Ordinary pushes to `main` aren't touched — they don't
deploy anything. Bypass with `git push --no-verify` if you ever need to.

If you clone this fresh, turn the hook back on with:

```bash
git config core.hooksPath .githooks
```

**And try the real artefact on the iPad first:**

```bash
npm run build && npm run preview
```

That serves the exact production build on your network.

## Tests

```bash
npm test
```

`tests/world.mjs` loads the real game modules through Vite and replays the actual
movement code frame by frame — it is not a reimplementation, which is the only
reason it has ever caught anything. It checks that she can ride in through the
gate from every approach, reach every corner of the courtyard, that each stall is
reachable, that a tap into a wall resolves somewhere legal, and that a stabled
horse is still in the same stall after a reload (including when the save is
corrupt).

It runs locally, not in CI: it boots Vite a few times, and her game shouldn't be
gated on a remote runner. It takes about a second.

**Why not the App Store:** a free Apple developer account re-signs an app every
7 days, so it dies on her iPad every week. The paid program is $99/yr. For an
audience of one, the home-screen route costs nothing and she'll never know the
difference.

## How it plays

| Action | Control |
|---|---|
| Walk | Tap the grass nearby |
| Run | Tap the grass **far** away — this spooks horses |
| Earn trust | Stand near a calm horse. Hearts fill above its head |
| Feed | 🍎 button (appears when a horse is close) |
| Brush | 🧽 button — hold it down. Fastest way to fill hearts |
| Name it | Tap a picture. No keyboard anywhere in this game |
| Ride | Tap your tamed horse |
| Visit the castle | Ride north through the gate. The courtyard is hers to gallop around; the keep and towers are scenery |
| Stable a horse | Ride into the stable, then tap 🏡 **Stay here** |
| Get it back | Tap the horse in its stall. It walks back out to her |

Tamed horses are saved to `localStorage` and are still there tomorrow, with the
names and colours she chose — and, if she put one away, still in the same stall
with its name-picture hanging over the door. That persistence matters more to a
six-year-old than any mechanic in here.

**"Stay here" vs "Hop down."** Both buttons show inside the stable, and the
difference is the whole point: hop down and the horse follows you around, tap
Stay here and it stays put.

## Tuning knobs

Everything you'll want to fiddle with after watching her play is at the top of
a file:

- `src/world/Horse.jsx` — `NOTICE_RANGE`, `SPOOK_RANGE`, `TRUST_FLOOR`, and the
  trust rates. If taming feels slow, raise the `rate` values. If horses feel too
  jumpy, drop `SPOOK_RANGE`.
- `src/world/Player.jsx` — `RUN_DISTANCE` decides how far a tap has to be before
  she runs. This is the single most important number in the game.
- `src/store.js` — `COATS`, `NAME_CARDS`, and `HORSE_SPAWNS`. Add her own name
  ideas here; letting her pick them is worth more than an hour of your coding.
- `src/world/buildings.js` — every number that places the castle and the stable,
  plus `BLOCKERS`, the list of things she can't walk through. `CASTLE.gateHalf`
  widens the gate; `STALLS` decides where horses stand and how many fit.

## Design notes

Three decisions worth keeping if you extend this:

1. **No fail state anywhere.** Trust decays toward a floor, never to zero. A
   spooked horse trots away and stays findable. She can't lose progress.
2. **Per-frame state lives outside React** (`src/world/shared.js`). Trust,
   positions, and the brush toggle would otherwise trigger 60 re-renders a
   second. React state is only for things a human clicks.
3. **The trust meter is in the 3D scene, not the HUD.** Feedback belongs on the
   thing she's looking at, not in a corner she has to learn to check.
4. **Buildings fade when she's inside them.** The camera sits south of her, so
   the castle's front wall and the stable's roof would otherwise hide her the
   moment she rode in. Both buildings lerp their front geometry to near-zero
   opacity while she's inside. It also reads as "you're in now."
5. **One shadow-casting light, and its shadow camera follows her.**
   `src/world/Sunlight.jsx`. Covering the whole meadow at once would need a
   ~130-unit frustum, at which size a horse's leg is barely a texel and the
   shadows turn to mush. Following her keeps the same 2048 map on a 68-unit box,
   and it means three.js frustum-culls everything else out of the shadow pass —
   so the cost is bounded by what's near her, not by how much world exists.
   `RADIUS` in that file is the sharpness-vs-coverage dial.
6. **Collision is push-out, not pathfinding.** `resolveBlockers` shoves a point
   out of any wall along its shallowest axis, which gives wall-sliding for free.
   Two consequences worth knowing before you extend it: circles get a tangential
   nudge as well, or riding dead-on at the fountain would deadlock; and a wall
   between her and her tap simply stops her, so `Player.jsx` drops the
   destination once she's stopped making progress.

## Obvious next things

- More meadows behind a gate — new coat colours as the reward for exploring
- Foals that follow a tamed mare
- A stable screen showing her horses, with a brush-and-groom mode
- Real horse audio (the current sounds are synthesized in `src/audio.js`); drop
  mp3s in `public/` and swap the functions out
- Swap the procedural horse for a rigged glTF — Quaternius and Kenney both
  publish CC0 animated animal packs. Keep `HorseModel.jsx`'s props and nothing
  else has to change. The current horse is generated geometry with jointed legs
  and a walk/gallop, which may well be enough; the glTF costs megabytes and the
  offline story, so it's worth watching her play first.
