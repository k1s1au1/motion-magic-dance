/** نظام صوت خفيف بالكامل عبر WebAudio (بدون ملفات) + نطق عربي للتعليمات */
class AudioSystem {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private beatTimer: number | null = null;
  enabled = true;

  private ac() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    this.ac();
  }

  tone(freq: number, dur = 0.12, type: OscillatorType = "sine", vol = 0.25, slide = 0) {
    if (!this.enabled) return;
    const ac = this.ac();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur + 0.02);
  }

  noise(dur = 0.18, vol = 0.3) {
    if (!this.enabled) return;
    const ac = this.ac();
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ac.createBufferSource();
    const g = ac.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g).connect(ac.destination);
    src.start();
  }

  hit(power = 1) {
    this.tone(180 + power * 120, 0.1, "square", 0.22, -120);
    this.noise(0.12, 0.22 * power);
  }
  perfect() {
    this.tone(880, 0.09, "triangle", 0.2);
    this.tone(1320, 0.12, "triangle", 0.16);
  }
  good() {
    this.tone(660, 0.09, "triangle", 0.18);
  }
  miss() {
    this.tone(160, 0.22, "sawtooth", 0.16, -60);
  }
  count(n: number) {
    this.tone(n === 0 ? 880 : 520, n === 0 ? 0.3 : 0.14, "triangle", 0.25);
  }

  /** موسيقى إيقاعية بسيطة متغيّرة حسب اللعبة */
  startMusic(bpm = 128, root = 110) {
    if (!this.enabled) return;
    this.stopMusic();
    const ac = this.ac();
    if (!ac) return;
    this.musicGain = ac.createGain();
    this.musicGain.gain.value = 0.12;
    this.musicGain.connect(ac.destination);
    const step = 60000 / bpm / 2;
    let i = 0;
    const scale = [0, 3, 5, 7, 10];
    this.beatTimer = window.setInterval(() => {
      const g = this.musicGain;
      const a = this.ctx;
      if (!g || !a) return;
      const kick = i % 4 === 0;
      const o = a.createOscillator();
      const eg = a.createGain();
      const semis = scale[(i * 3) % scale.length] ?? 0;
      o.type = kick ? "sine" : "square";
      o.frequency.setValueAtTime(kick ? root : root * 2 * Math.pow(2, semis / 12), a.currentTime);
      if (kick) o.frequency.exponentialRampToValueAtTime(root * 0.5, a.currentTime + 0.16);
      eg.gain.setValueAtTime(0.0001, a.currentTime);
      eg.gain.exponentialRampToValueAtTime(kick ? 0.9 : 0.22, a.currentTime + 0.01);
      eg.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + (kick ? 0.2 : 0.12));
      o.connect(eg).connect(g);
      o.start();
      o.stop(a.currentTime + 0.24);
      i++;
    }, step);
  }

  stopMusic() {
    if (this.beatTimer !== null) window.clearInterval(this.beatTimer);
    this.beatTimer = null;
    this.musicGain?.disconnect();
    this.musicGain = null;
  }

  /** تعليمات منطوقة بالعربية */
  say(text: string) {
    if (!this.enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-SA";
    u.rate = 1.1;
    u.pitch = 1.1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
}

export const audio = new AudioSystem();
