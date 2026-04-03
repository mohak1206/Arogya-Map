import mysql.connector

try:
    conn = mysql.connector.connect(
        host="localhost",
        user="root",
        password="Mohak@12",      # Default config based on config.py if no password
        database="arogyamap_db"
    )
    cursor = conn.cursor()
    
    # 1. Add role column if not exists
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user';")
        print("Column 'role' added to 'users' table.")
    except Exception as e:
        print(f"Role column might already exist: {e}")

    # 2. Add unique constraint if not exists
    try:
        cursor.execute("ALTER TABLE health_data ADD UNIQUE KEY unique_user_date (user_id, date);")
        print("Unique key added to 'health_data'.")
    except Exception as e:
        print(f"Unique key might already exist: {e}")

    conn.commit()
    cursor.close()
    conn.close()
    print("Migration complete!")
except Exception as e:
    print(f"Error connecting to database: {e}")
