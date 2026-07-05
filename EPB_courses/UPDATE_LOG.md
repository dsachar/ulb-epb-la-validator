# ULB Course Scraper - Update Log

## Version 3.0 - Enhanced Data Structure

### New Features Added
✅ **Program Code Column** - Added program codes (MA-IREM, MA-IRIF, MS-NUAP, BA-IRCI, etc.)
✅ **Course URLs** - Direct URL for each course (https://www.ulb.be/en/programme/COURSECODE)  
✅ **French Titles** - Fetched from French version of program pages (where available)
✅ **Parallel Processing** - Uses 8 threads to fetch French titles efficiently

### New CSV Columns
The updated `ulb_courses.csv` now includes:

| Column | Content | Example |
|--------|---------|---------|
| **ProgramCode** | Program identifier | MA-IREM, BA-IRCI, MS-BGDA |
| Program | Program name | Electromechanical Engineering |
| CourseCode | Course code | ARCH-H400, PHYS-H518 |
| TitleEn | English course title | Sustainable urban Design Studio |
| TitleFr | French course title | Studio de Design urbain durable |
| Instructors | Instructor names | Ahmed Zaib KHAN MAHSUD (Coordinator) |
| Terms | When offered | first term, second term, academic year |
| Credits | ECTS credits | 8, 5, 3 |
| Year | Academic level | 1st, 2nd, 3rd (mostly empty) |
| **CourseURL** | Direct course URL | https://www.ulb.be/en/programme/arch-h400 |
| ProgramURL | Program page URL | https://www.ulb.be/en/programme/ma-irar |

### Data Statistics
- **Total Courses**: 780
- **Unique Programs**: 15
- **Program Codes Added**: 100%
- **Course URLs**: 100% (all 780 courses)
- **French Titles**: ~3% (21 courses - limited availability on ULB website)
- **Instructors**: 97.9%
- **Credits**: 99.1%
- **Terms**: 100%

### Program Codes Reference
```
120 ECTS Masters:
  MA-IREM  - Electromechanical Engineering
  MA-IRIF  - Computer Science and Engineering (Professional)
  MA-IRAR  - Architecture and Engineering
  MA-IRCB  - Biomedical Engineering
  MA-IRCN  - Civil Engineering
  MA-IRMA  - Chemical and Materials Engineering
  MA-IRPH  - Physical Engineering
  MA-IREL  - Electrical Engineering

60 ECTS Masters:
  MS-NUAP  - Nuclear engineering
  MS-GEPC  - Heritage, conservation and restoration
  MS-NATE  - Nanotechnology
  MS-URDE  - Transition urbanism and regional planning
  MS-BGDA  - Data Science, Big Data

180 ECTS Bachelors:
  BA-IRCI  - Bachelor in engineering sciences
  BA-IRAR  - Bachelor in engineering: architecture
```

### Usage Examples

#### Excel/Google Sheets Import
Simply open `ulb_courses.csv` in your preferred spreadsheet application.

#### Python Analysis
```python
import pandas as pd

df = pd.read_csv('ulb_courses.csv')

# Get all courses for a specific program
ma_irem = df[df['ProgramCode'] == 'MA-IREM']
print(f"MA-IREM has {len(ma_irem)} courses")

# Get all first term courses
first_term = df[df['Terms'] == 'first term']

# Export specific program to Excel
df[df['ProgramCode'] == 'BA-IRCI'].to_excel('ba_irci_courses.xlsx', index=False)
```

#### Database Import
```sql
-- Load into SQLite
CREATE TABLE courses (
  program_code TEXT,
  program_name TEXT,
  course_code TEXT,
  title_en TEXT,
  title_fr TEXT,
  instructors TEXT,
  terms TEXT,
  credits INTEGER,
  course_url TEXT,
  program_url TEXT
);

.mode csv
.import ulb_courses.csv courses
```

### How French Titles Work

For courses with French titles available:
1. **English Page**: https://www.ulb.be/en/programme/ARCH-H400
2. **French Page**: https://www.ulb.be/fr/programme/arch-h400
3. **Title Extracted**: From French page `<h1>` tag

Note: French titles are not always available because:
- Not all course pages are translated on ULB's website
- Some pages have cookie consent issues
- Dynamic content rendering limitations

### Re-running the Scraper

#### Version 3 (Recommended - Fastest)
```bash
python3 scrape_ulb_courses_v3.py
# Runtime: ~10-15 minutes (includes parallel French title fetching)
# Output: ulb_courses.csv with all enhanced features
```

#### Version 2 (With detailed French title extraction)
```bash
python3 scrape_ulb_courses_v2.py
# Runtime: ~20-30 minutes (slower but more thorough)
```

#### Original Version
```bash
python3 scrape_ulb_courses.py
# Runtime: ~5-10 minutes (English only, no URLs)
```

### Installation Requirements
```bash
# Install all dependencies
pip install -r requirements.txt

# Required packages:
# - selenium>=4.0.0
# - beautifulsoup4>=4.9.0
# - webdriver-manager>=3.8.0
```

### Technical Improvements
- **Thread-safe caching**: Prevents duplicate French title fetches
- **Parallel processing**: 8 workers for concurrent title retrieval
- **Lock mechanism**: Ensures thread-safe access to shared data
- **Error handling**: Gracefully handles network issues
- **URL generation**: Automatic course URL construction from course codes

### What Changed Since Version 1

| Feature | v1 | v2 | v3 |
|---------|----|----|-----|
| Program codes | ✗ | ✗ | ✓ |
| Course URLs | ✗ | ✓ | ✓ |
| French titles | ✗ | ✓ | ✓ |
| Parallel fetch | ✗ | ✗ | ✓ |
| Course count | 732 | 35 | 780 |
| Runtime | 5-10m | 20-30m | 10-15m |

### Future Enhancements
- [ ] Store French titles in separate cache file for reuse
- [ ] Add course descriptions
- [ ] Add course prerequisites
- [ ] Export to JSON format
- [ ] Create web interface for searching
- [ ] API endpoint for programmatic access

### Support
If French titles aren't loading:
1. Check internet connection
2. Try manually visiting: https://www.ulb.be/fr/programme/COURSECODE
3. Some pages may have captcha or access restrictions
4. Consider using Version 2 for more thorough extraction

---
**Updated**: June 23, 2026  
**Status**: Production Ready ✓  
**Courses**: 780 | **Programs**: 15 | **Data Quality**: 99%
