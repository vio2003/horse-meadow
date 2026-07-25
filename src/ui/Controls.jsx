import { useEffect, useRef } from 'react'
import { world } from '../world/shared'
import { stickAxis } from '../controls'
import { useGame } from '../store'
import { hoofstep } from '../audio'

/**
 * The advanced controls: a thumb stick bottom-left, jump and sprint
 * bottom-right, and the horse's wind wrapped around the sprint button.
 *
 * Two rules run through all of it.
 *
 * **Nothing here goes through React state.** The stick moves every frame under
 * her thumb and the stamina ring changes every frame while she gallops; putting
 * either through a re-render would cost more than the game does. shared.js says
 * this at the top and means it — the knob and the ring are written straight to
 * the DOM.
 *
 * **Every touch is tracked by pointerId.** She will hold the stick with one
 * thumb and sprint with the other, and a control that grabs whatever pointer
 * arrives will eat the other one's press. Each control captures its own and
 * ignores the rest. This is the part most likely to be wrong on a real iPad and
 * the least likely to show up on a desktop with one mouse.
 */

/** Half the travel of the stick, in px. Matches .stick in styles.css. */
const STICK_RADIUS = 56

function Joystick() {
  const base = useRef()
  const knob = useRef()
  const active = useRef(null)

  // Reset on unmount, or turning the controls off mid-push leaves her walking
  // into the sunset forever.
  useEffect(() => () => { world.moveAxis = { x: 0, z: 0, mag: 0 } }, [])

  const place = (e) => {
    const r = base.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const axis = stickAxis(dx, dy, STICK_RADIUS)
    world.moveAxis = axis
    // The knob follows the thumb, clamped to the rim.
    const len = Math.hypot(dx, dy) || 1
    const k = Math.min(1, STICK_RADIUS / len)
    knob.current.style.transform = `translate(${dx * k}px, ${dy * k}px)`
  }

  const release = () => {
    active.current = null
    world.moveAxis = { x: 0, z: 0, mag: 0 }
    knob.current.style.transform = 'translate(0px, 0px)'
  }

  return (
    <div
      ref={base}
      className="stick"
      onPointerDown={(e) => {
        if (active.current !== null) return
        active.current = e.pointerId
        // Capture is an optimisation — it keeps the stick tracking when her
        // thumb slides off the base. It is allowed to fail, and if it does the
        // stick must still work: claiming the pointer and *then* throwing would
        // latch active.current forever and kill the control outright.
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // no capture, still perfectly usable
        }
        place(e)
      }}
      onPointerMove={(e) => {
        if (active.current !== e.pointerId) return
        place(e)
      }}
      onPointerUp={(e) => {
        if (active.current !== e.pointerId) return
        release()
      }}
      onPointerCancel={(e) => {
        if (active.current !== e.pointerId) return
        release()
      }}
    >
      <div ref={knob} className="stick-knob" />
    </div>
  )
}

/**
 * The wind left in the horse, as an arc up the right-hand side of the button.
 *
 * Its own animation frame loop, reading world.stamina and writing the dash
 * straight to the circle. `pathLength=100` makes the dash arithmetic percentages
 * regardless of the actual radius, so the geometry can be retuned in CSS without
 * touching this.
 */
function StaminaRing() {
  const arc = useRef()
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const pct = Math.max(0, Math.min(1, world.stamina)) * 50
      // 50 of the 100 units is the right-hand half; the rest is the gap.
      arc.current?.setAttribute('stroke-dasharray', `${pct} 100`)
      arc.current?.classList.toggle('low', world.stamina < 0.25)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg className="wind" viewBox="0 0 100 100" aria-hidden>
      {/* The track it runs on, so the arc reads as "how much of what". */}
      <circle className="wind-track" cx="50" cy="50" r="44" pathLength="100"
        strokeDasharray="50 100" />
      <circle ref={arc} className="wind-arc" cx="50" cy="50" r="44" pathLength="100"
        strokeDasharray="0 100" />
    </svg>
  )
}

export default function Controls() {
  const mounted = useGame((s) => s.mounted)

  // Never leave sprint stuck on because she lifted her thumb off the edge.
  useEffect(() => () => { world.sprintHeld = false }, [])
  useEffect(() => { if (!mounted) world.sprintHeld = false }, [mounted])

  const sprint = useRef(null)
  const hold = (on) => (e) => {
    if (on) {
      if (sprint.current !== null) return
      sprint.current = e.pointerId
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // See the stick: capture is a convenience, not a requirement.
      }
    } else if (sprint.current !== e.pointerId) {
      return
    } else {
      sprint.current = null
    }
    world.sprintHeld = on
    e.currentTarget.classList.toggle('held', on)
  }

  return (
    <>
      <Joystick />

      <div className="actions">
        <button
          className="tack action"
          aria-label="Jump"
          onPointerDown={() => {
            world.jumpPulse++
            hoofstep(0.12)
          }}
        >
          <span aria-hidden>⤴</span>
        </button>

        {/* Sprint is the horse's, so it only exists while she's on one — the
            same rule the apple and brush buttons follow. A control that does
            nothing when pressed is how a child decides a game is broken. */}
        <div className={`dock-item ${mounted ? 'show' : ''}`}>
          <button
            className="tack action sprint"
            aria-label="Sprint"
            onPointerDown={hold(true)}
            onPointerUp={hold(false)}
            onPointerCancel={hold(false)}
          >
            <StaminaRing />
            <span aria-hidden>💨</span>
          </button>
        </div>
      </div>
    </>
  )
}
