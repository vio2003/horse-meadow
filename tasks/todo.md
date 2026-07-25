# Looking more realistic — step 1: shadows

She likes the game but wants it to look more realistic. The stack isn't the
limit; three.js can go much further. Working up a ladder one rung at a time:

- [x] **Shadows** — real cast shadows replacing the painted-on dark circles
- [x] ~~Environment map~~ — **tried, made it worse, reverted. See below.**
- [x] ~~A better procedural horse~~ — built, wasn't enough for her, superseded
- [x] **A real rigged glTF horse** — CC0, shipped. See below.
- [ ] Textures (grass, stone, wood) — there are currently none
- [ ] Give the girl the same treatment; she's still a cone next to a real horse
- [ ] ~~Drop `flatShading`; roughness/normal maps~~ — reconsider; same risk as
      the env map, and flat shading is load-bearing for this art style
- [ ] Post-processing (SSAO, bloom)
- [ ] Instanced alpha-tested grass with a wind shader

## The horse — a real rigged model

Quaternius' CC0 "White Horse" from the Animated Animal Pack, 1.08MB, via
poly.pizza. Public domain, no attribution needed; provenance recorded in
`public/horse.glb.LICENSE.txt` as a courtesy.

**Why this model.** It ships **no textures** — every surface is a flat named
material (Main, Hair, Muzzle, Hooves) — so her ten coat colours still work by
overriding a colour, which a texture-baked model would have fought. And the base
is white, so tinting it lavender or mint gives lavender and mint rather than mud.
It also carries the exact clips the game needs: Walk, Gallop, Idle and Eating.

Loaded via R3F's own `useLoader` + three's `GLTFLoader`, so it cost **no new npm
dependency** — only the asset.

**Four things that needed care:**

1. **Each horse needs its own skeleton.** A plain `.clone()` shares bones and all
   five animate in lockstep. `SkeletonUtils.clone()` is the fix. Materials get
   cloned per horse too, or recolouring one recolours the herd.
2. **Auto-fitting the scale didn't work.** Both `Box3.setFromObject` and
   `SkinnedMesh.computeBoundingBox` come back a hundredfold out on this model,
   because of how the armature's 100x scale interacts with the bind matrices —
   the first attempt scaled the horses to 0.3% and they vanished. `FIT_SCALE` is
   a measured constant now, which for one fixed asset is honest and clearer than
   a calculation that's wrong. The *height* is not guessed — see below.
3. **The precache didn't include it.** `globPatterns` in vite.config.js listed
   js/css/html/png/svg/woff2 — no glb. The game would have installed to her home
   screen and then had no horses with the Wi-Fi off. Precache is 12 entries /
   2.1MB now, up from 989KB.
4. **The model URL had to be base-relative.** The build sets `base: './'` so the
   game runs from any subpath; `/horse.glb` would 404 anywhere but a domain root.

**Two bugs she found in the first play, both now fixed.**

- *Floating.* The height off the ground was a constant derived from the same
  unusable bounding box, so it was simply wrong — the horses hovered in every
  pose, and grazing is just where it showed. Now measured off the rig: pose the
  model in Idle at setup and ask the four IK foot bones where they are. Done
  once, not per frame, because per frame the offset would shift as feet lift
  through a stride and the whole horse would bob.
- *Facing backwards.* I'd assumed the usual glTF -z forward and set MODEL_YAW to
  PI. This model already faces +z, which is the game's own convention, so the
  correction was creating the bug. MODEL_YAW is 0.

Confirmed the facing with a deterministic case rather than by eye: a stabled
horse settles at yaw 0, so it must face out of its stall toward the camera. It
does.

**Still not verified, needs an eyeball on the iPad:** the rider's seat height,
and the walk/gallop crossfades. `SADDLE_Y` lives in HorseModel.jsx (the model is
what decides where a saddle is) and is set from proportion, not measurement — if
she floats above the horse or sinks into it, that's the one number to nudge. The
crossfades I can't judge at all here: the test browser throttles
requestAnimationFrame to a frame or two a second.

## The old procedural horse — superseded

Chose the procedural rebuild over a downloaded glTF so the game keeps its "no
downloads, no licences, works offline at ~1MB" property while we find out whether
a better stylised horse is what she actually meant. Three things carry it:

- **The body is one swept surface** through anatomical cross-sections — point of
  shoulder, deep girth, barrel, croup — instead of three overlapping spheres.
  One mesh instead of three, and an actual silhouette.
- **The legs have joints.** A knee that folds on the forward swing and
  straightens under weight is the difference between a horse walking and a table
  sliding.
- **The gait changes with speed**: a four-beat walk (LH, LF, RH, RF) when she's
  leading it, a gallop with the hind pair together when something spooks it.
  Plus a body that rises twice per stride, a head that nods in time with the
  footfalls, and a mane and tail that stream back the faster it goes.

All geometry is module-level and shared by all five horses; only materials
differ. The old version rebuilt every primitive per horse, so this is fewer
objects than before despite being a much better model.

**Two bugs worth remembering, both from mixing up local axes.**

1. The neck came out a segment too long. `NeckSegment` already positions its
   children at its own tip, and the head then added another segment length on
   top of that — giving it a llama's neck.
2. The muzzle pointed at the horse's own feet. The neck chain stacks along `+y`
   but the head's features are laid out along `+z`, so the head's own rotation
   has to *subtract* most of the neck's pitch. Its resting angle is negative for
   exactly this reason, and there's a comment there now saying so.

## Environment map — tried and reverted

Generated a sky probe procedurally (gradient + sun disc → `PMREMGenerator`), set
it as `scene.environment`, and made the gold metallic so it had something to
reflect. **The gold came out worse than plain painted yellow every time.** Four
passes at it:

1. Full-strength probe using the grass colour for the ground half → olive gold,
   and the pink washed out.
2. Darkened, desaturated the ground half; cut `environmentIntensity` to 0.35 →
   pink recovered, gold still khaki.
3. Warmed the horizon, strengthened the sun disc, dropped metalness → closer,
   still duller than diffuse.
4. Swapped the gold base colour for a real metal reflectance (`#FFD277` rather
   than the painted `#E8C15A`), which is the textbook fix → still khaki.

**Why it doesn't work here, and it isn't a tuning failure.** A metal is its
reflection. What there is to reflect in this scene is a pale blue sky over a dark
green field, which is a cool, low-contrast surround — and ACES tone mapping
flattens what highlights survive. Real gold reads as gold because it sits in a
high-dynamic-range environment with bright, contrasty light sources. On top of
that, the camera never looks above the horizon, so the tower roofs are always
seen from a low angle where they reflect the dullest band of the probe.

**The lesson for the rest of the ladder.** This is the coherence problem from the
original assessment arriving early: PBR lighting doesn't improve art that wasn't
authored for PBR. The rungs that will actually pay are the ones that change the
*art* — textures, and a real horse model — not the ones that change the lighting
model applied on top of untextured flat-shaded primitives. Reordered above.

If revisiting: a real HDRI (not a generated gradient) with genuine dynamic range
is the only version of this worth trying, and it costs the offline-friendly
download size the project deliberately protects.

## Shadows — review

The horse meshes already carried `castShadow` flags; the system had simply never
been switched on. Turned it on (`shadows="soft"` → PCFSoftShadowMap), gave the
sun a shadow camera, and deleted the fake dark circles under the girl and the
horses — a hard blob under a soft real shadow looks worse than either alone.

**The one design decision worth knowing.** The shadow camera follows her instead
of covering the meadow. A frustum big enough for the whole world (keep to far
fence, ~130 units) spreads 2048 texels so thin that a horse's leg is about one
texel wide, and the shadows come out as mush. Following her puts the same map on
a 68-unit box. It also means three.js culls everything else out of the shadow
pass, so cost tracks what's near her rather than how much world exists — which
is what keeps this affordable on an iPad.

The light hangs off a rig group at a fixed local offset and the rig *is* the
light's target, so the sun's direction never changes as she walks. First attempt
assigned a detached `Object3D` as the target via a prop; a directional light aims
at its target's world matrix, and a detached object never gets one updated.

**What to check on the actual iPad:** frame rate. The shadow pass adds a second
geometry pass, and I could not measure FPS here — the test browser throttles
`requestAnimationFrame`, so any number I took would have been meaningless. If it
does drop, the dials in order are `MAP` 2048 → 1024, then `RADIUS` down, then
dropping `castShadow` from the merlons (~50 small meshes) and fence posts.

# Castle courtyard + stable

Her request: a pink-and-gold castle with a courtyard she can ride into (only the
courtyard), a stable, and — while riding — a button that makes the horse stay in
the stable.

## Plan

- [x] `src/world/buildings.js` — one file holding every layout number, plus
      `BLOCKERS` (the things she can't walk through) and `STALLS`
- [x] `src/world/shared.js` — `resolveBlockers` / `clampToWorld`, replacing the
      old circle-only `clampToMeadow`
- [x] `src/world/Castle.jsx` — walls, towers, gate arch, fountain, keep
- [x] `src/world/Stable.jsx` — barn, five stalls, roof, name signs
- [x] Stabling: `stall` on each horse, persisted; `stableHorse` / `unstable`
- [x] `Horse.jsx` — stabled branch (walk to stall, stay, don't follow) and
      tap-to-open-the-stall
- [x] `HUD.jsx` — 🏡 "Stay here", shown only while mounted inside the stable
- [x] Keep grass, flowers, rocks, trees and fence posts off the buildings
- [x] README

## Review

**What was built.** The castle sits north of the meadow, opening south toward
the camera so she can always see herself inside it. The courtyard is ~22 × 18 of
rideable space with a fountain to circle. The keep and towers are silhouette
only. The stable is west of the castle approach with one stall per horse, so the
button never has nowhere to put one. Stabled horses walk themselves in, stay put
while she wanders off, survive a reload, and come back out when tapped. Their
name-picture — the same icon she tapped when naming them — hangs over the stall.

**Three bugs the tests caught that playing wouldn't have, quickly.**

1. *Riding dead-on at the fountain deadlocked.* Pushing a point out of a circle
   sends it straight back down its line of travel, so she'd grind to a halt in
   front of the fountain instead of going round. Fixed by sizing a tangential
   nudge to the overlap, which converts the movement she loses into movement
   sideways.
2. *An unreachable pocket behind the castle.* The keep's padded footprint
   overlapped the north wall's, so a tap on the keep resolved into a sliver
   nothing could ever walk to — she'd press against the wall forever, and
   because the tap counted as a run, every horse in the meadow would stay
   spooked for as long as she leaned there. Moved the keep back; also added a
   stall detector in `Player.jsx` that drops the destination when she stops
   making progress, which covers every case of this I haven't thought of.
3. *A notch at the gate.* The gate towers poked out of the flat wall face, and
   riding at the gate from an angle wedged her in the corner between them —
   at the one spot she aims for most. The south wall now runs in to the towers'
   inner edge and the towers get no blocker of their own, so the face is flush.

**Verification.** `scratchpad/verify.mjs` loads the real modules through Vite and
replays `Player`/`Horse` movement frame by frame: 46 southern approaches to the
gate, every courtyard corner, the length of every wall face, all five stalls,
and taps aimed inside each building. It also drives the store through
tame → stable → save → reload to prove a horse is still in its stall tomorrow,
including a corrupt save with an out-of-range and a double-booked stall. All
pass. Then checked in the browser: the castle from outside and from the
courtyard, the stable inside and out, the fades, and a seeded save rendering a
horse standing in its stall under its ⭐ sign. Production build is clean.

**Known limits, deliberately.**

- A wall between her and her tap stops her rather than routing around it. That's
  honest, physical behaviour and it's learnable ("I have to go through the
  gate"), but it is not pathfinding. If it frustrates her, the fix is a
  navigation mesh, not a bigger nudge.
- The corner towers still bulge slightly into the courtyard corners. Convex from
  every angle she'll approach from, so it slides rather than catches — but it's
  the same class of thing as the gate notch, if a corner ever feels sticky.
