import { useEffect, useMemo, useState } from 'react';
import {
  DeadlineBadge,
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
  SCHEMA_VERSION,
  avg,
  delay,
  findAtRisk,
  formatDateTime,
  lateBy,
  loadAnnouncements,
  loadAssignments,
  loadStudents,
  makeId,
  parseDeadline,
  ratingDistribution,
  toLocalInput,
  updateAnnouncements,
  updateAssignments,
} from '../shared/portalUtils';
import './AdminDashboard.css';

const LANGUAGES = ['Python', 'Java'];
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unrated', label: 'Needs rating' },
  { id: 'late', label: 'Late' },
];

export default function AdminDashboard({ currentUser, onLogout }) {
  const adminId = 'admin';
  const now = useNow(30000);
  const { theme, toggle } = useTheme();
  const { toasts, push } = useToasts();
  const { readIds, markAll, markOne } = useReadState(adminId);

  const [activeTab, setActiveTab] = useState('create');
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState(loadAssignments);
  const [announcements, setAnnouncements] = useState(loadAnnouncements);
  const [students, setStudents] = useState(loadStudents);

  // assignment form
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('JavaScript');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [posting, setPosting] = useState(false);

  // announcement form
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annPriority, setAnnPriority] = useState('medium');
  const [annBusy, setAnnBusy] = useState(false);

  // submissions + evaluation modal
  const [filter, setFilter] = useState('all');
  const [evalRef, setEvalRef] = useState(null); // { assignmentId, email }
  const [rating, setRating] = useState(5);
  const [hoverStar, setHoverStar] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  }, []);

  useStorageSync({
    [KEYS.assignments]: () => setAssignments(loadAssignments()),
    [KEYS.announcements]: () => setAnnouncements(loadAnnouncements()),
    [KEYS.students]: () => setStudents(loadStudents()),
  });

  /* ───────── derived data ───────── */
  const pairs = useMemo(
    () =>
      assignments
        .flatMap((a) => Object.values(a.submissions).map((sub) => ({ a, sub })))
        .sort((x, y) => new Date(y.sub.submittedAt) - new Date(x.sub.submittedAt)),
    [assignments]
  );
  const unratedCount = pairs.filter((p) => p.sub.rating == null).length;
  const visiblePairs = pairs.filter((p) =>
    filter === 'unrated' ? p.sub.rating == null : filter === 'late' ? p.sub.late : true
  );

  const evalTarget = evalRef
    ? (() => {
        const a = assignments.find((x) => x.id === evalRef.assignmentId);
        const sub = a?.submissions[evalRef.email];
        return a && sub ? { a, sub } : null;
      })()
    : null;

  const notifications = useMemo(
    () =>
      pairs.map(({ a, sub }) => ({
        id: `s-${a.id}-${sub.studentEmail}-${sub.submittedAt}`,
        icon: sub.late ? '⏰' : '📥',
        tone: sub.late ? 'warn' : 'info',
        title: `${sub.studentName} submitted "${a.title}"`,
        text: sub.late ? `Late by ${lateBy(a.deadline, sub.submittedAt)} — waiting for review.` : 'Waiting for review.',
        at: sub.submittedAt,
        tab: 'submissions',
      })),
    [pairs]
  );

  /* ───────── analytics ───────── */
  const analytics = useMemo(() => {
    const allRatings = pairs.filter((p) => p.sub.rating != null).map((p) => p.sub.rating);
    const expected = assignments.length * students.length;
    const completion = expected ? Math.min(100, Math.round((pairs.length / expected) * 100)) : 0;
    const perAssignment = assignments.map((a) => {
      const subs = Object.values(a.submissions);
      const ratings = subs.filter((s) => s.rating != null).map((s) => s.rating);
      return {
        a,
        count: subs.length,
        late: subs.filter((s) => s.late).length,
        pct: students.length ? Math.min(100, Math.round((subs.length / students.length) * 100)) : 0,
        avgRating: avg(ratings),
        distribution: ratingDistribution(ratings),
      };
    });
    return {
      completion,
      avgRating: avg(allRatings),
      ratedCount: allRatings.length,
      perAssignment,
      atRisk: findAtRisk(assignments, students, now),
    };
  }, [assignments, students, pairs, now]);

  /* ───────── actions ───────── */
  const handlePostAssignment = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !deadline) {
      push('Fill in the title, description and deadline.', 'error');
      return;
    }
    const due = parseDeadline(deadline);
    if (!due || due.getTime() <= Date.now()) {
      push('Pick a deadline in the future.', 'error');
      return;
    }

    setPosting(true);
    await delay(500);
    const created = {
      id: makeId(),
      title: title.trim(),
      language,
      description: description.trim(),
      deadline,
      createdAt: new Date().toISOString(),
      submissions: {},
      schemaVersion: SCHEMA_VERSION,
    };
    setAssignments(updateAssignments((list) => [created, ...list]));
    setPosting(false);
    push(`Assignment "${created.title}" posted.`);
    setTitle('');
    setLanguage('JavaScript');
    setDescription('');
    setDeadline('');
  };

  const openEvaluation = (a, sub) => {
    setEvalRef({ assignmentId: a.id, email: sub.studentEmail.toLowerCase() });
    setRating(sub.rating ?? 5);
    setHoverStar(0);
    setFeedbackText('');
  };
  const closeEvaluation = () => {
    setEvalRef(null);
    setFeedbackText('');
  };

  const handleSaveEvaluation = async () => {
    if (!evalTarget) return;
    setSaving(true);
    await delay(500);
    const at = new Date().toISOString();
    const entry = feedbackText.trim()
      ? { id: makeId(), text: feedbackText.trim(), at, author: currentUser?.fullName || 'Admin' }
      : null;
    const { a } = evalTarget;
    const email = evalRef.email;

    setAssignments(
      updateAssignments((list) =>
        list.map((item) => {
          if (item.id !== a.id || !item.submissions[email]) return item;
          const prev = item.submissions[email];
          return {
            ...item,
            submissions: {
              ...item.submissions,
              [email]: {
                ...prev,
                rating,
                ratedAt: at,
                feedback: entry ? [...(prev.feedback || []), entry] : prev.feedback || [],
              },
            },
          };
        })
      )
    );
    setSaving(false);
    push(`Saved ${rating}/5${entry ? ' with feedback' : ''} for ${evalTarget.sub.studentName}.`);
    closeEvaluation();
  };

  const handlePostAnnouncement = async (e) => {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim()) {
      push('Add a title and a message.', 'error');
      return;
    }
    setAnnBusy(true);
    await delay(400);
    const item = {
      id: makeId(),
      title: annTitle.trim(),
      message: annMessage.trim(),
      priority: annPriority,
      createdAt: new Date().toISOString(),
    };
    setAnnouncements(updateAnnouncements((list) => [item, ...list]));
    setAnnBusy(false);
    push('Announcement sent to all students.');
    setAnnTitle('');
    setAnnMessage('');
    setAnnPriority('medium');
  };

  const deleteAnnouncement = (id) => {
    setAnnouncements(updateAnnouncements((list) => list.filter((x) => x.id !== id)));
    push('Announcement removed.');
  };

  /* ───────── render ───────── */
  const tabs = [
    { id: 'create', icon: '➕', label: 'Assignments' },
    { id: 'submissions', icon: '📥', label: 'Submissions', badge: unratedCount },
    { id: 'analytics', icon: '📊', label: 'Analytics' },
    { id: 'announcements', icon: '📢', label: 'Announcements' },
  ];

  return (
    <div className="portal-shell">
      <Toasts toasts={toasts} />

      <PortalHeader
        icon="⚡"
        title="Admin Dashboard"
        subtitle="Manage coursework, track deadlines and evaluate student code submissions."
      >
        <NotificationBell
          items={notifications}
          readIds={readIds}
          onMarkAll={markAll}
          onMarkOne={markOne}
          onSelect={(n) => setActiveTab(n.tab)}
        />
        <ThemeToggle theme={theme} onToggle={toggle} />
        {onLogout && (
          <button className="btn-secondary" onClick={onLogout}>
            🚪 Log out
          </button>
        )}
      </PortalHeader>

      <PortalNav tabs={tabs} active={activeTab} onChange={setActiveTab} label="Admin navigation" />

      {/* ═════ Tab: assignments ═════ */}
      {activeTab === 'create' && (
        <section>
          <div className="card">
            <h2 className="section-heading">Create new assignment</h2>
            <form onSubmit={handlePostAssignment}>
              <div className="form-group">
                <label className="form-label" htmlFor="assignment-title">Assignment title</label>
                <input id="assignment-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Python Functions & Modules" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="programming-language">Programming language</label>
                  <select id="programming-language" className="form-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="submission-deadline">Deadline (date & time)</label>
                  <input id="submission-deadline" className="form-input" type="datetime-local" min={toLocalInput()} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="assignment-description">Description & requirements</label>
                <textarea id="assignment-description" className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the task, constraints and expected output…" />
              </div>

              <LoadingButton type="submit" loading={posting}>
                {posting ? 'Posting…' : '+ Post assignment'}
              </LoadingButton>
            </form>
          </div>

          <h3 className="section-heading">Posted assignments ({assignments.length})</h3>
          {loading ? (
            <SkeletonCards count={2} />
          ) : assignments.length === 0 ? (
            <div className="card">
              <EmptyState kind="assignments" title="No assignments yet" text="Use the form above to post your first assignment. Students see it instantly." />
            </div>
          ) : (
            <div className="card-list">
              {assignments.map((item) => {
                const count = Object.keys(item.submissions).length;
                return (
                  <div key={item.id} className="item-card">
                    <div className="item-head">
                      <strong>{item.title}</strong>
                      <span className="badge badge-lang">{item.language}</span>
                    </div>
                    <p className="item-desc">{item.description}</p>
                    <div className="stack-row">
                      <span className="muted small-text">📅 {formatDateTime(parseDeadline(item.deadline))}</span>
                      <DeadlineBadge deadline={item.deadline} now={now} />
                      <span className="badge badge-neutral">
                        {count}/{students.length || '–'} submitted
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ═════ Tab: submissions ═════ */}
      {activeTab === 'submissions' && (
        <section>
          <div className="section-bar">
            <h2 className="section-heading">Student code submissions</h2>
            <div className="chip-group" role="group" aria-label="Filter submissions">
              {FILTERS.map((f) => (
                <button key={f.id} className={`chip ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <SkeletonCards count={2} />
          ) : visiblePairs.length === 0 ? (
            <div className="card">
              <EmptyState
                kind="submissions"
                title={pairs.length === 0 ? 'No submissions yet' : 'Nothing matches this filter'}
                text={pairs.length === 0 ? 'Submitted code will appear here, ready to review.' : 'Try another filter to see more submissions.'}
              />
            </div>
          ) : (
            <div className="card-list">
              {visiblePairs.map(({ a, sub }) => (
                <article key={`${a.id}-${sub.studentEmail}`} className={`item-card ${sub.late ? 'is-late' : ''}`}>
                  <div className="item-head">
                    <div className="stack-row">
                      <strong>👤 {sub.studentName}</strong>
                      <span className="badge badge-lang">{a.language}</span>
                      {sub.late && (
                        <span className="badge badge-critical">🔴 Late by {lateBy(a.deadline, sub.submittedAt)}</span>
                      )}
                      {sub.rating == null && <span className="badge badge-warning">Needs rating</span>}
                    </div>
                    <span className="muted small-text">Submitted {formatDateTime(sub.submittedAt)}</span>
                  </div>

                  <div className="small-text"><strong>Assignment:</strong> {a.title}</div>

                  <div className="code-block-label">Submitted code</div>
                  <pre className="code-block"><code>{sub.code || '// No code submitted.'}</code></pre>

                  {sub.feedback?.length > 0 && (
                    <div className="feedback-count muted small-text">💬 {sub.feedback.length} feedback message{sub.feedback.length > 1 ? 's' : ''} sent</div>
                  )}

                  <div className="item-head item-foot">
                    <div>
                      <strong className="small-text">Rating: </strong>
                      {sub.rating != null ? <span className="rating-display">★ {sub.rating} / 5</span> : <span className="muted small-text">Not rated</span>}
                    </div>
                    <button className="btn-action" onClick={() => openEvaluation(a, sub)}>
                      {sub.rating != null ? 'Update evaluation' : 'Evaluate'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ═════ Tab: analytics ═════ */}
      {activeTab === 'analytics' && (
        <section>
          <div className="kpi-grid">
            <Kpi icon="🎓" label="Students registered" value={students.length} />
            <Kpi icon="✅" label="Class completion rate" value={`${analytics.completion}%`} progress={analytics.completion} />
            <Kpi icon="🕑" label="Pending evaluations" value={unratedCount} tone={unratedCount ? 'warn' : ''} />
            <Kpi icon="⭐" label="Class average rating" value={analytics.ratedCount ? `${analytics.avgRating.toFixed(2)} / 5` : '—'} />
          </div>

          <h2 className="section-heading">Per-assignment performance</h2>
          {analytics.perAssignment.length === 0 ? (
            <div className="card"><EmptyState kind="analytics" title="No data yet" text="Post an assignment to start collecting metrics." /></div>
          ) : (
            <div className="metric-grid">
              {analytics.perAssignment.map(({ a, count, late, pct, avgRating, distribution }) => (
                <div key={a.id} className="item-card">
                  <div className="item-head">
                    <strong>{a.title}</strong>
                    <span className="badge badge-lang">{a.language}</span>
                  </div>
                  <div className="stack-row small-text muted">
                    <span>{count} submission{count === 1 ? '' : 's'}</span>
                    {late > 0 && <span className="badge badge-critical">{late} late</span>}
                    <DeadlineBadge deadline={a.deadline} now={now} />
                  </div>
                  <div className="progress-line">
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                    <strong>{pct}%</strong>
                  </div>
                  <div className="small-text muted">
                    Avg rating: {avgRating ? `${avgRating.toFixed(2)} / 5` : 'not rated yet'}
                  </div>
                  <StarDistribution distribution={distribution} />
                </div>
              ))}
            </div>
          )}

          <h2 className="section-heading" style={{ marginTop: 28 }}>At-risk students</h2>
          <div className="card">
            {students.length === 0 ? (
              <EmptyState kind="analytics" title="No registered students" text="Students appear here once they register." />
            ) : analytics.atRisk.length === 0 ? (
              <EmptyState kind="submissions" title="No one is at risk 🎉" text="Every student is up to date on overdue and upcoming work." />
            ) : (
              <ul className="risk-list">
                {analytics.atRisk.map(({ student, overdue, soon, missing, level }) => (
                  <li key={student.email} className={`risk-row risk-${level}`}>
                    <div className="risk-who">
                      <strong>{student.fullName}</strong>
                      <span className="muted small-text">{student.email}</span>
                    </div>
                    <div className="risk-details">
                      {overdue.length > 0 && <span className="badge badge-critical">🔴 {overdue.length} overdue</span>}
                      {soon.length > 0 && <span className="badge badge-warning">🟡 {soon.length} due within 48h</span>}
                      <span className="badge badge-neutral">{missing.length} unsubmitted</span>
                    </div>
                    <div className="risk-titles small-text muted">
                      {[...overdue, ...soon].map((a) => a.title).join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ═════ Tab: announcements ═════ */}
      {activeTab === 'announcements' && (
        <section>
          <div className="card">
            <h2 className="section-heading">Broadcast announcement</h2>
            <form onSubmit={handlePostAnnouncement}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="ann-title">Title</label>
                  <input id="ann-title" className="form-input" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="e.g. Midterm schedule changed" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="ann-priority">Priority</label>
                  <select id="ann-priority" className="form-select" value={annPriority} onChange={(e) => setAnnPriority(e.target.value)}>
                    {Object.entries(PRIORITIES).map(([id, p]) => <option key={id} value={id}>{p.icon} {p.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ann-message">Message</label>
                <textarea id="ann-message" className="form-textarea" value={annMessage} onChange={(e) => setAnnMessage(e.target.value)} placeholder="What do students need to know?" />
              </div>
              <LoadingButton type="submit" loading={annBusy}>
                {annBusy ? 'Sending…' : '📢 Send to all students'}
              </LoadingButton>
            </form>
          </div>

          <h3 className="section-heading">Sent announcements ({announcements.length})</h3>
          {announcements.length === 0 ? (
            <div className="card"><EmptyState kind="announcements" title="No announcements yet" text="Broadcasts you send appear on every student's portal." /></div>
          ) : (
            <div className="card-list">
              {announcements.map((n) => (
                <div key={n.id} className={`announcement-card priority-${n.priority}`}>
                  <span className="announcement-icon">{PRIORITIES[n.priority].icon}</span>
                  <div className="announcement-main">
                    <h4>{n.title} <span className="badge badge-neutral">{PRIORITIES[n.priority].label}</span></h4>
                    <p>{n.message}</p>
                    <time>{formatDateTime(n.createdAt)}</time>
                  </div>
                  <button className="btn-danger" onClick={() => deleteAnnouncement(n.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ═════ Evaluation modal ═════ */}
      {evalTarget && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Evaluate submission" onClick={closeEvaluation}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-header">Evaluate submission</h3>
            <div className="modal-body">
              <div className="modal-info-row"><strong>Student:</strong> {evalTarget.sub.studentName}</div>
              <div className="modal-info-row"><strong>Assignment:</strong> {evalTarget.a.title}</div>
              {evalTarget.sub.late && (
                <div className="modal-info-row"><span className="badge badge-critical">🔴 Late by {lateBy(evalTarget.a.deadline, evalTarget.sub.submittedAt)}</span></div>
              )}

              <div className="form-group" style={{ marginTop: 18 }}>
                <span className="form-label" id="star-label">Rating</span>
                <div className="star-picker" role="radiogroup" aria-labelledby="star-label" onMouseLeave={() => setHoverStar(0)}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`${n} star${n > 1 ? 's' : ''}`}
                      className={`star-btn ${n <= (hoverStar || rating) ? 'on' : ''}`}
                      onMouseEnter={() => setHoverStar(n)}
                      onClick={() => setRating(n)}
                    >
                      ★
                    </button>
                  ))}
                  <span className="star-readout">{rating} / 5</span>
                </div>
              </div>

              {evalTarget.sub.feedback?.length > 0 && (
                <div className="form-group">
                  <span className="form-label">Previous feedback</span>
                  <ul className="thread">
                    {evalTarget.sub.feedback.map((f) => (
                      <li key={f.id}>
                        <p>{f.text}</p>
                        <time>{f.author} · {formatDateTime(f.at)}</time>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="feedback-text">New feedback for the student</label>
                <textarea id="feedback-text" className="form-textarea" value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="What went well? What should they improve?" />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeEvaluation}>Cancel</button>
              <LoadingButton loading={saving} onClick={handleSaveEvaluation}>
                {saving ? 'Saving…' : 'Save evaluation'}
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, progress, tone = '' }) {
  return (
    <div className={`kpi-card ${tone}`}>
      <span className="kpi-icon" aria-hidden="true">{icon}</span>
      <div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
        {progress != null && (
          <div className="bar-track kpi-bar"><div className="bar-fill" style={{ width: `${progress}%` }} /></div>
        )}
      </div>
    </div>
  );
}
