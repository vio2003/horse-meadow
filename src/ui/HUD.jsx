import { useEffect } from 'react'
import { useGame } from '../store'
import { world } from '../world/shared'
import { STALL_COUNT } from '../world/buildings'
import { blip, nicker, sparkle } from '../audio'

/**
 * Two verbs, both wordless. The controls only exist when they'd do something,
 * so there is never a button on screen that does nothing when pressed — which
 * is the main way small children conclude a game is broken.
 */
export default function HUD() {
  const nearHorse = useGame((s) => s.nearHorse)
  const nearStable = useGame((s) => s.nearStable)
  const mounted = useGame((s) => s.mounted)
  const horses = useGame((s) => s.horses)
  const dismount = useGame((s) => s.dismount)
  const stableHorse = useGame((s) => s.stableHorse)

  const near = horses.find((h) => h.id === nearHorse)
  const canTame = !!near && !near.tamed && !mounted
  const tamedList = horses.filter((h) => h.tamed && h.name)
  const stallsFree = horses.filter((h) => h.stall !== null).length < STALL_COUNT
  const canStable = !!mounted && nearStable && stallsFree

  // If the brush is held and she walks away, don't leave it stuck on.
  useEffect(() => {
    if (!canTame) world.brushing = false
  }, [canTame])

  const holdBrush = (on) => (e) => {
    e.preventDefault()
    world.brushing = on
    e.currentTarget.classList.toggle('held', on)
    if (on) blip(520)
  }

  return (
    <div className="layer">
      {tamedList.length > 0 && (
        <div className="stable">
          <span aria-hidden>🐴</span>
          <strong>{tamedList.length}</strong>
          <span className="stable-names">
            {tamedList.map((h) => h.name).join(' · ')}
          </span>
        </div>
      )}

      <div className="dock">
        <div className={`dock-item ${canTame ? 'show' : ''}`}>
          <button
            className="tack"
            aria-label="Give the horse an apple"
            onClick={() => {
              world.feedPulse++
              blip(760)
            }}
          >
            <span aria-hidden>🍎</span>
          </button>
        </div>

        <div className={`dock-item ${canTame ? 'show' : ''}`}>
          <button
            className="tack"
            aria-label="Brush the horse"
            onPointerDown={holdBrush(true)}
            onPointerUp={holdBrush(false)}
            onPointerLeave={holdBrush(false)}
            onPointerCancel={holdBrush(false)}
          >
            <span aria-hidden>🧽</span>
          </button>
        </div>

        {/* Sits next to "Hop down" inside the stable, which is how she learns
            the difference: hop down and the horse follows you around, tap this
            and it stays put — today, and tomorrow when she opens the app. */}
        <div className={`dock-item ${canStable ? 'show' : ''}`}>
          <button
            className="tack tack--wide"
            aria-label="Leave the horse in the stable"
            onClick={() => {
              stableHorse(mounted)
              world.moveTarget = null
              sparkle()
              nicker()
            }}
          >
            <span aria-hidden>🏡</span>
            Stay here
          </button>
        </div>

        <div className={`dock-item ${mounted ? 'show' : ''}`}>
          <button
            className="tack tack--wide"
            onClick={() => {
              dismount()
              world.moveTarget = null
              blip(440)
            }}
          >
            <span aria-hidden>🧍</span>
            Hop down
          </button>
        </div>
      </div>
    </div>
  )
}
