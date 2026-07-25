import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from './store'
import { sparkle, whinny } from './audio'
import Meadow from './world/Meadow'
import Beach from './world/Beach'
import Town from './world/Town'
import Snow from './world/Snow'
import Castle from './world/Castle'
import Stable from './world/Stable'
import Sunlight from './world/Sunlight'
import Player from './world/Player'
import Horse from './world/Horse'
import FollowCamera from './world/FollowCamera'
import HUD from './ui/HUD'
import NameHorse from './ui/NameHorse'
import StartScreen from './ui/StartScreen'

function Scene() {
  const horses = useGame((s) => s.horses)
  return (
    <>
      <color attach="background" args={['#9AC7E8']} />
      {/* Sized for the whole world now, not one meadow. Near enough that the
          far side of a region still softens into the distance — which is what
          makes the place feel big — and far enough that riding toward the sea
          doesn't mean riding into a wall of haze. */}
      <fog attach="fog" args={['#B9DCF0', 90, 260]} />

      {/* Hemisphere light does most of the work: sky above, grass bounce below.
          It's one light, it's cheap, and it flatters flat shading. It also fills
          in everything the sun can't reach, so a shadow is never a black hole
          she loses a horse in. */}
      <hemisphereLight args={['#CFE9F6', '#5F9E52', 1.25]} />
      <Sunlight />

      <FollowCamera />
      <Meadow />
      <Beach />
      <Town />
      <Snow />
      <Castle />
      <Stable />
      {/* She loads a model too now, so she suspends like the horses do. Her own
          boundary keeps her download from holding up theirs, and vice versa. */}
      <Suspense fallback={null}>
        <Player />
      </Suspense>
      {/* The horses load a model, so they suspend. Their own boundary means the
          meadow, castle and stable draw immediately instead of the whole world
          waiting on a 1.1MB download. */}
      <Suspense fallback={null}>
        {horses.map((h) => (
          <Horse
            key={h.id}
            id={h.id}
            spawn={h.pos}
            coatIndex={h.coat}
            tamed={h.tamed}
            name={h.name}
            foal={h.foal}
          />
        ))}
      </Suspense>
    </>
  )
}

/**
 * The only thing in the game that happens on its own. One timer for the whole
 * meadow rather than a clock inside every horse; two seconds is plenty of
 * resolution for a five-minute wait, and it costs nothing when nothing is
 * growing — growUp() returns an empty list and leaves the store alone.
 */
function useGrowingUp() {
  const growUp = useGame((s) => s.growUp)
  useEffect(() => {
    const t = setInterval(() => {
      if (growUp().length > 0) {
        sparkle()
        whinny()
      }
    }, 2000)
    return () => clearInterval(t)
  }, [growUp])
}

export default function App() {
  const started = useGame((s) => s.started)
  useGrowingUp()

  return (
    <>
      <Canvas
        // Capping DPR at 2 keeps an iPad Pro from rendering 3x pixels for no
        // visible gain. This is the single biggest frame-rate lever on iOS.
        dpr={[1, 2]}
        // Soft = PCFSoftShadowMap. Hard-edged shadows would fight the rounded,
        // storybook look of everything else.
        shadows="soft"
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 46, near: 0.5, far: 460, position: [0, 11, 18] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
      >
        <Scene />
      </Canvas>

      {started && <HUD />}
      {started && <NameHorse />}
      {!started && <StartScreen />}
    </>
  )
}
