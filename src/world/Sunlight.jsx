import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { world } from './shared'

/**
 * The sun, and the only thing in the scene that casts shadows.
 *
 * The shadow camera follows her rather than covering the whole meadow. Covering
 * everything from the keep to the far fence would need a ~130-unit frustum, and
 * at that size a horse's leg is barely a texel wide — the shadows come out as
 * mush. Following her means the same 2048 map covers a 68-unit box, which is
 * sharp enough to see a horse's legs and still wide enough that the castle walls
 * throw proper shadows across the courtyard while she's in it.
 *
 * The light hangs off a rig group at a fixed local offset, and the rig is also
 * the light's target — so moving the rig moves the sun and what it aims at
 * together, and the sun's *direction* never changes as she walks. A
 * DirectionalLight aims at a target object's world position, and a detached
 * Object3D never gets its world matrix updated, so the target has to be
 * something that actually lives in the scene graph. The rig is.
 */

/** Sun position relative to her. Direction matters; distance just needs to clear the towers. */
const OFFSET = [30, 46, 20]
/** Half-width of the shadowed box around her. Raise for coverage, lower for sharpness. */
const RADIUS = 34
const MAP = 2048

export default function Sunlight() {
  const rig = useRef()
  const light = useRef()

  useEffect(() => {
    light.current.target = rig.current
  }, [])

  useFrame(() => {
    rig.current.position.set(world.playerPos.x, 0, world.playerPos.z)
  })

  return (
    <group ref={rig}>
      <directionalLight
        ref={light}
        position={OFFSET}
        intensity={1.5}
        color="#FFF6E0"
        castShadow
        shadow-mapSize={[MAP, MAP]}
        shadow-camera-left={-RADIUS}
        shadow-camera-right={RADIUS}
        shadow-camera-top={RADIUS}
        shadow-camera-bottom={-RADIUS}
        shadow-camera-near={1}
        shadow-camera-far={130}
        // normalBias does the heavy lifting against shadow acne on curved,
        // flat-shaded surfaces; a plain depth bias big enough to fix those would
        // detach the horses' shadows from their hooves.
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />
    </group>
  )
}
