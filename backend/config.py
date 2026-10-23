import os
from dotenv import load_dotenv

# Path configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)

# Load .env from root directory, then backend directory as fallback
env_path_root = os.path.join(ROOT_DIR, '.env')
env_path_backend = os.path.join(BASE_DIR, '.env')

if os.path.exists(env_path_root):
    load_dotenv(env_path_root)
elif os.path.exists(env_path_backend):
    load_dotenv(env_path_backend)
else:
    load_dotenv()


class Config:
    # Flask secret key for session management
    SECRET_KEY = os.getenv('SECRET_KEY', 'arogyamap_secret_key_2024_ultra_secure')

    # MySQL connection settings
    MYSQL_HOST = os.getenv('MYSQL_HOST', 'localhost')
    MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))
    MYSQL_USER = os.getenv('MYSQL_USER', 'root')
    MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', 'Mohak@12')
    MYSQL_DB = os.getenv('MYSQL_DB', 'arogyamap_db')
    MYSQL_CURSORCLASS = os.getenv('MYSQL_CURSORCLASS', 'DictCursor')

    # Session config
    SESSION_TYPE = 'filesystem'
    SESSION_PERMANENT = False

    # Server config
    FLASK_PORT = int(os.getenv('PORT', os.getenv('FLASK_PORT', 5000)))
    FLASK_DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() in ('true', '1', 't')

    # Overpass API Mirrors (in order of priority)
    _raw_endpoints = os.getenv(
        'OVERPASS_ENDPOINTS',
        'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.private.coffee/api/interpreter'
    )
    OVERPASS_ENDPOINTS = [ep.strip() for ep in _raw_endpoints.split(',') if ep.strip()]

