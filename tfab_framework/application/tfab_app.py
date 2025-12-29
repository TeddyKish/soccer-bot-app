from tfab_framework.tfab_logger import tfab_logger
from tfab_framework.tfab_consts import Consts as TConsts
from tfab_framework.application.menus.input_handlers import InputRoutingHandlers
from tfab_framework.application.menus.rankers_handlers import RankersMenuHandlers
from tfab_framework.application.menus.admin_handlers import AdminMenuHandlers, MatchdaysMenuHandlers, PlayersMenuHandlers, SettingsMenuHandlers
from tfab_framework.application.menus.menu_utils import TFABMenuHierarchy, CommonHandlers

from telegram.ext import filters, MessageHandler, ApplicationBuilder, ContextTypes, CommandHandler, CallbackQueryHandler
from telegram.ext import ConversationHandler


class TFABApplication(object):
    """
    Handles the entirety of the command handling and logic.
    """
    def __init__(self, tfab_configuration, tfab_db):
        """
        Constructs a TFABApplication.
        """
        self.configuration = tfab_configuration
        self.db = tfab_db
        self.__initialize_telegram_app()
        self.__initialize_handlers()
        tfab_logger.debug("TFABApplication successfully initialized")

    def __initialize_telegram_app(self):
        """
        Initiailizes PTB and the connection to our bot.
        """
        self.__ptb_app = ApplicationBuilder().token(self.configuration.TELEGRAM_BOT_TOKEN).build()

    def __initialize_handlers(self):
        """
        Initializes the different handlers for this application.
        """
        conversation_handler = ConversationHandler(
            entry_points=[CommandHandler(["start", "help"], CommonHandlers.entrypoint_handler)],
            states={
                TFABMenuHierarchy.GENERAL_MENU: [
                    CallbackQueryHandler(RankersMenuHandlers.rankers_menu_handler,
                                         pattern=str(TFABMenuHierarchy.RANKER_MENU)),
                    CallbackQueryHandler(AdminMenuHandlers.admin_menu_handler,
                                         pattern=str(TFABMenuHierarchy.ADMIN_MENU)),
                ],
                TFABMenuHierarchy.RANKER_MENU: [
                    CallbackQueryHandler(RankersMenuHandlers.rank_everyone_handler,
                                         pattern=str(TFABMenuHierarchy.RANKER_MENU_RANK_EVERYONE)),
                    CallbackQueryHandler(RankersMenuHandlers.rank_everyone_handler,
                                         pattern=str(TFABMenuHierarchy.RANKER_MENU_RANK_SPECIFIC_PLAYER)),
                    CallbackQueryHandler(RankersMenuHandlers.show_my_rankings_handler,
                                         pattern=str(TFABMenuHierarchy.RANKER_MENU_SHOW_MY_RANKINGS)),
                ],
                TFABMenuHierarchy.ADMIN_MENU: [
                    CallbackQueryHandler(MatchdaysMenuHandlers.matchdays_menu_handler,
                                         pattern=str(TFABMenuHierarchy.ADMIN_MENU_MATCHDAYS)),
                    CallbackQueryHandler(PlayersMenuHandlers.players_menu_handler,
                                         pattern=str(TFABMenuHierarchy.ADMIN_MENU_PLAYERS)),
                ],
                TFABMenuHierarchy.ADMIN_MENU_MATCHDAYS: [
                    CallbackQueryHandler(MatchdaysMenuHandlers.set_todays_list_handler,
                                         pattern=str(TFABMenuHierarchy.MATCHDAYS_MENU_SET_TODAY_LIST)),
                    CallbackQueryHandler(MatchdaysMenuHandlers.show_todays_info_handler,
                                         pattern=str(TFABMenuHierarchy.MATCHDAYS_MENU_SHOW_TODAY_INFO)),
                    CallbackQueryHandler(MatchdaysMenuHandlers.generate_teams_handler,
                                         pattern=str(TFABMenuHierarchy.MATCHDAYS_MENU_GENERATE_TEAMS)),
                    CallbackQueryHandler(MatchdaysMenuHandlers.matchdays_settings_menu,
                                         pattern=str(TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS)),
                ],
                TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS: [
                    CallbackQueryHandler(SettingsMenuHandlers.constraints_menu_handler,
                                         pattern=str(TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS_CONSTRAINTS)),
                    CallbackQueryHandler(SettingsMenuHandlers.parameters_menu_handler,
                                         pattern=str("|".join([str(TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS_PARAMETERS),
                                                              str(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY),
                                                               str(TConsts.EOO_QUERY_DATA)] +
                                                              list(TConsts.TeamGenerationParameters.values())))),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, SettingsMenuHandlers.parameters_menu_handler)
                ],
                TFABMenuHierarchy.MATCHDAYS_MENU_SETTINGS_CONSTRAINTS: [
                    CallbackQueryHandler(SettingsMenuHandlers.creating_constraints_menu,
                                         pattern=(str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_COUPLING) +
                                                "|" + str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_CREATE_DECOUPLING))),
                    CallbackQueryHandler(SettingsMenuHandlers.delete_constraints_handler,
                                         pattern=(str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_DELETE))),
                    CallbackQueryHandler(SettingsMenuHandlers.show_constraints_handler,
                                         pattern=(str(TFABMenuHierarchy.MATCHDAYS_CONSTRAINTS_SHOW_ACTIVE)))
                ],
                TFABMenuHierarchy.ADMIN_MENU_PLAYERS: [
                    CallbackQueryHandler(PlayersMenuHandlers.add_player_handler,
                                         pattern=str(TFABMenuHierarchy.PLAYERS_MENU_ADD)),
                    CallbackQueryHandler(PlayersMenuHandlers.show_players_handler,
                                         pattern=str(TFABMenuHierarchy.PLAYERS_MENU_SHOW)),
                    CallbackQueryHandler(PlayersMenuHandlers.edit_player_handler,
                                         pattern=str(TFABMenuHierarchy.PLAYERS_MENU_EDIT)),
                    CallbackQueryHandler(PlayersMenuHandlers.delete_player_handler,
                                         pattern=str(TFABMenuHierarchy.PLAYERS_MENU_DELETE)),
                    CallbackQueryHandler(PlayersMenuHandlers.characteristics_handler,
                                         pattern=str("|".join(list(TConsts.PlayerCharacteristics.values()))))
                ],
                TFABMenuHierarchy.GOT_INPUT: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, InputRoutingHandlers.text_input_handler)
                ]
            },
            fallbacks=[CommandHandler(["start", "help"], CommonHandlers.entrypoint_handler)]
        )

        # Add ConversationHandler to application that will be used for handling updates
        self.__ptb_app.add_handler(conversation_handler)

        # The last handlers that handle unknown commands or text
        self.__ptb_app.add_handler(MessageHandler(filters.COMMAND, CommonHandlers.unknown_command_handler))
        self.__ptb_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, CommonHandlers.unknown_text_handler))

    def run(self):
        """
        Performs the actual logic of the TFABApplication.
        """
        self.__ptb_app.run_polling()
