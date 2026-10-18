import { HugeiconsIcon } from '@hugeicons/react';
import {
  Analytics01Icon,
  BookOpen01Icon,
  Home01Icon,
  Login01Icon,
  Logout01Icon,
  Search01Icon,
  ShieldUserIcon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons';
import { forwardRef, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { QuickViewProvider } from '../context/QuickView';
import Avatar from './Avatar';
import Loader from './Loader';
import Logo from './Logo';
import ClickSpark from './reactbits/ClickSpark/ClickSpark';
import Dock from './reactbits/Dock/Dock';
import PillNav from './reactbits/PillNav/PillNav';

// Адаптер: PillNav передаёт href, а React Router ожидает to
const RouterLink = forwardRef(function RouterLink({ href, ...props }, ref) {
  return <Link ref={ref} to={href} {...props} />;
});

const icon = glyph => <HugeiconsIcon icon={glyph} size="1em" strokeWidth={1.8} />;

function useNavItems() {
  const { user, isAdmin } = useAuth();
  return [
    { label: 'Главная', href: '/', icon: Home01Icon },
    { label: 'Поиск', href: '/search', icon: Search01Icon },
    user && { label: 'Дневник', href: '/library', icon: BookOpen01Icon },
    user && { label: 'Статистика', href: '/stats', icon: Analytics01Icon },
    isAdmin && { label: 'Админ', href: '/admin', icon: ShieldUserIcon },
  ].filter(Boolean);
}

const activeOf = (items, pathname) =>
  items.find(i => i.href !== '/' && pathname.startsWith(i.href))?.href ?? (pathname === '/' ? '/' : '');

// Шапка для компьютера: логотип, меню PillNav и блок пользователя на сплошной полосе
function DesktopHeader() {
  const { user, isAdmin, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const items = useNavItems();

  return (
    <div className="container header-bar">
      <Link to="/" className="brand" aria-label="КиноДневник — на главную">
        <Logo />
        <span>КиноДневник</span>
      </Link>
      <PillNav
        items={items.map(({ label, href }) => ({ label, href }))}
        activeHref={activeOf(items, pathname)}
        linkComponent={RouterLink}
        theme="dark"
        surface="none"
        layout="joined"
        size="sm"
        itemStyle="text"
        hoverEffect="glide"
        indicator="pill"
        highlightColor="#2a2c31"
        highlightTextColor="#ecebe8"
        textColor="#a1a3a8"
        collapse="never"
        intro={false}
        ariaLabel="Главное меню"
      />
      <div className="header-user">
        {user ? (
          <>
            <NavLink to="/profile" className="user-chip" title="Профиль">
              <Avatar user={user} size={30} />
              <span>{user.first_name}</span>
              {isAdmin && <span className="role-badge">admin</span>}
            </NavLink>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Выйти
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-sm">
              Войти
            </Link>
            <Link to="/register" className="btn btn-sm btn-accent">
              Создать дневник
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// Телефон и планшет: компактная строка сверху и док-панель снизу
function MobileChrome() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const items = useNavItems();
  const active = activeOf(items, pathname);

  const signOut = () => {
    logout();
    navigate('/');
  };

  const dockItems = [
    ...items.map(item => ({
      label: item.label,
      icon: icon(item.icon),
      active: active === item.href,
      onClick: () => navigate(item.href),
    })),
    user
      ? {
          label: 'Профиль',
          icon: icon(UserCircleIcon),
          active: pathname === '/profile',
          onClick: () => navigate('/profile'),
          // долгое нажатие открывает меню профиля
          menu: [
            { label: 'Открыть профиль', onClick: () => navigate('/profile') },
            { separator: true },
            { label: 'Выйти из аккаунта', onClick: signOut },
          ],
        }
      : { label: 'Войти', icon: icon(Login01Icon), active: pathname === '/login', onClick: () => navigate('/login') },
  ];

  return (
    <>
      <div className="container mobile-top">
        <Link to="/" className="brand" aria-label="КиноДневник — на главную">
          <Logo />
          <span>КиноДневник</span>
        </Link>
        {user ? (
          <div className="header-user">
            <Link to="/profile" aria-label="Профиль">
              <Avatar user={user} size={34} />
            </Link>
            <button type="button" className="icon-btn" onClick={signOut} aria-label="Выйти из аккаунта" title="Выйти">
              <HugeiconsIcon icon={Logout01Icon} size={20} strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <Link to="/register" className="btn btn-sm btn-accent">
            Создать дневник
          </Link>
        )}
      </div>
      <div className="dock-wrap">
        <Dock
          items={dockItems}
          position="bottom"
          theme="graphite"
          baseItemSize={44}
          magnification={52}
          panelHeight={60}
          showLabels
          showIndicators
          accentColor="#ecebe8"
        />
      </div>
    </>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__inner">
          <span>КиноДневник, учебный проект 2026. Постеры и описания: TMDB, ПоискКино, OMDb, Википедия, iTunes.</span>
          <span className="site-footer__links">
            <Link to="/rules">Правила</Link>
            <a href="/docs" target="_blank" rel="noreferrer">
              Документация API
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  return (
    <QuickViewProvider>
      {/* Фон: три размытых приглушённых пятна; на странице фильма — в цветах его постера */}
      <div className="ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      {/* Искры при клике — короткий отклик на любое нажатие */}
      <ClickSpark sparkColor={['#f5c518', '#ecebe8']} sparkSize={9} sparkRadius={20} sparkCount={8} duration={420}>
        <div className="app-shell">
          <header className="site-header">
            <DesktopHeader />
            <MobileChrome />
          </header>
          <main className="site-main">
            {/* Пока загружается код страницы, шапка и фон остаются на месте */}
            <Suspense fallback={<Loader />}>
              <Outlet />
            </Suspense>
          </main>
          <Footer />
        </div>
      </ClickSpark>
    </QuickViewProvider>
  );
}
