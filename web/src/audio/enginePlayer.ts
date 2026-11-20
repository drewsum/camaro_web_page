// Engine sound for the 540, played from loops rendered offline with
// engine-sim (see tools/engine-sim/README.md). Each loop is the engine held
// on the dyno at one rpm and one throttle: wide open ("on"), a light cruise
// ("mid") and closed throttle ("off", the overrun burble). For any rpm and
// throttle the player blends the two nearest rpm loops of the two nearest
// throttle layers, pitch-shifted to the exact rpm, so the sound follows the
// engine continuously. Below the lowest loop it fades into a free-running
// idle recording.
//
// Each loop file holds the loop twice back to back; playback loops a
// one-period window inside it, so MP3 encoder padding never lands in the loop.

const BASE = "/audio/engine/";

interface Clip {
  rpm?: number;
  layer: "on" | "mid" | "off" | "idle" | "start";
  period: number | null; // loop length in seconds (null: one-shot)
  level: number; // dB, the clip's loudness before it was normalised
}
type Manifest = Record<string, Clip>;

const LAYERS = ["off", "mid", "on"] as const;
const IDLE_RPM = 920;
// How much of the rendered loudness range to keep. engine-sim's level spans
// ~40 dB from a light-throttle 1000 rpm to wide open at 5000; 0.4 keeps the
// character (louder under load and with revs) without the extremes.
const LEVEL_DEPTH = 0.4;
const SMOOTH = 0.03; // s, parameter smoothing at the audio rate

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  base: number; // rpm the loop was recorded at
  idleSince: number; // ctx time the voice went silent, or -1
}

class EnginePlayer {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private manifest: Manifest | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<string, Voice>();
  private loading: Promise<void> | null = null;
  private rpms: number[] = []; // loop rpms, ascending
  private refLevel = 0;
  private startedAt = -1; // ctx time the start-up clip began
  private startLength = 0;
  enabled = false;

  // Must be called from a user gesture (the browser's autoplay policy).
  async enable() {
    this.enabled = true;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.2;
      this.tone = this.ctx.createBiquadFilter();
      this.tone.type = "lowpass";
      this.tone.frequency.value = 18000;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(this.tone).connect(comp).connect(this.ctx.destination);
    }
    await this.ctx.resume();
    try {
      await (this.loading ??= this.load());
    } catch (e) {
      this.loading = null; // try again next time
      throw e;
    }
    if (!this.enabled) return;
    this.out!.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.05);
    this.playStart();
  }

  disable() {
    this.enabled = false;
    if (!this.ctx || !this.out) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    for (const key of [...this.voices.keys()]) this.stopVoice(key, t + 0.3);
    this.startedAt = -1;
  }

  private async load() {
    const ctx = this.ctx!;
    const manifest = (await (await fetch(BASE + "manifest.json")).json()) as Manifest;
    const entries = Object.entries(manifest);
    await Promise.all(
      entries.map(async ([key]) => {
        const data = await (await fetch(`${BASE}${key}.mp3`)).arrayBuffer();
        this.buffers.set(key, await ctx.decodeAudioData(data));
      }),
    );
    this.refLevel = Math.max(...entries.map(([, c]) => c.level));
    this.rpms = [...new Set(entries.flatMap(([, c]) => (c.layer === "on" && c.rpm ? [c.rpm] : [])))].sort((a, b) => a - b);
    this.manifest = manifest;
  }

  private levelGain(key: string) {
    const c = this.manifest![key];
    return 10 ** (((c.level - this.refLevel) * LEVEL_DEPTH) / 20);
  }

  private playStart() {
    const ctx = this.ctx!;
    const buffer = this.buffers.get("start");
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = this.levelGain("start");
    src.connect(g).connect(this.out!);
    src.start();
    this.startedAt = ctx.currentTime;
    this.startLength = buffer.duration;
  }

  private voice(key: string): Voice | null {
    const existing = this.voices.get(key);
    if (existing) return existing;
    const ctx = this.ctx!;
    const buffer = this.buffers.get(key);
    const clip = this.manifest?.[key];
    if (!buffer || !clip?.period) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = clip.period * 0.5;
    src.loopEnd = src.loopStart + clip.period;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.out!);
    // Start at a random point in the loop so voices never phase together.
    src.start(0, src.loopStart + Math.random() * clip.period);
    const v = { src, gain, base: clip.rpm ?? IDLE_RPM, idleSince: -1 };
    this.voices.set(key, v);
    return v;
  }

  private stopVoice(key: string, when: number) {
    const v = this.voices.get(key);
    if (!v) return;
    v.gain.gain.setTargetAtTime(0, this.ctx!.currentTime, SMOOTH);
    v.src.stop(when);
    this.voices.delete(key);
  }

  // rpm: engine speed; throttle 0..1; distance: camera to car in metres.
  update(rpm: number, throttle: number, distance: number) {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.manifest) return;
    const t = ctx.currentTime;
    const rpms = this.rpms;

    const weights = new Map<string, number>();
    const add = (key: string, w: number) => w > 1e-3 && weights.set(key, (weights.get(key) ?? 0) + w);

    // While the start-up clip plays, the loops stay silent; then fade in.
    const sinceStart = this.startedAt < 0 ? Infinity : t - this.startedAt;
    const running = Math.min(1, Math.max(0, (sinceStart - (this.startLength - 0.35)) / 0.35));

    // Idle recording below the lowest loop, crossfading up to it.
    const lo = rpms[0];
    const idleMix = Math.min(1, Math.max(0, (lo + 50 - rpm) / 250)) * (1 - Math.min(1, throttle * 2));
    add("idle", running * idleMix);

    const r = Math.min(Math.max(rpm, lo), rpms[rpms.length - 1]);
    let i = 0;
    while (i < rpms.length - 2 && rpms[i + 1] <= r) i++;
    const f = (r - rpms[i]) / (rpms[i + 1] - rpms[i]);
    // Throttle to layer: closed → off, 0.25 → mid, wide open → on.
    const lt = Math.min(Math.max(throttle, 0), 1);
    const lf = lt < 0.25 ? lt / 0.25 : 1 + (lt - 0.25) / 0.75;
    const li = Math.min(Math.floor(lf), 1);
    const lw = lf - li;
    const rest = running * (1 - idleMix);
    const pairs: [string, number][] = [
      [LAYERS[li], 1 - lw],
      [LAYERS[li + 1], lw],
    ];
    for (const [layer, wl] of pairs) {
      // Equal-power across rpm (neighbouring loops aren't phase-coherent).
      add(`${layer}_${rpms[i]}`, rest * wl * Math.cos((f * Math.PI) / 2));
      add(`${layer}_${rpms[i + 1]}`, rest * wl * Math.sin((f * Math.PI) / 2));
    }

    // Distance: quieter and duller further from the car.
    const near = Math.min(1, 7 / Math.max(distance, 1));
    this.out!.gain.setTargetAtTime(0.9 * near ** 0.8, t, 0.1);
    this.tone!.frequency.setTargetAtTime(2500 + 15500 * near, t, 0.1);

    const rate = (v: Voice) => Math.max(rpm, 300) / v.base;
    for (const [key, w] of weights) {
      const v = this.voice(key);
      if (!v) continue;
      v.idleSince = -1;
      v.gain.gain.setTargetAtTime(w * this.levelGain(key), t, SMOOTH);
      v.src.playbackRate.setTargetAtTime(rate(v), t, SMOOTH);
    }
    // Silence voices that dropped out; stop them once they've been quiet.
    for (const [key, v] of this.voices) {
      if (weights.has(key)) continue;
      v.gain.gain.setTargetAtTime(0, t, SMOOTH);
      v.src.playbackRate.setTargetAtTime(rate(v), t, SMOOTH);
      if (v.idleSince < 0) v.idleSince = t;
      else if (t - v.idleSince > 1) this.stopVoice(key, t + 0.2);
    }
  }
}

export const enginePlayer = new EnginePlayer();
