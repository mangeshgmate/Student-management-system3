import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDateTime, getDeadlineInfo, LEVELS } from './portalUtils';
import './Shared.css';

/* ───────── Header, nav, theme ───────── */
export function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      className="icon-btn"
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title="Toggle theme"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

export function PortalHeader({ icon, title, subtitle, variant = 'admin', children }) {
  return (
    <header className={`portal-header header-${variant}`}>
      <div className="header-text">
        <h1 className="header-title">
          <span aria-hidden="true">{icon}</span> {title}
        </h1>
        <p className="header-sub">{subtitle}</p>
      </div>
      <div className="header-actions">{children}</div>
    </header>
  );
}

/** tabs: [{ id, icon, label, badge? }] — becomes a bottom tab bar under 768px. */
export function PortalNav({ tabs, active, onChange, label }) {
  return (
    <nav className="portal-nav" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`portal-tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          <span className="tab-icon" aria-hidden="true">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
          {t.badge > 0 && <span className="badge-count">{t.badge}</span>}
        </button>
      ))}
    </nav>
  );
}

/* ───────── Notification bell + drawer ───────── */
export function NotificationBell({ items, readIds, onMarkAll, onMarkOne, onSelect }) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.at) - new Date(a.at)),
    [items]
  );
  const unread = sorted.filter((i) => !readIds.includes(i.id)).length;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        className="icon-btn"
        onClick={() => setOpen(true)}
        aria-label={`Notifications, ${unread} unread`}
      >
        🔔
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open &&
        createPortal(
          <div className="drawer-overlay" onClick={() => setOpen(false)}>
            <aside
              className="drawer"
              role="dialog"
              aria-label="Notifications"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="drawer-head">
                <h3>Notifications</h3>
                <div className="drawer-head-actions">
                  {unread > 0 && (
                    <button className="btn-link" onClick={() => onMarkAll(sorted.map((i) => i.id))}>
                      Mark all read
                    </button>
                  )}
                  <button className="icon-btn small" onClick={() => setOpen(false)} aria-label="Close">
                    ✕
                  </button>
                </div>
              </div>

              {sorted.length === 0 ? (
                <EmptyState kind="announcements" title="You're all caught up" text="New alerts and messages will show up here." />
              ) : (
                <ul className="drawer-list">
                  {sorted.map((n) => {
                    const isUnread = !readIds.includes(n.id);
                    return (
                      <li key={n.id}>
                        <button
                          className={`notif-item ${isUnread ? 'unread' : ''} tone-${n.tone || 'info'}`}
                          onClick={() => {
                            onMarkOne(n.id);
                            onSelect?.(n);
                            setOpen(false);
                          }}
                        >
                          <span className="notif-icon" aria-hidden="true">{n.icon}</span>
                          <span className="notif-body">
                            <strong>{n.title}</strong>
                            <span>{n.text}</span>
                            <time>{formatDateTime(n.at)}</time>
                          </span>
                          {isUnread && <span className="unread-dot" aria-label="Unread" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </div>,
          document.body
        )}
    </>
  );
}

/* ───────── Badges, buttons, toasts ───────── */
export function DeadlineBadge({ deadline, now }) {
  const info = getDeadlineInfo(deadline, now);
  return (
    <span className={`badge badge-${info.level}`} title={LEVELS[info.level].name}>
      <span aria-hidden="true">{LEVELS[info.level].icon}</span> {info.label}
    </span>
  );
}

export function LoadingButton({ loading, children, className = 'btn-primary', disabled, ...rest }) {
  return (
    <button className={className} disabled={loading || disabled} aria-busy={loading} {...rest}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Toasts({ toasts }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'error' ? '⚠️' : '✅'} {t.message}
        </div>
      ))}
    </div>
  );
}

/* ───────── Empty + loading states ───────── */
const ART = {
  assignments: (
    <>
      <rect x="44" y="24" width="52" height="68" rx="8" className="art-card" />
      <path d="M56 46h28M56 58h28M56 70h16" className="art-line" />
    </>
  ),
  submissions: (
    <>
      <path d="M40 62l10-26h40l10 26v24a6 6 0 0 1-6 6H46a6 6 0 0 1-6-6z" className="art-card" />
      <path d="M40 62h24a6 6 0 0 0 12 0h24" className="art-line" />
      <path d="M62 44l6 6 12-12" className="art-line" />
    </>
  ),
  announcements: (
    <>
      <path d="M52 52a18 18 0 0 1 36 0v18l6 8H46l6-8z" className="art-card" />
      <path d="M64 88a6 6 0 0 0 12 0" className="art-line" />
    </>
  ),
  analytics: (
    <>
      <rect x="44" y="60" width="14" height="30" rx="3" className="art-card" />
      <rect x="64" y="44" width="14" height="46" rx="3" className="art-card" />
      <rect x="84" y="30" width="14" height="60" rx="3" className="art-card" />
    </>
  ),
};

export function EmptyState({ kind = 'assignments', title, text, action }) {
  return (
    <div className="empty-state">
      <svg viewBox="0 0 140 120" width="140" height="120" role="img" aria-hidden="true">
        <circle cx="70" cy="60" r="50" className="art-blob" />
        <circle cx="112" cy="26" r="6" className="art-dot" />
        <circle cx="26" cy="90" r="4" className="art-dot" />
        {ART[kind] || ART.assignments}
      </svg>
      <h4>{title}</h4>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function SkeletonCards({ count = 3 }) {
  return (
    <div className="skeleton-grid" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton sk-pill" />
          <div className="skeleton sk-title" />
          <div className="skeleton sk-line" />
          <div className="skeleton sk-line short" />
        </div>
      ))}
    </div>
  );
}

/* ───────── Charts ───────── */
export function DonutChart({ segments, activeKey, onSelect }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const total = segments.reduce((s, x) => s + x.value, 0);
  const active = segments.find((s) => s.key === activeKey);
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut" role="img" aria-label="Submission breakdown">
        <circle cx="60" cy="60" r={R} className="donut-bg" />
        {total > 0 &&
          segments.map((seg) => {
            const len = (seg.value / total) * C;
            const el = (
              <circle
                key={seg.key}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={activeKey === seg.key ? 17 : 12}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
                className="donut-seg"
                onClick={() => onSelect(activeKey === seg.key ? null : seg.key)}
              />
            );
            offset += len;
            return el;
          })}
        <text x="60" y="58" textAnchor="middle" className="donut-num">
          {active ? active.value : total}
        </text>
        <text x="60" y="73" textAnchor="middle" className="donut-cap">
          {active ? active.label : 'Total'}
        </text>
      </svg>

      <ul className="donut-legend">
        {segments.map((seg) => (
          <li key={seg.key}>
            <button
              className={`legend-item ${activeKey === seg.key ? 'active' : ''}`}
              onClick={() => onSelect(activeKey === seg.key ? null : seg.key)}
            >
              <span className="legend-dot" style={{ background: seg.color }} />
              {seg.label}
              <strong>
                {seg.value}
                {total > 0 && <small> ({Math.round((seg.value / total) * 100)}%)</small>}
              </strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StarDistribution({ distribution }) {
  const max = Math.max(1, ...distribution.map((d) => d.count));
  return (
    <div className="star-dist">
      {distribution.map((d) => (
        <div key={d.star} className="star-row">
          <span className="star-label">{d.star} ★</span>
          <div className="bar-track">
            <div className="bar-fill star-fill" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="star-count">{d.count}</span>
        </div>
      ))}
    </div>
  );
}
