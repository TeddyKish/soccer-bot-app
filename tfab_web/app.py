from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from tfab_framework.tfab_consts import Consts as TConsts
from tfab_framework.tfab_database_handler import TFABDBHandler
from tfab_utils.tfab_message_parser import MessageParser
from tfab_utils.tfab_team_generator import TeamGenerator
from tfab_web.auth import AuthService, SESSION_ROLE_FIELD, SESSION_USER_ID_FIELD, SESSION_DISPLAY_NAME_FIELD
from tfab_web.schemas import (
    LoginRequest,
    LoginResponse,
    PlayerCreate,
    PlayerUpdate,
    MatchdayImport,
    MatchdayReplace,
    GuestCreate,
    ConstraintRequest,
    SettingsUpdate,
    RankingsUpdate,
)
from tfab_web.settings import Settings


settings = Settings()
app = FastAPI(title=settings.app_name)

db = TFABDBHandler.get_instance(
    settings.mongodb_db_name,
    settings.mongodb_port,
    db_host=settings.mongodb_host,
    db_uri=settings.mongodb_uri or None,
)

auth_service = AuthService(db, ttl_minutes=settings.session_ttl_minutes)


if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def bootstrap_configuration():
    db.upsert_configuration_value(TConsts.INTERNAL_ADMIN_PASSWORD_KEY, settings.admin_password)
    db.upsert_configuration_value(TConsts.INTERNAL_RANKER_PASSWORD_KEY, settings.ranker_password)
    if not db.check_configuration_existence(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY):
        db.insert_configuration_value(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY, 1)

    if not db.check_configuration_existence(TConsts.TeamGenerationParameters["NUM_TEAMS"]):
        db.insert_configuration_value(TConsts.TeamGenerationParameters["NUM_TEAMS"], 3)
    for key in TConsts.TeamGenerationParameters.values():
        if not db.check_configuration_existence(key):
            db.insert_configuration_value(key, 1)


bootstrap_configuration()


def get_client_ip(request: Request):
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def build_attempt_key(role, request: Request, display_name=None):
    ip = get_client_ip(request)
    identity = display_name or "anonymous"
    return f"{role}:{identity}:{ip}"


def require_session(request: Request):
    auth_header = request.headers.get("Authorization", "")
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="נדרשת הזדהות")
    session = auth_service.get_session(parts[1])
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ההתחברות פגה")
    return session


def require_role(required_role):
    def _guard(session=Depends(require_session)):
        if session[SESSION_ROLE_FIELD] != required_role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה")
        return session

    return _guard


def get_today_date():
    return datetime.now().strftime(TConsts.MATCHDAYS_DATE_FORMAT)

def parse_matchday_date(date_value):
    if not date_value:
        return None
    try:
        return datetime.strptime(date_value, TConsts.MATCHDAYS_DATE_FORMAT)
    except ValueError:
        return None


def position_label(position):
    if not position:
        return "לא ידוע"
    return TConsts.PlayerPositionToHebrew.get(position, position)


def serialize_matchday(matchday):
    if not matchday:
        return None

    dev_threshold = db.get_configuration_value(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY)
    guests = matchday.get(TConsts.MATCHDAYS_GUESTS_KEY, []) or []
    guest_index = {guest[TConsts.PLAYERS_NAME_KEY]: guest for guest in guests}
    roster_details = []
    for player_name in matchday.get(TConsts.MATCHDAYS_ROSTER_KEY, []) or []:
        if player_name in guest_index:
            guest = guest_index[player_name]
            position = guest.get(TConsts.PLAYERS_CHARACTERISTICS_KEY)
            average_rating = guest.get(TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY, 0)
        else:
            position = db.get_player_characteristic(player_name)
            average_rating = db.get_player_average_rating(player_name, dev_threshold)
        roster_details.append(
            {
                "name": player_name,
                "position": position,
                "positionLabel": position_label(position),
                "averageRating": average_rating,
            }
        )

    teams = []
    for team in matchday.get(TConsts.MATCHDAYS_TEAMS_KEY, []) or []:
        team_players = []
        for player in team.get(TConsts.MATCHDAYS_SPECIFIC_TEAM_ROSTER_KEY, []) or []:
            team_players.append(
                {
                    "name": player[TConsts.PLAYERS_NAME_KEY],
                    "position": player[TConsts.PLAYERS_CHARACTERISTICS_KEY],
                    "positionLabel": position_label(player[TConsts.PLAYERS_CHARACTERISTICS_KEY]),
                    "averageRating": player[TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY],
                }
            )
        field_ratings = [
            entry["averageRating"]
            for entry in team_players
            if entry.get("position") != TConsts.PlayerCharacteristics["GOALKEEPER"]
        ]
        average_rating = (sum(field_ratings) / len(field_ratings)) if field_ratings else 0
        teams.append(
            {
                "rating": team.get(TConsts.MATCHDAYS_SPECIFIC_TEAM_RATING_KEY, 0),
                "averageRating": average_rating,
                "players": team_players,
            }
        )

    return {
        "date": matchday.get(TConsts.MATCHDAYS_DATE_KEY),
        "time": matchday.get(TConsts.MATCHDAYS_TIME_KEY),
        "location": matchday.get(TConsts.MATCHDAYS_LOCATION_KEY),
        "roster": matchday.get(TConsts.MATCHDAYS_ROSTER_KEY, []) or [],
        "rosterDetails": roster_details,
        "guests": [
            {
                "name": guest.get(TConsts.PLAYERS_NAME_KEY),
                "position": guest.get(TConsts.PLAYERS_CHARACTERISTICS_KEY),
                "positionLabel": position_label(guest.get(TConsts.PLAYERS_CHARACTERISTICS_KEY)),
                "rating": guest.get(TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY, 0),
                "invitedBy": guest.get("invitedBy"),
            }
            for guest in guests
        ],
        "teams": teams,
        "couplingConstraints": matchday.get(TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY, []) or [],
        "decouplingConstraints": matchday.get(TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY, []) or [],
        "originalMessage": matchday.get(TConsts.MATCHDAYS_ORIGINAL_MESSAGE_KEY),
        "prettyMessage": MessageParser.generate_matchday_message(matchday),
    }


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request):
    role = payload.role
    display_name = payload.displayName.strip() if payload.displayName else None
    if display_name == "":
        display_name = None

    if role == "ranker" and not display_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="יש להזין שם מזהה")

    attempt_key = build_attempt_key(role, request, display_name)
    blocked, blocked_until = auth_service.is_blocked(attempt_key)
    if blocked:
        until = blocked_until.strftime("%H:%M") if blocked_until else ""
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"נחסמת זמנית אחרי ניסיונות כושלים. נסה שוב אחרי {until}",
        )

    expected_password = (
        db.get_configuration_value(TConsts.INTERNAL_ADMIN_PASSWORD_KEY)
        if role == "admin"
        else db.get_configuration_value(TConsts.INTERNAL_RANKER_PASSWORD_KEY)
    )

    if payload.password != expected_password:
        blocked_until = auth_service.register_failure(attempt_key)
        if blocked_until:
            until = blocked_until.strftime("%H:%M")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"נחסמת זמנית אחרי ניסיונות כושלים. נסה שוב אחרי {until}",
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="סיסמה שגויה")

    auth_service.clear_failures(attempt_key)

    if role == "ranker":
        if not db.check_ranker_existence(display_name):
            db.insert_ranker(display_name, display_name)
        user_id = display_name
    else:
        user_id = display_name or "admin"
        if not db.check_admin_existence(user_id):
            db.insert_admin(display_name or "מנהל", user_id)

    token, expires_at = auth_service.create_session(role, user_id, display_name)
    return LoginResponse(
        token=token,
        role=role,
        displayName=display_name,
        expiresAt=expires_at.isoformat(),
    )


@app.get("/api/auth/me")
async def auth_me(session=Depends(require_session)):
    return {
        "role": session[SESSION_ROLE_FIELD],
        "userId": session[SESSION_USER_ID_FIELD],
        "displayName": session.get(SESSION_DISPLAY_NAME_FIELD),
    }


@app.post("/api/auth/logout")
async def logout(request: Request, session=Depends(require_session)):
    auth_header = request.headers.get("Authorization", "")
    parts = auth_header.split()
    if len(parts) == 2:
        auth_service.delete_session(parts[1])
    return {"status": "ok"}


@app.get("/api/admin/players")
async def list_players(session=Depends(require_role("admin"))):
    players = []
    for name, position, rating in db.get_player_list(hebrew_characteristics=False):
        players.append(
            {
                "name": name,
                "position": position,
                "positionLabel": position_label(position),
                "averageRating": rating,
            }
        )
    return {"players": players}


@app.post("/api/admin/players")
async def add_player(payload: PlayerCreate, session=Depends(require_role("admin"))):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="חובה להזין שם שחקן")
    db.insert_player(name, payload.position)
    return {"status": "ok"}


@app.patch("/api/admin/players/{player_name}")
async def edit_player(player_name: str, payload: PlayerUpdate, session=Depends(require_role("admin"))):
    player_name = player_name.strip()
    found, _ = db.edit_player(player_name, payload.position)
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="השחקן לא נמצא")
    return {"status": "ok"}


@app.delete("/api/admin/players/{player_name}")
async def delete_player(player_name: str, session=Depends(require_role("admin"))):
    player_name = player_name.strip()
    if not db.delete_player(player_name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="השחקן לא נמצא")
    return {"status": "ok"}


@app.get("/api/admin/settings")
async def get_settings(session=Depends(require_role("admin"))):
    return {
        "settings": {
            "balanceRatings": bool(db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_RATINGS"])),
            "enforceTiers": bool(db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_TIERS"])),
            "enforceDefense": bool(db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_DEFENSE"])),
            "enforceOffense": bool(db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_OFFENSE"])),
            "enforceRoles": bool(db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_ROLES"])),
            "numTeams": db.get_configuration_value(TConsts.TeamGenerationParameters["NUM_TEAMS"]),
            "deviationThreshold": db.get_configuration_value(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY),
        }
    }


@app.patch("/api/admin/settings")
async def update_settings(payload: SettingsUpdate, session=Depends(require_role("admin"))):
    updates = payload.model_dump(exclude_none=True) if hasattr(payload, "model_dump") else payload.dict(exclude_none=True)
    if not updates:
        return {"status": "noop"}

    mapping = {
        "balanceRatings": TConsts.TeamGenerationParameters["BLC_RATINGS"],
        "enforceTiers": TConsts.TeamGenerationParameters["BLC_TIERS"],
        "enforceDefense": TConsts.TeamGenerationParameters["BLC_DEFENSE"],
        "enforceOffense": TConsts.TeamGenerationParameters["BLC_OFFENSE"],
        "enforceRoles": TConsts.TeamGenerationParameters["BLC_ROLES"],
    }

    for key, config_key in mapping.items():
        if key in updates:
            db.modify_configuration_value(config_key, int(bool(updates[key])))

    if "numTeams" in updates:
        num_teams = int(updates["numTeams"])
        if num_teams < 2 or num_teams > 10:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="מספר קבוצות לא תקין")
        db.modify_configuration_value(TConsts.TeamGenerationParameters["NUM_TEAMS"], num_teams)

    if "deviationThreshold" in updates:
        db.modify_configuration_value(
            TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY, float(updates["deviationThreshold"])
        )

    return {"status": "ok"}


@app.get("/api/admin/matchday/today")
async def get_today_matchday(session=Depends(require_role("admin"))):
    today = get_today_date()
    matchday = db.get_matchday(today)
    return {"matchday": serialize_matchday(matchday)}


@app.delete("/api/admin/matchday/today")
async def delete_today_matchday(session=Depends(require_role("admin"))):
    today = get_today_date()
    if db.check_matchday_existence(today):
        if not db.delete_matchday(today):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="לא הצלחתי להסיר את המשחק")
    return {"status": "ok"}


@app.post("/api/admin/matchday/preview")
async def preview_matchday(payload: MatchdayImport, session=Depends(require_role("admin"))):
    result_dictionary = MessageParser.parse_matchday_message(payload.message)

    roster = result_dictionary.get(TConsts.MATCHDAYS_ROSTER_KEY) or []
    detected_guests = result_dictionary.get(TConsts.MATCHDAYS_GUESTS_KEY) or []
    date_value = result_dictionary.get(TConsts.MATCHDAYS_DATE_KEY)
    time_value = result_dictionary.get(TConsts.MATCHDAYS_TIME_KEY)
    location = result_dictionary.get(TConsts.MATCHDAYS_LOCATION_KEY)

    if not roster:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הרשימה ששלחת לא תקינה, לא הצלחתי לקרוא את רשימת השחקנים כהלכה",
        )
    if date_value is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הרשימה ששלחת לא תקינה, לא הצלחתי לקרוא את התאריך כהלכה",
        )
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הרשימה ששלחת לא תקינה, לא הצלחתי לקרוא את המיקום כהלכה",
        )

    today_date = get_today_date()
    if today_date != date_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ניתן לקבוע רשימה רק ביום המשחק",
        )

    guest_names = {
        guest.get(TConsts.PLAYERS_NAME_KEY)
        for guest in detected_guests
        if guest.get(TConsts.PLAYERS_NAME_KEY)
    }
    missing_players = [
        player
        for player in roster
        if not db.check_player_existence(player) and player not in guest_names
    ]
    if missing_players:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "ברשימה קיימים שחקנים לא מוכרים למערכת",
                "missingPlayers": missing_players,
            },
        )

    return {
        "matchday": {
            "date": date_value,
            "time": time_value,
            "location": location,
            "roster": roster,
        },
        "guests": detected_guests,
    }


@app.post("/api/admin/matchday/import")
async def import_matchday(payload: MatchdayImport, session=Depends(require_role("admin"))):
    result_dictionary = MessageParser.parse_matchday_message(payload.message)

    roster = result_dictionary.get(TConsts.MATCHDAYS_ROSTER_KEY) or []
    detected_guests = result_dictionary.get(TConsts.MATCHDAYS_GUESTS_KEY) or []
    date_value = result_dictionary.get(TConsts.MATCHDAYS_DATE_KEY)
    time_value = result_dictionary.get(TConsts.MATCHDAYS_TIME_KEY)
    location = result_dictionary.get(TConsts.MATCHDAYS_LOCATION_KEY)

    if not roster:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הרשימה ששלחת לא תקינה, לא הצלחתי לקרוא את רשימת השחקנים כהלכה",
        )
    if date_value is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הרשימה ששלחת לא תקינה, לא הצלחתי לקרוא את התאריך כהלכה",
        )
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הרשימה ששלחת לא תקינה, לא הצלחתי לקרוא את המיקום כהלכה",
        )

    today_date = get_today_date()
    if today_date != date_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ניתן לקבוע רשימה רק ביום המשחק",
        )

    guest_payload = payload.guests or []
    if detected_guests and not guest_payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "נמצאו שחקני אורח, יש להגדיר אותם לפני שמירת הרשימה",
                "detectedGuests": detected_guests,
            },
        )

    guest_by_original = {}
    for guest in guest_payload:
        original_name = guest.originalName or guest.name
        guest_by_original[original_name] = guest

    guest_names = {guest.name for guest in guest_payload}
    missing_players = [
        player
        for player in roster
        if not db.check_player_existence(player)
        and player not in guest_names
        and player not in guest_by_original
    ]
    if missing_players:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "ברשימה קיימים שחקנים לא מוכרים למערכת",
                "missingPlayers": missing_players,
            },
        )

    existing_matchday = db.get_matchday(today_date)
    existing_guests = existing_matchday.get(TConsts.MATCHDAYS_GUESTS_KEY, []) if existing_matchday else []
    guest_by_name = {
        guest.get(TConsts.PLAYERS_NAME_KEY): guest
        for guest in existing_guests
        if guest.get(TConsts.PLAYERS_NAME_KEY)
    }

    if guest_payload:
        updated_roster = []
        for player in roster:
            guest_override = guest_by_original.get(player)
            if guest_override:
                updated_roster.append(guest_override.name)
            else:
                updated_roster.append(player)
        roster = updated_roster

        for guest in guest_payload:
            guest_name = guest.name.strip()
            if not guest_name:
                continue
            position = guest.position
            rating_value = 0 if position == TConsts.PlayerCharacteristics["GOALKEEPER"] else float(guest.rating)
            guest_by_name[guest_name] = {
                TConsts.PLAYERS_NAME_KEY: guest_name,
                TConsts.PLAYERS_CHARACTERISTICS_KEY: position,
                TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY: rating_value,
                "invitedBy": guest.invitedBy,
            }
    else:
        for guest in detected_guests:
            guest_name = guest.get(TConsts.PLAYERS_NAME_KEY)
            if not guest_name:
                continue
            if guest_name in guest_by_name:
                guest_by_name[guest_name]["invitedBy"] = guest.get("invitedBy")
                continue
            guest_by_name[guest_name] = {
                TConsts.PLAYERS_NAME_KEY: guest_name,
                TConsts.PLAYERS_CHARACTERISTICS_KEY: TConsts.PlayerCharacteristics["ALLAROUND"],
                TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY: 5,
                "invitedBy": guest.get("invitedBy"),
            }

    merged_guests = list(guest_by_name.values())

    db.insert_matchday(
        result_dictionary[TConsts.MATCHDAYS_ORIGINAL_MESSAGE_KEY],
        location,
        roster,
        date_value,
        guests=merged_guests,
        time_value=time_value,
    )

    return {"matchday": serialize_matchday(db.get_matchday(today_date))}


@app.post("/api/admin/matchday/roster/replace")
async def replace_matchday_player(payload: MatchdayReplace, session=Depends(require_role("admin"))):
    today_date = get_today_date()
    matchday = db.get_matchday(today_date)
    if not matchday:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="אין רשימה פעילה לעריכה")

    current_name = payload.currentName.strip()
    replacement_name = payload.replacementName.strip()
    if not current_name or not replacement_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="חובה להזין שחקן חלופי")
    if current_name == replacement_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="יש לבחור שחקן שונה")

    roster = matchday.get(TConsts.MATCHDAYS_ROSTER_KEY, []) or []
    if current_name not in roster:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="השחקן לא נמצא ברשימה")
    if replacement_name in roster:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="השחקן כבר נמצא ברשימה")
    if not db.check_player_existence(replacement_name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="השחקן החלופי לא קיים")

    if not db.replace_matchday_player(today_date, current_name, replacement_name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="לא הצלחתי לעדכן את הרשימה")

    return {"matchday": serialize_matchday(db.get_matchday(today_date))}


@app.post("/api/admin/matchday/generate")
async def generate_teams(session=Depends(require_role("admin"))):
    today_date = get_today_date()
    if not db.check_matchday_existence(today_date):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="עדיין לא נקבעה רשימה להיום")

    todays_matchday = db.get_matchday(today_date)
    todays_player_list = todays_matchday[TConsts.MATCHDAYS_ROSTER_KEY]
    guests = todays_matchday.get(TConsts.MATCHDAYS_GUESTS_KEY, []) or []
    guest_by_name = {guest[TConsts.PLAYERS_NAME_KEY]: guest for guest in guests}

    player_dicts_list = []
    dev_threshold = db.get_configuration_value(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY)
    added_names = set()
    for player in todays_player_list:
        if player in guest_by_name:
            guest = guest_by_name[player]
            player_dicts_list.append(
                {
                    TConsts.PLAYERS_NAME_KEY: guest[TConsts.PLAYERS_NAME_KEY],
                    TConsts.PLAYERS_CHARACTERISTICS_KEY: guest[TConsts.PLAYERS_CHARACTERISTICS_KEY],
                    TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY: float(
                        guest.get(TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY, 0)
                    ),
                }
            )
        else:
            player_dicts_list.append(
                {
                    TConsts.PLAYERS_NAME_KEY: player,
                    TConsts.PLAYERS_CHARACTERISTICS_KEY: db.get_player_characteristic(player),
                    TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY: db.get_player_average_rating(
                        player, dev_threshold
                    ),
                }
            )
        added_names.add(player)

    for guest in guests:
        if guest[TConsts.PLAYERS_NAME_KEY] in added_names:
            continue
        player_dicts_list.append(
            {
                TConsts.PLAYERS_NAME_KEY: guest[TConsts.PLAYERS_NAME_KEY],
                TConsts.PLAYERS_CHARACTERISTICS_KEY: guest[TConsts.PLAYERS_CHARACTERISTICS_KEY],
                TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY: float(
                    guest.get(TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY, 0)
                ),
            }
        )

    teams_dict = TeamGenerator.generate_teams(
        player_dicts_list,
        balance_team_ratings=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_RATINGS"]),
        enforce_tiers=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_TIERS"]),
        enforce_defense=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_DEFENSE"]),
        enforce_offense=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_OFFENSE"]),
        enforce_total_roles=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_ROLES"]),
        num_teams=db.get_configuration_value(TConsts.TeamGenerationParameters["NUM_TEAMS"]),
        coupling_constraints=todays_matchday[TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY],
        decoupling_constraints=todays_matchday[TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY],
    )

    if not teams_dict:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="בלתי אפשרי לייצר כוחות מתאימים, שנה את הפרמטרים או מחק אילוצים",
        )

    db.insert_teams_to_matchday(today_date, teams_dict)
    return {"matchday": serialize_matchday(db.get_matchday(today_date))}


@app.post("/api/admin/matchday/guests")
async def add_guest(payload: GuestCreate, session=Depends(require_role("admin"))):
    today_date = get_today_date()
    matchday = db.get_matchday(today_date)
    if not matchday:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="יש להגדיר רשימת משחק לפני הוספת אורח",
        )

    guest_name = payload.name.strip()
    if not guest_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="שם אורח לא תקין")

    rating_value = (
        0
        if payload.position == TConsts.PlayerCharacteristics["GOALKEEPER"]
        else float(payload.rating)
    )

    guest_dict = {
        TConsts.PLAYERS_NAME_KEY: guest_name,
        TConsts.PLAYERS_CHARACTERISTICS_KEY: payload.position,
        TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY: rating_value,
        "IsGuest": True,
    }

    if not db.upsert_guest_for_matchday(today_date, guest_dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="לא הצלחתי להוסיף אורח")

    return {"matchday": serialize_matchday(db.get_matchday(today_date))}


@app.delete("/api/admin/matchday/guests/{guest_name}")
async def delete_guest(guest_name: str, session=Depends(require_role("admin"))):
    today_date = get_today_date()
    if not db.get_matchday(today_date):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="יש להגדיר רשימת משחק לפני מחיקת אורח",
        )

    if not db.remove_guest_from_matchday(today_date, guest_name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="לא הצלחתי להסיר אורח")

    return {"matchday": serialize_matchday(db.get_matchday(today_date))}


@app.get("/api/admin/constraints")
async def get_constraints(session=Depends(require_role("admin"))):
    today_date = get_today_date()
    matchday = db.get_matchday(today_date)
    if not matchday:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="שימוש באילוצים מחייב שתהיה רשימת משחק תקפה להיום",
        )

    return {
        "couplings": matchday.get(TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY, []) or [],
        "decouplings": matchday.get(TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY, []) or [],
    }


@app.post("/api/admin/constraints/couple")
async def add_coupling(payload: ConstraintRequest, session=Depends(require_role("admin"))):
    today_date = get_today_date()
    matchday = db.get_matchday(today_date)
    if not matchday:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="שימוש באילוצים מחייב שתהיה רשימת משחק תקפה להיום",
        )
    player_list = [player.strip() for player in payload.players if player.strip()]
    if not player_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="לא נבחרו שחקנים")

    guest_names = {
        guest.get(TConsts.PLAYERS_NAME_KEY)
        for guest in matchday.get(TConsts.MATCHDAYS_GUESTS_KEY, []) or []
    }
    valid_players = [
        player
        for player in player_list
        if db.check_player_existence(player) or player in guest_names
    ]
    if not valid_players:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="שמות השחקנים לא תקינים")

    db.insert_constraints_to_matchday(today_date, couplings=[valid_players])
    return {"status": "ok"}


@app.post("/api/admin/constraints/decouple")
async def add_decoupling(payload: ConstraintRequest, session=Depends(require_role("admin"))):
    today_date = get_today_date()
    matchday = db.get_matchday(today_date)
    if not matchday:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="שימוש באילוצים מחייב שתהיה רשימת משחק תקפה להיום",
        )
    player_list = [player.strip() for player in payload.players if player.strip()]
    if not player_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="לא נבחרו שחקנים")

    guest_names = {
        guest.get(TConsts.PLAYERS_NAME_KEY)
        for guest in matchday.get(TConsts.MATCHDAYS_GUESTS_KEY, []) or []
    }
    valid_players = [
        player
        for player in player_list
        if db.check_player_existence(player) or player in guest_names
    ]
    if not valid_players:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="שמות השחקנים לא תקינים")

    db.insert_constraints_to_matchday(today_date, decouplings=[valid_players])
    return {"status": "ok"}


@app.delete("/api/admin/constraints")
async def clear_constraints(session=Depends(require_role("admin"))):
    today_date = get_today_date()
    if db.insert_constraints_to_matchday(date=today_date, absolute=True):
        return {"status": "ok"}
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="קרתה תקלה בעת מחיקת האילוצים")


@app.get("/api/admin/statistics")
async def get_statistics(session=Depends(require_role("admin"))):
    matchdays_collection = db.get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)
    matchdays = list(matchdays_collection.find())

    appearances = {}
    matchday_summaries = []
    last_match_date = None
    total_roster_size = 0
    total_matchdays = 0

    for matchday in matchdays:
        date_value = matchday.get(TConsts.MATCHDAYS_DATE_KEY)
        parsed_date = parse_matchday_date(date_value)
        roster = matchday.get(TConsts.MATCHDAYS_ROSTER_KEY, []) or []
        guests = matchday.get(TConsts.MATCHDAYS_GUESTS_KEY, []) or []
        guest_names = [guest.get(TConsts.PLAYERS_NAME_KEY) for guest in guests if guest.get(TConsts.PLAYERS_NAME_KEY)]

        participant_names = list(dict.fromkeys(roster + guest_names))
        if not participant_names:
            continue

        total_matchdays += 1
        total_roster_size += len(participant_names)

        if parsed_date and (last_match_date is None or parsed_date > last_match_date):
            last_match_date = parsed_date

        for name in participant_names:
            if name not in appearances:
                appearances[name] = {"count": 0, "last": parsed_date}
            appearances[name]["count"] += 1
            if parsed_date and (appearances[name]["last"] is None or parsed_date > appearances[name]["last"]):
                appearances[name]["last"] = parsed_date

        matchday_summaries.append(
            {
                "date": date_value,
                "location": matchday.get(TConsts.MATCHDAYS_LOCATION_KEY),
                "rosterCount": len(roster),
                "guestCount": len(guest_names),
                "teamsGenerated": bool(matchday.get(TConsts.MATCHDAYS_TEAMS_KEY)),
            }
        )

    players_stats = [
        {
            "name": name,
            "appearances": data["count"],
            "lastAppearance": data["last"].strftime(TConsts.MATCHDAYS_DATE_FORMAT) if data["last"] else None,
        }
        for name, data in appearances.items()
    ]
    players_stats.sort(key=lambda entry: entry["appearances"], reverse=True)

    overview = {
        "totalMatchdays": total_matchdays,
        "totalPlayers": len(appearances.keys()),
        "totalAppearances": sum(data["count"] for data in appearances.values()),
        "averageRosterSize": round((total_roster_size / total_matchdays), 2) if total_matchdays else 0,
        "lastMatchDate": last_match_date.strftime(TConsts.MATCHDAYS_DATE_FORMAT) if last_match_date else None,
    }

    matchday_summaries.sort(
        key=lambda entry: parse_matchday_date(entry["date"]) or datetime.min, reverse=True
    )

    return {"overview": overview, "players": players_stats, "matchdays": matchday_summaries}


@app.get("/api/ranker/players")
async def ranker_players(session=Depends(require_role("ranker"))):
    user_id = session[SESSION_USER_ID_FIELD]
    user_rankings = db.get_user_rankings(user_id)
    if user_rankings is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="מדרג לא קיים")

    player_list = []
    for name, position, rating in db.get_player_list(hebrew_characteristics=False):
        if position == TConsts.PlayerCharacteristics["GOALKEEPER"]:
            continue
        player_list.append(
            {
                "name": name,
                "position": position,
                "positionLabel": position_label(position),
                "averageRating": rating,
                "myRating": user_rankings.get(name),
            }
        )

    return {"players": player_list}


@app.post("/api/ranker/ratings")
async def update_rankings(payload: RankingsUpdate, session=Depends(require_role("ranker"))):
    user_id = session[SESSION_USER_ID_FIELD]
    rankings = {}

    for player_name, rating in payload.rankings.items():
        player_name = player_name.strip()
        if not player_name:
            continue
        if db.get_player_characteristic(player_name) == TConsts.PlayerCharacteristics["GOALKEEPER"]:
            continue
        try:
            value = float(rating)
        except (TypeError, ValueError):
            continue
        if value < 1 or value > 10:
            continue
        rankings[player_name] = value

    found, modified = db.modify_user_rankings(user_id, rankings)
    if not found:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="מדרג לא קיים")

    return {"status": "ok", "modified": modified, "rankings": rankings}


@app.get("/{path:path}", include_in_schema=False)
async def serve_frontend(path: str):
    if path.startswith("api/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    static_root = settings.static_root
    index_file = static_root / "index.html"

    if not static_root.exists() or not index_file.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frontend not built")

    requested = static_root / path
    if path and requested.exists() and requested.is_file():
        return FileResponse(requested)

    return FileResponse(index_file)
