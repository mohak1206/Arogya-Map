# 🏥 Arogya Map — Comprehensive AI Context & Project Specification

> **How to use this file:**  
> Copy and paste this document into **ChatGPT**, **Claude**, **Gemini**, or any LLM whenever you start a new chat. It provides the AI with 100% of the architecture, database schema, algorithms, API endpoints, frontend design, known bugs, and improvement areas so it can answer questions, write accurate code, and suggest high-value enhancements without guessing.

---

## 📌 1. Project Overview & Mission

- **Project Name:** Arogya Map (आरोग्य मैप)
- **Tagline:** Smart Emergency Healthcare & Hospital Resource Management System
- **Core Mission:** Reduce emergency response times and eliminate critical bed-shortage delays by pairing real-time hospital occupancy data with intelligent geo-spatial routing and emergency patient triage.
- **Key Personas:**
  1. **Standard Users / Patients:** View nearest available hospitals, submit one-click Emergency SOS triage requests, track daily health vitals (sleep, stress, activity, screen time), and receive rule-based AI wellness insights.
  2. **Hospital Admins & Healthcare Dispatchers:** Supervise real-time bed & ICU capacities, manage emergency triage queues, track incoming ambulance/patient requests, and analyze system health telemetry.

---

## 🛠️ 2. Technology Stack & Dependencies

| Layer | Technologies Used |
|---|---|
| **Backend Framework** | Python 3.10+ / Flask, Flask Blueprints (Modular API & Admin isolation) |
| **Authentication & Security** | Werkzeug (`generate_password_hash`, `check_password_hash`), Flask Sessions (`session['user_id']`, `session['user_role']`), Custom Python Decorators (`@login_required`, `@admin_required`) |
| **Database & ORM** | MySQL 8.0+ via `flask-mysqldb` and `mysql-connector-python`, raw SQL with DictCursor |
| **Frontend Templates** | HTML5, Jinja2 template inheritance, Semantic HTML |
| **Styling & Design System** | Vanilla CSS3 (`style.css`), Glassmorphism, CSS Custom Properties (Theme tokens), Light/Dark mode toggling |
| **Client-Side Libraries** | **Leaflet.js** (Interactive OpenStreetMap tile rendering & pins), **Chart.js** (Health metrics & admin analytics), **Font Awesome 6** (Icons) |
| **Environment Management** | `python-dotenv` loading `.env` configuration |

### Dependencies (`backend/requirements.txt`):
```txt
flask
flask-cors
flask-mysqldb
mysql-connector-python
werkzeug
python-dotenv
```

---

## 📂 3. Directory & File Structure

```text
Arogya-Map/
├── run.py                          # Primary server entrypoint (Runs Flask on port 5000)
├── .env.example                    # Environment variable template
├── .env                            # Active environment configuration (git-ignored)
├── README.md                       # High-level repository documentation
├── PROJECT_CONTEXT_FOR_AI.md       # THIS FILE — Master AI context document
│
├── backend/
│   ├── app.py                      # Core Flask app, public/user page routes, user REST APIs
│   ├── admin_routes.py             # Admin Blueprint (views & protected admin REST APIs)
│   ├── config.py                   # Central Config class (loads .env parameters)
│   ├── database.py                 # MySQL instance initialization
│   ├── admin_db_setup.py           # Admin seeding and table initialization helper
│   ├── update_db.py                # Database update & patch script
│   ├── db_migration.py             # Migration script
│   ├── requirements.txt            # Python pip package specifications
│   └── database/
│       └── arogyamap.sql           # MySQL DDL schema and seed records
│
├── database/
│   └── arogyamap.sql               # Mirror copy of the primary schema file
│
└── frontend/
    ├── static/
    │   ├── css/
    │   │   └── style.css           # Global design system (glassmorphism, CSS variables, dark/light)
    │   ├── js/
    │   │   ├── main.js             # User dashboard, geolocation, Leaflet maps, Chart.js logic
    │   │   └── admin.js            # Admin dispatch queue, live bed updates, telemetry charts
    │   └── images/                 # Favicons and static assets
    └── templates/
        ├── index.html              # Authentication page (Login)
        ├── signup.html             # User registration page
        ├── dashboard.html          # Patient health dashboard & quick actions
        ├── hospitals.html          # Map-based hospital locator with filters
        ├── emergency.html          # Standalone Emergency SOS triage interface
        ├── profile.html            # User health profile, activity graphs, and history
        ├── about.html              # Project overview, algorithm explanations, team info
        ├── contact.html            # Contact support & inquiry form
        ├── admin_dashboard.html    # Admin analytics, occupancy rates & dispatch board
        ├── admin_hospitals.html    # Hospital CRUD and live bed count adjustment
        ├── admin_patients.html     # Active emergency requests & triage queue
        ├── admin_users.html        # User management & role assignment (User ↔ Admin)
        └── admin_reports.html      # System reports and data export
```

---

## 🗄️ 4. Database Schema (MySQL)

Database Name: `arogyamap_db`

### 1. `users` Table
Stores registered accounts and roles:
```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,                 -- Werkzeug scrypt/pbkdf2 hash
    role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. `hospitals` Table
Stores hospital coordinates, emergency capacities, and real-time inventory:
```sql
CREATE TABLE hospitals (
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
    contact VARCHAR(20)
);
```

### 3. `emergency_requests` Table
Tracks patient emergency SOS submissions and assignments:
```sql
CREATE TABLE emergency_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    hospital_id INT,
    patient_name VARCHAR(100),
    description TEXT,
    priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
    status ENUM('pending','assigned','completed') NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL
);
```

### 4. `health_data` Table
Tracks daily wellness and lifestyle metrics:
```sql
CREATE TABLE health_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    stress_level INT DEFAULT 0,              -- Scale: 0 to 100
    productivity_score INT DEFAULT 0,        -- Scale: 0 to 100
    sleep_hours DECIMAL(4,2) DEFAULT 0.00,
    steps INT DEFAULT 0,
    screen_time_hours DECIMAL(4,2) DEFAULT 0.00,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_date (user_id, date)
);
```

### 5. `contact_messages` Table
Contact form submissions:
```sql
CREATE TABLE contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🧮 5. Key Algorithms & Core Logic

### 1. Haversine Distance Formula (`haversine(lat1, lon1, lat2, lon2)`)
Used in `/api/hospitals/nearest` to calculate the shortest great-circle distance between the user's GPS position and every hospital:
$$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
- $R = 6371 \text{ km}$ (Earth's mean radius)
- Sorted ascending by distance ($O(N \log N)$), filtered by `available_beds > 0`.

### 2. Priority-Based Emergency Triage (Priority Queue Concept)
When emergency SOS requests arrive, they are weighted:
- `critical`: Weight 4 (Immediate life threat — Cardiac arrest, trauma, stroke)
- `high`: Weight 3 (Severe distress, respiratory failure)
- `medium`: Weight 2 (Fractures, non-acute emergencies)
- `low`: Weight 1 (Minor ailments)
Admin dispatch queues sort by `priority_score DESC, requested_at ASC`.

### 3. Greedy Resource Allocation
When an emergency assignment is processed, the system prioritizes the nearest hospital that fulfills:
$$\text{available\_beds} > 0 \quad \text{and (if critical)} \quad \text{available\_icu} > 0$$

### 4. Concurrency & Deadlock Prevention
When booking a bed during emergency dispatch:
- MySQL Transactions (`START TRANSACTION`, `SELECT ... FOR UPDATE`, `UPDATE ...`, `COMMIT`).
- Prevents race conditions where two simultaneous dispatches overbook the last available bed.

---

## 🌐 6. API Route Matrix

### 👤 Public & User Endpoints (`backend/app.py`)
| Method | Route | Auth Req? | Description |
|---|---|---|---|
| `GET` | `/` | No | Login page view |
| `GET` | `/signup` | No | Signup page view |
| `GET` | `/dashboard` | Session | Main user dashboard |
| `GET` | `/hospitals` | Session | Interactive hospital finder |
| `GET` | `/emergency` | Session | Emergency SOS trigger interface |
| `GET` | `/profile` | Session | User health profile |
| `POST` | `/api/register` | No | Register new account (`name`, `email`, `password`) |
| `POST` | `/api/login` | No | Authenticate user, set session cookies |
| `POST` | `/api/logout` | No | Clear session |
| `GET` | `/api/hospitals` | No | List all hospitals |
| `GET` | `/api/hospitals/nearest` | No | Nearest hospitals by query params `lat` and `lng` |
| `POST` | `/api/emergency` | Yes | Submit new emergency SOS request |
| `GET` | `/api/user/profile` | Yes | Get user details + latest 7-day health metrics |
| `POST` | `/api/health` | Yes | Upsert user daily health metrics |
| `POST` | `/api/contact` | No | Submit feedback/contact message |

### 🛡️ Admin Blueprint Endpoints (`backend/admin_routes.py`)
All require `session['user_role'] == 'admin'` (enforced by `@admin_required` or `@admin_api_required`).
| Method | Route | Description |
|---|---|---|
| `GET` | `/admin/dashboard` | Admin analytics & telemetry view |
| `GET` | `/admin/hospitals` | Admin hospital inventory manager view |
| `GET` | `/admin/patients` | Admin emergency triage queue view |
| `GET` | `/admin/users` | Admin user role management view |
| `GET` | `/admin/reports` | Admin system reports view |
| `GET` | `/api/admin/dashboard-stats` | Aggregated statistics (total beds, ICU occupancy %, open SOS) |
| `GET/POST` | `/api/admin/hospitals` | List all hospitals / Add new hospital |
| `PUT/DELETE`| `/api/admin/hospitals/<id>` | Update hospital capacity / Remove hospital |
| `GET` | `/api/admin/patients` | Fetch live emergency triage queue with filters |
| `PATCH` | `/api/admin/patients/<id>/status`| Update emergency state (`pending` $\rightarrow$ `assigned` $\rightarrow$ `completed`) |
| `GET` | `/api/admin/users` | List all registered users |
| `PATCH` | `/api/admin/users/<id>/role` | Toggle user role (`user` $\leftrightarrow$ `admin`) |

---

## 🎨 7. Frontend Architecture & Design System

- **Layout Structure:**
  - Responsive Sidebar navigation with collapsible mobile drawer (`sidebar.has-sidebar`).
  - Top search & quick action bars with user avatar & dynamic status badges.
  - Mesh-gradient background (`.bg-mesh`) with glassmorphism cards (`backdrop-filter: blur(12px)`).
- **Theme Support:**
  - Light & Dark mode switched via `toggleTheme()` in `main.js`.
  - CSS Custom Variables defined in `:root` and `[data-theme="dark"]`:
    - `--bg-primary`, `--bg-card`, `--text-primary`, `--text-secondary`, `--teal`, `--amber`, `--rose`, `--blue`, `--border`.
- **Icon Set:**
  - Font Awesome 6 Solid (`fa-solid fa-*`).
  - *Note on Free vs Pro:* Font Awesome Free must use valid free icons like `fa-table-cells-large` instead of Pro-only icons like `fa-grid-2`.

---

## ⚙️ 8. Environment Configuration (`.env`)

```ini
# Flask Configuration
SECRET_KEY=arogyamap_secret_key_2024_ultra_secure
FLASK_PORT=5000
FLASK_DEBUG=True

# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DB=arogyamap_db
MYSQL_CURSORCLASS=DictCursor
```

---

## ⚠️ 9. Known Technical Challenges & Current Roadmap

1. **Font Awesome Icon CDN:**
   - Some icons (e.g. `fa-grid-2`) are Font Awesome **Pro** icons and fail to display with the Free CDN tier. They should be replaced with free alternatives (e.g. `fa-table-cells-large`, `fa-th-large`).
   - If the network blocks Cloudflare CDN, local SVG icons or a local CSS fallback ensure offline reliability.
2. **Real-time Ambulance Geolocation:**
   - Current distance calculation uses the static `hospitals` table coordinates and the client's current browser geolocation.
   - Future enhancement: WebSockets (Flask-SocketIO) for live moving ambulance tracking.
3. **AI Wellness Integration:**
   - Currently, health tips use simple rule-based heuristics on sleep, steps, and stress.
   - Ready for integration with Gemini API or OpenAI API to provide clinical-grade personalized lifestyle recommendations.
4. **Database Connection Resilience:**
   - Flask with `flask-mysqldb` relies on a local MySQL server running. If MySQL is closed, requests return 500. A mock/fallback mode or SQLite adapter is a valuable development feature.

---

## 💬 10. Ready-to-Use Prompts for Claude & ChatGPT

Paste the prompts below along with this file to get immediate, high-quality assistance:

### Prompt 1: Feature Expansion
> *"I have attached the full context of Arogya Map above. I want to add a real-time hospital bed booking and appointment scheduling system. Show me the exact SQL migration, the Flask backend endpoint, and the frontend JavaScript modal code required to implement this."*

### Prompt 2: Security & Production Hardening
> *"Review the security architecture in this document (authentication, session handling, database queries). Identify any vulnerabilities (e.g. CSRF, SQL injection, session hijacking) and provide production-ready refactored code."*

### Prompt 3: UI/UX Modernization
> *"Based on the frontend specifications in section 7, suggest 5 modern UI micro-interactions or components to make the Emergency SOS screen feel faster, more reassuring, and intuitive during high-stress situations."*

### Prompt 4: Migration to Modern Tech Stack
> *"Provide a step-by-step architectural plan to migrate the Arogya Map backend from Flask to FastAPI (or Node.js) and the frontend to Next.js with Tailwind CSS, while keeping the database schema intact."*
