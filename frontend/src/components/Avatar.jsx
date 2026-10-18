import { useState } from 'react';
import { initials } from '../utils';

// Аватар: фото профиля, если оно загружено, иначе инициалы на цветном круге
export default function Avatar({ user, size = 40 }) {
  const [broken, setBroken] = useState(null);
  const src = user?.avatar_url;
  const style = { width: size, height: size, fontSize: size * 0.38, '--avatar': user?.avatar_color || '#a3a4aa' };
  if (src && broken !== src) {
    return (
      <img
        className="avatar avatar--photo"
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={style}
        onError={() => setBroken(src)}
      />
    );
  }
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {initials(user)}
    </span>
  );
}
