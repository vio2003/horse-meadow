import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from './store'
import Meadow from './world/Meadow'
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
      <fog attach="fog" args={['#B9DCF0', 55, 115]} />

      {/* Hemisphere light does most of the work: sky above, grass bounce below.
          It's one light, it's cheap, and it flatters flat shading. It also fills
          in everything the sun can't reach, so a shadow is never a black hole
          she loses a horse in. */}
      <hemisphereLight args={['#CFE9F6', '#5F9E52', 1.25]} />
      <Sunlight />

      <FollowCamera />
      <Meadow />
      <Castle />
      <Stable />
      <Player />
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
          />
        ))}
      </Suspense>
    </>
  )
}

export default function App() {
  const started = useGame((s) => s.started)

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
        camera={{ fov: 46, near: 0.5, far: 220, position: [0, 11, 18] }}
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
