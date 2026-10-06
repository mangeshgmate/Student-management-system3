import { useEffect, useMemo, useState } from 'react';
import {
  DeadlineBadge,
  DonutChart,
  EmptyState,
  LoadingButton,
  NotificationBell,
  PortalHeader,
  PortalNav,
  SkeletonCards,
  StarDistribution,
  ThemeToggle,
  Toasts,
} from '../shared/SharedUI';
import { useNow, useReadState, useStorageSync, useTheme, useToasts } from '../shared/portalHooks';
import {
  KEYS,
  PRIORITIES,
  WITHIN_48H,
  avg,
  buildLeaderboard,
  delay,
  formatDateTime,
  getDeadlineInfo,
  isLate,
  lateBy,
  loadAnnouncements,
  loadAssignments,
  loadDismissed,
  loadStudents,
  parseDeadline,
  ratingDistribution,
  saveDismissed,
  toGpa,
  updateAssignments,
} from '../shared/portalUtils';
import './StudentDashboard.css';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function StudentDashboard({ currentUser, onLogout }) {
  const email = (currentUser?.email || 'student@local').toLowerCase();
  const name = currentUser?.fullName || 'Student';

  const now = useNow(30000);
  const { theme, toggle } = useTheme();
  const { toasts, push } = useToasts();
  const { readIds, markAll, markOne } = useReadState(email);

  const [activeTab, setActiveTab] = useState('assignments');
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState(() => loadAssignments({ seed: true }));
  const [announcements, setAnnouncements] = useState(loadAnnouncements);
  const [students, setStudents] = useState(loadStudents);
  const [dismissed, setDismissed] = useState(() => loadDismissed(email));

  // editor modal
  const [selectedId, setSelectedId] = useState(null);
  const [studentCode, setStudentCode] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // analytics interaction
  const [activeSegment, setActiveSegment] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  }, []);

  useStorageSync({
    [KEYS.assignments]: () => setAssignments(loadAssignments({ seed: true })),
    [KEYS.announcements]: () => setAnnouncements(loadAnnouncements()),
    [KEYS.students]: () => setStudents(loadStudents()),
  });

  /* ───────── derived rows ───────── */
  const rows = useMemo(() => {
    const list = assignments.map((a) => {
      const sub = a.submissions[email] || null;
      const info = getDeadlineInfo(a.deadline, now);
      const status = sub ? 'submitted' : info.overdue ? 'overdue' : 'pending';
      return { a, sub, info, status };
    });
    // open work first (soonest deadline), submitted last
    return list.sort((x, y) => {
      if (!!x.sub !== !!y.sub) return x.sub ? 1 : -1;
      return x.info.ms - y.info.ms;
    });
  }, [assignments, email, now]);

  const urgent = rows.filter((r) => !r.sub && r.info.ms < WITHIN_48H);
  const selected = rows.find((r) => r.a.id === selectedId) || null;
  const visibleAnnouncements = announcements
    .filter((n) => !dismissed.includes(n.id))
    .sort((x, y) => PRIORITIES[x.priority].rank - PRIORITIES[y.priority].rank || new Date(y.createdAt) - new Date(x.createdAt));

  /* ───────── notifications ───────── */
  const notifications = useMemo(() => {
    const items = announcements.map((n) => ({
      id: `a-${n.id}`,
      icon: PRIORITIES[n.priority].icon,
      tone: n.priority === 'urgent' ? 'urgent' : 'info',
      title: n.title,
      text: n.message,
      at: n.createdAt,
    }));
    rows.forEach(({ a, sub }) => {
      if (!sub) return;
      (sub.feedback || []).forEach((f) =>
        items.push({ id: `f-${a.id}-${f.id}`, icon: '💬', title: `Feedback on "${a.title}"`, text: f.text, at: f.at })
      );
      if (sub.rating != null && sub.ratedAt) {
        items.push({ id: `r-${a.id}-${sub.ratedAt}`, icon: '⭐', title: `"${a.title}" was rated`, text: `You received ${sub.rating} / 5.`, at: sub.ratedAt });
      }
    });
    return items;
  }, [announcements, rows]);

  /* ───────── analytics ───────── */
  const stats = useMemo(() => {
    const completed = rows.filter((r) => r.status === 'submitted').length;
    const overdue = rows.filter((r) => r.status === 'overdue').length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    const late = rows.filter((r) => r.sub?.late).length;
    const ratings = rows.filter((r) => r.sub?.rating != null).map((r) => r.sub.rating);

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now);
      d.setDate(1);
      d.setMonth(d.getMonth() - (5 - i));
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString([], { month: 'short' }), count: 0 };
    });
    rows.forEach(({ sub }) => {
      if (!sub) return;
      const d = new Date(sub.submittedAt);
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.count += 1;
    });

    return {
      completed, overdue, pending, late, months,
      total: rows.length,
      pct: rows.length ? Math.round((completed / rows.length) * 100) : 0,
      avgRating: avg(ratings),
      ratedCount: ratings.length,
      distribution: ratingDistribution(ratings),
    };
  }, [rows, now]);

  const segments = [
    { key: 'completed', label: 'Completed', value: stats.completed, color: 'var(--success)' },
    { key: 'overdue', label: 'Overdue', value: stats.overdue, color: 'var(--danger)' },
    { key: 'pending', label: 'Pending', value: stats.pending, color: '#f59e0b' },
  ];
  const maxMonth = Math.max(1, ...stats.months.map((m) => m.count));

  const leaderboard = useMemo(
    () => buildLeaderboard(assignments, [...students, { email, fullName: name }]),
    [assignments, students, email, name]
  );

  /* ───────── actions ───────── */
  const openCodeModal = ({ a, sub }) => {
    setSelectedId(a.id);
    setStudentCode(sub?.code || `// Write your ${a.language} solution here\n\nfunction solution() {\n  return true;\n}`);
    setOutput('');
  };
  const closeCodeModal = () => {
    setSelectedId(null);
    setStudentCode('');
    setOutput('');
  };

  // Simulated runner (no real execution)
  const handleRunCode = async () => {
    setRunning(true);
    setOutput('');
    await delay(700);
    setOutput('▶ Compiling & executing…\nConsole output: all sample test cases passed (2/2).');
    setRunning(false);
  };

  const handleSubmitAssignment = async () => {
    if (!selected) return;
    if (!studentCode.trim()) {
      push('Write some code before submitting.', 'error');
      return;
    }
    setSubmitting(true);
    await delay(600);

    const { a } = selected;
    const submittedAt = new Date().toISOString();
    const late = isLate(a.deadline, submittedAt);

    setAssignments(
      updateAssignments((list) =>
        list.map((item) =>
          item.id !== a.id
            ? item
            : {
                ...item,
                submissions: {
                  ...item.submissions,
                  [email]: {
                    studentName: name,
                    studentEmail: email,
                    code: studentCode,
                    submittedAt,
                    late,
                    rating: null, // re-submissions are re-evaluated
                    ratedAt: null,
                    feedback: item.submissions[email]?.feedback || [],
                  },
                },
              }
        )
      )
    );
    setSubmitting(false);
    push(late ? `"${a.title}" submitted — marked as late.` : `"${a.title}" submitted.`, late ? 'error' : 'success');
    closeCodeModal();
  };

  const dismissAnnouncement = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    saveDismissed(email, next);
    markOne(`a-${id}`);
  };

  /* ───────── render ───────── */
  const openCount = stats.pending + stats.overdue;
  const tabs = [
    { id: 'assignments', icon: '📚', label: 'Assignments', badge: openCount },
    { id: 'analytics', icon: '📊', label: 'Analytics' },
    { id: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
  ];

  return (
    <div className="portal-shell">
      <Toasts toasts={toasts} />

      <PortalHeader
        variant="student"
        icon="🎓"
        title="Student Portal"
        subtitle={`Welcome back, ${name}! Track deadlines, submit solutions and read feedback.`}
      >
        <NotificationBell
          items={notifications}
          readIds={readIds}
          onMarkAll={markAll}
          onMarkOne={markOne}
          onSelect={() => setActiveTab('assignments')}
        />
        <ThemeToggle theme={theme} onToggle={toggle} />
        {onLogout && (
          <button className="btn-secondary" onClick={onLogout}>
            🚪 Log out
          </button>
        )}
      </PortalHeader>

      <PortalNav tabs={tabs} active={activeTab} onChange={setActiveTab} label="Student navigation" />

      {/* ═════ Tab: assignments ═════ */}
      {activeTab === 'assignments' && (
        <section>
          {urgent.length > 0 && (
            <aside className="alert-center" role="alert" aria-label="Urgent assignments">
              <div className="alert-title">
                🚨 {urgent.length} assignment{urgent.length > 1 ? 's' : ''} need{urgent.length === 1 ? 's' : ''} your attention
              </div>
              <ul>
                {urgent.slice(0, 4).map((r) => (
                  <li key={r.a.id}>
                    <span className="alert-name">{r.a.title}</span>
                    <DeadlineBadge deadline={r.a.deadline} now={now} />
                    <button className="btn-link" onClick={() => openCodeModal(r)}>
                      {r.info.overdue ? 'Submit late' : 'Open'}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          {visibleAnnouncements.length > 0 && (
            <div className="announcement-feed">
              {visibleAnnouncements.map((n) => (
                <div key={n.id} className={`announcement-card priority-${n.priority}`}>
                  <span className="announcement-icon">{PRIORITIES[n.priority].icon}</span>
                  <div className="announcement-main">
                    <h4>{n.title}</h4>
                    <p>{n.message}</p>
                    <time>{formatDateTime(n.createdAt)}</time>
                  </div>
                  <button className="dismiss-btn" onClick={() => dismissAnnouncement(n.id)} aria-label={`Dismiss ${n.title}`}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <SkeletonCards count={3} />
          ) : rows.length === 0 ? (
            <div className="card">
              <EmptyState kind="assignments" title="No assignments yet" text="When your instructor posts coursework, it will show up here." />
            </div>
          ) : (
            <div className="assignment-grid">
              {rows.map((row) => {
                const { a, sub, info, status } = row;
                return (
                  <article key={a.id} className={`assignment-card state-${sub ? 'done' : info.level}`}>
                    <div>
                      <div className="card-top">
                        <span className="badge badge-lang">{a.language}</span>
                        <span className="stack-row">
                          {sub?.late && <span className="badge badge-critical">⏰ Late submission</span>}
                          <span className={`badge ${status === 'submitted' ? 'badge-ok' : status === 'overdue' ? 'badge-critical' : 'badge-warning'}`}>
                            {status === 'submitted' ? '✓ Submitted' : status === 'overdue' ? '⚠ Overdue' : '⏳ Pending'}
                          </span>
                        </span>
                      </div>

                      <h3 className="assignment-card-title">{a.title}</h3>
                      <p className="assignment-card-desc">{a.description}</p>

                      <div className="deadline-block">
                        <span className="deadline-text">📅 {formatDateTime(parseDeadline(a.deadline))}</span>
                        {sub ? (
                          <span className="deadline-text">
                            Submitted {formatDateTime(sub.submittedAt)}
                            {sub.late && ` · ${lateBy(a.deadline, sub.submittedAt)} late`}
                          </span>
                        ) : (
                          <DeadlineBadge deadline={a.deadline} now={now} />
                        )}
                      </div>

                      {sub?.rating != null && <div className="rating-badge">★ Rated {sub.rating} / 5</div>}

                      {sub?.feedback?.length > 0 && (
                        <details className="feedback-details">
                          <summary>💬 Instructor feedback ({sub.feedback.length})</summary>
                          <ul className="thread">
                            {sub.feedback.map((f) => (
                              <li key={f.id}>
                                <p>{f.text}</p>
                                <time>{f.author} · {formatDateTime(f.at)}</time>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>

                    <button
                      className={`btn-submit-action ${sub ? 'submitted-btn' : info.overdue ? 'late-btn' : 'pending-btn'}`}
                      onClick={() => openCodeModal(row)}
                    >
                      {sub ? 'View / re-submit solution' : info.overdue ? 'Submit late →' : 'Solve & submit →'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ═════ Tab: analytics ═════ */}
      {activeTab === 'analytics' && (
        <section>
          {stats.total === 0 ? (
            <div className="card"><EmptyState kind="analytics" title="Nothing to analyse yet" text="Your stats appear once assignments are posted." /></div>
          ) : (
            <div className="analytics-grid">
              <div className="card span-2">
                <h2 className="section-heading">Submission breakdown</h2>
                <DonutChart segments={segments} activeKey={activeSegment} onSelect={setActiveSegment} />
                <div className="completion">
                  <div className="completion-head">
                    <span>{stats.completed} of {stats.total} assignments completed{stats.late > 0 && ` · ${stats.late} late`}</span>
                    <strong>{stats.pct}%</strong>
                  </div>
                  <div className="bar-track tall" role="progressbar" aria-valuenow={stats.pct} aria-valuemin="0" aria-valuemax="100">
                    <div className="bar-fill" style={{ width: `${stats.pct}%` }} />
                  </div>
                </div>
              </div>

              <div className="card">
                <h2 className="section-heading">Grades</h2>
                {stats.ratedCount === 0 ? (
                  <EmptyState kind="analytics" title="No grades yet" text="Ratings show up once your work is evaluated." />
                ) : (
                  <>
                    <div className="grade-hero">
                      <div>
                        <div className="grade-num">{stats.avgRating.toFixed(2)}<small> / 5</small></div>
                        <div className="muted small-text">Average rating</div>
                      </div>
                      <div>
                        <div className="grade-num gpa">{toGpa(stats.avgRating)}<small> / 4.0</small></div>
                        <div className="muted small-text">GPA equivalent</div>
                      </div>
                    </div>
                    <StarDistribution distribution={stats.distribution} />
                  </>
                )}
              </div>

              <div className="card span-3">
                <h2 className="section-heading">Monthly submission activity</h2>
                <div className="timeline" role="img" aria-label="Submissions per month, last six months">
                  {stats.months.map((m) => (
                    <div key={m.key} className="timeline-col" title={`${m.label}: ${m.count} submission${m.count === 1 ? '' : 's'}`}>
                      <span className="timeline-count">{m.count}</span>
                      <div className="timeline-bar" style={{ height: `${(m.count / maxMonth) * 100}%` }} />
                      <span className="timeline-label">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ═════ Tab: leaderboard ═════ */}
      {activeTab === 'leaderboard' && (
        <section>
          <div className="leaderboard-container">
            <div className="table-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr><th>Rank</th><th>Student</th><th>Submissions</th><th>Avg rating</th></tr>
                </thead>
                <tbody>
                  {leaderboard.map((r, i) => (
                    <tr key={r.email} className={`leaderboard-row ${r.email === email ? 'highlight-row' : ''}`}>
                      <td>{MEDALS[i] || ''} {i + 1}</td>
                      <td>{r.name}{r.email === email && ' (You)'}</td>
                      <td>{r.completed}</td>
                      <td>{r.ratings.length ? `★ ${r.avg.toFixed(1)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ═════ Code editor modal ═════ */}
      {selected && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={selected.a.title} onClick={closeCodeModal}>
          <div className="editor-modal-container" onClick={(e) => e.stopPropagation()}>
            <h3 className="assignment-card-title" style={{ fontSize: '1.35rem' }}>{selected.a.title}</h3>
            <p className="assignment-card-desc">{selected.a.description}</p>

            <div className="stack-row" style={{ marginBottom: 12 }}>
              <DeadlineBadge deadline={selected.a.deadline} now={now} />
              {selected.sub?.rating != null && <span className="rating-badge" style={{ margin: 0 }}>★ {selected.sub.rating} / 5</span>}
            </div>

            {selected.info.overdue && (
              <div className="late-warning" role="alert">
                ⚠️ The deadline has passed. This will be recorded as a <strong>late submission</strong>.
              </div>
            )}

            {selected.sub?.feedback?.length > 0 && (
              <ul className="thread" style={{ marginBottom: 14 }}>
                {selected.sub.feedback.map((f) => (
                  <li key={f.id}>
                    <p>{f.text}</p>
                    <time>{f.author} · {formatDateTime(f.at)}</time>
                  </li>
                ))}
              </ul>
            )}

            <div className="code-block-label">Code workspace ({selected.a.language})</div>
            <textarea className="editor-textarea" value={studentCode} onChange={(e) => setStudentCode(e.target.value)} spellCheck="false" />

            <div className="modal-footer">
              <LoadingButton className="btn-success" loading={running} onClick={handleRunCode}>
                ▶ Run code
              </LoadingButton>
              <LoadingButton loading={submitting} onClick={handleSubmitAssignment}>
                {submitting ? 'Submitting…' : selected.info.overdue && !selected.sub ? 'Submit late' : 'Submit assignment'}
              </LoadingButton>
              <button className="btn-secondary" onClick={closeCodeModal}>Cancel</button>
            </div>

            {output && <pre className="console-output"><code>{output}</code></pre>}
          </div>
        </div>
      )}
    </div>
  );
}
