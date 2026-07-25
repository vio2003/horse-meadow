import { useState } from 'react'
import { useGame, NAME_CARDS, COATS } from '../store'
import { blip, nicker } from '../audio'

/**
 * Naming is the reward, not the taming.
 *
 * She can't reliably read or type yet, so a name is chosen by tapping a
 * picture: tap the star, the horse is called Star. The word sits under the
 * picture, which means she picks up the reading incidentally instead of being
 * blocked by it. There's no keyboard anywhere in this game.
 */
export default function NameHorse() {
  const id = useGame((s) => s.namingHorse)
  const horses = useGame((s) => s.horses)
  const nameHorse = useGame((s) => s.nameHorse)
  const recolor = useGame((s) => s.recolor)
  const close = useGame((s) => s.closeNaming)
  const [step, setStep] = useState('name')

  if (!id) return null
  const horse = horses.find((h) => h.id === id)
  if (!horse) return null

  return (
    <div className="sheet">
      <div className="card">
        {step === 'name' ? (
          <>
            <h1>You have a new friend!</h1>
            <p>Pick a name for your horse.</p>
            <div className="grid">
              {NAME_CARDS.map((c) => (
                <button
                  key={c.name}
                  className="pick"
                  onClick={() => {
                    nameHorse(id, c.name)
                    nicker()
                    setStep('color')
                  }}
                >
                  <span aria-hidden style={{ fontSize: 40 }}>
                    {c.icon}
                  </span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1>{horse.name}</h1>
            <h2>Choose a colour</h2>
            <div className="swatches">
              {COATS.map((c, i) => (
                <button
                  key={c.id}
                  className="swatch"
                  aria-label={c.label}
                  aria-pressed={horse.coat === i}
                  style={{ background: c.coat }}
                  onClick={() => {
                    recolor(id, i)
                    blip(880)
                  }}
                />
              ))}
            </div>
            <button
              className="tack tack--wide"
              onClick={() => {
                close()
                setStep('name')
                blip(660)
              }}
            >
              <span aria-hidden>🐴</span>
              Go and ride
            </button>
            <p className="hint">Tap {horse.name} to climb on.</p>
          </>
        )}
      </div>
    </div>
  )
}
