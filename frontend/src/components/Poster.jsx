import { useEffect, useState } from 'react';

// Постер фильма; если картинка не загрузилась — рисуется обложка-заглушка с названием
export default function Poster({ src, title, year, className = '' }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);

  if (failed) {
    const hue = [...(title || '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
    return (
      <div className={`poster poster--fallback ${className}`} style={{ '--hue': hue }} role="img" aria-label={title}>
        <span>{title}</span>
        {year && <small>{year}</small>}
      </div>
    );
  }
  return (
    <img
      className={`poster ${className}`}
      src={src}
      alt={`Постер фильма «${title}»`}
      loading="lazy"
      decoding="async"
      width={300}
      height={450}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
