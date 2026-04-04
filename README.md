# Arogya Map — Smart Emergency & Hospital Resource Management

Arogya Map is a full-stack healthcare dashboard designed to optimize emergency responses and hospital resource management. It uses real-time data, Haversine-based hospital finding, priority queues for emergency routing, and interactive maps to deliver a premium healthcare experience. We also feature a comprehensive **Admin Panel** for role-based system supervision.

## 🚀 Key Features

- **Role-Based Access Control (RBAC)**: Secure access tailored for Standard Users and System Administrators.
- **Comprehensive Admin Panel**: Administrators can manage hospitals, users, emergency patient assigned queues, and view detailed system analytics via an intuitive dashboard.
- **Smart Hospital Finder**: Uses the **Haversine formula** to locate the nearest hospitals with an interactive **Leaflet.js** map.
- **Dedicated Emergency SOS Interface**: Intelligent, standalone routing system that automatically assigns patients to hospitals based on bed availability and triage severity (**Greedy Algorithm** & **Priority Queue**).
- **Health Analytics & Profiles**: Interactive charts using **Chart.js** to track and display user sleep, steps, stress, and activity within personal profiles.
- **Real-time Occupancy**: Tracks available beds, ICU units, and ventilators with live occupancy bars.
- **Secure Authentication**: Password hashing with **Werkzeug** and robust session-based routing constraints.
- **Premium User-Interface**: Mobile-first glassmorphism design with a dynamic, user-selectable light/dark theme.

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES6), Leaflet.js, Chart.js
- **Backend**: Python 3, Flask, Flask Blueprints (API routing & Admin isolation)
- **Database**: MySQL
- **Design Architecture**: Dark/Light themes, Glassmorphism, Micro-Animations, Context-driven sidebars.

## 📦 Installation & Setup

### 1. Prerequisites
- Python 3.x
- MySQL Server (XAMPP / MySQL Workbench / Docker)

### 2. Database Configuration
```bash
# Create database and seed data
mysql -u root -p < backend/database/arogyamap.sql
```
- Update `backend/config.py` with your MySQL `root` password.

### 3. Backend Setup
```bash
# Install dependencies
pip install -r backend/requirements.txt

# Start the Flask server
python run.py
```

### 4. Access the App
Open your browser and navigate to:
`http://127.0.0.1:5000`

---

## 🏗️ Folder Structure

```text
HEAL MAPS/
├── run.py                          # Entry point — starts Flask server
├── README.md
├── backend/
│   ├── app.py                      # Main Flask Backend (public API routes & views)
│   ├── admin_routes.py             # Admin Blueprint (Role-controlled API routes & views)
│   ├── admin_db_setup.py           # Script to initialize admin schema/data
│   ├── config.py                   # MySQL configuration
│   ├── requirements.txt            # Python dependencies
│   └── database/
│       └── arogyamap.sql            # Schema + seed data
└── frontend/
    ├── static/
    │   ├── css/style.css           # Premium design system (light/dark theme)
    │   ├── js/main.js              # Frontend logic, maps, charts, API calls
    │   └── images/logo.png         # Project logo
    └── templates/
        ├── index.html              # Login Page
        ├── signup.html             # Signup Page
        ├── dashboard.html          # Main User Dashboard
        ├── profile.html            # User Health Profile
        ├── hospitals.html          # Hospital Finder (Map + Cards)
        ├── emergency.html          # Standalone Emergency SOS Interface
        ├── contact.html            # Contact Form + Office Map
        ├── about.html              # Mission, Algorithms & Team
        ├── admin_dashboard.html    # Admin Overview & Analytics Panel
        ├── admin_hospitals.html    # Admin Hospital Management
        ├── admin_patients.html     # Admin Emergency Patient Queue
        ├── admin_users.html        # Admin User Management
        └── admin_reports.html      # Admin System Reports
```

---

## 📡 API Endpoints Core

### Public & User API
| Endpoint | Method | Description |
|---|---|---|
| `/api/register` | POST | Register a new user |
| `/api/login` | POST | Authenticate and start session |
| `/api/logout` | POST | End session |
| `/api/user/profile` | GET | Full profile with health summary |
| `/api/hospitals/nearest` | GET | Find nearest hospitals (Haversine) |
| `/api/emergency` | POST | Submit emergency request |
| `/api/health` | GET/POST | Read/Update personal health records |

### Admin Blueprint (`/admin/` & `/api/admin/`)
| Endpoint | Method | Description |
|---|---|---|
| `/admin/dashboard` | GET | Admin Panel UI view (Protected) |
| `/api/admin/dashboard-stats` | GET | Aggregated system telemetry and usage |
| `/api/admin/hospitals` | GET/POST/PUT | Manage/Onboard hospital capabilities |
| `/api/admin/patients` | GET/PATCH | Review and assign emergency queues |
| `/api/admin/users/<id>/role` | PATCH | RBAC assignments and restrictions |

---

## ⚡ Algorithms & Concepts

- **Role-Based Access Control (RBAC)**: Secure route protection at the backend level ensuring isolation of administrative commands.
- **Haversine Distance**: Great-circle distance for shortest path calculations.
- **Priority Queue**: Sorting patients by severity (Critical > High > Medium > Low).
- **Greedy Allocation**: Assigning hospitals with the most available resources.
- **Deadlock Prevention**: MySQL Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`, `FOR UPDATE`).
