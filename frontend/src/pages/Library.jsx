import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { API } from '../api/client';
import Loader from '../components/Loader';
import MovieCard from '../components/MovieCard';
import FadeContent from '../components/reactbits/FadeContent/FadeContent';
import GlideSelect from '../components/reactbits/GlideSelect/GlideSelect';
import RubberSegment from '../components/reactbits/RubberSegment/RubberSegment';
import { EmptyState, PageHeader, SELECT_THEME } from '../components/ui';

const TABS = [
  { key: 'all', label: 'Все' },
  { key: 'watched', label: 'Просмотрено' },
  { key: 'planned', label: 'Буду смотреть' },
  { key: 'dropped', label: 'Брошено' },
  { key: 'favorite', label: 'Избранное' },
];

const SORTS = [
  { value: 'recent', label: 'Недавно изменённые' },
  { value: 'watched', label: 'По дате просмотра' },
  { value: 'rating', label: 'По моей оценке' },
  { value: 'title', label: 'По названию' },
  { value: 'year', label: 'По году выхода' },
];

export default function Library() {
  const [all, setAll] = useState(null);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('recent');
  const [genre, setGenre] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    API.library({ sort, genre }).then(setAll).catch(() => setAll([]));
  }, [sort, genre]);

  const counts = useMemo(() => {
    const c = { all: all?.length || 0, watched: 0, planned: 0, dropped: 0, favorite: 0 };
    (all || []).forEach(e => {
      c[e.status] += 1;
      if (e.is_favorite) c.favorite += 1;
    });
    return c;
  }, [all]);

  const genres = useMemo(() => {
    const set = new Set((all || []).flatMap(e => e.movie.genres));
    return [{ value: '', label: 'Все жанры' }, ...[...set].sort().map(g => ({ value: g, label: g }))];
  }, [all]);

  const visible = (all || []).filter(e => {
    if (tab === 'favorite' && !e.is_favorite) return false;
    if (tab !== 'all' && tab !== 'favorite' && e.status !== tab) return false;
    return !query || e.movie.title.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="container page">
      <PageHeader
        title="Мой дневник"
        actions={
          <Link to="/search" className="btn btn-accent">
            + Добавить фильм
          </Link>
        }
      />

      <div className="tabs-scroll">
        <RubberSegment
          items={TABS.map(t => ({
            value: t.key,
            label: (
              <>
                {t.label}
                <span className="tab-count">{counts[t.key]}</span>
              </>
            ),
          }))}
          value={tab}
          onChange={setTab}
          trackColor="#18191c"
          thumbColor="#ecebe8"
          textColor="#a1a3a8"
          activeTextColor="#111214"
          size="lg"
          radius={10}
          equalSlots={false}
          aria-label="Вкладки дневника"
        />
      </div>

      <div className="toolbar">
        <input
          type="search"
          className="toolbar__search"
          placeholder="Найти в дневнике"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Поиск в дневнике"
        />
        <GlideSelect options={genres} value={genre} onChange={setGenre} menuWidth={200} ariaLabel="Жанр" {...SELECT_THEME} />
        <GlideSelect options={SORTS} value={sort} onChange={setSort} menuWidth={230} align="right" ariaLabel="Сортировка" {...SELECT_THEME} />
      </div>

      {all === null ? (
        <Loader />
      ) : visible.length === 0 ? (
        <EmptyState
          title={all.length ? 'Под фильтр ничего не попало' : 'Дневник пока пуст'}
          action={
            <Link to="/search" className="btn btn-accent">
              Найти фильм
            </Link>
          }
        >
          {all.length ? 'Сбросьте фильтры или выберите другую вкладку.' : 'Найдите первый фильм и отметьте его просмотренным.'}
        </EmptyState>
      ) : (
        <FadeContent key={`${tab}-${sort}-${genre}`} className="movie-grid" stagger={0.03} duration={0.45}>
          {visible.map(e => (
            <MovieCard
              key={e.id}
              movie={e.movie}
              to={`/movie/${e.movie.id}`}
              status={e.status}
              rating={e.rating}
              favorite={e.is_favorite}
            />
          ))}
        </FadeContent>
      )}
    </div>
  );
}
