from tfab_framework.tfab_logger import tfab_logger

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from telegram.ext import ConversationHandler

class TFABMenuHierarchy(object):
    """
    Contains the hierarchy of menus within this application
    """
    ADMIN_LOGIN, \
    RANKERS_LOGIN, \
    GOT_INPUT, \
    GENERAL_MENU, \
        RANKER_MENU, \
            RANKER_MENU_RANK_EVERYONE, \
            RANKER_MENU_RANK_SPECIFIC_PLAYER, \
            RANKER_MENU_SHOW_MY_RANKINGS, \
        ADMIN_MENU, \
            ADMIN_MENU_MATCHDAYS, \
                MATCHDAYS_MENU_SET_TODAY_LIST, \
                MATCHDAYS_MENU_GENERATE_TEAMS, \
                MATCHDAYS_MENU_SHOW_TODAY_INFO, \
                MATCHDAYS_MENU_SETTINGS,  \
                    MATCHDAYS_MENU_SETTINGS_CONSTRAINTS, \
                        MATCHDAYS_CONSTRAINTS_CREATE_COUPLING, \
                        MATCHDAYS_CONSTRAINTS_CREATE_DECOUPLING, \
                        MATCHDAYS_CONSTRAINTS_DELETE, \
                        MATCHDAYS_CONSTRAINTS_SHOW_ACTIVE, \
                    MATCHDAYS_MENU_SETTINGS_PARAMETERS, \
            ADMIN_MENU_PLAYERS, \
                PLAYERS_MENU_ADD, \
                PLAYERS_MENU_SHOW, \
                PLAYERS_MENU_EDIT, \
                PLAYERS_MENU_DELETE = range(25)

class UpdateTypes(object):
    CALLBACK_QUERY = 0
    TEXTUAL_MESSAGE = 1
    OTHER = 2


class EntryPointStates(object):
    START = 0,
    END_OF_OPERATION = 1,
    ILLEGAL = 2


class HandlerUtils(object):
    """
    Contains utilities for the different handlers.
    """
    @staticmethod
    def get_update_type(update):
        if update.message and update.message.text and update.message.text != "":
            return UpdateTypes.TEXTUAL_MESSAGE
        elif update.message is None and update.callback_query is not None:
            return UpdateTypes.CALLBACK_QUERY

        return UpdateTypes.OTHER

class UserDataIndices(object):
    CONTEXTUAL_ADDED_PLAYER = "AddedPlayer"
    CONTEXTUAL_DELETED_PLAYER = "DeletedPlayer"
    CONTEXTUAL_EDITED_PLAYER = "EditedPlayer"
    CURRENT_STATE = "CurrentState"
    CONTEXTUAL_LAST_OPERATION_STATUS = "CurrentStatus"

class CommonHandlers(object):
    """
    Encompasses common handlers throughout the different menus.
    """

    @staticmethod
    async def entrypoint_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Send message on `/start` or `/help`."""

        def get_entry_method(update: Update):
            """
            :param update: The update received.
            :return: The method by which this function was called.
            """
            update_type = HandlerUtils.get_update_type(update)
            if update_type == UpdateTypes.TEXTUAL_MESSAGE:
                if update.message.text == "/start" or update.message.text == "/help":
                    return EntryPointStates.START

            if update_type != UpdateTypes.OTHER:
                return EntryPointStates.END_OF_OPERATION

            # Bugs
            return EntryPointStates.ILLEGAL

        keyboard = [
            [
                InlineKeyboardButton("דירוגים", callback_data=str(TFABMenuHierarchy.RANKER_MENU)),
                InlineKeyboardButton("מנהלים", callback_data=str(TFABMenuHierarchy.ADMIN_MENU)),
            ]
        ]

        reply_markup = InlineKeyboardMarkup(keyboard)

        entry_method = get_entry_method(update)
        if entry_method == EntryPointStates.START:
            # Get user that sent /start and log his name
            user = update.message.from_user
            tfab_logger.info("\nTFAB: User %s started the conversation.\n", user.first_name)

            start_text = """ברוך הבא לבוטיטו!
    הבוטיטו נוצר כדי לעזור בארגון משחקי הכדורגל.
    לפניך התפריטים הבאים:"""

            await update.message.reply_text(start_text, reply_markup=reply_markup)
        if entry_method == EntryPointStates.END_OF_OPERATION:
            operation_success_message = """הפעולה בוצעה בהצלחה."""
            operation_failure_message = """הפעולה נכשלה."""
            menus_text = """לפניך התפריטים הבאים:"""
            final_text = ""

            if context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS]:
                final_text = operation_success_message + "\n" + menus_text
            else:
                final_text = operation_failure_message + "\n" + menus_text

            await context.bot.send_message(chat_id=update.effective_chat.id, text=final_text, reply_markup=reply_markup)
        if entry_method == EntryPointStates.ILLEGAL:
            await CommonHandlers.illegal_situation_handler(update, context)

        context.user_data.clear()
        return TFABMenuHierarchy.GENERAL_MENU

    @staticmethod
    async def pass_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handles currently unimplemented options.
        """
        query = update.callback_query
        await query.answer()

        text = """אופציה זו עדיין לא מומשה, ניתן לחזור להתחלה עם  /help"""
        await query.edit_message_text(text)
        return ConversationHandler.END

    @staticmethod
    async def unknown_command_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        await context.bot.send_message(chat_id=update.effective_chat.id,
                                       text="האופציה לא קיימת. לחזרה לתפריט הראשי /help")
        return ConversationHandler.END

    @staticmethod
    async def unknown_text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        await context.bot.send_message(chat_id=update.effective_chat.id,
                                       text="האופציה לא קיימת. לחזרה לתפריט הראשי /help")
        return ConversationHandler.END

    @staticmethod
    async def illegal_situation_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        await context.bot.send_message(chat_id=update.effective_chat.id,
                                       text="הגעת למצב בלתי אפשרי, דווח על זה במהירות למפתחים")
        return ConversationHandler.END
