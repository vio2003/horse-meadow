import { Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import PlayerModel from '../world/PlayerModel'
import { useGame, CHARACTERS } from '../store'
import { blip } from '../audio'

/**
 * Who she wants to be, chosen the same way she names a horse: by tapping the
 * picture, with the word underneath so the reading comes along for free.
 *
 * The three are rendered live rather than as thumbnails, because she should see
 * the girl she's picking — standing there, breathing, in the round. It costs a
 * second WebGL context, but only on the start screen, and it goes away the
 * moment she taps play.
 *
 * She can tap the girl or tap the word; both work, because a six-year-old will
 * try the girl first and be right to.
 */

/** PlayerModel reads this every frame. Standing still, not riding — so: Idle. */
const STILL = { current: { speed: 0, mounted: false } }

function Choice({ spec, x, width, selected, onPick }) {
  return (
    <group
      position={[x, 0, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onPick(spec.id)
      }}
    >
      <Suspense fallback={null}>
        <PlayerModel character={spec.id} anim={STILL} />
      </Suspense>

      {/* The tap target. A box she can't miss, rather than the skinned mesh —
          raycasting a rig is both slower and fussier about where you hit it.
          Exactly one column wide, so each girl owns her own third of the strip
          and there is no dead ground between them to tap into. */}
      <mesh position={[0, 0.7, 0]} visible={false}>
        <boxGeometry args={[width, 1.6, 1.0]} />
      </mesh>

      {/* Which one is hers, right now. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={selected}>
        <ringGeometry args={[0.3, 0.39, 28]} />
        <meshBasicMaterial color="#E4557A" transparent opacity={0.95} />
      </mesh>
    </group>
  )
}

/**
 * Lays the three out across the canvas, spaced by a third of whatever is
 * actually visible. The words below are a three-column grid of the same width,
 * so deriving the spacing from the viewport rather than hardcoding it keeps
 * each girl standing over her own word on any screen shape — which a fixed
 * number does not, once the canvas is allowed to change size.
 */
function Row({ character, onPick }) {
  const { viewport } = useThree()
  const step = viewport.width / 3

  return (
    <group position={[0, -0.62, 0]}>
      {CHARACTERS.map((c, i) => (
        <Choice
          key={c.id}
          spec={c}
          x={(i - (CHARACTERS.length - 1) / 2) * step}
          width={step}
          selected={c.id === character}
          onPick={onPick}
        />
      ))}
    </group>
  )
}

export default function CharacterPicker() {
  const character = useGame((s) => s.character)
  const chooseCharacter = useGame((s) => s.chooseCharacter)

  const pick = (id) => {
    chooseCharacter(id)
    blip(880)
  }

  return (
    // Picking is not playing. Without this, choosing a girl would start the
    // game out from under her — the whole start screen is one big tap target.
    <div className="picker" onClick={(e) => e.stopPropagation()}>
      <div className="picker-stage">
        {/* Camera pulled in close: she has to be able to tell the three apart
            at a glance, and from arm's length on an iPad. */}
        <Canvas
          dpr={[1, 2]}
          camera={{ fov: 34, near: 0.1, far: 20, position: [0, 0.6, 2.8] }}
          gl={{ antialias: true, alpha: true }}
        >
          <hemisphereLight args={['#CFE9F6', '#5F9E52', 1.45]} />
          <directionalLight position={[3, 6, 4]} intensity={1.5} color="#FFF3D6" />
          <Row character={character} onPick={pick} />
        </Canvas>
      </div>

      <div className="picker-names">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            className={`picker-name ${c.id === character ? 'on' : ''}`}
            aria-pressed={c.id === character}
            onClick={() => pick(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}
