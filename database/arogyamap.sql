-- ============================================================
-- Arogya Map Database Schema
-- Smart Emergency & Hospital Resource Management System
-- Run this file in MySQL Workbench or phpMyAdmin
-- ============================================================

CREATE DATABASE IF NOT EXISTS arogyamap_db;
USE arogyamap_db;

-- ============================================================
-- Table 1: hospitals
-- Stores hospital details, location, and real-time bed availability
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    type ENUM('hospital', 'clinic') NOT NULL DEFAULT 'hospital',
    location VARCHAR(200) NOT NULL,
    address TEXT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    total_beds INT NOT NULL DEFAULT 0,
    available_beds INT NOT NULL DEFAULT 0,
    icu_beds INT NOT NULL DEFAULT 0,
    available_icu INT NOT NULL DEFAULT 0,
    ventilators INT NOT NULL DEFAULT 0,
    available_ventilators INT NOT NULL DEFAULT 0,
    contact VARCHAR(20),
    open_24h TINYINT(1) DEFAULT 1,
    hours_note VARCHAR(100) NULL,
    is_active TINYINT(1) DEFAULT 1,
    beds_updated_at TIMESTAMP NULL DEFAULT NULL,
    speciality VARCHAR(100) DEFAULT 'General',
    INDEX idx_hospitals_lat_lng (latitude, longitude),
    CONSTRAINT chk_beds CHECK (available_beds >= 0 AND available_beds <= total_beds),
    CONSTRAINT chk_icu CHECK (available_icu >= 0 AND available_icu <= icu_beds),
    CONSTRAINT chk_ventilators CHECK (available_ventilators >= 0 AND available_ventilators <= ventilators)
);

-- ============================================================
-- Table 2: users
-- Stores registered user accounts for authentication
-- Roles: user, admin, hospital
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,                 -- Werkzeug hashed password
    role ENUM('user', 'admin', 'hospital') NOT NULL DEFAULT 'user',
    hospital_id INT NULL DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL
);

-- ============================================================
-- Table 3: hospital_applications
-- Stores registration applications submitted by hospital / clinic staff
-- ============================================================
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
);

-- ============================================================
-- Table 4: bed_updates
-- Audit log of bed capacity changes made by hospital staff
-- ============================================================
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
);

-- ============================================================
-- Table 5: emergency_requests
-- Stores patient emergency requests with hospital assignments
-- Priority queue: critical > high > medium > low
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
-- Table 6: health_data
-- Tracks daily health metrics for each user (stress, sleep, steps, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS health_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    stress_level INT DEFAULT 0,              -- 0-100 scale
    productivity_score INT DEFAULT 0,        -- 0-100 scale
    sleep_hours DECIMAL(4,2) DEFAULT 0.00,
    steps INT DEFAULT 0,
    screen_time_hours DECIMAL(4,2) DEFAULT 0.00,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_date (user_id, date)
);

-- ============================================================
-- Table 7: contact_messages
-- Stores messages submitted via the Contact Us form
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table 8: osm_facilities
-- Stores OpenStreetMap healthcare facilities (hospitals, clinics, doctors)
-- ============================================================
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

-- ============================================================
-- SAMPLE DATA: Hospitals in Mumbai & Delhi
-- ============================================================
INSERT INTO hospitals (name, location, latitude, longitude, total_beds, available_beds, icu_beds, available_icu, ventilators, available_ventilators, contact, is_active, beds_updated_at) VALUES
('AIIMS Delhi',             'Ansari Nagar, New Delhi, Delhi 110029',       28.56840000,  77.20960000, 2500, 340, 200, 42, 80, 18, '011-26588500', 1, NOW()),
('Lilavati Hospital',       'Bandra West, Mumbai, Maharashtra 400050',     19.05270000,  72.82650000, 750,  120, 80,  22, 50, 12, '022-26751000', 1, NOW()),
('Kokilaben Hospital',      'Andheri West, Mumbai, Maharashtra 400053',    19.12730000,  72.83800000, 700,  95,  70,  18, 45, 10, '022-30999999', 1, NOW()),
('Safdarjung Hospital',     'Ansari Nagar West, New Delhi, Delhi 110029',  28.56720000,  77.20580000, 3000, 210, 150, 30, 60,  8, '011-26165060', 1, NOW()),
('Fortis Mulund Mumbai',    'Mulund West, Mumbai, Maharashtra 400080',     19.17260000,  72.95230000, 450,  75,  40,  14, 30,  9, '022-21822000', 1, NOW());
