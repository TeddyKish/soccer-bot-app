import logging

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
CRIT = logging.CRITICAL
tfab_logger = logging.getLogger(__name__)
