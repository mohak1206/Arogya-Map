"""
Safe database migration script for Arogya Map:
Adds hospital role, hospital applications, bed audit log, and schema integrity constraints.
Preserves all existing data.
"""
import MySQLdb
from config import Config

def run_migration():
    conn = MySQLdb.connect(
        host=Config.MYSQL_HOST,
        user=Config.MYSQL_USER,
        passwd=Config.MYSQL_PASSWORD,
        db=Config.MYSQL_DB
    )
    cur = conn.cursor()
    print("Connected to MySQL database:", Config.MYSQL_DB)

    # 1. Update users table role enum and add hospital_id
    print("Checking users table...")
    cur.execute("SHOW COLUMNS FROM users LIKE 'role'")
    role_col = cur.fetchone()
    # Modify role to enum('user','admin','hospital')
    cur.execute("ALTER TABLE users MODIFY COLUMN role ENUM('user', 'admin', 'hospital') NOT NULL DEFAULT 'user'")
    print("  -> users.role updated to ENUM('user', 'admin', 'hospital')")

    cur.execute("SHOW COLUMNS FROM users LIKE 'hospital_id'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE users ADD COLUMN hospital_id INT NULL DEFAULT NULL")
        cur.execute("ALTER TABLE users ADD CONSTRAINT fk_users_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL")
        print("  -> users.hospital_id added with FK to hospitals(id)")
    else:
        print("  -> users.hospital_id already exists")

    # 2. Update hospitals table columns
    print("Checking hospitals table...")
    cur.execute("SHOW COLUMNS FROM hospitals LIKE 'type'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE hospitals ADD COLUMN type ENUM('hospital', 'clinic') NOT NULL DEFAULT 'hospital'")
        print("  -> hospitals.type added")

    cur.execute("SHOW COLUMNS FROM hospitals LIKE 'address'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE hospitals ADD COLUMN address TEXT NULL")
        print("  -> hospitals.address added")

    cur.execute("SHOW COLUMNS FROM hospitals LIKE 'open_24h'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE hospitals ADD COLUMN open_24h TINYINT(1) DEFAULT 1")
        print("  -> hospitals.open_24h added")

    cur.execute("SHOW COLUMNS FROM hospitals LIKE 'hours_note'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE hospitals ADD COLUMN hours_note VARCHAR(100) NULL")
        print("  -> hospitals.hours_note added")

    cur.execute("SHOW COLUMNS FROM hospitals LIKE 'is_active'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE hospitals ADD COLUMN is_active TINYINT(1) DEFAULT 1")
        print("  -> hospitals.is_active added")

    cur.execute("SHOW COLUMNS FROM hospitals LIKE 'beds_updated_at'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE hospitals ADD COLUMN beds_updated_at TIMESTAMP NULL DEFAULT NULL")
        print("  -> hospitals.beds_updated_at added")

    # Add CHECK constraints if not already present
    print("Adding CHECK constraints on hospitals...")
    # Clean any potential bad data first just in case
    cur.execute("UPDATE hospitals SET available_beds = total_beds WHERE available_beds > total_beds")
    cur.execute("UPDATE hospitals SET available_beds = 0 WHERE available_beds < 0")
    cur.execute("UPDATE hospitals SET available_icu = icu_beds WHERE available_icu > icu_beds")
    cur.execute("UPDATE hospitals SET available_icu = 0 WHERE available_icu < 0")
    cur.execute("UPDATE hospitals SET available_ventilators = ventilators WHERE available_ventilators > ventilators")
    cur.execute("UPDATE hospitals SET available_ventilators = 0 WHERE available_ventilators < 0")

    try:
        cur.execute("ALTER TABLE hospitals ADD CONSTRAINT chk_beds CHECK (available_beds >= 0 AND available_beds <= total_beds)")
        print("  -> CHECK constraint chk_beds added")
    except Exception as e:
        print("  -> Note on chk_beds:", e)

    try:
        cur.execute("ALTER TABLE hospitals ADD CONSTRAINT chk_icu CHECK (available_icu >= 0 AND available_icu <= icu_beds)")
        print("  -> CHECK constraint chk_icu added")
    except Exception as e:
        print("  -> Note on chk_icu:", e)

    try:
        cur.execute("ALTER TABLE hospitals ADD CONSTRAINT chk_ventilators CHECK (available_ventilators >= 0 AND available_ventilators <= ventilators)")
        print("  -> CHECK constraint chk_ventilators added")
    except Exception as e:
        print("  -> Note on chk_ventilators:", e)

    # 3. Create hospital_applications table
    print("Checking hospital_applications table...")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS hospital_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hospital_name VARCHAR(150) NOT NULL,
        type ENUM('hospital', 'clinic') NOT NULL DEFAULT 'hospital',
        address TEXT NOT NULL,
        latitude DECIMAL(10,8) NOT NULL,
        longitude DECIMAL(11,8) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        contact_person VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        registration_number VARCHAR(100) NOT NULL,
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        admin_note TEXT NULL,
        reviewed_by INT NULL,
        reviewed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
    print("  -> hospital_applications table ready")

    # 4. Create bed_updates table (audit log)
    print("Checking bed_updates table...")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS bed_updates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hospital_id INT NOT NULL,
        user_id INT NULL,
        field VARCHAR(50) NOT NULL,
        old_value INT NOT NULL,
        new_value INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
    print("  -> bed_updates table ready")

    conn.commit()
    cur.close()
    conn.close()
    print("Migration finished successfully!")

if __name__ == '__main__':
    run_migration()
