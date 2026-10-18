import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';

// Остальные страницы загружаются по требованию: первый экран открывается быстрее,
// а тяжёлые библиотеки (графики, WebGL-фон) скачиваются только на своих страницах
const Search = lazy(() => import('./pages/Search'));
const MoviePage = lazy(() => import('./pages/MoviePage'));
const Library = lazy(() => import('./pages/Library'));
const Stats = lazy(() => import('./pages/Stats'));
const Profile = lazy(() => import('./pages/Profile'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Admin = lazy(() => import('./pages/Admin'));
const Rules = lazy(() => import('./pages/Rules'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Карта маршрутов приложения
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="movie/:id" element={<MoviePage />} />
        <Route path="rules" element={<Rules />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />

        <Route element={<ProtectedRoute />}>
          <Route path="library" element={<Library />} />
          <Route path="stats" element={<Stats />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route element={<ProtectedRoute admin />}>
          <Route path="admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
