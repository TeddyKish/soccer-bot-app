from datetime import datetime
from tfab_framework.tfab_database_handler import TFABDBHandler
from tfab_utils import tfab_message_parser, tfab_team_generator
from tfab_framework.tfab_logger import tfab_logger
from tfab_framework.tfab_consts import Consts as TConsts
from tfab_framework.application.menus.menu_utils import UpdateTypes, HandlerUtils, TFABMenuHierarchy, UserDataIndices, CommonHandlers
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes


class AdminMenuHandlers(object):
    """
    Encompasses the Admin menu options.
    """

    @staticmethod
    async def admin_login_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Responsible for validating admin requests.
        """
        update_type = HandlerUtils.get_update_type(update)
        if update_type == UpdateTypes.OTHER:
            tfab_logger.log("Illegal state in bot.", tfab_logger.CRIT)
            return await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.CALLBACK_QUERY:
            # We got here through the main menu, so we'll route this to GOT_INPUT
            context.user_data[UserDataIndices.CURRENT_STATE] = TFABMenuHierarchy.ADMIN_LOGIN
            await context.bot.send_message(chat_id=update.effective_chat.id, text="אנא הקלד את סיסמת המנהלים")
            return TFABMenuHierarchy.GOT_INPUT
        elif update_type == UpdateTypes.TEXTUAL_MESSAGE:
            # We got here because the user attempted to enter the admin password
            if update.message.text == \
                    TFABDBHandler.get_instance().get_configuration_value(TConsts.INTERNAL_ADMIN_PASSWORD_KEY):
                first_name = update.effective_user.first_name
                last_name = update.effective_user.last_name
                if first_name:
                    TFABDBHandler.get_instance().insert_admin(
                        "{0}".format(first_name if last_name is None else first_name + " " + last_name),
                        update.effective_user.id)
                    context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
                    return await CommonHandlers.entrypoint_handler(update, context)
                else:
                    await context.bot.send_message(chat_id=update.effective_chat.id,
                                                   text="השם שלך בטלגרם מוזר, תקן אותו אחי ואז תחזור")
            else:
                await context.bot.send_message(chat_id=update.effective_chat.id, text="הסיסמא שגויה.")

        context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
        return await CommonHandlers.entrypoint_handler(update, context)

    @staticmethod
    async def admin_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handle the admin menu.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        query = update.callback_query
        await query.answer()

        # First check if the user is logged in as admin.
        if not TFABDBHandler.get_instance().check_admin_existence(update.effective_user.id):
            return await AdminMenuHandlers.admin_login_handler(update, context)

        text = """להלן פעולות המנהלים האפשריות:"""
        keyboard = [
            [InlineKeyboardButton("נהל משחקים", callback_data=str(TFABMenuHierarchy.ADMIN_MENU_MATCHDAYS))],
            [InlineKeyboardButton("נהל שחקנים", callback_data=str(TFABMenuHierarchy.ADMIN_MENU_PLAYERS))]
        ]

        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
        return TFABMenuHierarchy.ADMIN_MENU

class MatchdaysMenuHandlers(object):
    """
    Handles the matchdays menu hierarchy.
    """
    @staticmethod
    async def matchdays_settings_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handle the admin->matchdays->settings menu.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        query = update.callback_query
        await query.answer()

        text = """בחר את האפשרות הרצויה:"""
        keyboard = [
            [InlineKeyboardButton("אילוצים",
                                  callback_data=str(TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS_CONSTRAINTS))],
            [InlineKeyboardButton("פרמטרים",
                                  callback_data=str(TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS_PARAMETERS))]
        ]

        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
        return TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS

    @staticmethod
    async def matchdays_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handle the admin->matchdays menu.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        query = update.callback_query
        await query.answer()

        text = """בחר את האפשרות הרצויה:"""
        keyboard = [
            [InlineKeyboardButton("הצג מידע להיום", callback_data=str(TFABMenuHierarchy.MATCHDAYS_MENU_SHOW_TODAY_INFO))],
            [InlineKeyboardButton("קבע רשימה להיום", callback_data=str(TFABMenuHierarchy.MATCHDAYS_MENU_SET_TODAY_LIST))],
            [InlineKeyboardButton("צור כוחות", callback_data=str(TFABMenuHierarchy.MATCHDAYS_MENU_GENERATE_TEAMS)),
             InlineKeyboardButton("הגדרות", callback_data=str(TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS))]
        ]

        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
        return TFABMenuHierarchy.ADMIN_MENU_MATCHDAYS

    @staticmethod
    async def generate_teams_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handle the admin->matchdays->generate teams menu.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)
        await update.callback_query.answer()

        db = TFABDBHandler.get_instance()
        today_date = datetime.now().strftime(TConsts.MATCHDAYS_DATE_FORMAT)

        if not db.check_matchday_existence(today_date):
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
            await context.bot.send_message(chat_id=update.effective_chat.id, text="עדיין לא נקבעה רשימה להיום")
            return await CommonHandlers.entrypoint_handler(update, context)

        todays_matchday = db.get_matchday(today_date)
        todays_player_list = todays_matchday[TConsts.MATCHDAYS_ROSTER_KEY]

        # Prepare the data for the generation function
        player_dicts_list = []
        for player in todays_player_list:
            player_dicts_list.append({
                TConsts.PLAYERS_NAME_KEY: player,
                TConsts.PLAYERS_CHARACTERISTICS_KEY: db.get_player_characteristic(player),
                TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY: db.get_player_average_rating(player, db.get_configuration_value(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY))})

        await context.bot.send_message(chat_id=update.effective_chat.id, text="מחשב..")
        teams_dict = tfab_team_generator.TeamGenerator.generate_teams\
            (player_dicts_list,
             balance_team_ratings=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_RATINGS"]),
             enforce_tiers=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_TIERS"]),
             enforce_defense=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_DEFENSE"]),
             enforce_offense=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_OFFENSE"]),
             enforce_total_roles=db.get_configuration_value(TConsts.TeamGenerationParameters["BLC_ROLES"]),
             num_teams=db.get_configuration_value(TConsts.TeamGenerationParameters["NUM_TEAMS"]),
             coupling_constraints=todays_matchday[TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY],
             decoupling_constraints=todays_matchday[TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY])
        if not teams_dict:
            await context.bot.send_message( chat_id=update.effective_chat.id,text="בלתי אפשרי לייצר כוחות מתאימים, שנה את הפרמטרים או מחק אילוצים")
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
            return await CommonHandlers.entrypoint_handler(update, context)
        if not db.insert_teams_to_matchday(today_date, teams_dict):
            # Impossible because we already checked that there is a matchday occuring today
            await CommonHandlers.illegal_situation_handler(update, context)

        await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text=tfab_message_parser.MessageParser.generate_matchday_message(db.get_matchday(today_date)))
        context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
        return await CommonHandlers.entrypoint_handler(update, context)

    @staticmethod
    async def set_todays_list_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handle the admin->matchdays->set list menu.
        """
        update_type = HandlerUtils.get_update_type(update)

        if update_type == UpdateTypes.CALLBACK_QUERY:
            await update.callback_query.answer()

            await context.bot.send_message(chat_id=update.effective_chat.id, text="שלח בבקשה את רשימת המשחק להיום")
            context.user_data[UserDataIndices.CURRENT_STATE] = TFABMenuHierarchy.MATCHDAYS_MENU_SET_TODAY_LIST
            return TFABMenuHierarchy.GOT_INPUT
        elif update_type == UpdateTypes.TEXTUAL_MESSAGE:
            # Do stuff after you got the user's list
            list_message = update.message.text
            result_dictionary = tfab_message_parser.MessageParser.parse_matchday_message(list_message)
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False

            if result_dictionary[TConsts.MATCHDAYS_ROSTER_KEY] is None:
                await context.bot.send_message(chat_id=update.effective_chat.id,
                                               text="הרשימה ששלחת לא תקינה, לא הצלחתי לקרוא את רשימת השחקנים כהלכה")
                return await CommonHandlers.entrypoint_handler(update, context)
            elif result_dictionary[TConsts.MATCHDAYS_DATE_KEY] is None:
                await context.bot.send_message(chat_id=update.effective_chat.id,
                                               text="הרשימה ששלחת לא תקינה, לא הצלחתי לקרוא את התאריך כהלכה")
                return await CommonHandlers.entrypoint_handler(update, context)
            elif result_dictionary[TConsts.MATCHDAYS_LOCATION_KEY] is None:
                await context.bot.send_message(chat_id=update.effective_chat.id,
                                               text="הרשימה ששלחת לא תקינה, לא הצלחתי לקרוא את המיקום כהלכה")
                return await CommonHandlers.entrypoint_handler(update, context)
            elif result_dictionary[TConsts.MATCHDAYS_ORIGINAL_MESSAGE_KEY] is None:
                return await CommonHandlers.illegal_situation_handler(update, context)

            today_date = datetime.now().strftime(TConsts.MATCHDAYS_DATE_FORMAT)
            if today_date != result_dictionary[TConsts.MATCHDAYS_DATE_KEY]:
                context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
                await context.bot.send_message(chat_id=update.effective_chat.id,
                                               text="ניתן לקבוע רשימה רק ביום המשחק")
                return await CommonHandlers.entrypoint_handler(update, context)

            all_players_exist_in_db = True
            for player in result_dictionary[TConsts.MATCHDAYS_ROSTER_KEY]:
                if not TFABDBHandler.get_instance().check_player_existence(player):
                    all_players_exist_in_db = False
                    break

            if not all_players_exist_in_db:
                context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
                await context.bot.send_message(
                    chat_id=update.effective_chat.id,
                    text="ברשימה קיימים שחקנים לא מוכרים למערכת, תוסיף אותם דרך תפריט השחקנים ואז נסה שוב")
                return await CommonHandlers.entrypoint_handler(update, context)

            # Insert DB information
            TFABDBHandler.get_instance().insert_matchday(
                result_dictionary[TConsts.MATCHDAYS_ORIGINAL_MESSAGE_KEY],
                result_dictionary[TConsts.MATCHDAYS_LOCATION_KEY],
                result_dictionary[TConsts.MATCHDAYS_ROSTER_KEY],
                result_dictionary[TConsts.MATCHDAYS_DATE_KEY],
                )

            await context.bot.send_message(chat_id=update.effective_chat.id,
                                               text="הרשימה תקינה ונקלטה בהצלחה")
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
            return await CommonHandlers.entrypoint_handler(update, context)

        await CommonHandlers.illegal_situation_handler(update, context)

    @staticmethod
    async def show_todays_info_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handle the admin->matchdays->show info menu.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)
        await update.callback_query.answer()

        today_date = datetime.now().strftime(TConsts.MATCHDAYS_DATE_FORMAT)
        todays_matchday = TFABDBHandler.get_instance().get_matchday(today_date)

        if not todays_matchday:
            await context.bot.send_message(chat_id=update.effective_chat.id, text="עדיין לא נקבעה רשימה להיום")
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
        else:
            message = tfab_message_parser.MessageParser.generate_matchday_message(todays_matchday)
            await context.bot.send_message(chat_id=update.effective_chat.id, text=message)
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True

        return await CommonHandlers.entrypoint_handler(update, context)


class PlayersMenuHandlers(object):
    """
    Encompasses the complicated operations of the players menu
    """

    @staticmethod
    async def players_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handle the admin->players menu.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        query = update.callback_query
        await query.answer()

        text = """בחר את האפשרות הרצויה:"""
        keyboard = [
            [InlineKeyboardButton("הצג שחקנים", callback_data=str(TFABMenuHierarchy.PLAYERS_MENU_SHOW))],
            [InlineKeyboardButton("הוסף שחקן", callback_data=str(TFABMenuHierarchy.PLAYERS_MENU_ADD))],
            [InlineKeyboardButton("מחק שחקן", callback_data=str(TFABMenuHierarchy.PLAYERS_MENU_DELETE)),
             InlineKeyboardButton("ערוך שחקן", callback_data=str(TFABMenuHierarchy.PLAYERS_MENU_EDIT))]
        ]

        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
        return TFABMenuHierarchy.ADMIN_MENU_PLAYERS

    @staticmethod
    async def add_player_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_data = context.user_data

        update_type = HandlerUtils.get_update_type(update)
        if update_type == UpdateTypes.OTHER:
            tfab_logger.log("Illegal state in bot.", tfab_logger.CRIT)
            return await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.CALLBACK_QUERY:
            query = update.callback_query
            await query.answer()

            if query.data == str(TFABMenuHierarchy.PLAYERS_MENU_ADD):
                # This means we got here through the players menu
                user_data[UserDataIndices.CURRENT_STATE] = TFABMenuHierarchy.PLAYERS_MENU_ADD
                await query.edit_message_text("""מה שם השחקן שתרצה להוסיף?""")
                return TFABMenuHierarchy.GOT_INPUT

            elif query.data in list(TConsts.PlayerCharacteristics.values()):
                # This means we got here after the user entered the player name and characteristics
                player_name = user_data[UserDataIndices.CONTEXTUAL_ADDED_PLAYER]
                characteristic = query.data

                if not player_name or not characteristic:
                    return await CommonHandlers.illegal_situation_handler(update, context)
                TFABDBHandler.get_instance().insert_player(player_name, characteristic)

                user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
                return await CommonHandlers.entrypoint_handler(update, context)
            else:
                # The data of the query doesn't match any legal values
                return await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.TEXTUAL_MESSAGE:
            # The user entered the name of the player he wishes to add
            message = update.message
            user_data[UserDataIndices.CONTEXTUAL_ADDED_PLAYER] = message.text

            text = """בחר את סוג השחקן:"""
            keyboard = [
                [InlineKeyboardButton("מתאים לכל המגרש", callback_data=str(TConsts.PlayerCharacteristics["ALLAROUND"]))],
                [InlineKeyboardButton("שוער", callback_data=str(TConsts.PlayerCharacteristics["GOALKEEPER"])),
                 InlineKeyboardButton("התקפה", callback_data=str(TConsts.PlayerCharacteristics["OFFENSIVE"])),
                 InlineKeyboardButton("הגנה", callback_data=str(TConsts.PlayerCharacteristics["DEFENSIVE"]))]
            ]

            await message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
            return TFABMenuHierarchy.ADMIN_MENU_PLAYERS

    @staticmethod
    async def edit_player_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_data = context.user_data

        update_type = HandlerUtils.get_update_type(update)
        if update_type == UpdateTypes.OTHER:
            tfab_logger.log("Illegal state in bot.", tfab_logger.CRIT)
            return await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.CALLBACK_QUERY:
            query = update.callback_query
            await query.answer()

            if query.data == str(TFABMenuHierarchy.PLAYERS_MENU_EDIT):
                # This means we got here through the players menu
                user_data[UserDataIndices.CURRENT_STATE] = TFABMenuHierarchy.PLAYERS_MENU_EDIT

                await query.edit_message_text("""מה שם השחקן שתרצה לערוך?""")
                return TFABMenuHierarchy.GOT_INPUT
            elif query.data in list(TConsts.PlayerCharacteristics.values()):
                # This means we got here after the user entered the player name and characteristics
                player_name = user_data[UserDataIndices.CONTEXTUAL_EDITED_PLAYER]
                characteristic = query.data

                if not player_name or not characteristic:
                    return await CommonHandlers.illegal_situation_handler(update, context)

                if TFABDBHandler.get_instance().edit_player(player_name, characteristic)[0]:
                    user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
                    return await CommonHandlers.entrypoint_handler(update, context)
                else:
                    await context.bot.send_message(chat_id=update.effective_chat.id,
                                                   text="""קרתה שגיאה בפעולת עריכת השחקן""")
                    context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
                    return await CommonHandlers.entrypoint_handler(update, context)
            else:
                # The data of the query doesn't match any legal values
                return await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.TEXTUAL_MESSAGE:
            message = update.message
            user_data[UserDataIndices.CONTEXTUAL_EDITED_PLAYER] = message.text

            if not TFABDBHandler.get_instance().check_player_existence(message.text):
                await context.bot.send_message(chat_id=update.effective_chat.id,
                                               text="""לא קיים שחקן כזה, וודא שהשם כתוב נכון""")
                context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
                return await CommonHandlers.entrypoint_handler(update, context)

            text = """בחר את הסוג המעודכן עבור השחקן:"""
            keyboard = [
                [InlineKeyboardButton("מתאים לכל המגרש",
                                      callback_data=str(TConsts.PlayerCharacteristics["ALLAROUND"]))],
                [InlineKeyboardButton("שוער", callback_data=str(TConsts.PlayerCharacteristics["GOALKEEPER"])),
                 InlineKeyboardButton("התקפה", callback_data=str(TConsts.PlayerCharacteristics["OFFENSIVE"])),
                 InlineKeyboardButton("הגנה", callback_data=str(TConsts.PlayerCharacteristics["DEFENSIVE"]))]
            ]

            await message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
            return TFABMenuHierarchy.ADMIN_MENU_PLAYERS

    @staticmethod
    async def delete_player_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_data = context.user_data

        update_type = HandlerUtils.get_update_type(update)
        if update_type == UpdateTypes.OTHER:
            tfab_logger.log("Illegal state in bot.", tfab_logger.CRIT)
            await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.CALLBACK_QUERY:
            # The user got to this handler through the Players menu
            query = update.callback_query
            await query.answer()

            if query.data == str(TFABMenuHierarchy.PLAYERS_MENU_DELETE):
                user_data[UserDataIndices.CURRENT_STATE] = TFABMenuHierarchy.PLAYERS_MENU_DELETE

                await query.edit_message_text("""מה שם השחקן שתרצה למחוק?""")
                return TFABMenuHierarchy.GOT_INPUT
            else:
                # The data of the query doesn't match any legal values
                return await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.TEXTUAL_MESSAGE:
            # The user already entered the name of the player he wishes to delete
            message = update.message
            player_name = message.text

            if not player_name:
                tfab_logger.log("Player name was empty despite receiving a message!")
                return await CommonHandlers.illegal_situation_handler(update, context)

            if TFABDBHandler.get_instance().delete_player(player_name):
                context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
                return await CommonHandlers.entrypoint_handler(update, context)
            else:
                await context.bot.send_message(chat_id=update.effective_chat.id,
                                               text="""לא קיים שחקן כזה, וודא שהשם כתוב נכון""")
                context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
                return await CommonHandlers.entrypoint_handler(update, context)

    @staticmethod
    async def show_players_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handles the "Show Players" Menu.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)
        await update.callback_query.answer()

        all_players_list = TFABDBHandler.get_instance().get_player_list(hebrew_characteristics=True)
        all_players_message = tfab_message_parser.MessageParser.stringify_player_list(all_players_list)
        await context.bot.send_message(chat_id=update.effective_chat.id, text=all_players_message)

        context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
        return await CommonHandlers.entrypoint_handler(update, context)

    @staticmethod
    async def characteristics_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handles text that contains a characteristic - infers the previous operation and forwards the information to it.
        """
        if UserDataIndices.CURRENT_STATE in context.user_data:
            state = context.user_data[UserDataIndices.CURRENT_STATE]
            if state == TFABMenuHierarchy.PLAYERS_MENU_ADD:
                return await PlayersMenuHandlers.add_player_handler(update, context)
            elif state == TFABMenuHierarchy.PLAYERS_MENU_EDIT:
                return await PlayersMenuHandlers.edit_player_handler(update, context)

        return await CommonHandlers.illegal_situation_handler(update, context)


class SettingsMenuHandlers(object):
    """
    Encompasses the complicated operations of the Settings menu.
    """
    @staticmethod
    async def delete_constraints_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Deletes the current constraints.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        await update.callback_query.answer()
        today_date = datetime.now().strftime(TConsts.MATCHDAYS_DATE_FORMAT)

        if TFABDBHandler.get_instance().insert_constraints_to_matchday(date=today_date, absolute=True):
            await context.bot.send_message(chat_id=update.effective_chat.id, text="האילוצים נמחקו.")
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
        else:
            await context.bot.send_message(chat_id=update.effective_chat.id, text="קרתה תקלה בעת מחיקת האילוצים.")
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
        return await CommonHandlers.entrypoint_handler(update, context)

    @staticmethod
    async def show_constraints_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Shows the current constraints.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        await update.callback_query.answer()
        today_date = datetime.now().strftime(TConsts.MATCHDAYS_DATE_FORMAT)
        matchday = TFABDBHandler.get_instance().get_matchday(today_date)
        if not matchday:
            await context.bot.send_message(chat_id=update.effective_chat.id, text="שימוש באילוצים מחייב שתהיה רשימת משחק תקפה להיום.")
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
            return await CommonHandlers.entrypoint_handler(update, context)

        couplings = matchday[TConsts.MATCHDAYS_COUPLING_CONSTRAINTS_KEY]
        decouplings = matchday[TConsts.MATCHDAYS_DECOUPLING_CONSTRAINTS_KEY]

        output = ""
        if couplings:
            output += "להלן רשימת ההצמדות הנוכחית:\n"
            for index, entry in enumerate(couplings):
                output += "{0}.{1}\n".format(index + 1, ",".join(entry))
        else:
            output += "לא קיימות הצמדות כרגע.\n"

        output += "\n"

        if decouplings:
            output += "להלן רשימת ההפרדות הנוכחית:\n"
            for index, entry in enumerate(decouplings):
                output += "{0}.{1}\n".format(index + 1, ",".join(entry))
        else:
            output += "לא קיימות הפרדות כרגע.\n"

        await context.bot.send_message(chat_id=update.effective_chat.id, text=output)
        context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
        return await CommonHandlers.entrypoint_handler(update, context)

    @staticmethod
    async def constraints_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handles the settings->constraints menu.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        query = update.callback_query
        await query.answer()

        today_date = datetime.now().strftime(TConsts.MATCHDAYS_DATE_FORMAT)
        if not TFABDBHandler.get_instance().get_matchday(today_date):
            await context.bot.send_message(chat_id=update.effective_chat.id,
                                           text="שימוש באילוצים מחייב שתהיה רשימת משחק תקפה להיום.")
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False
            return await CommonHandlers.entrypoint_handler(update, context)

        text = """בחר את האפשרות הרצויה:"""
        keyboard = [
            [InlineKeyboardButton("הצג אילוצים", callback_data=str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_SHOW_ACTIVE))],
            [InlineKeyboardButton("הצמד שחקנים", callback_data=str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_COUPLING)),
             InlineKeyboardButton("הפרד שחקנים", callback_data=str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_DECOUPLING))],
            [InlineKeyboardButton("מחק אילוצים", callback_data=str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_DELETE))]
        ]

        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
        return TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS_CONSTRAINTS

    @staticmethod
    async def creating_constraints_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handles the settings->constraints->couple/decouple menu.
        """
        user_data = context.user_data
        update_type = HandlerUtils.get_update_type(update)

        if update_type == UpdateTypes.OTHER:
            tfab_logger.log("Illegal state in bot.", tfab_logger.CRIT)
            return await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.CALLBACK_QUERY:
            query = update.callback_query
            await query.answer()

            if query.data == str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_COUPLING):
                user_data[UserDataIndices.CURRENT_STATE] = TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_COUPLING
                await query.edit_message_text("""שלח רשימת שחקנים שתרצה להצמיד, כל אחד בשורה נפרדת""")
                return TFABMenuHierarchy.GOT_INPUT
            elif query.data == str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_DECOUPLING):
                user_data[UserDataIndices.CURRENT_STATE] = TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_DECOUPLING
                await query.edit_message_text("""שלח רשימת שחקנים שתרצה להפריד, כל אחד בשורה נפרדת""")
                return TFABMenuHierarchy.GOT_INPUT
            else:
                # The data of the query doesn't match any legal values
                tfab_logger.error("Received illegal query data")
                return await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.TEXTUAL_MESSAGE:
            # The user entered a list of players to couple/decouple
            player_list = []

            for player in update.message.text.splitlines():
                player = player.strip()
                if TFABDBHandler.get_instance().check_player_existence(player):
                    player_list.append(player)

            if player_list:
                output = "קלטתי את השחקנים: {0}".format(",".join(player_list))
                await context.bot.send_message(chat_id=update.effective_chat.id, text=output)
                today_date = datetime.now().strftime(TConsts.MATCHDAYS_DATE_FORMAT)

                if user_data[UserDataIndices.CURRENT_STATE] == TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_COUPLING:
                    TFABDBHandler.get_instance().insert_constraints_to_matchday(today_date, couplings=[player_list])
                elif user_data[UserDataIndices.CURRENT_STATE] == TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_DECOUPLING:
                    TFABDBHandler.get_instance().insert_constraints_to_matchday(today_date, decouplings=[player_list])

                user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
            else:
                user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = False

            return await CommonHandlers.entrypoint_handler(update, context)

    @staticmethod
    async def parameters_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handles the settings->constraints menu.
        """
        def get_state_string(configuration_key):
            """
            Returns the state string for the requested configuration key.
            """
            return "דלוק" if TFABDBHandler.get_instance().get_configuration_value(configuration_key) == 1 else "כבוי"

        if HandlerUtils.get_update_type(update) == UpdateTypes.TEXTUAL_MESSAGE:
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
            return await CommonHandlers.entrypoint_handler(update, context)
        elif HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        query = update.callback_query
        await query.answer()
        db = TFABDBHandler.get_instance()

        if query.data == str(TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS_PARAMETERS):
            pass
        elif query.data == str(TConsts.EOO_QUERY_DATA):
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
            return await CommonHandlers.entrypoint_handler(update, context)
        elif query.data in [TConsts.TeamGenerationParameters["BLC_RATINGS"],
                            TConsts.TeamGenerationParameters["BLC_TIERS"],
                            TConsts.TeamGenerationParameters["BLC_DEFENSE"],
                            TConsts.TeamGenerationParameters["BLC_OFFENSE"],
                            TConsts.TeamGenerationParameters["BLC_ROLES"]]:
            db.modify_configuration_value(query.data, int(not db.get_configuration_value(query.data)))
        elif query.data == TConsts.TeamGenerationParameters["NUM_TEAMS"]:
            current_size = db.get_configuration_value(TConsts.TeamGenerationParameters["NUM_TEAMS"])
            db.modify_configuration_value(TConsts.TeamGenerationParameters["NUM_TEAMS"], 2 if (current_size + 1) % 6 == 0 else current_size + 1)
        elif query.data == TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY:
            current_thresh = db.get_configuration_value(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY)
            db.modify_configuration_value(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY,
                                          0.5 if (current_thresh + 0.25) % 2.5 == 0 else current_thresh + 0.25)
        else:
            tfab_logger.error("Received illegal query data for the parameters menu")
            await CommonHandlers.illegal_situation_handler(update, context)

        text = """בחר את האפשרות הרצויה:"""
        keyboard = [
            [InlineKeyboardButton("איזון דירוגי קבוצות: {0}".format(get_state_string(TConsts.TeamGenerationParameters["BLC_RATINGS"])),
                                  callback_data=str(TConsts.TeamGenerationParameters["BLC_RATINGS"])),
             InlineKeyboardButton("מספר קבוצות: {0}".format(db.get_configuration_value(TConsts.TeamGenerationParameters["NUM_TEAMS"])),
                 callback_data=str(TConsts.TeamGenerationParameters["NUM_TEAMS"]))],
            [InlineKeyboardButton("ווידוא שחקן מכל דרג: {0}".format(get_state_string(TConsts.TeamGenerationParameters["BLC_TIERS"])),
                                  callback_data=str(TConsts.TeamGenerationParameters["BLC_TIERS"])),
             InlineKeyboardButton("איזון תפקידים כללי: {0}".format(get_state_string(TConsts.TeamGenerationParameters["BLC_ROLES"])),
                    callback_data=str(TConsts.TeamGenerationParameters["BLC_ROLES"]))],
            [InlineKeyboardButton("איזון שחקני הגנה: {0}".format(get_state_string(TConsts.TeamGenerationParameters["BLC_DEFENSE"])),
                                  callback_data=str(TConsts.TeamGenerationParameters["BLC_DEFENSE"])),
             InlineKeyboardButton("איזון שחקני התקפה: {0}".format(get_state_string(TConsts.TeamGenerationParameters["BLC_OFFENSE"])),
                                  callback_data=str(TConsts.TeamGenerationParameters["BLC_OFFENSE"]))],
            [InlineKeyboardButton("מידת חופש למדרגים: {0}".format(db.get_configuration_value(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY)),
                                  callback_data=str(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY))],
            [InlineKeyboardButton("סיימתי", callback_data=str(TConsts.EOO_QUERY_DATA))]
            ]

        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
        return TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS
