# OLA Course Parser & Verifier

A client-side web application designed to parse, manage, and validate **Online Learning Agreements (OLAs)** (specifically **Table A: Study Programme at Receiving Institution**) from PDF files or manual course inputs. 

The application evaluates academic criteria in real-time, adapting validation thresholds dynamically based on the student's selected mobility context.

---

## 🚀 Getting Started

Since the application runs entirely client-side, you can open and run it using any local web server.

### Run with Python (Recommended)
1. Open your terminal in the project directory.
2. Spin up Python's built-in HTTP server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open your browser and navigate to:
   **[http://localhost:8000](http://localhost:8000)**

---

## 📁 Codebase Structure

- **[index.html](file:///Users/dimitris/Desktop/OLAs/index.html)**: The modern glassmorphic UI layout containing the entry selectors, manual entry forms, course list table, and validation results dashboard.
- **[app.js](file:///Users/dimitris/Desktop/OLAs/app.js)**: The core logic orchestrating client-side PDF parsing (via PDF.js), mobility context auto-detection, manual course management, and the rules verification engine.
- **[styles.css](file:///Users/dimitris/Desktop/OLAs/styles.css)**: Sleek visual design using dark mode styling, linear neon gradients, glow animations, and responsive flex grids.
- **[examples/](file:///Users/dimitris/Desktop/OLAs/examples)**: Pre-loaded Erasmus OLA PDF documents to test different formats and languages (Italian, Spanish, English).

---

## 🌟 Core Features

### 1. Dual Entry Paths
- **PDF Parsing**: Drag & drop or upload an OLA PDF. The app parses the document's coordinates to extract tabular course data (code, title, term, ECTS) and student metadata (name, origin university, mobility period).
- **Manual Entry**: Toggle to the "Manual Entry" tab to type course details (code, title, term, credits) directly into the study plan.

### 2. Dynamic Mobility Contexts & Rulesets
Depending on the student's mobility type, different rules are applied dynamically:
- **One Semester (1st)**: Enforces a total of **30 ECTS**. Checks that all courses are scheduled in the 1st term. Fails if 2nd term courses are present.
- **One Semester (2nd)**: Enforces a total of **30 ECTS**. Checks that all courses are scheduled in the 2nd term. Fails if 1st term courses are present.
- **Two Semesters (Full Year)**: Enforces a total of **60 ECTS** and a minimum study load of **21 ECTS per term**.
- **Double Diploma**: Enforces a total of **60 ECTS** and **21 ECTS per term**. Also evaluates a specialized soft rule checking for a master's thesis or capstone project course (scanning titles for keywords like *thesis*, *project*, *projet*, *dissertation*).

### 3. Study Program Operations
- **Actions Column**: Remove courses (both parsed and manually added) from the study program individually with instant rules re-evaluation.
- **Clear All**: Reset the courses table and metadata to start fresh.
- **Custom Rules**: Add your own validation rules (minimum total ECTS, specific code prefixes, or mandatory course requirements) via the rule creation modal.

---

## 🕷️ EPB Course Scraper

Located in the **[EPB_courses/](file:///Users/dimitris/Desktop/OLAs/EPB_courses/)** subdirectory, this scraper extracts and compiles courses from the Université libre de Bruxelles (ULB) curriculum catalog.

### Setup and Execution
1. Navigate to the scraper directory:
   ```bash
   cd EPB_courses
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the scraper:
   ```bash
   python3 scrape_epb_courses_v4.py
   ```

### Scraper Pipeline
- **Course Extraction**: Traverses program catalogs listed in the `PROGRAMS` map using BeautifulSoup and Selenium headless driver to build a list of course codes, English titles, credits (ECTS), terms, and URLs.
- **Parallel French Title Extraction**: Spawns a ThreadPool of 8 Selenium webdrivers running concurrently to fetch French course titles from individual course pages.
- **Cached English Fallback**: Includes a fallback caching lock that writes the English title to the database if the French page fails to load or resolves to cookie policy popups.
- **Dataset Output**: Saves unique listings to **[epb_courses.csv](file:///Users/dimitris/Desktop/OLAs/EPB_courses/epb_courses.csv)** (780 courses across 17 engineering/science programs).
