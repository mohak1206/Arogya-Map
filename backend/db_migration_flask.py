import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app import app, mysql

with app.app_context():
    try:
        cur = mysql.connection.cursor()
        try:
            cur.execute("ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user';")
            print("Added 'role'.")
        except Exception as e:
            print(f"Role constraint exists: {e}")
            
        try:
            cur.execute("ALTER TABLE health_data ADD UNIQUE KEY unique_user_date (user_id, date);")
            print("Added unique key.")
        except Exception as e:
            print(f"Unique key exists: {e}")
            
        mysql.connection.commit()
        cur.close()
        print("Success.")
    except Exception as e:
        print(f"Failed: {e}")
