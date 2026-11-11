// SPDX-License-Identifier: Apache-2.0
import { seededRandom, clamp } from '../vendor/vanillajs/modules/math/index.js';
import { createSound2D } from '../vendor/vanillajs/modules/audio2d/index.js';
import '../vendor/sonification/APP/js/namespace.js';
import '../vendor/sonification/APP/js/math64.js';
import '../vendor/sonification/APP/js/synthesis.js';
globalThis.Arcade = { rng: seededRandom, clamp, V2D: { createSound2D } };
await import('../vendor/arcade/js/audio.js');

export class Soundscape {
  constructor() { this.effects = new globalThis.Arcade.Audio(); this.enabled = false; this.notes = new Map(); this.timer = null; this.part = 0; this.score = []; this.sources = new Set(); }
  setScore(score) { this.score = score; this.part = 0; this.stopMusic(); }
  async toggle() {
    this.enabled = !this.enabled;
    this.effects.setEnabled(this.enabled);
    if (this.enabled) {
      await this.effects.ctx?.resume();
      if (!this.effects.ctx || this.effects.ctx.state !== 'running') { this.enabled = false; this.effects.setEnabled(false); throw new Error('Audio is unavailable in this browser.'); }
      this.play(); this.effects.effect('select');
    } else this.stopMusic();
    return this.enabled;
  }
  effect(name = 'select') { if (!document.hidden && this.enabled) this.effects.effect(name); }
  stopMusic() { clearTimeout(this.timer); this.timer = null; for (const source of this.sources) { try { source.stop(); } catch {} } this.sources.clear(); }
  suspend() { this.stopMusic(); this.effects.suspend(); }
  resume() { if (this.enabled) { this.effects.unlock(); this.play(); } }
  play() {
    if (!this.enabled || document.hidden || this.timer || !this.score.length || this.effects.ctx?.state !== 'running') return;
    const ctx = this.effects.ctx, note = this.score[this.part++ % this.score.length];
    const key = `${note.note}/${note.duration}/${ctx.sampleRate}`;
    if (!this.notes.has(key)) {
      if (this.notes.size >= 32) this.notes.delete(this.notes.keys().next().value);
      const samples = globalThis.QSOLIMC.Synthesis.fm({ frequencyHz: 440 * 2 ** ((note.note - 69) / 12), durationSeconds: note.duration, velocity: .15, sampleRate: ctx.sampleRate, seed: BigInt(note.note) });
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate); buffer.getChannelData(0).set(samples); this.notes.set(key, buffer);
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = this.notes.get(key); gain.gain.value = .35; source.connect(gain); gain.connect(ctx.destination); this.sources.add(source);
    source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); }; source.start();
    this.timer = setTimeout(() => { this.timer = null; this.play(); }, note.duration * 1000);
  }
}
