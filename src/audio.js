/**
 * Every sound here is synthesized at runtime. No audio files to download, host,
 * or license, and the whole game still works on a plane with no signal.
 *
 * These are placeholders in spirit — if you want a real whinny, drop an mp3 in
 * /public and swap out whinny() for an <audio> play call. But they're good
 * enough that you won't be embarrassed on Saturday.
 */

let ctx = null

/** iOS will not start audio outside a user gesture. Called from the start screen. */
export function unlockAudio() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  // A silent blip is what actually convinces Safari the context is live.
  const b = ctx.createBuffer(1, 1, 22050)
  const s = ctx.createBufferSource()
  s.buffer = b
  s.connect(ctx.destination)
  s.start(0)
  return ctx
}

function env(node, { attack = 0.01, decay = 0.2, peak = 0.3, at = 0 }) {
  const t = ctx.currentTime + at
  node.gain.setValueAtTime(0.0001, t)
  node.gain.exponentialRampToValueAtTime(peak, t + attack)
  node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function noiseBuffer(seconds = 0.3) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

/** A single hoof landing. Called on a timer while anything is moving. */
export function hoofstep(volume = 0.12) {
  if (!ctx) return
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(0.12)
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.value = 190 + Math.random() * 90
  filt.Q.value = 2.5
  const g = ctx.createGain()
  src.connect(filt).connect(g).connect(ctx.destination)
  env(g, { attack: 0.004, decay: 0.09, peak: volume })
  src.start()
  src.stop(ctx.currentTime + 0.14)
}

/** Low, friendly rumble. The horse likes you. */
export function nicker() {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  const lfo = ctx.createOscillator()
  const lfoG = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.value = 118
  lfo.frequency.value = 22
  lfoG.gain.value = 30
  lfo.connect(lfoG).connect(osc.frequency)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.value = 700
  osc.connect(filt).connect(g).connect(ctx.destination)
  env(g, { attack: 0.03, decay: 0.45, peak: 0.16 })
  osc.start()
  lfo.start()
  osc.stop(ctx.currentTime + 0.55)
  lfo.stop(ctx.currentTime + 0.55)
}

/** The big one — a startled or delighted whinny. */
export function whinny() {
  if (!ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  const lfo = ctx.createOscillator()
  const lfoG = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(520, t)
  osc.frequency.exponentialRampToValueAtTime(300, t + 0.28)
  osc.frequency.exponentialRampToValueAtTime(165, t + 0.75)
  lfo.type = 'sine'
  lfo.frequency.value = 26
  lfoG.gain.value = 42
  lfo.connect(lfoG).connect(osc.frequency)
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.value = 1100
  filt.Q.value = 1.1
  osc.connect(filt).connect(g).connect(ctx.destination)
  env(g, { attack: 0.02, decay: 0.72, peak: 0.2 })
  osc.start()
  lfo.start()
  osc.stop(t + 0.85)
  lfo.stop(t + 0.85)
}

/** Crunch of an apple. */
export function munch() {
  if (!ctx) return
  for (let i = 0; i < 3; i++) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer(0.1)
    const filt = ctx.createBiquadFilter()
    filt.type = 'highpass'
    filt.frequency.value = 1400
    const g = ctx.createGain()
    src.connect(filt).connect(g).connect(ctx.destination)
    env(g, { attack: 0.005, decay: 0.06, peak: 0.1, at: i * 0.13 })
    src.start(ctx.currentTime + i * 0.13)
    src.stop(ctx.currentTime + i * 0.13 + 0.12)
  }
}

/** Rising chime when a horse becomes yours. */
export function sparkle() {
  if (!ctx) return
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = f
    osc.connect(g).connect(ctx.destination)
    env(g, { attack: 0.01, decay: 0.5, peak: 0.13, at: i * 0.09 })
    osc.start(ctx.currentTime + i * 0.09)
    osc.stop(ctx.currentTime + i * 0.09 + 0.6)
  })
}

/** Soft tap feedback for UI buttons. */
export function blip(freq = 660) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(g).connect(ctx.destination)
  env(g, { attack: 0.005, decay: 0.11, peak: 0.09 })
  osc.start()
  osc.stop(ctx.currentTime + 0.15)
}
