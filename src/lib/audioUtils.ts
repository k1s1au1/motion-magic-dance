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
}

export const audio = new AudioService();
