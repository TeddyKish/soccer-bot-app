from tfab_framework.tfab_exception import TFABApplicationError
from tfab_framework.tfab_logger import tfab_logger
from tfab_framework.tfab_database_handler import TFABDBHandler
from tfab_framework.application.menus.menu_utils import UpdateTypes, HandlerUtils, TFABMenuHierarchy, UserDataIndices, CommonHandlers
from tfab_utils import tfab_message_parser
from tfab_framework.tfab_consts import Consts as TConsts
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

class RankersMenuHandlers(object):
    """
    Encompasses the Ranking menu options.
    """

    @staticmethod
    async def ranker_login_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Responsible for validating ranker requests.
        """
        update_type = HandlerUtils.get_update_type(update)
        if update_type == UpdateTypes.OTHER:
            tfab_logger.log("Illegal state in bot.", tfab_logger.CRIT)
        elif update_type == UpdateTypes.CALLBACK_QUERY:
            # We got here through the main menu, so we'll route this to GOT_INPUT
            context.user_data[UserDataIndices.CURRENT_STATE] = TFABMenuHierarchy.RANKERS_LOGIN
            await context.bot.send_message(chat_id=update.effective_chat.id, text="אנא הקלד את סיסמת המדרגים")
            return TFABMenuHierarchy.GOT_INPUT
        elif update_type == UpdateTypes.TEXTUAL_MESSAGE:
            # We got here because the user attempted to enter the rankers password
            if update.message.text == \
                    TFABDBHandler.get_instance().get_configuration_value(TConsts.INTERNAL_RANKER_PASSWORD_KEY):
                first_name = update.effective_user.first_name
                last_name = update.effective_user.last_name
                if first_name:
                    TFABDBHandler.get_instance().insert_ranker(
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
    def __get_rankings_template(update, context):
        players = [name
                   for name, role, _ in TFABDBHandler.get_instance().get_player_list(hebrew_characteristics=False)
                   if role != TConsts.PlayerCharacteristics["GOALKEEPER"]]
        user_rankings = TFABDBHandler.get_instance().get_user_rankings(update.effective_user.id)
        if user_rankings is None:
            raise TFABApplicationError("Logged-in user doesn't have rankings!")

        return tfab_message_parser.MessageParser.generate_rankings_template(players, user_rankings)

    @staticmethod
    async def rankers_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handle the Rankers menu.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        query = update.callback_query
        await query.answer()

        # First check if the user is logged in as a ranker.
        if not TFABDBHandler.get_instance().check_ranker_existence(update.effective_user.id):
            return await RankersMenuHandlers.ranker_login_handler(update, context)

        text = """להלן פעולות הדירוגים האפשריות:"""

        keyboard = [
            [InlineKeyboardButton("דרג שחקן ספציפי",
                                  callback_data=str(TFABMenuHierarchy.RANKER_MENU_RANK_SPECIFIC_PLAYER))],
            [InlineKeyboardButton("דרג את כלל השחקנים",
                                  callback_data=str(TFABMenuHierarchy.RANKER_MENU_RANK_EVERYONE))],
            [InlineKeyboardButton("הצג דירוגים שלי", callback_data=str(TFABMenuHierarchy.RANKER_MENU_SHOW_MY_RANKINGS))]
        ]

        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
        return TFABMenuHierarchy.RANKER_MENU

    @staticmethod
    async def rank_everyone_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handles the "rank everyone" option.
        """
        update_type = HandlerUtils.get_update_type(update)

        if update_type == UpdateTypes.OTHER:
            tfab_logger.log("Illegal state in bot.", tfab_logger.CRIT)
            await CommonHandlers.illegal_situation_handler(update, context)
        elif update_type == UpdateTypes.CALLBACK_QUERY:
            # Handles the case where the user enters this menu directly from the Rankers menu
            await update.callback_query.answer()

            if update.callback_query.data == str(TFABMenuHierarchy.RANKER_MENU_RANK_SPECIFIC_PLAYER):
                await context.bot.send_message(chat_id=update.effective_chat.id,
                                               text="""שלח דירוג עבור שחקן ספציפי (למשל: רונאלדו = 9)""")
            elif update.callback_query.data == str(TFABMenuHierarchy.RANKER_MENU_RANK_EVERYONE):
                rankings_template = RankersMenuHandlers.__get_rankings_template(update, context)

                await context.bot.send_message(chat_id=update.effective_chat.id, text=rankings_template)
                await context.bot.send_message(chat_id=update.effective_chat.id,
                                               text="""שלחתי לך תבנית לדירוגים, תמלא אותה ושלח לי""")
            context.user_data[UserDataIndices.CURRENT_STATE] = TFABMenuHierarchy.RANKER_MENU_RANK_EVERYONE
            return TFABMenuHierarchy.GOT_INPUT
        elif update_type == UpdateTypes.TEXTUAL_MESSAGE:
            # Handles the case where the user entered the Ranking message
            rankings_message = update.message.text
            rankings_dict = tfab_message_parser.MessageParser.parse_rankings_message(rankings_message)
            found, modified = TFABDBHandler.get_instance().modify_user_rankings(
                update.effective_user.id, rankings_dict)

            if modified:
                success_message = "להלן פעולות הדירוג שבוצעו בהצלחה:\n"
                for name, ranking in rankings_dict.items():
                    success_message += "{0} = {1}\n".format(name, ranking)

                await context.bot.send_message(chat_id=update.effective_chat.id, text=success_message)
            elif found:
                await context.bot.send_message(
                    chat_id=update.effective_chat.id,
                    text="לא בוצעו שינויים, הזנת דירוגים שגויים או זהים לקודמים. כמו כן, לא ניתן לדרג שוערים")
            else:
                await context.bot.send_message(
                    chat_id=update.effective_chat.id, text="פעולת הדירוג נכשלה, האם ההודעה שלך תקינה?")
            context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = found
            return await CommonHandlers.entrypoint_handler(update, context)

    @staticmethod
    async def show_my_rankings_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handles the "show my rankings" option.
        """
        if HandlerUtils.get_update_type(update) != UpdateTypes.CALLBACK_QUERY:
            await CommonHandlers.illegal_situation_handler(update, context)

        await update.callback_query.answer()

        rankings_template = RankersMenuHandlers.__get_rankings_template(update, context)
        await context.bot.send_message(chat_id=update.effective_chat.id, text=rankings_template)

        context.user_data[UserDataIndices.CONTEXTUAL_LAST_OPERATION_STATUS] = True
        return await CommonHandlers.entrypoint_handler(update, context)
