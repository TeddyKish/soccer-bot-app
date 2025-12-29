from typing import Dict, List, Optional, Literal
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    role: Literal["admin", "ranker"]
    password: str = Field(..., min_length=1)
    displayName: Optional[str] = None


class LoginResponse(BaseModel):
    token: str
    role: Literal["admin", "ranker"]
    displayName: Optional[str]
    expiresAt: str


class PlayerCreate(BaseModel):
    name: str = Field(..., min_length=1)
    position: Literal["GK", "DEF", "ATT", "ALL"]


class PlayerUpdate(BaseModel):
    position: Literal["GK", "DEF", "ATT", "ALL"]


class GuestCreate(BaseModel):
    name: str = Field(..., min_length=1)
    position: Literal["GK", "DEF", "ATT", "ALL"]
    rating: float = Field(..., ge=0, le=10)


class GuestSetup(BaseModel):
    name: str = Field(..., min_length=1)
    position: Literal["GK", "DEF", "ATT", "ALL"]
    rating: float = Field(..., ge=0, le=10)
    originalName: Optional[str] = None
    invitedBy: Optional[str] = None


class MatchdayImport(BaseModel):
    message: str = Field(..., min_length=1)
    guests: Optional[List[GuestSetup]] = None


class MatchdayReplace(BaseModel):
    currentName: str = Field(..., min_length=1)
    replacementName: str = Field(..., min_length=1)


class ConstraintRequest(BaseModel):
    players: List[str]


class SettingsUpdate(BaseModel):
    balanceRatings: Optional[bool] = None
    enforceTiers: Optional[bool] = None
    enforceDefense: Optional[bool] = None
    enforceOffense: Optional[bool] = None
    enforceRoles: Optional[bool] = None
    numTeams: Optional[int] = None
    deviationThreshold: Optional[float] = None


class RankingsUpdate(BaseModel):
    rankings: Dict[str, float]
