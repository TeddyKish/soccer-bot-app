from tfab_framework.tfab_exception import TFABApplicationError
from tfab_framework.application.menus.menu_utils import TFABMenuHierarchy, UserDataIndices
from tfab_framework.application.menus.admin_handlers import MatchdaysMenuHandlers, PlayersMenuHandlers, AdminMenuHandlers, SettingsMenuHandlers
from tfab_framework.application.menus.rankers_handlers import RankersMenuHandlers

from telegram import Update
from telegram.ext import ContextTypes

class InputRoutingHandlers(object):
    """
    Contains the different input handlers for this bot.
    """

    @staticmethod
    async def text_input_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        This one is basically a router between functions that need input.
        """
        if context.user_data[UserDataIndices.CURRENT_STATE] == TFABMenuHierarchy.PLAYERS_MENU_ADD:
            return await PlayersMenuHandlers.add_player_handler(update, context)
        elif context.user_data[UserDataIndices.CURRENT_STATE] == TFABMenuHierarchy.PLAYERS_MENU_DELETE:
            return await PlayersMenuHandlers.delete_player_handler(update, context)
        elif context.user_data[UserDataIndices.CURRENT_STATE] == TFABMenuHierarchy.PLAYERS_MENU_EDIT:
            return await PlayersMenuHandlers.edit_player_handler(update, context)
        elif context.user_data[UserDataIndices.CURRENT_STATE] == TFABMenuHierarchy.ADMIN_LOGIN:
            return await AdminMenuHandlers.admin_login_handler(update, context)
        elif context.user_data[UserDataIndices.CURRENT_STATE] == TFABMenuHierarchy.RANKERS_LOGIN:
            return await RankersMenuHandlers.ranker_login_handler(update, context)
        elif context.user_data[UserDataIndices.CURRENT_STATE] == TFABMenuHierarchy.RANKER_MENU_RANK_EVERYONE:
            return await RankersMenuHandlers.rank_everyone_handler(update, context)
        elif context.user_data[UserDataIndices.CURRENT_STATE] == TFABMenuHierarchy.MATCHDAYS_MENU_SET_TODAY_LIST:
            return await MatchdaysMenuHandlers.set_todays_list_handler(update, context)
        elif context.user_data[UserDataIndices.CURRENT_STATE] in [TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_DECOUPLING, TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_COUPLING]:
            return await SettingsMenuHandlers.creating_constraints_menu(update, context)
        else:
            raise TFABApplicationError("text input handler reached invalid state")
