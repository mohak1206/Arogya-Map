"""
Safe migration script to add composite index on hospitals(latitude, longitude).
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

        # Check if index already exists
        cursor.execute("""
            SELECT COUNT(1) 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = %s 
              AND TABLE_NAME = 'hospitals' 
              AND INDEX_NAME = 'idx_hospitals_lat_lng'
        """, (Config.MYSQL_DB,))
        
        index_exists = cursor.fetchone()[0] > 0

        if not index_exists:
            print("Adding composite index idx_hospitals_lat_lng on hospitals(latitude, longitude)...")
            cursor.execute("ALTER TABLE hospitals ADD INDEX idx_hospitals_lat_lng (latitude, longitude);")
            conn.commit()
            print("Successfully created index idx_hospitals_lat_lng!")
        else:
            print("Index idx_hospitals_lat_lng already exists. Skipping.")

        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Migration error: {e}")

if __name__ == '__main__':
    run_migration()
