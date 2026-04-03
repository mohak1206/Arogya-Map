# ============================================================
# Arogya Map — Database Configuration
# Update MYSQL_PASSWORD with your actual MySQL root password
# ============================================================

class Config:
    # Flask secret key for session management
    SECRET_KEY = 'arogyamap_secret_key_2024_ultra_secure'

    # MySQL connection settings
    MYSQL_HOST = 'localhost'
    MYSQL_USER = 'root'
    MYSQL_PASSWORD = 'Mohak@12'   # <-- Update this
    MYSQL_DB = 'arogyamap_db'
    MYSQL_CURSORCLASS = 'DictCursor'

    # Session config
    SESSION_TYPE = 'filesystem'
    SESSION_PERMANENT = False
