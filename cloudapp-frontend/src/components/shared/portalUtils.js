/**
 * portalUtils.js — storage, schema, deadline and analytics helpers.
 *
 * ─── localStorage schema (v2) ─────────────────────────────────────────────
 * 'assignments'   → Assignment[]
 *   Assignment {
 *     id: string,
 *     title: string,
 *     language: string,
 *     description: string,
 *     deadline: 'YYYY-MM-DDTHH:mm'        // local date + time (datetime-local)
 *     createdAt: ISO string,
 *     schemaVersion: 2,
 *     submissions: {                       // keyed by lowercase student email
 *       [email]: {
 *         studentName, studentEmail,
 *         code: string,
 *         submittedAt: ISO string,
 *         late: boolean,                   // submitted after the deadline
 *         rating: number | null,           // 1–5, set by admin
 *         ratedAt: ISO string | null,
 *         feedback: [{ id, text, at: ISO string, author }]
 *       }
 *     }
 *   }
 * 'announcements' → { id, title, message, priority: 'low'|'medium'|'urgent', createdAt }[]
 * 'registeredStudents' → { fullName, email, password, role }[]   (unchanged)
 * 'notif_read:<userId>' → string[]   ids of notifications already seen
 * 'dismissed:<userId>'  → string[]   announcement ids a student dismissed
 * 'portal_theme'        → 'light' | 'dark'
 *
 * Legacy v1 assignments (status / studentName / submittedCode / rating on the
 * assignment itself) are migrated automatically on first load.
 */

export const SCHEMA_VERSION = 2;
export const KEYS = {
  assignments: 'assignments',
  announcements: 'announcements',
  students: 'registeredStudents',
};

const HOUR = 3600e3;
const DAY = 24 * HOUR;

/* ───────────── low-level storage ───────────── */
const read = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const makeId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────── date helpers ───────────── */
export const toLocalInput = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const formatDateTime = (value) => {
  const d = new Date(value);
  return isNaN(d) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

/** Accepts 'YYYY-MM-DD' (legacy, treated as end of day) or 'YYYY-MM-DDTHH:mm'. */
export const parseDeadline = (value) => {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T23:59` : value);
  return isNaN(d) ? null : d;
};

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
export const formatDuration = (ms) => {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return plural(d, 'day');
  if (h >= 1) return plural(h, 'hour');
  return plural(Math.max(m, 1), 'minute');
};

/* ───────────── deadline alert logic ───────────── */
export const LEVELS = {
  critical: { icon: '🔴', name: 'Critical' },
  warning: { icon: '🟡', name: 'Warning' },
  ok: { icon: '🟢', name: 'On track' },
};

/**
 * level: critical (overdue or < 24h) | warning (1–3 days) | ok (> 3 days)
 */
export function getDeadlineInfo(deadline, now = Date.now()) {
  const d = parseDeadline(deadline);
  if (!d) return { ms: Infinity, overdue: false, level: 'ok', label: 'No deadline' };
  const ms = d.getTime() - now;

  if (ms < 0) {
    return { ms, overdue: true, level: 'critical', label: `Overdue by ${formatDuration(-ms)}` };
  }
  if (ms < DAY) {
    const sameDay = d.toDateString() === new Date(now).toDateString();
    return {
      ms,
      overdue: false,
      level: 'critical',
      label: sameDay ? `Due Today · ${formatDuration(ms)} left` : `Due in ${formatDuration(ms)}`,
    };
  }
  return {
    ms,
    overdue: false,
    level: ms <= 3 * DAY ? 'warning' : 'ok',
    label: `Due in ${formatDuration(ms)}`,
  };
}

export const isLate = (deadline, submittedAt) => {
  const d = parseDeadline(deadline);
  return !!d && new Date(submittedAt).getTime() > d.getTime();
};
export const lateBy = (deadline, submittedAt) => {
  const d = parseDeadline(deadline);
  return d ? formatDuration(new Date(submittedAt).getTime() - d.getTime()) : '';
};
export const WITHIN_48H = 2 * DAY;

/* ───────────── assignments ───────────── */
export function migrateAssignment(a) {
  if (a.schemaVersion === SCHEMA_VERSION && a.submissions) return a;

  const deadline = a.deadline && a.deadline.length === 10 ? `${a.deadline}T23:59` : a.deadline;
  const submissions = { ...(a.submissions || {}) };

  if (a.status === 'Submitted' && !a.submissions) {
    const email = (a.studentEmail || 'legacy@portal.local').toLowerCase();
    const at =
      a.submittedAt && a.submittedAt.length === 10
        ? `${a.submittedAt}T12:00:00.000Z`
        : a.submittedAt || new Date().toISOString();
    submissions[email] = {
      studentName: a.studentName || 'Student',
      studentEmail: email,
      code: a.submittedCode || '',
      submittedAt: at,
      late: isLate(deadline, at),
      rating: a.rating ?? null,
      ratedAt: null,
      feedback: [],
    };
  }

  // drop legacy single-student fields
  // eslint-disable-next-line no-unused-vars
  const { status, studentName, submittedCode, submittedAt, rating, studentEmail, ...rest } = a;
  return {
    ...rest,
    deadline,
    createdAt: a.createdAt || new Date(Number(a.id) || Date.now()).toISOString(),
    submissions,
    schemaVersion: SCHEMA_VERSION,
  };
}

const seedAssignment = () => ({
  id: 'seed-oop',
  title: 'Object-Oriented Programming Basics',
  language: 'Java',
  description: 'Implement a basic class structure with encapsulation and inheritance.',
  deadline: toLocalInput(new Date(Date.now() + 2 * DAY)),
  createdAt: new Date().toISOString(),
  submissions: {},
  schemaVersion: SCHEMA_VERSION,
});

export function loadAssignments({ seed = false } = {}) {
  const raw = read(KEYS.assignments, null);
  if (raw === null) {
    if (!seed) return [];
    const seeded = [seedAssignment()];
    write(KEYS.assignments, seeded);
    return seeded;
  }
  const migrated = raw.map(migrateAssignment);
  if (raw.some((a) => a.schemaVersion !== SCHEMA_VERSION)) write(KEYS.assignments, migrated);
  return migrated;
}

/** Read-modify-write against the latest stored data so other tabs' edits aren't lost. */
export function updateAssignments(updater) {
  const next = updater(loadAssignments());
  write(KEYS.assignments, next);
  return next;
}

export const loadAnnouncements = () => read(KEYS.announcements, []);
export function updateAnnouncements(updater) {
  const next = updater(loadAnnouncements());
  write(KEYS.announcements, next);
  return next;
}
export const loadStudents = () => read(KEYS.students, []);

/* per-user read / dismissed state */
export const loadReadIds = (uid) => read(`notif_read:${uid}`, []);
export const saveReadIds = (uid, ids) => write(`notif_read:${uid}`, ids);
export const loadDismissed = (uid) => read(`dismissed:${uid}`, []);
export const saveDismissed = (uid, ids) => write(`dismissed:${uid}`, ids);

/* ───────────── analytics ───────────── */
export const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
export const ratingDistribution = (ratings) =>
  [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: ratings.filter((r) => Math.round(r) === star).length,
  }));
export const toGpa = (rating) => ((rating / 5) * 4).toFixed(2);

export const PRIORITIES = {
  urgent: { label: 'Urgent', icon: '🚨', rank: 0 },
  medium: { label: 'Medium', icon: '📢', rank: 1 },
  low: { label: 'Low', icon: '💬', rank: 2 },
};

export function buildLeaderboard(assignments, students) {
  const map = new Map();
  students.forEach((s) => {
    const email = s.email.toLowerCase();
    map.set(email, { email, name: s.fullName, completed: 0, ratings: [] });
  });
  assignments.forEach((a) =>
    Object.values(a.submissions).forEach((sub) => {
      const email = sub.studentEmail.toLowerCase();
      if (!map.has(email)) map.set(email, { email, name: sub.studentName, completed: 0, ratings: [] });
      const row = map.get(email);
      row.completed += 1;
      if (sub.rating != null) row.ratings.push(sub.rating);
    })
  );
  return [...map.values()]
    .map((r) => ({ ...r, avg: avg(r.ratings) }))
    .sort((a, b) => b.completed - a.completed || b.avg - a.avg || a.name.localeCompare(b.name));
}

export function findAtRisk(assignments, students, now) {
  return students
    .map((student) => {
      const email = student.email.toLowerCase();
      const missing = assignments.filter((a) => !a.submissions[email]);
      const overdue = missing.filter((a) => getDeadlineInfo(a.deadline, now).overdue);
      const soon = missing.filter((a) => {
        const i = getDeadlineInfo(a.deadline, now);
        return !i.overdue && i.ms < WITHIN_48H;
      });
      const level = overdue.length ? 'high' : soon.length ? 'watch' : null;
      return { student, missing, overdue, soon, level };
    })
    .filter((r) => r.level)
    .sort((a, b) => (a.level === b.level ? b.overdue.length - a.overdue.length : a.level === 'high' ? -1 : 1));
}