import { useGame } from '../store'
import { unlockAudio, whinny } from '../audio'

/**
 * iOS refuses to start an AudioContext outside a user gesture, so a game with
 * sound needs a tap before it begins whether you want one or not. Might as
 * well make it the title card.
 */
export default function StartScreen() {
  const start = useGame((s) => s.start)
  const horses = useGame((s) => s.horses)
  const tamed = horses.filter((h) => h.tamed).length

  return (
    <div
      className="start"
      onClick={() => {
        unlockAudio()
        whinny()
        start()
      }}
    >
      <div className="start-inner">
        <div style={{ fontSize: 'clamp(70px, 15vw, 150px)' }} aria-hidden>
          🐴
        </div>
        <h1>Horse Meadow</h1>
        <p>
          {tamed > 0
            ? `${tamed} ${tamed === 1 ? 'horse is' : 'horses are'} waiting for you`
            : 'Walk slowly. Horses are shy.'}
        </p>
        <button className="tack tack--wide">
          <span aria-hidden>▶</span>
          Tap to play
        </button>
      </div>
    </div>
  )
}
