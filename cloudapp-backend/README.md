# CloudApp Backend (FastAPI)

Backend for the assignment-submission app (React frontend you already have).
Replaces the `localStorage`-only, hardcoded-admin-credential logic with a real
API: JWT auth, a database, assignments, submissions, ratings, and a
leaderboard.

**No real code execution.** `POST /run` intentionally returns a fixed
simulated result — exactly what the frontend's "Run Code" button already
showed — instead of compiling or executing anything. Actually running
untrusted student code safely requires a sandboxed executor (isolated
containers, timeouts, no network) which is a separate, security-sensitive
project on its own.

## 1. Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then edit SECRET_KEY etc. as needed
```

## 2. Run

```bash
uvicorn app.main:app --reload --port 8000
```

- API base URL: `http://localhost:8000`
- Interactive docs: `http://localhost:8000/docs`
- A SQLite file `cloudapp.db` is created automatically on first run.
- An admin account is seeded automatically on startup using
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (defaults:
  `admin@1234` / `admin123`, matching the old frontend-hardcoded values).

## 3. Connect the React frontend

In your React app, point requests at `http://localhost:8000` (e.g. via an
`.env` file with `REACT_APP_API_URL=http://localhost:8000`, or a proxy entry
in `package.json`). The current frontend fakes everything in
`LoginPage.jsx` / `RegisterPage.jsx` / the dashboards via `localStorage` —
those calls need to be swapped for `fetch`/`axios` calls to the endpoints
below. Happy to do that wiring next if you want.

## API Reference

All endpoints except `/auth/register` and `/auth/login`
require an `Authorization: Bearer <token>` header.

### Auth
| Method | Path            | Who     | Body                                                   |
|--------|-----------------|---------|---------------------------------------------------------|
| POST   | `/auth/register`| Public  | `{full_name, email, password, confirm_password}`        |
| POST   | `/auth/login`   | Public  | `{email, password}` → `{access_token, token_type, user}` |
| GET    | `/auth/me`      | Any     | —                                                        |

Registration always creates a `student` account. The one `admin` account is
seeded on startup (see above) — this mirrors the old frontend's hardcoded
admin login, just moved server-side.

### Assignments
| Method | Path                    | Who   | Notes |
|--------|-------------------------|-------|-------|
| POST   | `/assignments`          | Admin | Create an assignment |
| GET    | `/assignments`          | Any   | List all; for a student, each item includes *their own* `status`, `submitted_code`, `submitted_at`, `rating` |
| GET    | `/assignments/{id}`     | Any   | Fetch one assignment |

### Submissions
| Method | Path                                  | Who     | Notes |
|--------|----------------------------------------|---------|-------|
| POST   | `/assignments/{id}/submit`            | Student | `{code}` — creates or overwrites the student's own submission for that assignment |
| GET    | `/submissions`                        | Admin   | All submitted work, for the "Check Submissions" tab |
| GET    | `/submissions/mine`                   | Student | The current student's own submissions |
| PATCH  | `/submissions/{submission_id}/rate`   | Admin   | `{rating: 1-5}` |

### Leaderboard
| Method | Path            | Who | Notes |
|--------|-----------------|-----|-------|
| GET    | `/leaderboard`  | Any | Students ranked by number of submitted assignments |

### Run (mocked — see note above)
| Method | Path    | Who | Body                     |
|--------|---------|-----|--------------------------|
| POST   | `/run`  | Any | `{code, language}` → fixed simulated output |

## Project layout

```
backend/
  app/
    main.py              # app setup, CORS, admin seeding, router wiring
    database.py           # SQLAlchemy engine/session
    models.py              # User, Assignment, Submission tables
    schemas.py              # Pydantic request/response models
    auth.py                  # password hashing, JWT, current-user dependencies
    routers/
      auth_router.py
      assignments_router.py
      submissions_router.py
      misc_router.py        # leaderboard + run (mocked)
  requirements.txt
  .env.example
```

## Notes on data model vs. the old localStorage shape

The old frontend stored assignment + submission fields together in one
`localStorage` record per assignment (because it only ever simulated a single
student). The backend properly separates **assignments** (shared, created by
admins) from **submissions** (one per student per assignment, unique
constraint enforced at the DB level), so this now supports real multiple
students. `GET /assignments` merges the current student's own submission
back into each assignment in the response so the dashboard UI logic barely
has to change.
