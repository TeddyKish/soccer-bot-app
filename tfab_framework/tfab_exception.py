class TFABException(Exception):
    pass

class TFABConfigurationError(TFABException):
    pass

class TFABDatabaseError(TFABException):
    pass

class TFABApplicationError(TFABException):
    pass

class TFABSystemError(TFABException):
    pass