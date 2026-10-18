import { useEffect, useState } from 'react';

// Цвета постера: акцент для кнопок и три приглушённых цвета для фона страницы.
// Постеры приходят с того же адреса, что и приложение (кэш сервера), поэтому их пиксели можно прочитать.

const toHsl = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
};

const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

const cache = new Map();

function analyse(img) {
  const W = 32;
  const H = 48;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  // Гистограмма по 12 секторам оттенка: вес — насыщенность, так тусклые пиксели почти не влияют
  const bins = Array.from({ length: 12 }, () => ({ w: 0, h: 0, s: 0 }));
  let accent = null;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = toHsl(r, g, b);
    if (s > 0.18 && l > 0.12 && l < 0.88) {
      const bin = bins[Math.floor(h / 30) % 12];
      const w = s * (1 - Math.abs(l - 0.5));
      bin.w += w;
      bin.h += h * w;
      bin.s += s * w;
    }
    const max = Math.max(r, g, b);
    const sat = max ? (max - Math.min(r, g, b)) / max : 0;
    const score = sat * 0.7 + (max / 255) * 0.3;
    if (max > 90 && sat > 0.35 && (!accent || score > accent.score)) accent = { r, g, b, score };
  }

  const total = bins.reduce((sum, b) => sum + b.w, 0);
  const picked = [];
  bins
    .map((b, i) => ({ ...b, i }))
    .filter(b => b.w > total * 0.04)
    .sort((a, b) => b.w - a.w)
    .forEach(b => {
      // Берём заметно разные оттенки, чтобы фон не был одноцветным
      if (picked.length < 3 && picked.every(p => Math.min(Math.abs(p.i - b.i), 12 - Math.abs(p.i - b.i)) >= 2)) picked.push(b);
    });

  // Приглушаем: фон должен оставаться тёмным и не спорить с текстом
  const ambient = picked.map(b => hsl(b.h / b.w, Math.min(0.55, (b.s / b.w) * 0.8), 0.3));
  // Чёрно-белому или однотонному постеру — нейтральные холодные тона
  const neutrals = ['hsl(220 10% 24%)', 'hsl(210 8% 18%)', 'hsl(230 12% 22%)'];
  while (ambient.length < 3) ambient.push(ambient.length ? ambient[0] : neutrals[ambient.length]);

  const lift = c => Math.round(c + (255 - c) * 0.25);
  return {
    accent: accent ? `rgb(${lift(accent.r)}, ${lift(accent.g)}, ${lift(accent.b)})` : null,
    ambient,
  };
}

export function loadPalette(src) {
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return cache.get(src);
  const job = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        resolve(analyse(img));
      } catch {
        resolve(null); // постер с чужого домена без CORS
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(src, job);
  return job;
}

export default function usePosterPalette(src) {
  const [palette, setPalette] = useState(null);
  useEffect(() => {
    let alive = true;
    setPalette(null);
    loadPalette(src).then(p => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [src]);
  return palette;
}
