# ULB Courses Data Extraction

## Overview
This directory contains a comprehensive CSV file with course information from 17 ULB (Université libre de Bruxelles) Master's and Bachelor's programs.

## File: `ulb_courses.csv`

### Statistics
- **Total Courses**: 780 unique courses
- **File Size**: 134 KB
- **Programs Covered**: 17 engineering and specialized programs
- **Data Completeness**: 
  - Course Codes: 100%
  - Titles: 100%
  - Credits: 99%
  - Instructors: 97%
  - Terms: 100%

### Columns
1. **Program** - Name of the master's or bachelor's program
2. **CourseCode** - ULB course identifier (e.g., ARCH-H400)
3. **TitleEn** - Course title in English
4. **TitleFr** - Course title in French (empty for this extraction)
5. **Instructors** - Comma-separated list of instructors/coordinators
6. **Terms** - When the course is offered (first term, second term, academic year, etc.)
7. **Credits** - ECTS credits awarded
8. **Year** - Academic year (1st, 2nd, 3rd - mostly empty in current extraction)
9. **URL** - Source program URL

### Programs Included

#### 120 ECTS Masters (9 programs)
- Electromechanical Engineering (Professional) - 104 courses
- Electromechanical Engineering (Operations) - 45 courses
- Computer Science and Engineering (Specialist) - 68 courses
- Architecture and Engineering - 46 courses
- Biomedical Engineering - 73 courses
- Civil Engineering - 58 courses
- Chemical and Materials Engineering - 69 courses
- Physical Engineering - 56 courses
- Electrical Engineering - 76 courses

#### 60 ECTS Masters (5 programs)
- Nuclear Engineering - 14 courses
- Heritage, conservation and restoration - 9 courses
- Nanotechnology - 12 courses
- Transition urbanism and regional planning - 17 courses
- Data Science, Big Data - 18 courses

#### 180 ECTS Bachelors (3 programs)
- Bachelor in engineering sciences (Orientation B) - 65 courses
- Bachelor in engineering sciences (Orientation C) - 19 courses
- Bachelor in engineering: architecture - 31 courses

### Credits Distribution
- Most common: 5 ECTS (474 courses)
- Range: 2-29 ECTS
- Other common values: 3 ECTS (106), 4 ECTS (95), 6 ECTS (35)

### Terms Distribution
- First term only: 322 courses
- Second term only: 339 courses
- Both terms: 55 courses
- Academic year: 64 courses

## Data Quality Notes
- All courses have complete course codes and titles
- Most courses have instructor information (97%)
- Courses are offered in single terms, both terms, or across the academic year
- Course credits range from 2 to 29 ECTS
- Some programs had loading issues and are not fully represented

## Usage
The CSV file can be imported into:
- Excel, Google Sheets, or other spreadsheet applications
- Database systems
- Data analysis tools (Python pandas, R, etc.)
- Course management systems

## Data Source
- Extracted from: www.ulb.be programme pages
- Extraction Date: June 23, 2026
- Extraction Method: Web scraping with Selenium and BeautifulSoup

