import os
from datetime import datetime
import numpy as np
from tfab_framework import tfab_exception
from tfab_framework.tfab_consts import Consts as TConsts
from pymongo import MongoClient

class TFABDBHandler(object):
    """
    Should be an interface for other DB handlers if one wishes to replace, currently works with MongoDB
    """
    _instance = None

    @staticmethod
    def get_instance(db_name=None, db_port=None, db_host=None, db_uri=None):
        if TFABDBHandler._instance is None:
            TFABDBHandler._instance = TFABDBHandler(db_name, db_port, db_host=db_host, db_uri=db_uri)
        return TFABDBHandler._instance

    def __init__(self, db_name, db_port, db_host=None, db_uri=None):
        """
        Initializes an instance of TFABDBHandler, currently coupled to MongoDB.
        :param db_name: The name of the db to be used.
        :param db_port: The port in which the MongoDB server runs.
        """
        self.db_name = db_name or os.getenv("MONGODB_DB_NAME")
        if not self.db_name:
            raise tfab_exception.TFABDatabaseError("Missing MongoDB database name")

        resolved_uri = db_uri or os.getenv("MONGODB_URI")
        if resolved_uri:
            self.mongo_client = MongoClient(resolved_uri)
        else:
            resolved_host = db_host or os.getenv("MONGODB_HOST", "localhost")
            resolved_port = db_port or int(os.getenv("MONGODB_PORT", "27017"))
            self.mongo_client = MongoClient("mongodb://{0}:{1}/".format(resolved_host, resolved_port))
        self.db = self.mongo_client[self.db_name]

        if self.mongo_client is None or self.db is None:
            raise tfab_exception.TFABDatabaseError("Error initializing MongoDB")

        # Make sure all the core collections exist prior to running the app
        collection_names = self.db.list_collection_names()
        for cname in [TConsts.PLAYERS_COLLECTION_NAME, TConsts.ADMINS_COLLECTION_NAME,
                      TConsts.RANKERS_COLLECTION_NAME, TConsts.MATCHDAYS_COLLECTION_NAME,
                      TConsts.INTERNAL_COLLECTION_NAME, TConsts.SESSIONS_COLLECTION_NAME,
                      TConsts.AUTH_ATTEMPTS_COLLECTION_NAME, TConsts.CASH_LEDGER_COLLECTION_NAME,
                      TConsts.GUEST_PAYMENTS_COLLECTION_NAME]:
            if cname not in collection_names:
                self.db.create_collection(cname)

    def insert_configuration_value(self, configuration_key, configuration_value):
        """
        Inserts configuration values to the database.
        """
        internal_collection = self.__get_collection(TConsts.INTERNAL_COLLECTION_NAME)
        inserted_value = {TConsts.INTERNAL_CONFIGURATION_KEY: configuration_key,
                          TConsts.INTERNAL_CONFIGURATION_VALUE: configuration_value}

        try:
            internal_collection.insert_one(inserted_value)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

    def modify_configuration_value(self, configuration_key, configuration_value):
        """
        Modifies <configuration_key> to hold <configuration_value>.
        """
        internal_collection = self.__get_collection(TConsts.INTERNAL_COLLECTION_NAME)
        filter_object = {TConsts.INTERNAL_CONFIGURATION_KEY: configuration_key}
        update_object = {TConsts.INTERNAL_CONFIGURATION_VALUE: configuration_value}

        try:
            result = internal_collection.update_one(filter_object, {"$set": update_object})
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result.matched_count == 1, result.modified_count == 1

    def upsert_configuration_value(self, configuration_key, configuration_value):
        """
        Inserts or updates <configuration_key> to hold <configuration_value>.
        """
        internal_collection = self.__get_collection(TConsts.INTERNAL_COLLECTION_NAME)
        filter_object = {TConsts.INTERNAL_CONFIGURATION_KEY: configuration_key}
        update_object = {
            "$set": {
                TConsts.INTERNAL_CONFIGURATION_KEY: configuration_key,
                TConsts.INTERNAL_CONFIGURATION_VALUE: configuration_value,
            }
        }

        try:
            result = internal_collection.update_one(filter_object, update_object, upsert=True)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result.matched_count == 1 or result.upserted_id is not None

    def get_configuration_value(self, configuration_key):
        """
        Receives the value for <configuration_key>, out of the application's configuration.
        """
        internal_collection = self.__get_collection(TConsts.INTERNAL_COLLECTION_NAME)
        filter_object = {TConsts.INTERNAL_CONFIGURATION_KEY: configuration_key}

        try:
            result = internal_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result[TConsts.INTERNAL_CONFIGURATION_VALUE] if result is not None else None

    def check_configuration_existence(self, configuration_key):
        """
        Checks whether a configuration key exists in the database.
        :param configuration_key: The key to search for
        :return: True if <configuration_key> exists in the Internal collection, False otherwise
        """
        internal_collection = self.__get_collection(TConsts.INTERNAL_COLLECTION_NAME)
        filter_object = {TConsts.INTERNAL_CONFIGURATION_KEY: configuration_key}

        try:
            result = internal_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result is not None

    def insert_player(self, player_name, characteristics, entry_count=0):
        """
        Inserts a single player and their characteristics.
        """
        if self.check_player_existence(player_name):
            return

        new_player = {
            TConsts.PLAYERS_NAME_KEY: player_name,
            TConsts.PLAYERS_CHARACTERISTICS_KEY: characteristics,
            TConsts.PLAYERS_ENTRY_COUNT_KEY: entry_count,
        }
        players_collection = self.__get_collection(TConsts.PLAYERS_COLLECTION_NAME)

        try:
            players_collection.insert_one(new_player)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

    def insert_admin(self, admin_name, admin_id):
        """
        Inserts <admin_name, admin_id> to the admins' collection.
        """
        new_admin = \
            {TConsts.USER_ID_KEY: admin_id, TConsts.USER_FULLNAME_KEY: admin_name}
        admins_collection = self.__get_collection(TConsts.ADMINS_COLLECTION_NAME)

        try:
            admins_collection.insert_one(new_admin)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

    def insert_ranker(self, ranker_name, ranker_id, ranker_token=None):
        """
        Inserts <ranker_name, ranker_id> to the Rankers collection.
        """
        new_ranker = {
            TConsts.USER_ID_KEY: ranker_id,
            TConsts.USER_FULLNAME_KEY: ranker_name,
            TConsts.RANKERS_USER_RANKINGS: {},
        }
        if ranker_token:
            new_ranker[TConsts.RANKERS_TOKEN_KEY] = ranker_token
        rankers_collection = self.__get_collection(TConsts.RANKERS_COLLECTION_NAME)

        try:
            rankers_collection.insert_one(new_ranker)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

    def upsert_ranker_token(self, ranker_name, ranker_token):
        """
        Inserts a ranker if missing and updates the token for future logins.
        """
        rankers_collection = self.__get_collection(TConsts.RANKERS_COLLECTION_NAME)
        filter_object = {TConsts.USER_ID_KEY: ranker_name}
        update_object = {
            "$set": {
                TConsts.USER_FULLNAME_KEY: ranker_name,
                TConsts.RANKERS_TOKEN_KEY: ranker_token,
            },
            "$setOnInsert": {
                TConsts.USER_ID_KEY: ranker_name,
                TConsts.RANKERS_USER_RANKINGS: {},
            },
        }

        try:
            result = rankers_collection.update_one(filter_object, update_object, upsert=True)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result.matched_count == 1 or result.upserted_id is not None

    def get_ranker_by_token(self, ranker_token):
        """
        :return: The ranker record for a given login token.
        """
        rankers_collection = self.__get_collection(TConsts.RANKERS_COLLECTION_NAME)
        filter_object = {TConsts.RANKERS_TOKEN_KEY: ranker_token}

        try:
            result = rankers_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result

    def list_rankers(self):
        """
        :return: A list of rankers with their metadata and rankings.
        """
        rankers_collection = self.__get_collection(TConsts.RANKERS_COLLECTION_NAME)

        try:
            all_rankers_cursor = rankers_collection.find()
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        rankers = []
        for ranker in all_rankers_cursor:
            rankers.append(
                {
                    "id": ranker.get(TConsts.USER_ID_KEY),
                    "name": ranker.get(TConsts.USER_FULLNAME_KEY),
                    "token": ranker.get(TConsts.RANKERS_TOKEN_KEY),
                    "rankings": ranker.get(TConsts.RANKERS_USER_RANKINGS, {}),
                }
            )
        return rankers

    def insert_matchday(self, original_message, location, player_list, date,
                        coupling_constraints=None, decoupling_constraints=None, guests=None, time_value=None):
        """
        Inserts <matchday_dict> to the DB.
        If there is a matchday on the same date, it deletes the previous matchday and sets the current one as new.
        """
        if not isinstance(player_list, list) or not isinstance(original_message, str) or not isinstance(location, str) \
                or not isinstance(date, str):
            raise tfab_exception.TFABDatabaseError(
                "TFAB Database Error occurred: Illegal data when inserting a new matchday")

        if coupling_constraints is None:
            coupling_constraints = []
        if decoupling_constraints is None:
            decoupling_constraints = []

        if self.check_matchday_existence(date):
            if not self.delete_matchday(date):
                raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: Couldn't delete existing matchday")

        if guests is None:
            guests = []

        matchday_dict = {
            TConsts.MATCHDAYS_ORIGINAL_MESSAGE_KEY: original_message,
            TConsts.MATCHDAYS_LOCATION_KEY: location,
            TConsts.MATCHDAYS_ROSTER_KEY: player_list,
            TConsts.MATCHDAYS_DATE_KEY: date,
            TConsts.MATCHDAYS_TIME_KEY: time_value,
            TConsts.MATCHDAYS_TEAMS_KEY: [],
            TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY: coupling_constraints,
            TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY: decoupling_constraints,
            TConsts.MATCHDAYS_GUESTS_KEY: guests,
            TConsts.MATCHDAYS_FINALIZED_KEY: False,
        }

        matchdays_collection = self.__get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)

        try:
            matchdays_collection.insert_one(matchday_dict)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

    def get_matchday(self, date):
        """
        :param date: The date in which the matchday occurred.
        :return: The relevant matchday object.
        """
        matchdays_collection = self.__get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)
        filter_object = {TConsts.MATCHDAYS_DATE_KEY: date}

        try:
            result = matchdays_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result

    def get_player_list(self, hebrew_characteristics):
        """
        :param hebrew_characteristics: Whether the characteristics should be displayed in Hebrew or not.
        :return: A list containing entries of the form <player, characteristic>.
        """
        players_collection = self.__get_collection(TConsts.PLAYERS_COLLECTION_NAME)

        try:
            all_players_cursor = players_collection.find()
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        player_list = []
        for player in all_players_cursor:
            player_list.append((player[TConsts.PLAYERS_NAME_KEY],
                                TConsts.PlayerPositionToHebrew[player[TConsts.PLAYERS_CHARACTERISTICS_KEY]]
                                if hebrew_characteristics
                                else player[TConsts.PLAYERS_CHARACTERISTICS_KEY],
                                self.get_player_average_rating(player[TConsts.PLAYERS_NAME_KEY],
                                                               self.get_configuration_value
                                                               (TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY)),
                                player.get(TConsts.PLAYERS_ENTRY_COUNT_KEY, 0)))
        return player_list

    def get_user_rankings(self, user_id):
        """
        :param user_id: The ID of the requested user.
        :return: The user's rankings field as saved in the DB.
        """
        rankers_collection = self.__get_collection(TConsts.RANKERS_COLLECTION_NAME)
        filter_object = {TConsts.USER_ID_KEY: user_id}

        try:
            result = rankers_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return None if result is None else result[TConsts.RANKERS_USER_RANKINGS]

    def modify_user_rankings(self, user_id, rankings_dictionary):
        """
        :param user_id: The ID of the user.
        :param rankings_dictionary: A dictionary containing all the desired modifications to perform.
        * note - removes illegal rankings from the rankings dictionary.
        :return: (A, B) -> A is True if the entry was found, B is true if modifications occurred.
        """
        rankers_collection = self.__get_collection(TConsts.RANKERS_COLLECTION_NAME)
        filter_object = {TConsts.USER_ID_KEY: user_id}
        update_object = {}

        for player_name, ranking in rankings_dictionary.copy().items():
            # Make sure player exists and isn't a goalkeeper
            if self.check_player_existence(player_name) and \
               self.get_player_characteristic(player_name) != TConsts.PlayerCharacteristics["GOALKEEPER"]:
                update_object["{0}.{1}".format(TConsts.RANKERS_USER_RANKINGS, player_name)] = ranking
            else:
                rankings_dictionary.pop(player_name)

        try:
            result = rankers_collection.update_one(filter_object, {"$set": update_object})
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result.matched_count == 1, result.modified_count == 1

    def edit_player(self, player_name, new_characteristic, entry_count=None):
        """
        Edits the player's characteristic.
        :param player_name: The player that we wish to edit.
        :param new_characteristic: The new characteristic of the player.
        :param entry_count: The updated entries count, if provided.
        :return: (A, B) -> A is True if the entry was found, B is true if modifications occurred.
        """
        players_collection = self.__get_collection(TConsts.PLAYERS_COLLECTION_NAME)
        filter_object = {TConsts.PLAYERS_NAME_KEY: player_name}
        update_values = {TConsts.PLAYERS_CHARACTERISTICS_KEY: new_characteristic}
        if entry_count is not None:
            update_values[TConsts.PLAYERS_ENTRY_COUNT_KEY] = entry_count
        update_operation = {'$set': update_values}

        try:
            results = players_collection.update_one(filter_object, update_operation)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        # Not checking modified_count, to allow an admin to click on the same characteristic without triggering errors
        return results.matched_count == 1, results.modified_count == 1

    def adjust_entries_for_players(self, player_names, delta):
        """
        Adjusts entries for all players in <player_names> by <delta>.
        """
        if not player_names:
            return 0
        players_collection = self.__get_collection(TConsts.PLAYERS_COLLECTION_NAME)
        filter_object = {TConsts.PLAYERS_NAME_KEY: {"$in": list(player_names)}}
        update_operation = {"$inc": {TConsts.PLAYERS_ENTRY_COUNT_KEY: int(delta)}}

        try:
            result = players_collection.update_many(filter_object, update_operation)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result.modified_count

    def get_cash_balance(self):
        """
        :return: The current cash balance as a float.
        """
        value = self.get_configuration_value(TConsts.INTERNAL_CASH_BALANCE_KEY)
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def update_cash_balance(self, delta, reason, meta=None):
        """
        Updates the cash balance and logs the change.
        """
        ledger_collection = self.__get_collection(TConsts.CASH_LEDGER_COLLECTION_NAME)
        current_balance = self.get_cash_balance()
        next_balance = current_balance + float(delta)
        self.upsert_configuration_value(TConsts.INTERNAL_CASH_BALANCE_KEY, next_balance)

        entry = {
            "delta": float(delta),
            "balance": next_balance,
            "reason": reason,
            "meta": meta or {},
            "createdAt": datetime.utcnow(),
        }
        try:
            ledger_collection.insert_one(entry)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return next_balance

    def set_cash_balance(self, amount, reason, meta=None):
        """
        Sets the cash balance to <amount> and logs the change.
        """
        current_balance = self.get_cash_balance()
        delta = float(amount) - float(current_balance)
        return self.update_cash_balance(delta, reason, meta)

    def check_player_existence(self, player_name):
        """
        Checks whether a player exists in the database.
        :param player_name: The player name to search
        :return: True if the player exists in the Players collection, False otherwise
        """
        players_collection = self.__get_collection(TConsts.PLAYERS_COLLECTION_NAME)
        filter_object = {TConsts.PLAYERS_NAME_KEY: player_name}

        try:
            result = players_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result is not None

    def get_player_average_rating(self, player_name, dev_threshold):
        """
        Returns the average rating, across all the different rankers, for <player_name>.
        :param dev_threshold: Maximum deviation threshold.
        :param player_name: The player's name.
        :return: The average rating.
        """
        # This makes sure that a GK is always rated zero (including past-ranked "field" players that converted to GKs)
        if self.get_player_characteristic(player_name) == TConsts.PlayerCharacteristics["GOALKEEPER"]:
            return 0

        rankers_collection = self.__get_collection(TConsts.RANKERS_COLLECTION_NAME)

        try:
            all_rankers_cursor = rankers_collection.find()
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        rating_list = []
        for ranker in all_rankers_cursor:
            # check existence
            rankings_dictionary = ranker[TConsts.RANKERS_USER_RANKINGS]

            if player_name in rankings_dictionary:
                rating_list.append(float(rankings_dictionary[player_name]))

        filtered_ratings = []

        if rating_list:
            ratings_array = np.array(rating_list, dtype=float)
            std_dev = np.std(ratings_array)
            mean_value = float(np.mean(ratings_array))

            # Avoid aggressive filtering when the sample size is too small
            if len(ratings_array) < 5 or std_dev == 0:
                filtered_ratings = ratings_array
            else:
                z_scores = np.abs((ratings_array - mean_value) / std_dev)
                troll_scores = z_scores > dev_threshold  # Outliers, based on bypassing the threshold
                filtered_ratings = ratings_array[~troll_scores]

                # If filtering removes too much data, fall back to the full set
                min_sample = max(2, len(ratings_array) // 2)
                if len(filtered_ratings) < min_sample:
                    filtered_ratings = ratings_array

        return (sum(filtered_ratings) / len(filtered_ratings)) if len(filtered_ratings) > 0 else 0

    def insert_teams_to_matchday(self, date, teams):
        """
        Inserts <teams> into the matchday occuring at <date>.
        :param date: The date of the relevant matchday.
        :param teams: The generated teams for this matchday.
        :return: True if the entry was found successfully.
        """
        matchdays_collection = self.__get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)
        filter_object = {TConsts.MATCHDAYS_DATE_KEY: date}
        update_operation = {'$set': {TConsts.MATCHDAYS_TEAMS_KEY: teams}}

        try:
            results = matchdays_collection.update_one(filter_object, update_operation)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        # Not checking modified_count, to allow an admin to generate the same teams without triggering errors
        return results.matched_count == 1

    def insert_constraints_to_matchday(self, date, couplings=None, decouplings=None, absolute=False):
        """
        Inserts the couplings and decouplings to the matchday occuring at <date>.
        :param absolute: Whether to override the current value or not.
        :param date: The date of the relevant matchday.
        :param couplings: A list where each entry consists of players that must be coupled.
        :param decouplings: A list where each entry consists of players that must be decoupled.
        :return: True if the entry was found successfully.
        """
        if couplings is None:
            couplings = []
        if decouplings is None:
            decouplings = []

        relevant_matchday = self.get_matchday(date)
        if not relevant_matchday:
            return

        matchdays_collection = self.__get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)
        filter_object = {TConsts.MATCHDAYS_DATE_KEY: date}

        update_operation = {'$set': {TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY: couplings if absolute else relevant_matchday[TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY] + couplings,
                                     TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY: decouplings if absolute else relevant_matchday[TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY] + decouplings}}

        try:
            results = matchdays_collection.update_one(filter_object, update_operation)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        # If the same constraints have been applied
        return results.matched_count == 1

    def upsert_guest_for_matchday(self, date, guest_dict):
        """
        Adds or replaces a guest entry for the matchday on <date>.
        """
        matchdays_collection = self.__get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)
        filter_object = {TConsts.MATCHDAYS_DATE_KEY: date}

        try:
            matchdays_collection.update_one(
                filter_object,
                {
                    "$pull": {TConsts.MATCHDAYS_GUESTS_KEY: {TConsts.PLAYERS_NAME_KEY: guest_dict[TConsts.PLAYERS_NAME_KEY]}},
                },
            )
            results = matchdays_collection.update_one(
                filter_object,
                {"$push": {TConsts.MATCHDAYS_GUESTS_KEY: guest_dict}},
            )
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return results.matched_count == 1

    def remove_guest_from_matchday(self, date, guest_name):
        """
        Removes a guest entry by name from the matchday on <date>.
        """
        matchdays_collection = self.__get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)
        filter_object = {TConsts.MATCHDAYS_DATE_KEY: date}

        try:
            results = matchdays_collection.update_one(
                filter_object,
                {"$pull": {TConsts.MATCHDAYS_GUESTS_KEY: {TConsts.PLAYERS_NAME_KEY: guest_name}}},
            )
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return results.matched_count == 1

    def replace_matchday_player(self, date, current_name, replacement_name, replacement_guest=None):
        """
        Replaces a player name in the matchday roster with another existing player.
        Also removes a guest entry if the current player is a guest and clears teams.
        """
        matchday = self.get_matchday(date)
        if not matchday:
            return False

        roster = matchday.get(TConsts.MATCHDAYS_ROSTER_KEY, []) or []
        if current_name not in roster or replacement_name in roster:
            return False

        updated_roster = [
            replacement_name if name == current_name else name for name in roster
        ]
        guests = matchday.get(TConsts.MATCHDAYS_GUESTS_KEY, []) or []
        updated_guests = [
            guest
            for guest in guests
            if guest.get(TConsts.PLAYERS_NAME_KEY) not in {current_name, replacement_name}
        ]
        if replacement_guest:
            updated_guests.append(replacement_guest)

        def adjust_constraints(constraints):
            updated = []
            for group in constraints or []:
                new_group = []
                for name in group:
                    name = replacement_name if name == current_name else name
                    if name not in new_group and name in updated_roster:
                        new_group.append(name)
                if len(new_group) >= 2:
                    updated.append(new_group)
            return updated

        updated_couplings = adjust_constraints(
            matchday.get(TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY, []) or []
        )
        updated_decouplings = adjust_constraints(
            matchday.get(TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY, []) or []
        )

        matchdays_collection = self.__get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)
        filter_object = {TConsts.MATCHDAYS_DATE_KEY: date}
        update_operation = {
            "$set": {
                TConsts.MATCHDAYS_ROSTER_KEY: updated_roster,
                TConsts.MATCHDAYS_GUESTS_KEY: updated_guests,
                TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY: updated_couplings,
                TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY: updated_decouplings,
                TConsts.MATCHDAYS_TEAMS_KEY: [],
            }
        }

        try:
            results = matchdays_collection.update_one(filter_object, update_operation)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return results.matched_count == 1

    def get_player_characteristic(self, player_name):
        """
        :param player_name: The player to check.
        :return: The characteristic of <player_name>.
        """
        players_collection = self.__get_collection(TConsts.PLAYERS_COLLECTION_NAME)
        filter_object = {TConsts.PLAYERS_NAME_KEY: player_name}
        try:
            result = players_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return None if result is None else result[TConsts.PLAYERS_CHARACTERISTICS_KEY]

    def get_player_entry_count(self, player_name):
        """
        :return: The entry count for <player_name>.
        """
        players_collection = self.__get_collection(TConsts.PLAYERS_COLLECTION_NAME)
        filter_object = {TConsts.PLAYERS_NAME_KEY: player_name}
        try:
            result = players_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        if result is None:
            return None
        return result.get(TConsts.PLAYERS_ENTRY_COUNT_KEY, 0)

    def check_admin_existence(self, admin_id):
        """
        :return: True if <admin_id> exists in the Admins collection, False otherwise
        """
        admins_collection = self.__get_collection(TConsts.ADMINS_COLLECTION_NAME)
        filter_object = {TConsts.USER_ID_KEY: admin_id}
        try:
            result = admins_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result is not None

    def check_ranker_existence(self, ranker_id):
        """
        :return: True if <ranker_id> exists in the Rankers collection, False otherwise
        """
        rankers_collection = self.__get_collection(TConsts.RANKERS_COLLECTION_NAME)
        filter_object = {TConsts.USER_ID_KEY: ranker_id}
        try:
            result = rankers_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result is not None

    def check_matchday_existence(self, date):
        """
        :return: True if a matchday that occurs in <DDMMYY> exists, False otherwise.
        """
        matchdays_collection = self.__get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)
        filter_object = {TConsts.MATCHDAYS_DATE_KEY: date}
        try:
            result = matchdays_collection.find_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        return result is not None

    def delete_player(self, player_name):
        """
        Deletes a single player from the entire database.
        :param player_name: The player name that we wish to delete.
        :return: True if the player was deleted successfully, false otherwise
        """
        players_collection = self.__get_collection(TConsts.PLAYERS_COLLECTION_NAME)
        player_name_filter = {TConsts.PLAYERS_NAME_KEY: player_name}

        rankers_collection = self.__get_collection(TConsts.RANKERS_COLLECTION_NAME)
        delete_ranking_operation = {
            '$unset': {"{0}.{1}".format(TConsts.RANKERS_USER_RANKINGS, player_name): ""}}

        try:
            player_delete_result = players_collection.delete_one(player_name_filter)
            player_rankings_delete_result = rankers_collection.update_many({}, delete_ranking_operation)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        # Makes sure we actually deleted a player
        return player_delete_result.deleted_count == 1

    def delete_matchday(self, date):
        """
        Deletes the matchday that occurs at <DDMMYY>.
        :return: True if a single matchday was deleted successfully, False otherwise.
        """
        matchdays_collection = self.__get_collection(TConsts.MATCHDAYS_COLLECTION_NAME)
        filter_object = {TConsts.MATCHDAYS_DATE_KEY: date}

        try:
            matchdays_delete_result = matchdays_collection.delete_one(filter_object)
        except Exception as e:
            raise tfab_exception.TFABDatabaseError("TFAB Database Error occurred: " + str(e))

        # Makes sure we actually deleted a matchday
        return matchdays_delete_result.deleted_count == 1

    def __get_collection(self, collection_name):
        """
        :return: The requested collection, if there were no errors.
        """
        collection = self.db[collection_name]
        if collection is None:
            raise tfab_exception.TFABDatabaseError("Unable to access collection {0}".format(collection_name))

        return collection

    def get_collection(self, collection_name):
        """
        Exposes a collection for advanced flows outside the bot handlers.
        """
        return self.__get_collection(collection_name)

    def __del__(self):
        self.mongo_client.close()
