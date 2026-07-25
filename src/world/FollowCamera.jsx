import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { world, damp } from './shared'
import { useGame } from '../store'

/**
 * A fixed-angle chase camera. No orbit controls, no pinch-to-rotate — an extra
 * degree of freedom is one more thing to get lost in, and getting the camera
 * stuck facing a tree is the fastest way to end a six-year-old's session.
 */
export default function FollowCamera() {
  const { camera } = useThree()
  const look = useMemo(() => new THREE.Vector3(), [])
  const desired = useMemo(() => new THREE.Vector3(), [])
  const current = useRef(new THREE.Vector3(0, 11, 18))

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const mounted = !!useGame.getState().mounted
    const height = mounted ? 12.5 : 9.5
    const back = mounted ? 15.5 : 12

    desired.set(world.playerPos.x, height, world.playerPos.z + back)
    current.current.lerp(desired, damp(dt, mounted ? 2.6 : 3.4))
    camera.position.copy(current.current)

    look.set(world.playerPos.x, mounted ? 2.0 : 1.1, world.playerPos.z)
    camera.lookAt(look)
  })

  return null
}
