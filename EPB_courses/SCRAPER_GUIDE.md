# How to Re-run the ULB Course Scraper

## Overview
The scraper uses **Selenium** (for JavaScript rendering) and **BeautifulSoup** (for HTML parsing) to extract course data from ULB program pages.

## Prerequisites

### 1. Python 3.6+
Check if you have Python installed:
```bash
python3 --version
```

### 2. Required Python Packages
Install dependencies with:
```bash
pip install selenium beautifulsoup4 webdriver-manager requests
```

Or using a requirements file:
```bash
pip install -r requirements.txt
```

### 3. Chrome/Chromium Browser
The scraper needs Chrome or Chromium installed. Verify:
```bash
which google-chrome
# or
which chromium
```

## Running the Scraper

### Quick Start
Simply run the script from the terminal:

```bash
cd /Users/dimitris/Desktop/ULB_courses
python3 scrape_ulb_courses.py
```

### What It Does
1. **Initializes a headless Chrome browser** (no GUI, runs in background)
2. **Loads each program page** from the URLs defined in the script
3. **Waits for JavaScript to render** the dynamic course content
4. **Parses the HTML** to extract:
   - Course codes (e.g., ARCH-H400)
   - Course titles
   - Terms/periods
   - Credits (ECTS)
   - Instructor names
   - Program names
5. **Outputs CSV file**: `ulb_courses.csv`

### Typical Runtime
- **~15-20 minutes** for all 17 programs
- Each URL takes ~5-10 seconds to load and parse
- The scraper waits 2 seconds between requests (to be respectful to the server)

## Customization

### Changing Program URLs
Edit the `PROGRAMS` dictionary in `scrape_ulb_courses.py`:

```python
PROGRAMS = {
    "Program Name": {
        "credits": 120,
        "urls": [
            "https://www.ulb.be/en/programme/code1",
            "https://www.ulb.be/en/programme/code2"
        ]
    },
    # ... more programs
}
```

### Adjusting Wait Times
To speed up or slow down the scraper, modify these lines:

```python
time.sleep(3)  # Page load wait (seconds)
time.sleep(2)  # Between requests (seconds)
```

### Output File Name
Change the output filename in the `main()` function:
```python
output_file = 'my_custom_filename.csv'
```

## Troubleshooting

### Issue: "ChromeDriver not found"
**Solution**: The script automatically downloads the appropriate ChromeDriver version via `webdriver-manager`. If this fails:
```bash
pip install --upgrade webdriver-manager
```

### Issue: "Module not found: selenium"
**Solution**: Install missing packages:
```bash
pip install selenium beautifulsoup4 webdriver-manager
```

### Issue: Slow performance or timeouts
**Solution**: 
- Increase wait times in the script
- Check your internet connection
- The ULB servers might be slow; try again later

### Issue: CSV file is empty or has few courses
**Solution**:
- This might happen if the page structure changed on ULB's website
- Check the HTML structure and update CSS selectors in `extract_courses_from_page()`
- Run with verbose output to see which courses are being extracted

## Script Architecture

### Key Functions

**`setup_driver()`**
- Configures a headless Chrome browser
- Disables automation detection to avoid blocks
- Returns the WebDriver instance

**`scrape_program_page(url, program_name, driver)`**
- Loads a single program URL
- Waits for JavaScript rendering
- Calls extraction function
- Returns list of courses

**`extract_courses_from_page(soup, program_name, url)`**
- Parses BeautifulSoup object
- Finds course DIVs with ID pattern `prg-*`
- Extracts course code, title, terms, credits, instructors
- Returns list of course dictionaries

**`main()`**
- Orchestrates the entire scraping process
- Iterates through all programs
- Removes duplicates
- Writes CSV file

## Output Format

The CSV file has the following columns:

| Column | Description |
|--------|---|
| Program | Name of the degree program |
| CourseCode | ULB course identifier (e.g., ARCH-H400) |
| TitleEn | Course title in English |
| TitleFr | Course title in French (mostly empty) |
| Instructors | Comma-separated instructor names |
| Terms | When offered (first term, second term, etc.) |
| Credits | ECTS credits awarded |
| Year | Academic year level (1st, 2nd, 3rd) |
| URL | Source program URL |

## Maintenance

If ULB updates their website structure:
1. The script might extract fewer courses or fail
2. You'll need to inspect the HTML to find new CSS selectors
3. Update the `extract_courses_from_page()` function with new selectors
4. Re-run the script

To debug, save the page HTML:
```python
with open('debug.html', 'w') as f:
    f.write(driver.page_source)
```

Then inspect `debug.html` in a browser to find course element patterns.

## Notes

- The scraper respects the ULB servers with 2-second delays between requests
- It uses a headless browser to handle JavaScript-rendered content
- All requests include a User-Agent header to identify the scraper
- Duplicate courses (same program + same code) are automatically removed

---

**Last Updated**: June 23, 2026  
**Programs**: 17 (8 x 120 ECTS, 5 x 60 ECTS, 3 x 180 ECTS)  
**Typical Output**: 700-800 courses
