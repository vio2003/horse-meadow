import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { damp } from './shared'

/**
 * A real rigged horse: Quaternius' CC0 "White Horse", with its own skeletal
 * Walk, Gallop, Idle and Eating animations. See public/horse.glb.LICENSE.txt.
 *
 * Two things made this the right model to take. It ships **no textures** — every
 * surface is a flat named material (Main, Hair, Muzzle, Hooves) — so her ten
 * coat colours still work by overriding a colour, which a texture-baked model
 * would have fought. And the base is white, so tinting it lavender or mint gives
 * lavender and mint rather than mud.
 *
 * Loaded through R3F's own useLoader, so this costs no new npm dependency — only
 * the 1.1MB asset. The props are unchanged from the procedural version this
 * replaced, which is why nothing else in the game had to move.
 *
 * Three things to know before editing:
 *
 * - Every horse needs its **own skeleton**. A plain .clone() shares bones, so
 *   all five would animate in lockstep. SkeletonUtils.clone() is the fix.
 * - Materials are cloned per horse too, or recolouring one recolours the herd.
 * - The model is authored at a different scale from the game, and its height off
 *   the ground is measured from the rig on load rather than guessed.
 */

/**
 * Base-relative, not '/horse.glb'. The build sets `base: './'` so the whole game
 * works from any subpath (a Netlify drop URL, say); an absolute path would 404
 * everywhere except the domain root.
 */
const MODEL_URL = `${import.meta.env.BASE_URL}horse.glb`

/**
 * Scale into game units. Measured, not computed: this model gives no usable
 * bounding box (it's skinned, and both Box3.setFromObject and
 * SkinnedMesh.computeBoundingBox come back a hundredfold out because of how the
 * armature's 100x scale interacts with the bind matrices).
 *
 * The *height* off the ground is not guessed, though — see groundOffset below.
 */
const FIT_SCALE = 0.323

/**
 * Where a rider sits, in game units off the ground. Player.jsx used to hardcode
 * this for the old procedural horse's back; it belongs with the model, because
 * the model is what decides where the saddle is. Nudge it if she looks like
 * she's floating above the horse or sunk into it.
 */
export const SADDLE_Y = 1.22
/** The model already faces +z, which is the game's yaw 0. No correction needed. */
const MODEL_YAW = 0
/** Above this it breaks into a gallop — same threshold the procedural gait used. */
const GALLOP_SPEED = 2.6

/**
 * The pack ships every clip twice — bare, and prefixed "AnimalArmature|". Keep
 * one of each, preferring the bare name.
 */
function pickClips(animations) {
  const byName = new Map()
  for (const clip of animations) {
    const short = clip.name.split('|').pop()
    if (!byName.has(short) || !clip.name.includes('|')) byName.set(short, clip)
  }
  return byName
}

function clipFor(speed, graze) {
  if (speed > GALLOP_SPEED) return 'Gallop'
  if (speed > 0.05) return 'Walk'
  if (graze > 0.5) return 'Eating'
  return 'Idle'
}

/**
 * `scale` is 1 for a grown horse and FOAL_SCALE for a foal. It is eased toward
 * its target rather than applied outright, so a foal growing up is a visible
 * swell over a second or so instead of a pop between frames.
 */
export default function HorseModel({ coat, mane, anim, scale = 1 }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL)

  // One skeleton, one set of materials and one mixer per horse.
  const { root, mixer, actions, groundY } = useMemo(() => {
    const root = cloneSkinned(gltf.scene)

    const darker = new THREE.Color(coat).multiplyScalar(0.55)
    root.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      o.material = o.material.clone()
      const m = o.material
      m.roughness = 0.85
      m.metalness = 0
      switch (m.name) {
        case 'Main':
          m.color.set(coat)
          break
        case 'Main_Light':
          m.color.set(coat).multiplyScalar(1.15)
          break
        case 'Hair':
          m.color.set(mane)
          break
        case 'Muzzle':
          m.color.copy(darker)
          break
        case 'Hooves':
          m.color.set('#3A2E28')
          break
        default:
          break // the eyes keep their own colours
      }
    })

    const mixer = new THREE.AnimationMixer(root)
    const actions = {}
    for (const [name, clip] of pickClips(gltf.animations)) {
      actions[name] = mixer.clipAction(clip)
    }

    /**
     * Where the ground is, measured off the rig rather than guessed.
     *
     * A hardcoded offset floated the horses: it was derived from that same
     * unusable bounding box. The skeleton doesn't lie, though — pose the model
     * in Idle and ask the four foot bones where they are. Done once at setup
     * rather than per frame, because per frame the offset would change as feet
     * lift through a stride and the whole horse would bob.
     */
    const idle = actions.Idle
    if (idle) idle.play()
    mixer.update(0)
    root.updateMatrixWorld(true)
    const p = new THREE.Vector3()
    let lowest = Infinity
    root.traverse((o) => {
      if (/^IK(Front|Back)Leg/.test(o.name || '')) {
        lowest = Math.min(lowest, o.getWorldPosition(p).y)
      }
    })
    mixer.stopAllAction()
    const groundY = Number.isFinite(lowest) ? -lowest * FIT_SCALE : 0

    return { root, mixer, actions, groundY }
  }, [gltf, coat, mane])

  const current = useRef(null)
  const outer = useRef()
  const shownScale = useRef(scale)

  useEffect(() => () => mixer.stopAllAction(), [mixer])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const a = anim.current
    const want = clipFor(a.speed, a.graze)

    const s = (shownScale.current += (scale - shownScale.current) * damp(dt, 2.2))
    if (outer.current) outer.current.scale.setScalar(s)

    if (want !== current.current && actions[want]) {
      const prev = current.current && actions[current.current]
      actions[want].reset().setEffectiveWeight(1).fadeIn(0.25).play()
      if (prev) prev.fadeOut(0.25)
      current.current = want
    }

    // Match the stride to the ground speed so the hooves don't skate. The
    // divisors are roughly the speed each clip was authored to look right at,
    // scaled by how big the horse is: short legs covering the same ground need
    // *more* strides per metre, not the same number. Without the `s` a foal
    // skates about the meadow like it's on ice.
    const action = actions[current.current]
    if (action) {
      action.timeScale =
        current.current === 'Gallop'
          ? THREE.MathUtils.clamp(a.speed / (6.0 * s), 0.6, 1.6)
          : current.current === 'Walk'
            ? THREE.MathUtils.clamp(a.speed / (1.6 * s), 0.5, 1.8)
            : 1
    }

    mixer.update(dt)
  })

  // The outer group's scale is set on the ref every frame above. Everything
  // inside it — including how high off the ground the hooves sit — comes along.
  return (
    <group ref={outer} rotation={[0, MODEL_YAW, 0]}>
      <group position={[0, groundY, 0]} scale={FIT_SCALE}>
        <primitive object={root} />
      </group>
    </group>
  )
}

useLoader.preload(GLTFLoader, MODEL_URL)
