# Looking more realistic — step 1: shadows

She likes the game but wants it to look more realistic. The stack isn't the
limit; three.js can go much further. Working up a ladder one rung at a time:

- [x] **Shadows** — real cast shadows replacing the painted-on dark circles
- [x] ~~Environment map~~ — **tried, made it worse, reverted. See below.**
- [x] ~~A better procedural horse~~ — built, wasn't enough for her, superseded
- [x] **A real rigged glTF horse** — CC0, shipped. See below.
- [ ] Textures (grass, stone, wood) — there are currently none
- [x] **Give the girl the same treatment** — rigged CC0 character, and she picks
      which one. See below.
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

---

# Baby horses — GitHub issue #1

Foals. She finds a small horse somewhere in the meadow, earns its trust exactly
the way she already knows how, names it — and a few minutes later it grows up
and she can ride it.

- [x] Three foals, in new random spots every session
- [x] Tame one and it grows into an adult after five minutes
- [x] An untamed foal never grows
- [x] Foals can't be ridden; grown horses can

**Two decisions worth writing down.**

*The five minutes is wall clock, and it's saved.* Tame a foal, wander off, come
back to a horse. Close the app at bedtime and it has grown by morning. The
alternative — counting only time with the app open — would mean asking a
six-year-old to stand still and watch a timer, which is the one thing this game
has never done. `tamedAt` goes in the save; growing up is decided by comparing
it to now, so the clock isn't restarted by a reload.

*Foals turn up somewhere new each session.* Untamed ones are re-rolled on load
so that going and looking is rewarded; a tamed one keeps its name and coat
through the save like any other horse. Positions are rejection-sampled off the
buildings and then put through `clampToWorld`, the same function that guarantees
every other position in the game is legal — so however the dice land, a foal
cannot turn up inside a castle wall.

**Four things that needed care.**

1. **Stride length scales with the horse.** `HorseModel` matches the Walk and
   Gallop clips to ground speed by dividing by the speed each was authored for.
   A foal covering the same ground on shorter legs needs *more* strides per
   metre, not the same number — without the scale in that divisor it skates
   about the meadow like it's on ice.
2. **Growing up is eased, not switched.** The model's scale is damped toward its
   target, so it's a visible swell over about a second rather than a pop between
   two frames. Worth seeing happen.
3. **The trust meter is not a fixed height any more.** Sized for an adult, it
   hung in the air well above a foal and stopped reading as *that foal's* meter.
   It takes a `y` now. The hearts themselves stay full size — she has to be able
   to read them.
4. **Five stalls, and now up to eight rideable horses.** Nothing broke — the
   stable button already hides itself when the stalls are full and `stableHorse`
   already no-ops — but the check that every horse gets a stall was written when
   there were exactly five of them, and is now scoped to the grown ones. There's
   a test for the sixth horse: it stays with her rather than vanishing.

**Verification.** `npm test` — the foal section checks 500 random spawns all
land on open ground inside the meadow (one sample proves nothing when the
positions are random), that an untamed foal is still a foal an hour later, that
a tamed one is a foal at 4:59 and a horse at 5:01, and a save round-trip where a
foal tamed ten minutes ago has grown up while the app was closed while one tamed
a minute ago is still a foal and finishes on its original clock. All pass. Then
in the browser: a foal and an adult side by side at the same distance, the
grow-up swell, and the save surviving a reload. Production build is clean.

**Known limits, deliberately.**

- Foals can't be stabled, because stabling starts from riding and you can't ride
  a foal. That reads as a natural consequence rather than a rule to explain, so
  it stays until she asks otherwise.
- Eight skinned, shadow-casting horses instead of five. 120fps on a laptop, but
  **the iPad is the machine that matters** and hasn't been checked yet. If it
  drags, two foals instead of three is a one-line fix.

---

# A real girl — GitHub issue #3

*"The player model should be more realistic. It should be a human female
character."* She was a cone — a cone for the dress, capsules for arms, spheres
for the head — riding a real rigged horse. Now she's a rigged character too,
and she picks which one on the start screen.

- [x] Three rigged CC0 characters, tap to choose, saved like her horses
- [x] Idle / Walk / Run driven by her actual ground speed
- [x] A believable seat on a moving horse

**What "realistic" was taken to mean.** The horse's treatment, not photorealism.
Quaternius again, so she and the horse come from the same hand. This file already
records an env map being tried and reverted for fighting the art style; a
photoreal girl next to a low-poly horse and a pink castle would be that mistake
with more polygons. The cone was what read as wrong, not the shading.

**Five things worth knowing.**

1. **Half that pack is CC-BY, not CC0.** quaternius.com states CC0 for the pack
   but poly.pizza lists per-model licences and five of the ten — Witch, Soldier,
   Sci-Fi, Suit, Worker — are CC-BY. They're excluded, on the same standard as
   the horse. Provenance for what shipped is in `public/*.LICENSE.txt`.
2. **The CC0 characters are grown women, and she is six.** They model at ~1.8
   units, taller than the horse's withers. Scaling alone gives a shrunken adult,
   because children are shorter *and* proportionally bigger-headed — so the model
   comes down to `CHILD_HEIGHT` and the `Head` bone is scaled back up. Cheap, and
   completely convincing at the distance the chase camera sits. (Two of the five
   CC0 ones — a hooded figure holding a dagger, and a punk — weren't shipped.)
3. **There is no sitting animation.** 24 clips, including Death, Gun_Shoot and
   Sword_Slash, and not one of them is sitting, in a game about riding horses.
   So riding poses the leg bones directly. Both that and the head scale are
   applied *after* `mixer.update()`, or the clip overwrites them every frame.

   **And the bone names are not the names in the file.** `GLTFLoader` runs every
   node through `PropertyBinding.sanitizeNodeName`, because a dot is the
   property separator in an animation track path — so the rig's `UpperLeg.L` is
   `UpperLeg_L` by the time it reaches the scene graph. Looking it up by the
   name in the .glb finds nothing, *silently*: no error, no warning, she just
   rides standing bolt upright with her legs in the Idle pose. It cost a round
   of tuning numbers against a pose that was never being applied. `Hips` and
   `Head` have no dots, which is why the seat height worked and hid it.

   **And then the rotation went the wrong way.** On this rig a *negative* x
   swings the thigh forward; positive points her legs out behind her, which is
   what shipped in the first pass and what she spotted straight away. Forward
   and backward are genuinely hard to tell apart on a small figure at the chase
   camera's distance, and I called it wrong off a screenshot. The way to settle
   it is to ride due east so the horse's head is unambiguously on the right of
   frame, and read the leg against that — not to squint at the pose itself.
4. **`SADDLE_Y` was tuned against a thing with no legs.** Putting the cone's base
   on the saddle looked right. Do that to a model with legs and she perches on
   the horse's shoulders with her feet on its neck. She's dropped by her own hip
   height — measured off the `Hips` bone, not guessed — *plus* a further
   `SEAT_DROP`, because a cone could sit anywhere in a fairly wide band and look
   fine, so `SADDLE_Y` itself sits a clear hand's breadth too high for a real
   rider's hips. That extra drop is the one number to nudge if she ever looks
   like she's hovering or sunk. Her seat is only ever right *on average*: the
   horse's back rises and falls through its gait, which also means single
   screenshots at different moments are not comparable, and I burned a couple of
   iterations before noticing that.
5. **She suspends now, so she needed her own Suspense boundary.** Without it her
   download holds up the horses' and vice versa.

**Size, which is a real cost.** Precache went from 2120 KiB to 4758 KiB. It would
have been ~6.5MB: the pack ships 24 clips and this game plays three, and that
dead weight was ~40% of every file. `tools/strip-glb.mjs` drops the unplayed
clips, garbage-collects the orphaned accessors and bufferViews, repacks the
binary chunk and remaps the indices — 4.4MB of raw model down to 2.6MB, with
geometry, materials and the 62-bone rig provably untouched. That script is also
the only record of how the committed .glb files were made; a derived binary
nobody can regenerate is a trap.

**Verification.** `npm test` covers what the headless suite honestly can — the
default character, that choosing persists and survives a reload, that it doesn't
clobber her horses in the shared save, and that a character id which no longer
exists falls back to the first rather than rendering nothing. The rest is a
browser job and was done there: all three in the picker and in the meadow,
standing, walking, running and sitting on a moving horse seen side-on; tapping a
girl selects her without starting the game; console clean; production build
clean.

**Known limits, deliberately.**

- The picker is a second WebGL context on the start screen. It unmounts the
  moment she taps play, and it's the only way she can see the girl she's picking
  rather than an emoji standing in for her. If it costs too much on the iPad,
  pre-rendered thumbnails are the fallback.
- **Still unverified on the iPad**, which is now carrying eight skinned horses
  and a skinned girl. That check has been outstanding since the foals.

---

# Expanded World — GitHub issue #6

The meadow was one disc of radius 52 and she'd seen all of it. Now there are
four places and she rides between them: the meadow, a beach with a sea, a town
of five houses, and a snowy west with a mountain in it.

- [x] The world is a union of overlapping circles, not one circle
- [x] Beach and ocean, east
- [x] Town of five houses round a green, south
- [x] Snow and a solid mountain, west
- [x] The horses stay home; the one she's riding comes with her

**The whole feature is one function.** `clampToWorld` is the choke point every
position in this game passes through — player, horses, foal spawns, every tap —
so the shape of the world *is* the shape of that function. It now clamps to the
nearest region's edge instead of to one circle, and with a single region that is
byte-for-byte the old behaviour, which is what made this safe rather than a
rewrite. `clampToMeadow` is the old one, kept, for everything that lives at home.

**Four things the test suite caught that eyes would not have.**

1. **The snow was unreachable.** Its doorway was clear, but the *ride* to it went
   straight through the stable — and this game has no pathfinding, so she just
   stopped at the wall. Approach matters more than the doorway. It sits due west
   now, on the one westward line that misses the stable entirely.
2. **Two houses were standing in the road.** The town's doorway is 44 units wide
   and I'd put a house either side of it, which looks like a village and rides
   like a gate. The houses gather round the green now and the way in is clear.
3. **Taps behind the castle resolve a fraction outside the world.** Pre-existing,
   and correct: the keep and corner towers sit *on* the meadow's edge, and being
   ejected from a wall deliberately beats the boundary — better a step outside
   the world than inside a tower. Written down in the test rather than papered
   over, because the failure that check exists to catch is a tap stranded in the
   empty gaps between regions, and that misses by tens of units, not by one.
4. **A doorway sweep aimed inside the stable.** Not a fault — the stable only
   opens at the front. The sweep skips endpoints on a building's footprint now,
   not just its blockers.

**Two things the tests could never have caught, found by looking.**

- **Region discs z-fought.** They overlap by design — the overlap *is* the
  doorway — so two ground discs at the same height shimmered exactly where she
  walks between places. Each region carries its own `y` now.
- **The mountain had no snowcap and the beach had no palms.** The cap was a cone
  drawn *inside* a wider cone, so it was invisible; it has to be wider than the
  slope at the height it sits at. The palms were cones pointing up, which reads
  as a fir — the beach had a pine forest on it. The fronds hang down and out now.

**Boundaries are drawn, not just enforced.** Every region has a ring of markers —
fence posts, surf, hedges, snowdrifts — and `edgeMarkers` drops any that fall
inside a neighbouring region, because that gap is a doorway and fencing off your
own doorway is the sort of thing a six-year-old finds in four seconds.

**Verification.** `npm test`: 36 doorway crossings, 700 taps across the whole
world resolving somewhere legal, rides to and from every region, the mountain
approached from twelve directions, every doorstep in the town, and horses bolting
at the meadow fence in three directions. Then ridden in the browser — all four
places, the beach transition, and the horse positions read out of the live game
to confirm all eight stay inside the meadow. Production build clean; precache
2120 -> 4766 KiB (geometry only, no new assets).

**Known limits, deliberately.**

- Still no pathfinding: a building between her and her tap stops her, and now
  there are more buildings. The stall detector drops the destination so she is
  never left grinding, and she taps again. A navmesh is the real fix if it ever
  frustrates her.
- The gaps *between* regions are grass she can see and can't walk on, marked by
  fences and drifts. The meadow has always worked that way; there is just more
  boundary now.
- **Still unverified on the iPad**, and this adds three regions of scatter to a
  scene already carrying eight horses and a girl. That check is well overdue.
