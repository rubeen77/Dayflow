import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { addDays, capital, dateKey, formatDate } from '../lib/dates';
import { useDayflow } from '../state/DayflowContext';

export const colorStyle = (color: string): CSSProperties =>
  ({ '--category': color }) as CSSProperties;
export function IconButton({
  icon: Icon,
  label,
  onClick,
  className = '',
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={19} strokeWidth={1.7} />
    </button>
  );
}
export function EmptyState({
  icon: Icon = CalendarDays,
  title,
  description,
  action,
  actionLabel = 'Crear actividad',
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: () => void;
  actionLabel?: string;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? 'compact-empty' : ''}`}>
      <span className="empty-icon">
        <Icon size={26} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && (
        <button className="text-button" onClick={action}>
          {actionLabel}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function PanelHeading({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {aside && <span className="muted small">{aside}</span>}
      {children}
    </div>
  );
}
export function DateNav({
  date,
  setDate,
  step = 1,
}: {
  date: string;
  setDate: (s: string) => void;
  step?: number;
}) {
  return (
    <div className="date-nav">
      <button className="small-button" onClick={() => setDate(dateKey())}>
        Hoy
      </button>
      <IconButton
        icon={ChevronLeft}
        label="Fecha anterior"
        onClick={() => setDate(addDays(date, -step))}
      />
      <label className="date-picker-label">
        <span>{capital(formatDate(date, { month: 'long', year: 'numeric' }))}</span>
        <input
          aria-label="Ir a fecha"
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </label>
      <IconButton
        icon={ChevronRight}
        label="Fecha siguiente"
        onClick={() => setDate(addDays(date, step))}
      />
    </div>
  );
}
export function CategoryBadge({ id }: { id: string }) {
  const { state } = useDayflow();
  const c = state.settings.categories.find((c) => c.id === id);
  return c ? (
    <span className="category-badge" style={colorStyle(c.color)}>
      <i />
      {c.name}
    </span>
  ) : null;
}
export function CheckButton({
  checked,
  onClick,
  label,
  disabled = false,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`check-button ${checked ? 'checked' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {checked && <Check size={13} strokeWidth={3} />}
    </button>
  );
}
export function ProgressRing({
  progress,
  size = 58,
  children,
}: {
  progress: number;
  size?: number;
  children?: ReactNode;
}) {
  const r = 24;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 58 58" aria-hidden="true">
        <circle cx="29" cy="29" r={r} className="ring-track" />
        <circle
          cx="29"
          cy="29"
          r={r}
          className="ring-value"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, progress) / 100)}
        />
      </svg>
      <span>{children ?? `${progress}%`}</span>
    </div>
  );
}
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      node?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className={`modal ${wide ? 'wide-modal' : ''}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <IconButton icon={X} label="Cerrar" onClick={onClose} />
      </div>
      {children}
    </dialog>
  );
}
export function AddButton({
  onClick,
  children = 'Nueva actividad',
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button className="primary-button" onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
export function MiniBars({
  values,
  labels,
  color = 'var(--accent)',
  active = -1,
}: {
  values: number[];
  labels: string[];
  color?: string;
  active?: number;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="mini-chart">
      {values.map((v, i) => (
        <div className={`bar-column ${active === i ? 'active' : ''}`} key={i}>
          <span className="bar-value">{v > 0 ? (v % 1 ? v.toFixed(1) : v) : ''}</span>
          <div className="bar-track">
            <div
              style={{ height: `${(v / max) * 100}%`, background: color }}
              title={`${labels[i]}: ${v}`}
            />
          </div>
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
