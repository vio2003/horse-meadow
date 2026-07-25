import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { damp } from './shared'
import { characterOr } from '../store'

/**
 * The girl. A real rigged character, replacing the cone she used to be.
 *
 * Quaternius again — the same artist as the horse, which is the whole reason
 * she doesn't look pasted in from another game. Three CC0 characters off one
 * shared 62-bone rig, so one loader and one clip set serve all of them, and
 * she picks between them on the start screen. Provenance is in
 * public/*.LICENSE.txt, as with the horse.
 *
 * Every lesson from HorseModel applies again and is not repeated in full here:
 * SkeletonUtils.clone() so each instance gets its own skeleton, materials
 * cloned per instance, a BASE_URL-relative path so the game works from a
 * subpath, and the ground offset measured off the rig rather than guessed.
 *
 * Two things are specific to her:
 *
 * 1. **She's a child, and the models are grown women.** The CC0 half of that
 *    pack is adult characters at ~1.8 units — taller than the horse's withers.
 *    Scaling alone gives a shrunken adult, which reads wrong: children are
 *    shorter *and* proportionally bigger-headed. So the whole model comes down
 *    to CHILD_HEIGHT and the Head bone is scaled back up. It is a cheap trick
 *    and it is completely convincing at the distance the chase camera sits.
 *
 * 2. **There is no sitting animation.** The pack ships 24 clips — Death,
 *    Gun_Shoot, Sword_Slash — and not one of them is sitting, which is
 *    unfortunate in a game about riding horses. So riding poses the leg bones
 *    directly. Both the head scale and the riding pose are applied *after*
 *    mixer.update(), because the mixer would otherwise overwrite them every
 *    frame with whatever the clip says.
 */

/** How tall she stands, in game units. The cone she replaces was about this. */
const CHILD_HEIGHT = 1.24
/** Children are bigger-headed than adults. Without this she's a tiny woman. */
const HEAD_SCALE = 1.38
/** Above this she runs. Matches Player's own WALK/RUN split. */
const RUN_SPEED = 3.2

/** The pack prefixes every clip "CharacterArmature|". Same trick as the horse. */
function pickClips(animations) {
  const byName = new Map()
  for (const clip of animations) {
    const short = clip.name.split('|').pop()
    if (!byName.has(short) || !clip.name.includes('|')) byName.set(short, clip)
  }
  return byName
}

/**
 * Astride a horse: thighs forward over the barrel, knees bent so the calves
 * hang down its sides, and a little splay so she straddles it rather than
 * kneeling on it.
 *
 * On this rig a **negative** x swings the thigh forward, toward the horse's
 * head, and the knee bends the opposite way to the hip. Positive x points her
 * legs out behind her, which looks like she is being dragged rather than
 * riding. Verified against the horse's head direction rather than by eye,
 * because it is genuinely hard to tell forward from backward on a small figure
 * at the chase camera's distance — I got it backwards the first time.
 */
const SEAT = {
  'UpperLeg.L': [-1.15, 0, 0.35],
  'UpperLeg.R': [-1.15, 0, -0.35],
  'LowerLeg.L': [1.3, 0, 0],
  'LowerLeg.R': [1.3, 0, 0],
}

/**
 * The same bones, under the names they actually have once loaded.
 *
 * GLTFLoader runs every node name through `PropertyBinding.sanitizeNodeName`,
 * because a dot is the property separator in an animation track path — so the
 * rig's `UpperLeg.L` is `UpperLeg_L` by the time it reaches the scene graph.
 * Look it up by the name in the .glb and you find nothing, silently, and she
 * rides standing bolt upright on the horse's back with her legs in the Idle
 * pose. Which is exactly what happened.
 */
const SEAT_BONES = Object.fromEntries(
  Object.entries(SEAT).map(([name, r]) => [THREE.PropertyBinding.sanitizeNodeName(name), r])
)

/**
 * How far below SADDLE_Y her hips actually sit, on top of her own hip height.
 *
 * SADDLE_Y was measured against the cone she used to be, and a cone has no
 * legs — anywhere in a fairly wide band looked fine. Put a real rider's hips
 * there and she floats a clear hand's breadth above the horse. This is the
 * measured difference between "where the cone's base went" and "where a
 * backside goes", and it is the one number to nudge if she ever looks like
 * she's hovering or sunk.
 *
 * Note the horse's back rises and falls through its gait, so she is only ever
 * seated *on average* — which is what riding looks like anyway.
 */
const SEAT_DROP = 0.3

export default function PlayerModel({ character, anim }) {
  const spec = characterOr(character)
  const url = `${import.meta.env.BASE_URL}${spec.file}`
  const gltf = useLoader(GLTFLoader, url)

  const { root, mixer, actions, groundY, hipY, fit, bones } = useMemo(() => {
    const root = cloneSkinned(gltf.scene)

    root.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      o.material = o.material.clone()
      o.material.roughness = 0.85
      o.material.metalness = 0
      const swap = spec.recolor?.[o.material.name]
      if (swap) o.material.color.set(swap)
    })

    const mixer = new THREE.AnimationMixer(root)
    const actions = {}
    for (const [name, clip] of pickClips(gltf.animations)) {
      actions[name] = mixer.clipAction(clip)
    }

    // Scale is measured from the model's own bounding box, not guessed. Unlike
    // the horse — whose skinned bounds come back a hundredfold out — these
    // characters box cleanly, so this is simply the honest way to do it.
    const idle = actions.Idle
    if (idle) idle.play()
    mixer.update(0)
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const fit = CHILD_HEIGHT / (box.max.y - box.min.y)
    const groundY = -box.min.y * fit
    mixer.stopAllAction()

    const bones = {}
    root.traverse((o) => {
      if (o.isBone && (o.name === 'Head' || o.name === 'Hips' || o.name in SEAT_BONES)) {
        bones[o.name] = o
      }
    })

    /**
     * How high her hips sit — measured off the rig, not guessed.
     *
     * SADDLE_Y describes where a rider *sits*, and it was tuned against the
     * cone she used to be, which had no legs: putting the cone's base on the
     * saddle looked right. Do that to a model with legs and she perches on the
     * horse's shoulders with her feet on its neck. Dropping her by her own hip
     * height puts her backside on the saddle, which is where it belongs.
     */
    const hipY = bones.Hips ? bones.Hips.getWorldPosition(new THREE.Vector3()).y * fit : 0

    return { root, mixer, actions, groundY, hipY, fit, bones }
  }, [gltf, spec])

  const current = useRef(null)
  const seat = useRef(0)
  const outer = useRef()

  useEffect(() => () => mixer.stopAllAction(), [mixer])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const a = anim.current
    const want = a.mounted ? 'Idle' : a.speed > RUN_SPEED ? 'Run' : a.speed > 0.05 ? 'Walk' : 'Idle'

    if (want !== current.current && actions[want]) {
      const prev = current.current && actions[current.current]
      actions[want].reset().setEffectiveWeight(1).fadeIn(0.25).play()
      if (prev) prev.fadeOut(0.25)
      current.current = want
    }

    // Stride matched to ground speed, then divided by how big she is — a child
    // covering adult ground needs more steps per metre. Same reasoning as the
    // foals in HorseModel.
    const action = actions[current.current]
    if (action) {
      action.timeScale =
        current.current === 'Run'
          ? THREE.MathUtils.clamp(a.speed / (5.0 * fit), 0.6, 1.7)
          : current.current === 'Walk'
            ? THREE.MathUtils.clamp(a.speed / (1.9 * fit), 0.6, 1.8)
            : 1
    }

    mixer.update(dt)

    // ---- everything below overrides the clip, so it has to come after it.

    // Child proportions.
    if (bones.Head) bones.Head.scale.setScalar(HEAD_SCALE)

    // Riding. Eased in and out so mounting and hopping down are a movement
    // rather than a snap.
    seat.current += ((a.mounted ? 1 : 0) - seat.current) * damp(dt, 7)
    if (outer.current) {
      outer.current.position.y = groundY - (hipY + SEAT_DROP) * seat.current
    }
    if (seat.current > 0.001) {
      for (const [name, [x, y, z]] of Object.entries(SEAT_BONES)) {
        const bone = bones[name]
        if (!bone) continue
        bone.rotation.x += x * seat.current
        bone.rotation.y += y * seat.current
        bone.rotation.z += z * seat.current
      }
    }
  })

  return (
    <group ref={outer} position={[0, groundY, 0]} scale={fit}>
      <primitive object={root} />
    </group>
  )
}

for (const c of ['girl-dress.glb', 'girl-jeans.glb', 'girl-rider.glb']) {
  useLoader.preload(GLTFLoader, `${import.meta.env.BASE_URL}${c}`)
}
