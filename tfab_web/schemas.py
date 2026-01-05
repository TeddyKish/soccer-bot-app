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
    entryCount: int = 0
    cashContribution: Optional[float] = None


class PlayerUpdate(BaseModel):
    position: Literal["GK", "DEF", "ATT", "ALL"]
    entryCount: Optional[int] = None
    cashContribution: Optional[float] = None


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
    isGuest: Optional[bool] = False
    position: Optional[Literal["GK", "DEF", "ATT", "ALL"]] = None
    rating: Optional[float] = Field(None, ge=0, le=10)
    invitedBy: Optional[str] = None


class MatchdayTeamColors(BaseModel):
    colors: List[Literal["white", "yellow", "red"]]


class MatchdayFinish(BaseModel):
    teamWins: Optional[List[int]] = None
    waterCarrierName: Optional[str] = None


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


class PlayerImportRequest(BaseModel):
    message: str = Field(..., min_length=1)


class CashUpdate(BaseModel):
    amount: Optional[float] = None
    delta: Optional[float] = None
    reason: Optional[str] = None


class CashIncome(BaseModel):
    playerName: str = Field(..., min_length=1)
    entries: int = Field(..., ge=1)
    amount: float = Field(..., gt=0)


class GuestPaymentUpdate(BaseModel):
    name: str = Field(..., min_length=1)
    date: str = Field(..., min_length=1)


class GuestPaymentResolve(BaseModel):
    name: str = Field(..., min_length=1)
    date: str = Field(..., min_length=1)
    method: Literal["income", "entry"]
    amount: Optional[float] = None
    payerName: Optional[str] = None


class RankerTokenCreate(BaseModel):
    name: str = Field(..., min_length=1)
