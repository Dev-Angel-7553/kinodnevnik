import { Link } from 'react-router-dom';
import DecryptedText from '../components/reactbits/DecryptedText/DecryptedText';

export default function NotFound() {
  return (
    <div className="container page not-found">
      <DecryptedText text="404" animateOn="view" speed={70} maxIterations={14} className="not-found__code" parentClassName="not-found__wrap" characters="0123456789" />
      <h1>Эта плёнка потерялась</h1>
      <p className="muted">Страница не найдена или была удалена.</p>
      <Link to="/" className="btn btn-accent">
        На главную
      </Link>
    </div>
  );
}
