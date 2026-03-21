import { useGameStore } from '../game/store'
import {
  createDiceRattle,
  createCrowdCheer,
  createCrowdGroan,
  createWhistle,
  createCrowdGasp,
  createGunshot,
  type SoundCleanup,
} from './procedural'

type SoundType = 'diceRattle' | 'crowdCheer' | 'crowdGroan' | 'whistle' | 'crowdGasp' | 'gunshot'

class AudioManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private activeSounds: Map<SoundType, SoundCleanup> = new Map()

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.masterGain = this.ctx.createGain()
      this.masterGain.connect(this.ctx.destination)
    }
    // Resume if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  private getDest(): GainNode {
    this.getContext()
    const { soundVolume } = useGameStore.getState().settings
    this.masterGain!.gain.value = soundVolume
    return this.masterGain!
  }

  private isEnabled(): boolean {
    return useGameStore.getState().settings.soundEnabled
  }

  private stopSound(type: SoundType) {
    const cleanup = this.activeSounds.get(type)
    if (cleanup) {
      cleanup()
      this.activeSounds.delete(type)
    }
  }

  private play(type: SoundType, creator: (ctx: AudioContext, dest: GainNode) => SoundCleanup) {
    if (!this.isEnabled()) return
    this.stopSound(type)
    const ctx = this.getContext()
    const dest = this.getDest()
    const cleanup = creator(ctx, dest)
    this.activeSounds.set(type, cleanup)
  }

  playDiceRattle(duration?: number) {
    if (!this.isEnabled()) return
    this.stopSound('diceRattle')
    const ctx = this.getContext()
    const dest = this.getDest()
    const cleanup = createDiceRattle(ctx, dest, duration)
    this.activeSounds.set('diceRattle', cleanup)
  }

  playCrowdCheer() {
    this.play('crowdCheer', createCrowdCheer)
  }

  playCrowdGroan() {
    this.play('crowdGroan', createCrowdGroan)
  }

  playWhistle() {
    this.play('whistle', createWhistle)
  }

  playCrowdGasp() {
    this.play('crowdGasp', createCrowdGasp)
  }

  playGunshot() {
    this.play('gunshot', createGunshot)
  }

  stopAll() {
    for (const [type] of this.activeSounds) {
      this.stopSound(type)
    }
  }
}

export const audioManager = new AudioManager()
