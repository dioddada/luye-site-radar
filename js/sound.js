// 音效：Apple 風輕柔點擊聲，全部用 Web Audio 即時合成，沒有任何音檔
// （2026-11-23 阿宗指示改 Apple 質感，取代 SPEC 原本的遊戲風方波音效）
// 支援的手機會附帶輕觸覺（navigator.vibrate；iPhone Safari 不支援就略過）
import { store } from './util.js';

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = store.get('muted', false);

function ensure() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      // 輕微低通，讓聲音圓潤不刺耳
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 6000;
      master.connect(lp).connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    } catch (e) { ctx = null; }
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

/** 柔和正弦音：快起音、指數衰減 */
function tone({ f0, f1 = f0, dur, gain = 0.06, delay = 0, type = 'sine' }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** 極短的「嗒」：帶通濾波的雜訊，像 iOS 鍵盤／滾輪的 tick */
function tick({ freq = 3200, gain = 0.18, q = 2.5, delay = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
}

function haptic(p) {
  try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 不支援就算了 */ }
}

function play(fn, vib) {
  if (vib) haptic(vib);
  if (muted) return;
  ensure();
  if (!ctx) return;
  try { fn(); } catch (e) { /* 音效失敗不影響操作 */ }
}

export const sfx = {
  /** 切換選項：輕「嗒」 */
  beep: () => play(() => { tick({ freq: 3400, gain: 0.16 }); tone({ f0: 1900, dur: 0.035, gain: 0.018 }); }, 6),
  /** 確認／下一步：柔和兩音（上行） */
  confirm: () => play(() => {
    tick({ freq: 2600, gain: 0.1 });
    tone({ f0: 880, dur: 0.12, gain: 0.05 });
    tone({ f0: 1318.5, dur: 0.16, gain: 0.04, delay: 0.06 });
  }, 10),
  /** 返回：輕微下降 */
  back: () => play(() => { tick({ freq: 2200, gain: 0.08 }); tone({ f0: 1046.5, f1: 740, dur: 0.12, gain: 0.04 }); }, 6),
  /** 送出完成：柔和上升和弦（C–E–G–C） */
  success: () => play(() => {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone({ f0: f, dur: 0.55 - i * 0.05, gain: 0.04, delay: i * 0.07 }));
  }, [12, 60, 18]),
  /** 點地圖圖釘：短「啵」 */
  pop: () => play(() => { tone({ f0: 520, f1: 980, dur: 0.07, gain: 0.07 }); tick({ freq: 1800, gain: 0.06 }); }, 8),
};

export function isMuted() { return muted; }
export function setMuted(v) { muted = !!v; store.set('muted', muted); }
