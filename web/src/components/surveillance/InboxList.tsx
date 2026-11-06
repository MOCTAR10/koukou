import { Bell, ChevronRight } from 'lucide-react';
import type { InboxItem } from '../../api/types-surveillance';
import { classNames, dateTimeFr } from '../../lib/format';
import { Pill } from '../flock/shared';
import { EVENT_SHORT_LABELS, severityTone } from './notificationRoutes';

/** Inbox rows: unread ones marked, a click reads and opens. */
export function InboxList({ items, onOpen, compact = false }: { items: InboxItem[]; onOpen: (item: InboxItem) => void; compact?: boolean }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
        <Bell className="h-4 w-4" /> Aucune notification.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => {
        const unread = !n.readAt;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onOpen(n)}
              className={classNames('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50', unread && 'bg-brand-50/50')}
            >
              <span className={classNames('mt-1.5 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-brand-600' : 'bg-transparent')} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={classNames('text-sm text-slate-900', unread ? 'font-semibold' : 'font-medium')}>{n.title}</span>
                  {!compact ? <Pill tone={severityTone(n.severity)}>{EVENT_SHORT_LABELS[n.event] ?? n.event}</Pill> : null}
                </span>
                <span className={classNames('block text-sm text-slate-600', compact && 'line-clamp-2')}>{n.body}</span>
                <span className="block text-xs text-slate-400">
                  {dateTimeFr(n.createdAt)}
                  {unread ? ' · non lue' : ''}
                </span>
              </span>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
