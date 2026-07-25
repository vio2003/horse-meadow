import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The trust meter, rendered in 3D above the horse rather than in the HUD.
 *
 * Two reasons. First, a six-year-old shouldn't have to split attention between
 * a horse and a bar in the corner — the feedback belongs on the thing she's
 * looking at. Second, it means trust can update every frame without ever
 * touching React state.
 */

const COUNT = 8

const heartGeometry = (() => {
  const s = new THREE.Shape()
  const x = 0
  const y = 0
  s.moveTo(x + 5, y + 5)
  s.bezierCurveTo(x + 5, y + 5, x + 4, y, x, y)
  s.bezierCurveTo(x - 6, y, x - 6, y + 7, x - 6, y + 7)
  s.bezierCurveTo(x - 6, y + 11, x - 3, y + 15.4, x + 5, y + 19)
  s.bezierCurveTo(x + 12, y + 15.4, x + 16, y + 11, x + 16, y + 7)
  s.bezierCurveTo(x + 16, y + 7, x + 16, y, x + 10, y)
  s.bezierCurveTo(x + 7, y, x + 5, y + 5, x + 5, y + 5)
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 2,
    bevelEnabled: true,
    bevelSize: 1,
    bevelThickness: 1,
    bevelSegments: 1,
    curveSegments: 5,
  })
  g.center()
  g.rotateZ(Math.PI)
  g.scale(0.012, 0.012, 0.012)
  return g
})()

const FILLED = new THREE.MeshStandardMaterial({
  color: '#E4557A',
  emissive: '#8E1F3C',
  emissiveIntensity: 0.45,
  roughness: 0.35,
})
const EMPTY = new THREE.MeshStandardMaterial({
  color: '#F3E4E9',
  transparent: true,
  opacity: 0.32,
  roughness: 0.9,
})

const TrustHearts = forwardRef(function TrustHearts(_, ref) {
  const group = useRef()
  const hearts = useRef([])
  const state = useRef({ trust: 0, show: false, opacity: 0 })

  useImperativeHandle(ref, () => ({
    setTrust(trust, show) {
      state.current.trust = trust
      state.current.show = show
    },
  }))

  const slots = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const spread = 1.9
        const t = COUNT === 1 ? 0.5 : i / (COUNT - 1)
        return {
          x: (t - 0.5) * spread,
          y: Math.sin(t * Math.PI) * 0.16,
        }
      }),
    []
  )

  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const st = state.current
    const goal = st.show ? 1 : 0
    st.opacity += (goal - st.opacity) * (1 - Math.exp(-7 * dt))

    group.current.visible = st.opacity > 0.02
    if (!group.current.visible) return

    // Always face the camera.
    group.current.quaternion.copy(s.camera.quaternion)
    group.current.scale.setScalar(0.8 + st.opacity * 0.2)

    const filled = st.trust * COUNT
    for (let i = 0; i < COUNT; i++) {
      const h = hearts.current[i]
      if (!h) continue
      const isOn = i < filled
      h.material = isOn ? FILLED : EMPTY
      // The heart that's currently filling gets a little pulse.
      const partial = filled - i
      const pop = isOn && partial < 1 ? 1 + Math.sin(s.clock.elapsedTime * 8) * 0.14 : 1
      h.scale.setScalar((isOn ? 1 : 0.72) * pop * st.opacity)
      h.position.y = slots[i].y + (isOn ? Math.sin(s.clock.elapsedTime * 2 + i) * 0.03 : 0)
    }
  })

  return (
    <group ref={group} position={[0, 3.0, 0]}>
      {slots.map((slot, i) => (
        <mesh
          key={i}
          ref={(el) => (hearts.current[i] = el)}
          position={[slot.x, slot.y, 0]}
          geometry={heartGeometry}
          material={EMPTY}
        />
      ))}
    </group>
  )
})

export default TrustHearts
