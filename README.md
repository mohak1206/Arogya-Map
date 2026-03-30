# HealMaps — Smart Emergency & Hospital Resource Management

HealMaps is a full-stack healthcare dashboard designed to optimize emergency responses and hospital resource management. It uses real-time data to find the nearest hospitals, manage emergency requests via priority queues, and track user wellness.

## 🚀 Key Features

- **Smart Hospital Finder**: Uses the **Haversine formula** to locate the nearest hospitals.
- **Emergency SOS**: Intelligent routing system that assigns patients to hospitals based on bed availability and severity (**Greedy Algorithm** & **Priority Queue**).
- **Health Analytics**: Interactive charts using **Chart.js** to track sleep, steps, and productivity.
- **Real-time Occupancy**: Tracks available beds, ICU units, and ventilators.
- **Secure Authentication**: Password hashing with **Werkzeug** and session-based access control.

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES6)
- **Backend**: Python 3, Flask Framework
- **Database**: MySQL
- **Design**: Modern Teal Blue theme, Glassmorphism, Responsive Grid

## 📦 Installation & Setup

### 1. Prerequisites
- Python 3.x
- MySQL Server (XAMPP / MySQL Workbench / Docker)
- Node.js (Optional, for advanced dev)

### 2. Database Configuration
- Create a new database named `healmaps_db` in your MySQL server.
- Run the SQL script located at `database/healmaps.sql`.
- Update `config.py` with your MySQL `root` password.

### 3. Backend Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Start the Flask server
python app.py
```

### 4. Access the App
Open your browser and navigate to:
`http://127.0.0.1:5000`

---

## 🏗️ Folder Structure

```text
healmaps/
├── app.py              # Main Flask Backend
├── config.py           # DB & Session Configuration
├── requirements.txt    # Python dependencies
├── static/
│   ├── css/style.css  # Unified design system
│   ├── js/main.js     # Frontend logic & API calls
│   └── images/logo.png # Project logo
├── templates/
│   ├── index.html     # Login Page
│   ├── signup.html    # Signup Page
│   ├── dashboard.html # Main Dashboard
│   ├── about.html     # Mission & Team
│   └── contact.html   # Support Form
└── database/
    └── healmaps.sql   # SQL Schema & Seed Data
```

---

## ⚡ Algorithms & Concepts

- **Haversine Distance**: $d = 2R \arcsin(\sqrt{...})$ for shortest path calculations.
- **Priority Queue**: Sorting patients by severity (Critical > High > Medium > Low).
- **Greedy Allocation**: Assigning hospitals with the most available resources.
- **Deadlock Prevention**: Using MySQL Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`).
- **Client-Server**: CORS enabled for cross-origin communication.
