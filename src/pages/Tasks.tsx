import { useState, type FormEvent } from 'react';
import {
  Archive,
  CheckCheck,
  CheckSquare,
  Flag,
  Inbox,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  Ellipsis,
} from 'lucide-react';
import { dateKey, durationLabel, formatDate, repeatsOn, taskDone } from '../lib/dates';
import { stamp, uid, type Task } from '../lib/model';
import { toggleTask } from '../lib/actions';
import { TaskActions } from '../components/TaskActions';
import { TaskGesture } from '../components/Gestures';
import { useDayflow } from '../state/DayflowContext';
import {
  AddButton,
  CategoryBadge,
  CheckButton,
  EmptyState,
  Modal,
  SectionHeading,
  IconButton,
} from '../components/ui';
import type { PageProps } from './Today';

export function Tasks({ edit, capture: openCapture }: PageProps) {
  const { state, save } = useDayflow();
  const today = dateKey();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [priority, setPriority] = useState('all');
  const [quick, setQuick] = useState('');
  const capturing = false;
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);
  const actionTask = state.tasks.find((t) => t.id === actionTaskId);
  const [dateFilter, setDateFilter] = useState('');
  const [listModal, setListModal] = useState(false);
  const [listName, setListName] = useState('');
  const toggle = (task: Task, day = today) =>
    void save((s) => {
      toggleTask(s, task.id, day);
    });
  const isToday = (t: Task) => t.date && repeatsOn({ ...t, date: t.date }, today);
  const active = state.tasks.filter((t) => !taskDone(t, today));
  const history = state.tasks
    .flatMap((t) =>
      t.recurrence === 'none'
        ? t.completedAt
          ? [{ task: t, day: dateKey(new Date(t.completedAt)) }]
          : []
        : t.doneDates.map((day) => ({ task: t, day })),
    )
    .sort((a, b) => b.day.localeCompare(a.day));
  const visible =
    filter === 'done'
      ? history
      : state.tasks
          .filter((t) => !taskDone(t, today))
          .filter((t) =>
            filter === 'today'
              ? isToday(t) || (t.date && t.date < today && t.recurrence === 'none')
              : filter === 'upcoming'
                ? t.date && t.date > today
                : filter.startsWith('list:')
                  ? t.listId === filter.slice(5)
                  : true,
          )
          .map((task) => ({ task, day: today }));
  const searched = visible.filter(
    ({ task: t }) =>
      (category === 'all' || t.categoryId === category) &&
      (!dateFilter || (t.date && repeatsOn({ ...t, date: t.date }, dateFilter))) &&
      (priority === 'all' || t.priority === priority) &&
      `${t.title} ${t.tags.join(' ')} ${t.notes}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const filterTitle =
    filter === 'today'
      ? 'Para hoy'
      : filter === 'upcoming'
        ? 'Próximamente'
        : filter === 'done'
          ? 'Historial de tareas'
          : filter.startsWith('list:')
            ? state.settings.lists.find((l) => l.id === filter.slice(5))?.name
            : 'Todas tus tareas';
  const capture = (e: FormEvent) => {
    e.preventDefault();
    if (quick.trim()) openCapture(quick, () => setQuick(''));
  };
  return (
    <div className="page-enter">
      <SectionHeading
        eyebrow="MENOS RUIDO MENTAL"
        title="Tus tareas"
        description="Captura, organiza y avanza. Una cosa a la vez."
        action={<AddButton onClick={() => edit({ kind: 'task' })}>Nueva tarea</AddButton>}
      />
      <div className="tasks-layout">
        <aside className="panel task-filters">
          <span className="eyebrow">TU ESPACIO</span>
          {[
            { id: 'all', name: 'Todas las tareas', icon: CheckSquare, count: active.length },
            {
              id: 'today',
              name: 'Para hoy',
              icon: Flag,
              count: active.filter((t) => isToday(t)).length,
            },
            {
              id: 'upcoming',
              name: 'Próximamente',
              icon: Archive,
              count: active.filter((t) => t.date && t.date > today).length,
            },
            { id: 'done', name: 'Completadas', icon: CheckCheck, count: history.length },
          ].map((f) => (
            <button
              className={filter === f.id ? 'selected' : ''}
              key={f.id}
              onClick={() => setFilter(f.id)}
            >
              <f.icon size={17} />
              <span>{f.name}</span>
              <small>{f.count}</small>
            </button>
          ))}
          <div className="filter-separator" />
          <span className="eyebrow">MIS LISTAS</span>
          {state.settings.lists.map((l) => (
            <button
              key={l.id}
              className={filter === `list:${l.id}` ? 'selected' : ''}
              onClick={() => setFilter(`list:${l.id}`)}
            >
              {l.id === 'inbox' ? <Inbox size={17} /> : <List size={17} />}
              <span>{l.name}</span>
              <small>{active.filter((t) => t.listId === l.id).length}</small>
            </button>
          ))}
          <button className="new-list" onClick={() => setListModal(true)}>
            <Plus size={16} />
            Nueva lista
          </button>
        </aside>
        <section className="panel task-content">
          <form className="quick-capture" onSubmit={capture}>
            <Plus size={21} />
            <input
              aria-label="Captura rápida"
              maxLength={160}
              placeholder="¿Algo en tu cabeza? Escríbelo aquí…"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
            />
            <button className="small-button" disabled={capturing || !quick.trim()}>
              {capturing ? 'Guardando…' : 'Capturar'}
            </button>
          </form>
          <div className="task-content-heading">
            <h2>{filterTitle}</h2>
            <span>
              {searched.length} {filter === 'done' ? 'registros' : 'tareas'}
            </span>
          </div>
          <div className="task-search-tools">
            <input
              className="task-date-filter"
              type="date"
              aria-label="Filtrar tareas por fecha"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Buscar tareas"
                placeholder="Buscar tareas o etiquetas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="filter-select">
              <SlidersHorizontal size={14} />
              <select
                aria-label="Filtrar por categoría"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">Categorías</option>
                {state.settings.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <select
              aria-label="Filtrar por prioridad"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="all">Prioridades</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>
          <div className="task-list">
            {searched.map(({ task: t, day }) => (
              <TaskGesture
                key={`${t.id}-${day}`}
                complete={() => {
                  if (filter === 'done' || t.recurrence === 'none' || isToday(t)) toggle(t, day);
                }}
                actions={() => setActionTaskId(t.id)}
              >
                <div
                  className={`task-row ${filter === 'done' ? 'completed-row' : ''}`}
                  key={`${t.id}-${day}`}
                >
                  <CheckButton
                    checked={filter === 'done' || taskDone(t, today)}
                    label={`${filter === 'done' ? 'Reabrir' : 'Completar'} ${t.title}`}
                    disabled={filter !== 'done' && t.recurrence !== 'none' && !isToday(t)}
                    onClick={() => toggle(t, day)}
                  />
                  <button className="task-row-body" onClick={() => edit({ kind: 'task', item: t })}>
                    <strong>{t.title}</strong>
                    <span className="task-metadata">
                      <CategoryBadge id={t.categoryId} />
                      <span>{durationLabel(t.duration)}</span>
                      {filter === 'done' ? (
                        <span>{formatDate(day)}</span>
                      ) : t.date ? (
                        <span
                          className={t.date < today && t.recurrence === 'none' ? 'overdue' : ''}
                        >
                          {t.date === today ? 'Hoy' : formatDate(t.date)}
                          {t.time ? ` · ${t.time}` : ''}
                        </span>
                      ) : (
                        <span>Sin fecha</span>
                      )}
                      {t.subtasks.length > 0 && (
                        <span>
                          {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} pasos
                        </span>
                      )}
                    </span>
                    {t.tags.length > 0 && (
                      <span className="task-tags">
                        {t.tags.map((tag) => (
                          <small key={tag}>#{tag}</small>
                        ))}
                      </span>
                    )}
                    {t.deadline && (
                      <small className={t.deadline < today ? 'overdue' : 'muted'}>
                        Límite: {formatDate(t.deadline)}
                      </small>
                    )}
                    {filter !== 'done' && t.recurrence !== 'none' && !isToday(t) && (
                      <small className="muted">Se completa en sus días programados.</small>
                    )}
                  </button>
                  <span className={`priority-pill ${t.priority}`}>
                    {t.priority === 'high' ? 'Alta' : t.priority === 'medium' ? 'Media' : 'Baja'}
                  </span>
                  <IconButton
                    icon={Ellipsis}
                    label={`Acciones de ${t.title}`}
                    onClick={() => setActionTaskId(t.id)}
                  />
                  {t.subtasks.length > 0 && (
                    <div className="inline-subtasks">
                      <div
                        className="subtask-progress"
                        role="progressbar"
                        aria-label={`Progreso de ${t.title}`}
                        aria-valuenow={t.subtasks.filter((s) => s.done).length}
                        aria-valuemin={0}
                        aria-valuemax={t.subtasks.length}
                      >
                        <i
                          style={{
                            width: `${(t.subtasks.filter((s) => s.done).length / t.subtasks.length) * 100}%`,
                          }}
                        />
                      </div>
                      {t.subtasks.map((sub) => (
                        <label key={sub.id}>
                          <input
                            type="checkbox"
                            checked={sub.done}
                            onChange={() =>
                              void save((s) => {
                                const task = s.tasks.find((x) => x.id === t.id);
                                const item = task?.subtasks.find((x) => x.id === sub.id);
                                if (task && item) {
                                  item.done = !item.done;
                                  task.updatedAt = stamp();
                                }
                              })
                            }
                          />
                          {sub.title}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </TaskGesture>
            ))}
          </div>
          {!searched.length && (
            <EmptyState
              icon={filter === 'done' ? CheckCheck : Inbox}
              title={
                filter === 'done'
                  ? 'Cada paso quedará aquí'
                  : 'Espacio en tu lista. Espacio en tu mente.'
              }
              description={
                filter === 'done'
                  ? 'Tu historial se construye al completar tareas.'
                  : 'Añade tu siguiente pendiente o cambia los filtros.'
              }
              action={filter !== 'done' ? () => edit({ kind: 'task' }) : undefined}
              actionLabel="Crear una tarea"
            />
          )}
        </section>
      </div>
      <p className="helper task-gesture-help">
        Desliza una tarea a la derecha para completarla o a la izquierda para ver acciones. También
        puedes usar los botones de cada tarea.
      </p>
      {actionTask && (
        <TaskActions
          task={actionTask}
          onClose={() => setActionTaskId(null)}
          onEdit={() => {
            setActionTaskId(null);
            edit({ kind: 'task', item: actionTask });
          }}
        />
      )}
      {listModal && (
        <Modal
          title="Un lugar para cada cosa"
          eyebrow="NUEVA LISTA"
          onClose={() => setListModal(false)}
        >
          <form
            className="editor-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!listName.trim()) return;
              const name = listName.trim();
              if (
                await save((s) => {
                  if (
                    s.settings.lists.some(
                      (l) => l.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
                    )
                  )
                    throw new Error('Ya existe una lista con ese nombre.');
                  s.settings.lists.push({ id: uid(), name });
                }, 'Lista creada')
              ) {
                setListModal(false);
                setListName('');
              }
            }}
          >
            <label>
              Nombre de la lista
              <input
                autoFocus
                required
                maxLength={60}
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Proyectos, universidad, personal…"
              />
            </label>
            <button className="primary-button">Crear lista</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
