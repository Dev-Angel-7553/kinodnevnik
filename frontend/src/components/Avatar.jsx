import { initials } from '../utils';

export default function Avatar({ user, size = 40 }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, '--avatar': user?.avatar_color || '#a1a3a8' }}
      aria-hidden="true"
    >
      {initials(user)}
    </span>
  );
}
