let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

export function playGunshot() {
  const ctx = getAudioContext()
  const duration = 0.15

  // White noise burst for the "crack"
  const bufferSize = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    // Sharp attack, fast decay
    const envelope = Math.exp(-i / (bufferSize * 0.08))
    data[i] = (Math.random() * 2 - 1) * envelope
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  // Bandpass to make it snappier
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1000
  filter.Q.value = 0.5

  const gain = ctx.createGain()
  gain.gain.value = 0.6

  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)

  source.start()
  source.stop(ctx.currentTime + duration)
}
