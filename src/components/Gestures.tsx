import { useRef, type ReactNode } from 'react';

export function DateSwipe({
  previous,
  next,
  children,
}: {
  previous: () => void;
  next: () => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      onTouchStart={(e) => {
        if (
          e.touches.length === 1 &&
          !(e.target as Element).closest('input,select,textarea,[data-no-swipe]')
        )
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const from = start.current;
        start.current = null;
        if (!from || !e.changedTouches[0]) return;
        const dx = e.changedTouches[0].clientX - from.x;
        const dy = e.changedTouches[0].clientY - from.y;
        if (Math.abs(dx) >= 75 && Math.abs(dy) < 45) {
          if (dx < 0) next();
          else previous();
        }
      }}
      onTouchCancel={() => {
        start.current = null;
      }}
    >
      {children}
    </div>
  );
}
export function TaskGesture({
  complete,
  actions,
  children,
}: {
  complete: () => void;
  actions: () => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  return (
    <div
      className="task-gesture"
      onPointerDown={(e) => {
        swiped.current = false;
        if (e.pointerType === 'touch' && !(e.target as Element).closest('input,select,textarea'))
          start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onPointerUp={(e) => {
        const from = start.current;
        start.current = null;
        if (from && Math.abs(e.clientX - from.x) > 80 && Math.abs(e.clientY - from.y) < 35) {
          swiped.current = true;
          if (e.clientX > from.x) complete();
          else actions();
        }
      }}
      onClickCapture={(e) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      {children}
    </div>
  );
}
