# ============================================================
# HealMaps — Database Configuration
# Update MYSQL_PASSWORD with your actual MySQL root password
# ============================================================

class Config:
    # Flask secret key for session management (OS: Process Scheduling concept)
    SECRET_KEY = 'healmaps_secret_key_2024_ultra_secure'

    # MySQL connection settings
    MYSQL_HOST = 'localhost'
    MYSQL_USER = 'root'
    MYSQL_PASSWORD = 'Mohak@12'   # <-- Update this
    MYSQL_DB = 'healmaps_db'
    MYSQL_CURSORCLASS = 'DictCursor'         # Returns rows as dicts

    # Session config
    SESSION_TYPE = 'filesystem'
    SESSION_PERMANENT = False
