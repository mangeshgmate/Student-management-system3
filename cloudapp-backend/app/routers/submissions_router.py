from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_role
from ..database import get_db

router = APIRouter(tags=["submissions"])


def _to_submission_out(sub: models.Submission) -> schemas.SubmissionOut:
    return schemas.SubmissionOut(
        id=sub.id,
        assignment_id=sub.assignment_id,
        student_id=sub.student_id,
        student_name=sub.student.full_name,
        assignment_title=sub.assignment.title,
        language=sub.assignment.language,
        code=sub.code,
        status=sub.status,
        rating=sub.rating,
        submitted_at=sub.submitted_at,
    )


@router.post("/assignments/{assignment_id}/submit", response_model=schemas.SubmissionOut)
def submit_assignment(
    assignment_id: int,
    payload: schemas.SubmissionCreate,
    db: Session = Depends(get_db),
    student: models.User = Depends(require_role(models.RoleEnum.student)),
):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    submission = (
        db.query(models.Submission)
        .filter(
            models.Submission.assignment_id == assignment_id,
            models.Submission.student_id == student.id,
        )
        .first()
    )

    if submission is None:
        submission = models.Submission(assignment_id=assignment_id, student_id=student.id)
        db.add(submission)

    submission.code = payload.code
    submission.status = models.StatusEnum.submitted
    submission.submitted_at = datetime.utcnow()
    # Re-submitting clears any previous rating so admins re-review fresh work.
    submission.rating = None

    db.commit()
    db.refresh(submission)
    return _to_submission_out(submission)


@router.get("/submissions", response_model=List[schemas.SubmissionOut])
def list_submissions(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role(models.RoleEnum.admin)),
):
    subs = (
        db.query(models.Submission)
        .filter(models.Submission.status == models.StatusEnum.submitted)
        .order_by(models.Submission.submitted_at.desc())
        .all()
    )
    return [_to_submission_out(s) for s in subs]


@router.get("/submissions/mine", response_model=List[schemas.SubmissionOut])
def list_my_submissions(
    db: Session = Depends(get_db),
    student: models.User = Depends(require_role(models.RoleEnum.student)),
):
    subs = (
        db.query(models.Submission)
        .filter(models.Submission.student_id == student.id)
        .order_by(models.Submission.submitted_at.desc())
        .all()
    )
    return [_to_submission_out(s) for s in subs]


@router.patch("/submissions/{submission_id}/rate", response_model=schemas.SubmissionOut)
def rate_submission(
    submission_id: int,
    payload: schemas.RatingUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role(models.RoleEnum.admin)),
):
    submission = db.query(models.Submission).filter(models.Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    submission.rating = payload.rating
    db.commit()
    db.refresh(submission)
    return _to_submission_out(submission)
