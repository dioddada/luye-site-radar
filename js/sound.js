// 音效：全部用 Web Audio 即時合成，沒有任何音檔
import { store } from './util.js';

let ctx = null;
let muted = store.get('muted', false);

function ensure() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

// 第一次觸控才初始化 AudioContext
const firstTouch = () => {
  ensure();
  window.removeEventListener('pointerdown', firstTouch, true);
  window.removeEventListener('touchstart', firstTouch, true);
};
window.addEventListener('pointerdown', firstTouch, true);
window.addEventListener('touchstart', firstTouch, true);

function tone({ type = 'square', f0, f1 = f0, dur, gain = 0.12, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.setValueAtTime(gain, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function play(fn) {
  if (muted) return;
  ensure();
  if (!ctx) return;
  try { fn(); } catch (e) { /* 音效失敗不影響操作 */ }
}

export const sfx = {
  /** 切換選項：短促方波嗶 880Hz 40ms */
  beep: () => play(() => tone({ type: 'square', f0: 880, dur: 0.04, gain: 0.06 })),
  /** 確認／下一步：低沉咚 220→165Hz 120ms */
  confirm: () => play(() => tone({ type: 'triangle', f0: 220, f1: 165, dur: 0.12, gain: 0.35 })),
  /** 返回：下降音 660→330Hz */
  back: () => play(() => tone({ type: 'square', f0: 660, f1: 330, dur: 0.14, gain: 0.06 })),
  /** 送出完成：上升三連音 523、659、784Hz */
  success: () => play(() => {
    [523, 659, 784].forEach((f, i) => tone({ type: 'square', f0: f, dur: i === 2 ? 0.22 : 0.1, gain: 0.07, delay: i * 0.11 }));
  }),
  /** 點圖釘：短啵 */
  pop: () => play(() => tone({ type: 'sine', f0: 380, f1: 1000, dur: 0.06, gain: 0.3 })),
};

export function isMuted() { return muted; }
export function setMuted(v) { muted = !!v; store.set('muted', muted); }
