"""
Safe migration script to create the osm_facilities table and indexes in MySQL.
Does not drop any data.
"""
import mysql.connector
from config import Config

def run_migration():
    try:
        conn = mysql.connector.connect(
            host=Config.MYSQL_HOST,
            port=Config.MYSQL_PORT,
            user=Config.MYSQL_USER,
            password=Config.MYSQL_PASSWORD,
            database=Config.MYSQL_DB
        )
        cursor = conn.cursor()

        print("Checking/creating osm_facilities table...")
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS osm_facilities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            osm_id BIGINT NOT NULL,
            osm_type VARCHAR(20) NOT NULL,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(50) NOT NULL DEFAULT 'hospital',
            address VARCHAR(500) DEFAULT '',
            phone VARCHAR(100) DEFAULT NULL,
            latitude DECIMAL(10, 8) NOT NULL,
            longitude DECIMAL(11, 8) NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_osm_entity (osm_type, osm_id),
            INDEX idx_osm_lat_lng (latitude, longitude)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """
        cursor.execute(create_table_sql)
        conn.commit()
        print("osm_facilities table created or verified successfully!")

        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Migration error: {e}")
        raise e

if __name__ == '__main__':
    run_migration()
