// 線條圖示（仿 SF Symbols 風格，自己畫的 SVG，currentColor 上色）
const svg = (d, { size = 22, fill = false, sw = 2 } = {}) =>
  `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  nav: (o) => svg('<path d="M3 11 21 3l-8 18-2-8-8-2z" fill="currentColor" stroke="none"/>', o),
  phone: (o) => svg('<path d="M6.6 2.8 9 2.5l1.8 4.3-2.2 1.6a12 12 0 0 0 7 7l1.6-2.2 4.3 1.8-.3 2.4a2.5 2.5 0 0 1-2.6 2.1C10.4 19 5 13.6 4.5 5.4a2.5 2.5 0 0 1 2.1-2.6z" fill="currentColor" stroke="none"/>', o),
  camera: (o) => svg('<path d="M4 7.5h3l1.6-2.5h6.8L17 7.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>', o),
  photo: (o) => svg('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m21 15-4.5-4.5L7 19.5"/>', o),
  pencil: (o) => svg('<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3"/>', o),
  list: (o) => svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>', o),
  map: (o) => svg('<path d="m3 6.5 6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>', o),
  refresh: (o) => svg('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>', o),
  plus: (o) => svg('<path d="M12 5v14M5 12h14"/>', { sw: 2.4, ...o }),
  close: (o) => svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', { sw: 2.4, ...o }),
  back: (o) => svg('<path d="M15 4.5 7.5 12l7.5 7.5"/>', { sw: 2.6, ...o }),
  chevron: (o) => svg('<path d="m9 5 7 7-7 7"/>', { sw: 2.4, ...o }),
  locate: (o) => svg('<path d="M21 3 3 10.5l7.5 3 3 7.5z" fill="currentColor" stroke="none"/>', o),
  pin: (o) => svg('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', o),
  speaker: (o) => svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>', o),
  mute: (o) => svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>', o),
  check: (o) => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', { sw: 2.6, ...o }),
  clock: (o) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', o),
  warn: (o) => svg('<path d="M12 3.5 2.5 20h19z" fill="currentColor" stroke="none"/><path d="M12 10v4.5M12 17.2v.3" stroke="#000" stroke-width="2.2"/>', o),
  build: (o) => svg('<path d="M3 20h18"/><path d="M5 20v-8a7 7 0 0 1 14 0v8"/><path d="M9 20v-6M15 20v-6M5 14h14"/>', o),
  wrench: (o) => svg('<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2z"/>', o),
  trash: (o) => svg('<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13"/>', o),
};
