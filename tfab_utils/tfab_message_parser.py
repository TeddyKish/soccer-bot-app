import re
from tfab_framework.tfab_consts import Consts as TConsts
from tfab_framework.tfab_database_handler import TFABDBHandler
from datetime import datetime

class MessageParser:
    """
    Intended to parse user messages, to extract the interesting fields out of them.
    """

    @staticmethod
    def _get_date_value(message):
        """
        :param message: The message to search in.
        :return: The date value (if it exists), or None otherwise.
        """
        pattern = re.compile(r"((0?[1-9])|1\d|2\d|30|31)[./\\-]((0?[1-9])|1[012])[./\\-]((20)?([2-9]\d))")
        for line in message.split("\n"):
            match = pattern.search(line.strip())

            if match:
                day = match.group(1).strip()
                month = match.group(3).strip()
                year = match.group(5).strip()

                if len(year) == 2:
                    year = "20" + year

                return datetime(int(year), int(month), int(day)).strftime(TConsts.MATCHDAYS_DATE_FORMAT)

        return None

    @staticmethod
    def _get_placement_value(message):
        """
        :param message: The message to search in.
        :return: The placement value (if it exists), or None otherwise
        """
        pattern = re.compile(r"מיקום: ([א-ת\d \"]*)")
        for line in message.split("\n"):
            match = pattern.search(line.strip())

            if match:
                place = match.group(1).strip()
                return place if place != "" else None

        return None

    @staticmethod
    def _get_roster_value(message):
        """
        :param message: The message to search in.
        :return: The roster value (if it exists), or None otherwise.
        """
        players, _ = MessageParser._parse_roster_entries(message)
        return players

    @staticmethod
    def _split_guest_entry(entry):
        parts = re.split(r"\s[-–—]\s", entry, maxsplit=1)
        if len(parts) == 2 and parts[0] and parts[1]:
            return parts[0].strip(), parts[1].strip()
        return entry.strip(), None

    @staticmethod
    def _parse_roster_entries(message):
        pattern = re.compile(r"^\d{1,2}\.(([א-ת \-`'\u05f3\u2019]+)|)")
        name_characters_blacklist = r"[^א-ת \-`'\u05f3\u2019]"
        players = []
        guests = []
        first_part_started = False

        for line in message.split("\n"):
            match = pattern.search(line.strip())

            if match:
                if not first_part_started:
                    first_part_started = True

                player_raw = re.sub(name_characters_blacklist, "", match.group(1).strip())
                if player_raw:
                    player_name, inviter = MessageParser._split_guest_entry(player_raw)
                    if player_name:
                        players.append(player_name)
                        if inviter:
                            guests.append(
                                {
                                    TConsts.PLAYERS_NAME_KEY: player_name,
                                    "invitedBy": inviter,
                                }
                            )
            elif first_part_started:
                break

        return players, guests

    @staticmethod
    def _get_time_value(message):
        """
        :param message: The message to search in.
        :return: The time value (if it exists), or None otherwise.
        """
        pattern = re.compile(r"(?:שעה[:\s]*)?((?:[01]?\d|2[0-3])[:.][0-5]\d)")
        date_pattern = re.compile(
            r"((0?[1-9])|1\d|2\d|30|31)[./\\-]((0?[1-9])|1[012])[./\\-]((20)?([2-9]\d))"
        )
        for line in message.split("\n"):
            line_text = line.strip()
            if "תאריך" in line_text or date_pattern.search(line_text):
                continue
            match = pattern.search(line_text)
            if match:
                time_value = match.group(1).replace(".", ":")
                parts = time_value.split(":")
                if len(parts) == 2:
                    hour = parts[0].zfill(2)
                    minute = parts[1].zfill(2)
                    return f"{hour}:{minute}"
                return time_value
        return None

    @staticmethod
    def stringify_player_list(player_list, with_characteristic=True):
        """
        Returns a formatted string that nicely displays the player list.
        """
        i = 1
        all_players_message = ""

        for entry in player_list:
            player_name = None
            characteristic = None
            rating = None

            if isinstance(entry, dict):
                player_name = entry.get(TConsts.PLAYERS_NAME_KEY) or entry.get("name")
                characteristic = entry.get(TConsts.PLAYERS_CHARACTERISTICS_KEY) or entry.get("position")
                rating = entry.get(TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY)
                if rating is None:
                    rating = entry.get("averageRating") or entry.get("rating")
            elif isinstance(entry, (list, tuple)):
                if len(entry) >= 1:
                    player_name = entry[0]
                if len(entry) >= 2:
                    characteristic = entry[1]
                if len(entry) >= 3:
                    rating = entry[2]
            else:
                player_name = entry

            if player_name is None:
                continue

            if with_characteristic:
                numeric_rating = float(rating) if rating is not None else 0.0
                if characteristic:
                    all_players_message += "{0}.{1} = {3:.2f} ({2})\n".format(
                        i, player_name, characteristic, numeric_rating
                    )
                else:
                    all_players_message += "{0}.{1} = {2:.2f}\n".format(
                        i, player_name, numeric_rating
                    )
            else:
                if rating is None:
                    all_players_message += "{0}.{1}\n".format(i, player_name)
                else:
                    all_players_message += "{0}.{1} = {2}\n".format(i, player_name, rating)
            i += 1

        # Removes the last "\n" in the string if the string isn't trivial
        return all_players_message[:-1] if all_players_message != "" else ""

    @staticmethod
    def parse_matchday_message(message):
        """
        Parses a matchday message into a dictionary.
        :param message:
        :return: A dictionary that contains the game date, roster, location and the original message.
        """
        players, guests = MessageParser._parse_roster_entries(message)
        return {
            TConsts.MATCHDAYS_DATE_KEY: MessageParser._get_date_value(message),
            TConsts.MATCHDAYS_TIME_KEY: MessageParser._get_time_value(message),
            TConsts.MATCHDAYS_LOCATION_KEY: MessageParser._get_placement_value(message),
            TConsts.MATCHDAYS_ORIGINAL_MESSAGE_KEY: message,
            TConsts.MATCHDAYS_ROSTER_KEY: players,
            TConsts.MATCHDAYS_GUESTS_KEY: guests,
        }

    @staticmethod
    def generate_matchday_message(matchday_dict):
        """
        :return: A nicely formatted message, describing the information within <matchday_dict>
        """
        message = "הרשימה היומית כפי שנקלטה בבוטיטו:\n"
        date = matchday_dict[TConsts.MATCHDAYS_DATE_KEY]
        location = matchday_dict[TConsts.MATCHDAYS_LOCATION_KEY]
        player_list = matchday_dict[TConsts.MATCHDAYS_ROSTER_KEY]
        teams = matchday_dict[TConsts.MATCHDAYS_TEAMS_KEY]
        db = TFABDBHandler.get_instance()

        if date:
            message += "תאריך: {0}\n".format(date)
        time_value = matchday_dict.get(TConsts.MATCHDAYS_TIME_KEY)
        if time_value:
            message += "שעה: {0}\n".format(time_value)
        if location:
            message += "מיקום: {0}\n".format(location)
        if player_list and not teams:
            message += "----------------------------------------\n"
            message += MessageParser.stringify_player_list(player_list, with_characteristic=False)
            message += "\n----------------------------------------\n"
        if teams:
            message += "\nלהלן הקבוצות שנוצרו עבור המשחק:\n"
            for team_index, team in enumerate(teams):
                players = team[TConsts.MATCHDAYS_SPECIFIC_TEAM_ROSTER_KEY]
                field_players_ratings = [player[TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY] for player in players if player[TConsts.PLAYERS_CHARACTERISTICS_KEY] != TConsts.PlayerCharacteristics["GOALKEEPER"]]
                message += "קבוצה {0}: (ציון - {1:.2f}, ממוצע - {2:.2f})\n".format(team_index + 1, team[TConsts.MATCHDAYS_SPECIFIC_TEAM_RATING_KEY], sum(field_players_ratings) / len(field_players_ratings))
                for player_index, player in enumerate(players):
                    position = player.get(TConsts.PLAYERS_CHARACTERISTICS_KEY) or db.get_player_characteristic(player[TConsts.PLAYERS_NAME_KEY])
                    position_label = TConsts.PlayerPositionToHebrew.get(position, "לא ידוע")
                    message += "{0}.{1} - {2:.2f} ({3})\n".format(player_index + 1, player[TConsts.PLAYERS_NAME_KEY],
                                                      player[TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY],
                                                    position_label)
                message += "\n\n"

            message += "שיהיה בהצלחה!"

        return message

    @staticmethod
    def generate_rankings_template(all_player_names, user_rankings):
        """
        Generates a template for the message, intended to be parsed.
        :param all_player_names: Names of all the available players.
        :param user_rankings: This specific user's rankings.
        :return: A template message displaying the different rankings.
        """
        unranked_players = list(set(all_player_names) - set(user_rankings.keys()))

        if len(user_rankings.items()) == 0:
            ranking_message = "לא קיימים שחקנים שדירגת.\n"
        else:
            ranking_message = "אלו השחקנים שדירגת:\n"

            for player, ranking in user_rankings.items():
                ranking_message += "{0} = {1}\n".format(player, ranking)

        if len(unranked_players) == 0:
            ranking_message += "\nדירגת את כל השחקנים האפשריים."
        else:
            ranking_message += "\nלהלן השחקנים שלא דירגת:\n"
            for player in unranked_players:
                ranking_message += "{0} = \n".format(player)

        # Get rid of the last "\n"
        return ranking_message[:-1] if ranking_message != "" else ""

    @staticmethod
    def parse_rankings_message(message):
        """
        Parses the rankings message into a Rankings Dictionary.
        :param message: The rankings template, after being filled with the user's preferences.
        :return: A dictionary with rankings for each player.
        Every item in the dictionary is in the form of {<PlayerName>: <NumericalRankingValue>}
        """
        pattern = re.compile(r"(^([א-ת \-`'\u05f3\u2019]+\s)+)=\s?(([1-9])|10|(\d\.\d))$")
        result_dict = {}

        for line in message.split("\n"):
            match = pattern.search(line.strip())

            if match:
                result_dict[match.group(1).strip()] = match.group(3)

        return result_dict
