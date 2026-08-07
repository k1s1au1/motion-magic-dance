/**
 * مكتبة بسيطة لتوليد أصوات باستخدام Web Audio API
 * توفر أصواتاً تفاعلية للعبة دون الحاجة لملفات صوتية خارجية.
 */

class AudioService {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume = 0.2) {
    const ctx = this.init();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  /** صوت بداية الرقص / انطلق */
  playStart() {
    this.playTone(440, "sine", 0.3, 0.3);
    setTimeout(() => this.playTone(880, "sine", 0.4, 0.3), 100);
  }

  /** صوت التجميد / توقف */
  playStop() {
    this.playTone(220, "square", 0.2, 0.2);
    setTimeout(() => this.playTone(110, "square", 0.3, 0.2), 50);
  }

  /** صوت النجاح */
  playSuccess() {
    this.playTone(523.25, "sine", 0.1, 0.2); // C5
    setTimeout(() => this.playTone(659.25, "sine", 0.1, 0.2), 100); // E5
    setTimeout(() => this.playTone(783.99, "sine", 0.3, 0.2), 200); // G5
  }

  /** صوت الخطأ (عند الحركة أثناء التجميد) */
  playFail() {
    this.playTone(150, "sawtooth", 0.4, 0.2);
    this.playTone(100, "sawtooth", 0.4, 0.2);
  }
  /** صوت القفز */
  playJump() {
    this.playTone(400, "sine", 0.1, 0.2);
    setTimeout(() => this.playTone(600, "sine", 0.2, 0.2), 50);
  }

  /** صوت الانحناء */
  playDuck() {
    this.playTone(300, "sine", 0.1, 0.2);
    setTimeout(() => this.playTone(200, "sine", 0.2, 0.2), 50);
  }

  /** صوت جمع عملة */
  playCoin() {
    this.playTone(987.77, "sine", 0.1, 0.1); // B5
  }
  /** صوت الإيقاع (Beat) */
  playBeat() {
    this.playTone(150, "sine", 0.05, 0.1);
  }

  /** صوت التقييم المثالي */
  playPerfect() {
    this.playTone(880, "sine", 0.1, 0.2);
    setTimeout(() => this.playTone(1320, "sine", 0.2, 0.2), 50);
  }

  /** صوت التقييم الجيد */
  playGood() {
    this.playTone(440, "sine", 0.1, 0.2);
    setTimeout(() => this.playTone(660, "sine", 0.2, 0.2), 50);
  }
  /** صوت فرقعة بالون */
  playPop() {
    this.playTone(600 + Math.random() * 200, "sine", 0.05, 0.3);
    setTimeout(() => this.playTone(300, "sine", 0.1, 0.1), 20);
  }

  private musicInterval: any = null;
  private lastSpeak = 0;
  private lastPhrase = "";

  /** موسيقى حماسية للأطفال: باص + إيقاع + لحن مرح */
  startKidsMusic(bpm = 132) {
    this.stopMusic();
    this.init();
    const step = 60000 / bpm / 2; // 8th notes
    const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 783.99, 880, 783.99];
    const bass = [130.81, 130.81, 174.61, 174.61, 196, 196, 174.61, 146.83];
    let i = 0;
    this.musicInterval = setInterval(() => {
      const b = i % 8;
      // bass pulse
      this.playTone(bass[b] ?? 130.81, "triangle", 0.18, 0.09);
      // kick / hats
      if (b % 2 === 0) this.playTone(70, "sine", 0.12, 0.14);
      else this.playTone(1800, "square", 0.02, 0.02);
      // melody hook every bar
      this.playTone(melody[b] ?? 523.25, "square", 0.12, 0.05);
      if (b === 0) this.playTone((melody[0] ?? 523) * 2, "sine", 0.1, 0.04);
      i++;
    }, step);
  }

  /** إيقاف أي موسيقى جارية */
  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  /** نطق تعليمات بالعربية (يمين، يسار، اقفز، انخفض...) */
  speak(text: string, { cooldown = 700, force = false }: { cooldown?: number; force?: boolean } = {}) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const now = performance.now();
    if (!force && (now - this.lastSpeak < cooldown || (text === this.lastPhrase && now - this.lastSpeak < 1500))) return;
    this.lastSpeak = now;
    this.lastPhrase = text;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ar-SA";
      u.rate = 1.15;
      u.pitch = 1.35;
      u.volume = 1;
      const voices = window.speechSynthesis.getVoices();
      const ar = voices.find((v) => v.lang?.toLowerCase().startsWith("ar"));
      if (ar) u.voice = ar;
      window.speechSynthesis.speak(u);
    } catch {
      /* المتصفح لا يدعم النطق */
    }
  }

  stopSpeech() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }
}

export const audio = new AudioService();
