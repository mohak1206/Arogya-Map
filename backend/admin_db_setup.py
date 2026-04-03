import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app import app, mysql

with app.app_context():
    try:
        cur = mysql.connection.cursor()
        
        # 1. Create bed_bookings table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS bed_bookings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                hospital_id INT NOT NULL,
                user_id INT NOT NULL,
                patient_name VARCHAR(100) NOT NULL,
                bed_type ENUM('general', 'icu', 'ventilator') DEFAULT 'general',
                status ENUM('waiting', 'assigned', 'admitted', 'discharged') DEFAULT 'waiting',
                booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        print("Ensured bed_bookings table exists.")

        # 2. Add is_active to hospitals
        try:
            cur.execute("ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE")
            print("Ensured is_active in hospitals.")
        except Exception as e:
            # MariaDB / Older MySQL might not support IF NOT EXISTS in ALTER TABLE
            try:
                cur.execute("ALTER TABLE hospitals ADD COLUMN is_active BOOLEAN DEFAULT TRUE")
                print("Added is_active to hospitals.")
            except Exception as e2:
                print(f"hospitals is_active might already exist: {e2}")

        # 3. Add is_active to users
        try:
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE")
            print("Ensured is_active in users.")
        except Exception as e:
            try:
                cur.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE")
                print("Added is_active to users.")
            except Exception as e2:
                print(f"users is_active might already exist: {e2}")

        mysql.connection.commit()
        cur.close()
        print("Admin DB Migration Success.")
    except Exception as e:
        print(f"Admin DB Migration Failed: {e}")
