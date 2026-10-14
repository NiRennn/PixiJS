/**
 * SoundManager — процедурный звуковой движок на Web Audio API.
 * 
 * Почему Web Audio API вместо загрузки .mp3/.wav?
 * 1. Вес: 0 килобайт (звуки генерируются математическими формулами на лету).
 * 2. Мгновенный отклик (нулевая задержка, критично для тапов и мобилок).
 * 3. Надежность: никогда не упадет с ошибкой сети или 404.
 */
class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private getContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    // В браузерах AudioContext "спит", пока пользователь не коснется экрана
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Звук быстрого клика/тапа (кнопки, взятие предмета)
   */
  public playTap() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Быстрый частотный скачок вниз дает эффект приятного щелчка
    osc.frequency.setValueAtTime(450, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  /**
   * Звук успешного слияния (сочный восходящий аккорд "блуп-блип!")
   */
  public playMerge() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    // Восходящая частота 300Гц -> 650Гц -> 800Гц
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(now + 0.2);
  }

  /**
   * Звук победы / сдачи заказа (мажорный перелив колокольчиков)
   */
  public playOrderComplete() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    // Играем короткое мажорное арпеджио (До - Ми - Соль - До)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, index) => {
      const startTime = ctx.currentTime + index * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.22);
    });
  }

  /**
   * Звук ошибки (нельзя объединить, нет энергии)
   */
  public playError() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(90, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }
}

export const soundManager = new SoundManager();
