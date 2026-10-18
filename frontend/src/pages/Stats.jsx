import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { API } from '../api/client';
import Loader from '../components/Loader';
import Poster from '../components/Poster';
import Counter from '../components/reactbits/Counter/Counter';
import { EmptyState, PageHeader } from '../components/ui';
import { formatDate, plural } from '../utils';

// Графики в нейтральной гамме: цветом выделено только то, что относится к оценкам
const AXIS = { stroke: '#6b6c72', fontSize: 12, tickLine: false, axisLine: false };
const GRID = <CartesianGrid vertical={false} stroke="#1c1c1f" />;
const TOOLTIP = {
  contentStyle: { background: '#151517', border: '1px solid #2c2c30', borderRadius: 8, color: '#f5f4f0' },
  cursor: { fill: 'rgba(255,255,255,.05)' },
  labelStyle: { color: '#a3a4aa' },
};

function StatTile({ value, decimals, label }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <Counter value={value} decimals={decimals} fontSize={44} fontWeight={650} locale="ru-RU" textColor="#f5f4f0" />
    </div>
  );
}

function ChartPanel({ title, wide = false, children }) {
  return (
    <section className={`chart-panel ${wide ? 'chart-panel--wide' : ''}`}>
      <h3>{title}</h3>
      <div className="chart-panel__body">{children}</div>
    </section>
  );
}

export default function Stats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    API.stats().then(setStats).catch(() => {});
  }, []);

  if (!stats) return <Loader />;
  if (!stats.watched) {
    return (
      <div className="container page">
        <PageHeader title="Здесь появится ваша статистика" />
        <EmptyState title="Пока нет просмотренных фильмов" action={<Link to="/search" className="btn btn-accent">Найти фильм</Link>}>
          Отметьте хотя бы один фильм просмотренным, и здесь появятся часы у экрана, жанры и оценки.
        </EmptyState>
      </div>
    );
  }

  const hours = Math.round(stats.minutes / 60);

  return (
    <div className="container page">
      <PageHeader title="Мой год в кино">
        В планах {stats.planned}, брошено {stats.dropped}, в избранном {stats.favorites}.
      </PageHeader>

      <div className="stat-tiles">
        <StatTile value={stats.watched} label={plural(stats.watched, 'Фильм просмотрен', 'Фильма просмотрено', 'Фильмов просмотрено')} />
        <StatTile value={hours} label={`${plural(hours, 'Час', 'Часа', 'Часов')} у экрана`} />
        <StatTile value={stats.avg_rating || 0} decimals={1} label="Средняя оценка" />
        <StatTile value={stats.reviews} label={plural(stats.reviews, 'Рецензия', 'Рецензии', 'Рецензий')} />
      </div>

      <div className="chart-grid">
        <ChartPanel title="Просмотры по месяцам" wide>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.by_month} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="label" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip {...TOOLTIP} formatter={v => [v, 'фильмов']} />
              <Bar dataKey="value" fill="#e4e3df" radius={[4, 4, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Любимые жанры">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.by_genre} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={96} {...AXIS} stroke="#a3a4aa" />
              <Tooltip {...TOOLTIP} formatter={v => [v, 'фильмов']} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {stats.by_genre.map((g, i) => (
                  <Cell key={g.label} fill={i === 0 ? '#f5f4f0' : '#45464c'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Мои оценки">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.rating_distribution} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="label" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip {...TOOLTIP} labelFormatter={l => `Оценка ${l}`} formatter={v => [v, 'фильмов']} />
              <Bar dataKey="value" fill="#ffc61a" radius={[4, 4, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Фильмы по десятилетиям">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.by_decade} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="label" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip {...TOOLTIP} formatter={v => [v, 'фильмов']} />
              <Bar dataKey="value" fill="#8e9096" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Пять лучших по моей оценке">
          <ol className="top-list">
            {stats.top_rated.map(e => (
              <li key={e.id}>
                <Poster src={e.movie.poster_url} title={e.movie.title} year={e.movie.year} className="top-list__poster" />
                <Link to={`/movie/${e.movie.id}`}>
                  <b>{e.movie.title}</b>
                  <small>{formatDate(e.watched_at)}</small>
                </Link>
                <span className="top-list__mark">★ {e.rating}</span>
              </li>
            ))}
          </ol>
        </ChartPanel>
      </div>
    </div>
  );
}
