-- ============================================================
-- HealMaps Database Schema
-- Smart Emergency & Hospital Resource Management System
-- Run this file in MySQL Workbench or phpMyAdmin
-- ============================================================

CREATE DATABASE IF NOT EXISTS healmaps_db;
USE healmaps_db;

-- ============================================================
-- Table 1: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table 2: hospitals
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    location VARCHAR(200) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    total_beds INT NOT NULL DEFAULT 0,
    available_beds INT NOT NULL DEFAULT 0,
    icu_beds INT NOT NULL DEFAULT 0,
    available_icu INT NOT NULL DEFAULT 0,
    ventilators INT NOT NULL DEFAULT 0,
    available_ventilators INT NOT NULL DEFAULT 0,
    contact VARCHAR(20),
    speciality VARCHAR(100) DEFAULT 'General'
);

-- ============================================================
-- Table 3: emergency_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS emergency_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    hospital_id INT,
    patient_name VARCHAR(100),
    description TEXT,
    priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
    status ENUM('pending','assigned','completed','cancelled') NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL
);

-- ============================================================
-- Table 4: health_data
-- ============================================================
CREATE TABLE IF NOT EXISTS health_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    stress_level INT DEFAULT 0,
    productivity_score INT DEFAULT 0,
    sleep_hours DECIMAL(4,2) DEFAULT 0.00,
    steps INT DEFAULT 0,
    screen_time_hours DECIMAL(4,2) DEFAULT 0.00,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Table 5: contact_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table 6: bed_bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS bed_bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    hospital_id INT NOT NULL,
    patient_name VARCHAR(100) NOT NULL,
    bed_type ENUM('general','icu') NOT NULL DEFAULT 'general',
    status ENUM('booked','discharged','cancelled') NOT NULL DEFAULT 'booked',
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
);

-- ============================================================
-- SAMPLE DATA: Hospitals across India
-- ============================================================
INSERT INTO hospitals (name, location, latitude, longitude, total_beds, available_beds, icu_beds, available_icu, ventilators, available_ventilators, contact, speciality) VALUES
('AIIMS Delhi',             'Ansari Nagar, New Delhi, Delhi 110029',       28.56840000,  77.20960000, 2500, 340, 200, 42, 80, 18, '011-26588500', 'Multi-Speciality'),
('Lilavati Hospital',       'Bandra West, Mumbai, Maharashtra 400050',     19.05270000,  72.82650000, 750,  120, 80,  22, 50, 12, '022-26751000', 'Cardiology'),
('Kokilaben Hospital',      'Andheri West, Mumbai, Maharashtra 400053',    19.12730000,  72.83800000, 700,  95,  70,  18, 45, 10, '022-30999999', 'Neurology'),
('Safdarjung Hospital',     'Ansari Nagar West, New Delhi, Delhi 110029',  28.56720000,  77.20580000, 3000, 210, 150, 30, 60,  8, '011-26165060', 'General'),
('Fortis Mulund Mumbai',    'Mulund West, Mumbai, Maharashtra 400080',     19.17260000,  72.95230000, 450,  75,  40,  14, 30,  9, '022-21822000', 'Orthopaedics'),
('Apollo Hospital Chennai', 'Greams Road, Chennai, Tamil Nadu 600006',     13.06040000,  80.25550000, 600, 150, 60, 20, 40, 15, '044-28293333', 'Oncology'),
('Medanta Gurugram',        'Sector 38, Gurugram, Haryana 122001',         28.44140000,  77.04250000, 1600, 280, 120, 35, 70, 22, '0124-4141414', 'Cardiac Surgery'),
('CMC Vellore',             'Ida Scudder Road, Vellore, Tamil Nadu 632004',12.92490000,  79.13250000, 2700, 400, 180, 50, 90, 25, '0416-2281000', 'Multi-Speciality');

-- ============================================================
-- SAMPLE DATA: 7 days of health_data for user_id=1
-- ============================================================
INSERT INTO health_data (user_id, date, stress_level, productivity_score, sleep_hours, steps, screen_time_hours) VALUES
(1, DATE_SUB(CURDATE(), INTERVAL 6 DAY), 72, 58, 5.50, 4200, 7.50),
(1, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 65, 63, 6.00, 5500, 6.80),
(1, DATE_SUB(CURDATE(), INTERVAL 4 DAY), 80, 50, 5.00, 3100, 8.20),
(1, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 55, 75, 7.50, 8200, 5.50),
(1, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 48, 82, 8.00, 9800, 4.80),
(1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 60, 70, 6.50, 7100, 6.00),
(1, CURDATE(),                           44, 88, 8.50, 10500, 3.90);
