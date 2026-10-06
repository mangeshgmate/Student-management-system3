from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_role
from ..database import get_db

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("", response_model=schemas.AssignmentOut, status_code=201)
def create_assignment(
    payload: schemas.AssignmentCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role(models.RoleEnum.admin)),
):
    assignment = models.Assignment(
        title=payload.title.strip(),
        language=payload.language,
        description=payload.description.strip(),
        deadline=payload.deadline,
        created_by=admin.id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("", response_model=List[schemas.AssignmentWithMyStatus])
def list_assignments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Returns every assignment. For a student, each item is annotated with
    that student's own submission status/code/rating (mirrors what the
    frontend previously kept in a single localStorage record)."""
    assignments = db.query(models.Assignment).order_by(models.Assignment.created_at.desc()).all()

    my_submissions = {}
    if current_user.role == models.RoleEnum.student:
        rows = (
            db.query(models.Submission)
            .filter(models.Submission.student_id == current_user.id)
            .all()
        )
        my_submissions = {s.assignment_id: s for s in rows}

    result = []
    for a in assignments:
        sub = my_submissions.get(a.id)
        result.append(
            schemas.AssignmentWithMyStatus(
                id=a.id,
                title=a.title,
                language=a.language,
                description=a.description,
                deadline=a.deadline,
                created_at=a.created_at,
                status=sub.status if sub else models.StatusEnum.pending,
                submitted_code=sub.code if sub else None,
                submitted_at=sub.submitted_at.strftime("%Y-%m-%d") if sub and sub.submitted_at else None,
                rating=sub.rating if sub else None,
            )
        )
    return result


@router.get("/{assignment_id}", response_model=schemas.AssignmentOut)
def get_assignment(assignment_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment
