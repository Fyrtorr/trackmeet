// Procedural sound generators for Track Meet
// Each function creates and starts audio nodes, returning a cleanup function

export type SoundCleanup = () => void

function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

/** Short noise bursts at ~12Hz rate, highpass ~2kHz */
export function createDiceRattle(
  ctx: AudioContext,
  dest: AudioNode,
  duration: number = 0.8
): SoundCleanup {
  const burstRate = 12
  const burstDuration = 0.025
  const sources: AudioBufferSourceNode[] = []
  const numBursts = Math.floor(duration * burstRate)

  for (let i = 0; i < numBursts; i++) {
    const startTime = ctx.currentTime + i / burstRate
    const buffer = createNoiseBuffer(ctx, burstDuration)
    const source = ctx.createBufferSource()
    source.buffer = buffer

    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 2000

    const gain = ctx.createGain()
    // Vary amplitude slightly for organic feel
    gain.gain.value = 0.3 + Math.random() * 0.2

    source.connect(highpass)
    highpass.connect(gain)
    gain.connect(dest)

    source.start(startTime)
    source.stop(startTime + burstDuration)
    sources.push(source)
  }

  return () => {
    for (const s of sources) {
      try { s.stop() } catch { /* already stopped */ }
    }
  }
}

/** Filtered noise bandpass ~800Hz, slow attack, ~1.5s sustain */
export function createCrowdCheer(
  ctx: AudioContext,
  dest: AudioNode
): SoundCleanup {
  const duration = 1.5
  const buffer = createNoiseBuffer(ctx, duration)
  const source = ctx.createBufferSource()
  source.buffer = buffer

  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = 800
  bandpass.Q.value = 0.8

  // Slight pitch modulation for "roar" feel
  const bandpass2 = ctx.createBiquadFilter()
  bandpass2.type = 'bandpass'
  bandpass2.frequency.value = 1200
  bandpass2.Q.value = 1.0

  const gain = ctx.createGain()
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.4, now + 0.3) // slow attack
  gain.gain.setValueAtTime(0.4, now + 0.8)
  gain.gain.linearRampToValueAtTime(0, now + duration) // fade out

  source.connect(bandpass)
  bandpass.connect(bandpass2)
  bandpass2.connect(gain)
  gain.connect(dest)

  source.start()
  source.stop(ctx.currentTime + duration)

  return () => {
    try { source.stop() } catch { /* already stopped */ }
  }
}

/** Lower-pitched filtered noise ~300Hz, descending pitch, ~1s */
export function createCrowdGroan(
  ctx: AudioContext,
  dest: AudioNode
): SoundCleanup {
  const duration = 1.0
  const buffer = createNoiseBuffer(ctx, duration)
  const source = ctx.createBufferSource()
  source.buffer = buffer

  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.setValueAtTime(400, ctx.currentTime)
  bandpass.frequency.linearRampToValueAtTime(200, ctx.currentTime + duration) // descending
  bandpass.Q.value = 1.5

  const gain = ctx.createGain()
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.35, now + 0.1)
  gain.gain.linearRampToValueAtTime(0, now + duration)

  source.connect(bandpass)
  bandpass.connect(gain)
  gain.connect(dest)

  source.start()
  source.stop(ctx.currentTime + duration)

  return () => {
    try { source.stop() } catch { /* already stopped */ }
  }
}

/** Sine oscillator ~3kHz, quick attack, 0.3s, slight vibrato */
export function createWhistle(
  ctx: AudioContext,
  dest: AudioNode
): SoundCleanup {
  const duration = 0.3
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 3000

  // Vibrato via LFO
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 8
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 30 // vibrato depth in Hz
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)

  const gain = ctx.createGain()
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.25, now + 0.02) // quick attack
  gain.gain.setValueAtTime(0.25, now + 0.2)
  gain.gain.linearRampToValueAtTime(0, now + duration)

  osc.connect(gain)
  gain.connect(dest)

  osc.start()
  lfo.start()
  osc.stop(ctx.currentTime + duration)
  lfo.stop(ctx.currentTime + duration)

  return () => {
    try { osc.stop() } catch { /* already stopped */ }
    try { lfo.stop() } catch { /* already stopped */ }
  }
}

/** Sharp noise burst, bandpass ~1.5kHz, fast attack, 0.5s */
export function createCrowdGasp(
  ctx: AudioContext,
  dest: AudioNode
): SoundCleanup {
  const duration = 0.5
  const buffer = createNoiseBuffer(ctx, duration)
  const source = ctx.createBufferSource()
  source.buffer = buffer

  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = 1500
  bandpass.Q.value = 1.0

  const gain = ctx.createGain()
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.45, now + 0.03) // fast attack
  gain.gain.linearRampToValueAtTime(0, now + duration)

  source.connect(bandpass)
  bandpass.connect(gain)
  gain.connect(dest)

  source.start()
  source.stop(ctx.currentTime + duration)

  return () => {
    try { source.stop() } catch { /* already stopped */ }
  }
}

/** White noise burst, bandpass 1kHz, 0.15s — migrated from sounds.ts */
export function createGunshot(
  ctx: AudioContext,
  dest: AudioNode
): SoundCleanup {
  const duration = 0.15
  const bufferSize = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    const envelope = Math.exp(-i / (bufferSize * 0.08))
    data[i] = (Math.random() * 2 - 1) * envelope
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1000
  filter.Q.value = 0.5

  const gain = ctx.createGain()
  gain.gain.value = 0.6

  source.connect(filter)
  filter.connect(gain)
  gain.connect(dest)

  source.start()
  source.stop(ctx.currentTime + duration)

  return () => {
    try { source.stop() } catch { /* already stopped */ }
  }
}
