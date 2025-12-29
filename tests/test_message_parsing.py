import pytest
from tfab_utils.tfab_message_parser import MessageParser
from tfab_framework.tfab_consts import Consts as TConsts


@pytest.mark.parametrize(
    "message,expected",
    [
        ("תאריך: 30/08/2022", "30-08-2022"),
        ("היום המשחק 7.1.23", "07-01-2023"),
        ("יום המשחק 05-12-2024", "05-12-2024"),
    ],
)
def test_date_parsing(message, expected):
    assert MessageParser._get_date_value(message) == expected


@pytest.mark.parametrize(
    "message,expected",
    [
        ("מיקום: גן סאקר", "גן סאקר"),
        ("רשימה\nמיקום: אצטדיון 2", "אצטדיון 2"),
        ("מיקום: \n", None),
    ],
)
def test_location_parsing(message, expected):
    assert MessageParser._get_placement_value(message) == expected


def test_roster_parsing():
    message = """שלום חברים
תאריך: 30/08/2022
מיקום: מגרש קהילתי
1.טדי
2.זיו
3.ג'ק
4.אורי-אל
סוף הרשימה
"""
    assert MessageParser._get_roster_value(message) == ["טדי", "זיו", "ג'ק", "אורי-אל"]


def test_parse_matchday_message():
    message = """שלום
מיקום: פארק הירקון
תאריך: 12.09.2024
שעה: 20:30
1.דני
2.רון
3.גיא
"""
    result = MessageParser.parse_matchday_message(message)
    assert result[TConsts.MATCHDAYS_DATE_KEY] == "12-09-2024"
    assert result[TConsts.MATCHDAYS_LOCATION_KEY] == "פארק הירקון"
    assert result[TConsts.MATCHDAYS_TIME_KEY] == "20:30"
    assert result[TConsts.MATCHDAYS_ROSTER_KEY] == ["דני", "רון", "גיא"]
    assert result[TConsts.MATCHDAYS_GUESTS_KEY] == []
    assert result[TConsts.MATCHDAYS_ORIGINAL_MESSAGE_KEY] == message


@pytest.mark.parametrize(
    "message,expected",
    [
        ("שעה: 19:15", "19:15"),
        ("המשחק ב-8:05 בערב", "08:05"),
        ("מיקום: איצטדיון\n20.45", "20:45"),
    ],
)
def test_time_parsing(message, expected):
    assert MessageParser._get_time_value(message) == expected


def test_guest_detection_in_roster():
    message = """רשימה
1.דניאל - טדי
2.רון
3.עמית - שירי
"""
    result = MessageParser.parse_matchday_message(message)
    assert result[TConsts.MATCHDAYS_ROSTER_KEY] == ["דניאל", "רון", "עמית"]
    assert result[TConsts.MATCHDAYS_GUESTS_KEY] == [
        {TConsts.PLAYERS_NAME_KEY: "דניאל", "invitedBy": "טדי"},
        {TConsts.PLAYERS_NAME_KEY: "עמית", "invitedBy": "שירי"},
    ]


@pytest.mark.parametrize(
    "message,expected",
    [
        (
            """טדי = 5
זיו = 3.7
עידן = 0
ישי = 10
ג'ק = 3
""",
            {"טדי": "5", "זיו": "3.7", "ישי": "10", "ג'ק": "3"},
        ),
        ("עידן = 5", {"עידן": "5"}),
    ],
)
def test_rankings_message(message, expected):
    assert MessageParser.parse_rankings_message(message) == expected
