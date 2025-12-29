from tfab_framework.tfab_logger import tfab_logger
from tfab_framework.application.tfab_app import TFABApplication
from tfab_framework.tfab_consts import Consts as TConsts
from tfab_framework.tfab_database_handler import TFABDBHandler
from tfab_framework.tfab_configuration import TFABConfiguration
from tfab_framework.tfab_exception import TFABSystemError, TFABConfigurationError, TFABDatabaseError, \
    TFABApplicationError, TFABException

class TFABSystem(object):
    """
    Contains the TFAB Application in its entirety.
    """

    def __init__(self, tfab_conf_path="tfab_data//tfab_configuration.yaml"):
        """
        Initializes a TFABApplication instance.
        """
        try:
            self.__initialize_configuration(tfab_conf_path)
            self.__initialize_database(self.__configuration.DB_NAME, self.__configuration.MONGODB_PORT)
            self.__initialize_app(self.__configuration, self.__db)
            tfab_logger.debug("TFABSystem successfully initialized")
        except Exception as e:
            tfab_logger.error("TFAB Initialization error occurred: ", str(e))
            raise TFABSystemError("TFAB Initialization error occurred: ", str(e))

    def __initialize_configuration(self, conf_path):
        """
        Initializes the TFABConfiguration.
        """
        self.__configuration = TFABConfiguration(conf_path)

    def __initialize_database(self, db_name, db_port):
        """
        Initializes the database we're working with.
        """
        self.__db = TFABDBHandler.get_instance(db_name, db_port)

        # Initialize metadata
        if not self.__db.check_configuration_existence(TConsts.INTERNAL_ADMIN_PASSWORD_KEY):
            self.__db.insert_configuration_value(TConsts.INTERNAL_ADMIN_PASSWORD_KEY,
                                                 self.__configuration.BOTITO_SECRET_ADMINS_PASSWORD)
        if not self.__db.check_configuration_existence(TConsts.INTERNAL_RANKER_PASSWORD_KEY):
            self.__db.insert_configuration_value(TConsts.INTERNAL_RANKER_PASSWORD_KEY,
                                                 self.__configuration.BOTITO_SECRET_RANKERS_PASSWORD)
        if not self.__db.check_configuration_existence(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY):
            self.__db.insert_configuration_value(TConsts.INTERNAL_RATING_DEVIATION_THRESHOLD_KEY, 1)

        # Initialize team generation parameters
        if not self.__db.check_configuration_existence(TConsts.TeamGenerationParameters["NUM_TEAMS"]):
            self.__db.insert_configuration_value(TConsts.TeamGenerationParameters["NUM_TEAMS"], 3)
        for key in TConsts.TeamGenerationParameters.values():
            if not self.__db.check_configuration_existence(key):
                self.__db.insert_configuration_value(key, 1)


    def __initialize_app(self, config, db):
        """
        Initializes the TFAB Appication.
        """
        self.__app = TFABApplication(config, db)

    def run_system(self):
        """
        Runs the TFAB System indefinitely.
        """
        try:
            self.__app.run()
        except TFABConfigurationError as e:
            tfab_logger.error("TFAB Configuration Error occurred: ", str(e))
            raise TFABException("TFAB Configuration Error occurred: ", str(e))
        except TFABDatabaseError as e:
            tfab_logger.error("TFAB Database Error occurred: ", str(e))
            raise TFABException("TFAB Database Error occurred: ", str(e))
        except TFABApplicationError as e:
            tfab_logger.error("TFAB Application Error occurred: ", str(e))
            raise TFABException("TFAB Application Error occurred: ", str(e))
        except Exception as e:
            tfab_logger.error("General Error occurred: ", str(e))
            raise TFABException("General Error occurred: ", str(e))