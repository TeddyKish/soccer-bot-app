class Consts(object):
    """
    Encompasses all the different system consts.
    """
    TeamGenerationParameters = {
        "BLC_RATINGS": "BR",
        "BLC_TIERS": "BT",
        "BLC_DEFENSE": "BD",
        "BLC_OFFENSE": "BO",
        "BLC_ROLES": "BRO",
        "NUM_TEAMS": "NT"
    }

    PlayerCharacteristics = {
        "GOALKEEPER": "GK",
        "DEFENSIVE": "DEF",
        "OFFENSIVE": "ATT",
        "ALLAROUND": "ALL"
    }

    PlayerPositionToHebrew = {
        "GK": "שוער",
        "DEF": "הגנה",
        "ATT": "התקפה",
        "ALL": "כל המגרש"
    }

    PLAYERS_COLLECTION_NAME = "Players"
    PLAYERS_NAME_KEY = "PlayerName"
    PLAYERS_CHARACTERISTICS_KEY = "PlayerPosition"

    RANKERS_COLLECTION_NAME = "AuthorizedRankers"
    RANKERS_USER_RANKINGS = "UserRankings"
    ADMINS_COLLECTION_NAME = "AuthorizedAdmins"
    USER_ID_KEY = "UserId"
    USER_FULLNAME_KEY = "UserFullName"

    EOO_QUERY_DATA = "EndOfOperation"

    MATCHDAYS_COLLECTION_NAME = "Matchdays"
    MATCHDAYS_TEAMS_KEY = "Teams"
    MATCHDAYS_ORIGINAL_MESSAGE_KEY = "OriginalMessage"
    MATCHDAYS_LOCATION_KEY = "Location"
    MATCHDAYS_ROSTER_KEY = "Players"
    MATCHDAYS_DATE_KEY = "Date"
    MATCHDAYS_TIME_KEY = "Time"
    MATCHDAYS_GUESTS_KEY = "Guests"
    MATCHDAYS_DATE_FORMAT = "%d-%m-%Y"

    MATCHDAYS_SPECIFIC_TEAM_ROSTER_KEY = "TeamPlayers"
    MATCHDAYS_SPECIFIC_TEAM_RATING_KEY = "TeamRating"
    MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY = "PlayerAverageRating"

    MATCHDAYS_COUPLING_CONSTRAINTS_KEY = "CouplingConstraints"
    MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY = "DecouplingConstraints"

    INTERNAL_COLLECTION_NAME = "InternalData"
    INTERNAL_CONFIGURATION_KEY = "ConfigKey"
    INTERNAL_CONFIGURATION_VALUE = "ConfigValue"
    INTERNAL_ADMIN_PASSWORD_KEY = "AdminPassword"
    INTERNAL_RANKER_PASSWORD_KEY = "RankerPassword"
    INTERNAL_RATING_DEVIATION_THRESHOLD_KEY = "MaximumDeviationThreshold"

    SESSIONS_COLLECTION_NAME = "AuthSessions"
    AUTH_ATTEMPTS_COLLECTION_NAME = "AuthAttempts"
