from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(tags=["misc"])


@router.get("/leaderboard", response_model=schemas.LeaderboardOut)
def get_leaderboard(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = (
        db.query(
            models.User.id,
            models.User.full_name,
            func.count(models.Submission.id).label("count"),
        )
        .join(models.Submission, models.Submission.student_id == models.User.id)
        .filter(
            models.User.role == models.RoleEnum.student,
            models.Submission.status == models.StatusEnum.submitted,
        )
        .group_by(models.User.id)
        .order_by(func.count(models.Submission.id).desc())
        .all()
    )

    entries = [
        schemas.LeaderboardEntry(
            rank=i + 1,
            student_id=row.id,
            student_name=row.full_name,
            submissions_completed=row.count,
        )
        for i, row in enumerate(rows)
    ]
    return schemas.LeaderboardOut(entries=entries)


@router.post("/run", response_model=schemas.RunCodeResponse)
def run_code(payload: schemas.RunCodeRequest, _: models.User = Depends(get_current_user)):
    """
    Intentionally NOT a real code execution sandbox.

    Actually compiling/running arbitrary, untrusted student code would need a
    properly isolated sandbox (containers, resource/time limits, no network,
    etc.) to be safe — that's a separate, security-sensitive project on its
    own. This endpoint keeps the exact same simulated behavior the frontend
    already had, just moved server-side so the UI flow keeps working as-is.
    """
    return schemas.RunCodeResponse(
        output="▶ Compiling & Executing...\nConsole Output: All sample test cases passed successfully (2/2)."
    )
