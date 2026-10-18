export default function Loader({ label = 'Загрузка…' }) {
  return (
    <div className="loader" role="status">
      <span className="loader__reel" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
