// Знак: корешок билета с перфорацией
export default function Logo() {
  return (
    <span className="brand__mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path
          d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        />
        <path d="M15 7v10" stroke="currentColor" strokeWidth="1.9" strokeDasharray="2 2.2" />
      </svg>
    </span>
  );
}
