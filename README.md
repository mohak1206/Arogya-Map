# Arogya Map — Smart Emergency & Hospital Resource Management

Arogya Map is a full-stack healthcare dashboard designed to optimize emergency responses and hospital resource management. It uses real-time data, Haversine-based hospital finding, priority queues for emergency routing, and interactive maps to deliver a premium healthcare experience.

## 🚀 Key Features

- **Smart Hospital Finder**: Uses the **Haversine formula** to locate the nearest hospitals with an interactive **Leaflet.js** map.
- **Emergency SOS**: Intelligent routing system that assigns patients to hospitals based on bed availability and severity (**Greedy Algorithm** & **Priority Queue**).
- **Health Analytics**: Interactive charts using **Chart.js** to track sleep, steps, stress, and productivity.
- **Real-time Occupancy**: Tracks available beds, ICU units, and ventilators with live occupancy bars.
- **Bed Booking**: Book general or ICU beds with transactional safety (MySQL `FOR UPDATE` locks).
- **Secure Authentication**: Password hashing with **Werkzeug** and session-based access control.
- **Light / Dark Theme**: User-selectable theme with smooth transitions, saved to localStorage.
- **Responsive Design**: Mobile-first with hamburger menu, glassmorphism cards, and micro-animations.

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES6), Leaflet.js, Chart.js
- **Backend**: Python 3, Flask Framework
- **Database**: MySQL
- **Design**: Dark/Light themes, Glassmorphism, Gradient Mesh, Particle Animations

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
│   ├── app.py                      # Main Flask Backend (all API routes)
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
        ├── dashboard.html          # Main Dashboard
        ├── hospitals.html          # Hospital Finder (Map + Cards)
        ├── about.html              # Mission, Algorithms & Team
        └── contact.html            # Contact Form + Office Map
```

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/register` | POST | Register a new user |
| `/api/login` | POST | Authenticate and start session |
| `/api/logout` | POST | End session |
| `/api/user` | GET | Get current user info |
| `/api/user/profile` | GET | Full profile with health summary |
| `/api/hospitals` | GET | List all hospitals |
| `/api/hospitals/<id>` | GET | Get single hospital details |
| `/api/hospitals/nearest` | GET | Find nearest hospitals (Haversine) |
| `/api/hospitals/search` | GET | Search hospitals by name/city |
| `/api/hospitals/<id>/request-bed` | POST | Book a bed (transactional) |
| `/api/emergency` | POST | Submit emergency request |
| `/api/emergency/history` | GET | View past emergency requests |
| `/api/health` | GET | Get health data (last 7 days) |
| `/api/health` | POST | Add health entry |
| `/api/contact` | POST | Submit contact form |

---

## ⚡ Algorithms & Concepts

- **Haversine Distance**: Great-circle distance for shortest path calculations.
- **Priority Queue**: Sorting patients by severity (Critical > High > Medium > Low).
- **Greedy Allocation**: Assigning hospitals with the most available resources.
- **Deadlock Prevention**: MySQL Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`, `FOR UPDATE`).
- **Client-Server**: CORS enabled for cross-origin communication.
