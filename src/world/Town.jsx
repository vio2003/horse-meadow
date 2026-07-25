import { useMemo } from 'react'
import * as THREE from 'three'
import { Scatter } from './Meadow'
import { region, edgeMarkers } from './regions'
import { HOUSES, TIMBER, STONE } from './buildings'

/**
 * A small town south of the meadow: five houses round a green.
 *
 * Solid boxes, unlike the castle and the stable, which both have an open front
 * because she goes inside them. There is no inside here — so there's no doorway
 * to get wrong, and no way to be trapped in one. If she ever wants to go in,
 * that's the stable's trick (open front, faded when she's under the roof) and a
 * separate piece of work.
 *
 * Geometry and materials are shared across all five and only the transforms
 * differ, which keeps five buildings at a handful of draw calls.
 */

const TOWN = region('town')

export default function Town() {
  const wallGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const roofGeo = useMemo(() => new THREE.ConeGeometry(1, 1, 4), [])
  const doorGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 0.14), [])
  const doorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: TIMBER, flatShading: true, roughness: 0.95 }),
    []
  )
  const pathMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STONE, roughness: 1 }),
    []
  )

  const grassGeo = useMemo(() => new THREE.ConeGeometry(0.09, 0.36, 4), [])
  const grassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#6C9C51', flatShading: true, roughness: 1 }),
    []
  )

  const hedges = useMemo(() => edgeMarkers(TOWN, 54, 1.5), [])

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[TOWN.x, TOWN.y, TOWN.z]}
        raycast={() => null}
        receiveShadow
      >
        <circleGeometry args={[TOWN.r, 64]} />
        <meshStandardMaterial color={TOWN.ground} roughness={1} />
      </mesh>

      {/* A stone green in the middle, so the town reads as a place and not as
          five houses standing in a field. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[TOWN.x, TOWN.y + 0.001, TOWN.z]}
        raycast={() => null}
        receiveShadow
      >
        <circleGeometry args={[11, 32]} />
        <primitive object={pathMat} attach="material" />
      </mesh>

      {HOUSES.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]}>
          <mesh
            geometry={wallGeo}
            position={[0, b.h / 2, 0]}
            scale={[b.hw * 2, b.h, b.hd * 2]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={b.wall} flatShading roughness={1} />
          </mesh>
          <mesh
            geometry={roofGeo}
            position={[0, b.h + Math.max(b.hw, b.hd) * 0.62, 0]}
            rotation={[0, Math.PI / 4, 0]}
            scale={[Math.max(b.hw, b.hd) * 1.62, Math.max(b.hw, b.hd) * 1.24, Math.max(b.hw, b.hd) * 1.62]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={b.roof} flatShading roughness={1} />
          </mesh>
          {/* Door on the face that looks at the green, so the town faces inward. */}
          <mesh
            geometry={doorGeo}
            material={doorMat}
            position={[0, 0.95, b.z > TOWN.z ? -b.hd - 0.02 : b.hd + 0.02]}
            scale={[1.15, 1.9, 1]}
            castShadow
          />
        </group>
      ))}

      <Scatter
        count={260}
        radius={TOWN.r - 2}
        center={[TOWN.x, TOWN.z]}
        seed={828}
        geometry={grassGeo}
        material={grassMat}
        scaleRange={[0.6, 1.2]}
        yOffset={0.17}
      />

      {/* Hedges where the town borders open country — dropped at the doorway. */}
      {hedges.map((h, i) => (
        <mesh key={i} position={[h.x, 0.5, h.z]} rotation={[0, h.a, 0]} castShadow receiveShadow>
          <boxGeometry args={[4.6, 1.0, 1.0]} />
          <meshStandardMaterial color="#4E7A45" flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  )
}
