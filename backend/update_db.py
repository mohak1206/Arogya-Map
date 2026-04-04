import mysql.connector

try:
    conn = mysql.connector.connect(
        host="localhost",
        user="root",
        password="Mohak@12",
        database="arogyamap_db"
    )
    cursor = conn.cursor()
    
    # 1. Delete far away hospitals
    cursor.execute("DELETE FROM hospitals WHERE location LIKE '%New Delhi%' OR location LIKE '%Chennai%' OR location LIKE '%Vellore%' OR location LIKE '%Gurugram%'")
    
    # 2. Insert new
    sql = """
    INSERT INTO hospitals (name, location, latitude, longitude, total_beds, available_beds, icu_beds, available_icu, ventilators, available_ventilators, contact, is_active) VALUES
    ('Kanta Hospital', 'Near Canara Bank, Palghar, Maharashtra', 19.6963, 72.7658, 50, 18, 8, 3, 4, 1, '02525-253678', TRUE),
    ('Dr. J M Gandhi Clinic', 'Palghar Main Road, Maharashtra', 19.6970, 72.7665, 10, 4, 2, 1, 0, 0, '02525-254112', TRUE),
    ('Aditya Nursing Home & Maternity', 'Palghar East, Maharashtra', 19.6949, 72.7669, 25, 9, 4, 1, 2, 0, '02525-255890', TRUE),
    ('Rural Health Training Center', 'Government Health Facility, Palghar', 19.6942, 72.7675, 60, 22, 6, 2, 3, 1, '02525-256321', TRUE),
    ('Jeevan Jyot Eye Hospital', 'Near Palghar Railway Line Area', 19.6935, 72.7680, 20, 7, 3, 1, 1, 0, '02525-257777', TRUE),
    ('Ganesh Hospital', 'Tembhode Road Area, Palghar', 19.6982, 72.7690, 45, 15, 7, 2, 3, 1, '02525-258222', TRUE),
    ('Philia Hospital', 'Near Tembhode Road, Palghar', 19.6989, 72.7701, 30, 11, 5, 2, 2, 1, '02525-259111', TRUE),
    ('Dr. Kotis Prashant Maternity & Dental Clinic', 'Tembhode Road, Palghar', 19.6995, 72.7710, 15, 5, 2, 1, 0, 0, '02525-260555', TRUE),
    ('Dhada Hospital', 'Near Jo Mart Area, Palghar', 19.7002, 72.7722, 40, 13, 6, 2, 3, 1, '02525-261444', TRUE)
    """
    cursor.execute(sql)
    
    conn.commit()
    print("Database updated successfully.")
    
except Exception as e:
    print("Error:", e)
finally:
    if 'cursor' in locals(): cursor.close()
    if 'conn' in locals() and conn.is_connected(): conn.close()
