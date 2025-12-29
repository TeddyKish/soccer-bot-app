from tfab_framework.tfab_exception import TFABConfigurationError
import yaml
from schema import Schema, And

class TFABConfiguration(object):
    """
    TFAB's configuration object, to be used within PTB.
    """
    def __init__(self, configuration_path, custom_schema=None):
        """
        Creates a member in this class for every key in <configuration_path>.
        :param configuration_path: The path to the configuration file.
        """
        try:
            # Schema for the yaml configuration
            if custom_schema is not None:
                self.__schema = custom_schema
            else:
                self.__schema__ = Schema(
                    {
                        'TELEGRAM_BOT_TOKEN': And(str),
                        'MONGODB_PORT': And(int),
                        'DB_NAME': And(str),
                        'BOTITO_SECRET_RANKERS_PASSWORD': And(str),
                        'BOTITO_SECRET_ADMINS_PASSWORD': And(str)
                    }
                )
 
            with open(configuration_path, "r") as conf_file:
                self.__configuration_dictionary__ = yaml.safe_load(conf_file)
                self.__schema__.validate(self.__configuration_dictionary__)
            for key, value in self.__configuration_dictionary__.items():
                setattr(self, key, value)
        except Exception as e:
            raise TFABConfigurationError("TFAB Configuration Error occurred: " + str(e))