import { useEffect, useState } from 'react';

// Определяет яркий цвет постера: страница фильма окрашивается в цвета самого фильма.
// Работает для постеров с того же адреса или с CORS; иначе возвращает null.
export default function usePosterColor(src) {
  const [color, setColor] = useState(null);

  useEffect(() => {
    if (!src) return undefined;
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 36;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 36);
        const data = ctx.getImageData(0, 0, 24, 36).data;
        let best = null;
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max ? (max - min) / max : 0;
          const score = sat * 0.7 + (max / 255) * 0.3; // насыщенный и светлый пиксель
          if (max > 90 && sat > 0.35 && (!best || score > best.score)) best = { r, g, b, score };
        }
        if (alive && best) {
          // Осветляем, чтобы цвет читался на тёмном фоне
          const lift = c => Math.round(c + (255 - c) * 0.25);
          setColor(`rgb(${lift(best.r)}, ${lift(best.g)}, ${lift(best.b)})`);
        }
      } catch {
        if (alive) setColor(null); // постер с чужого домена без CORS
      }
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  return color;
}
