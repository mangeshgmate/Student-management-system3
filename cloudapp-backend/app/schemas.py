from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, EmailStr, Field, ConfigDict

from .models import RoleEnum, StatusEnum


# ---------- Auth / Users ----------

class UserRegister(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    confirm_password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    role: RoleEnum


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Assignments ----------

class AssignmentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    language: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1)
    deadline: str  # "YYYY-MM-DD"


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    language: str
    description: str
    deadline: str
    created_at: datetime


# Matches the shape the React frontend already expects (assignment + its
# submission state flattened together), scoped to the current student.
class AssignmentWithMyStatus(AssignmentOut):
    status: StatusEnum
    submitted_code: Optional[str] = None
    submitted_at: Optional[str] = None
    rating: Optional[float] = None


# ---------- Submissions ----------

class SubmissionCreate(BaseModel):
    code: str = Field(min_length=1)


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assignment_id: int
    student_id: int
    student_name: str
    assignment_title: str
    language: str
    code: Optional[str]
    status: StatusEnum
    rating: Optional[float]
    submitted_at: Optional[datetime]


class RatingUpdate(BaseModel):
    rating: float = Field(ge=1, le=5)


# ---------- Run (mocked, no real execution) ----------

class RunCodeRequest(BaseModel):
    code: str
    language: str


class RunCodeResponse(BaseModel):
    output: str


# ---------- Leaderboard ----------

class LeaderboardEntry(BaseModel):
    rank: int
    student_id: int
    student_name: str
    submissions_completed: int


class LeaderboardOut(BaseModel):
    entries: List[LeaderboardEntry]
