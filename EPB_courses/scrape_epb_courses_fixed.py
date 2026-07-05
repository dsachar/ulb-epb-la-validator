#!/usr/bin/env python3
"""
ULB Course Data Scraper - FIXED VERSION
Extracts course information from ULB program pages with improved text parsing.

Features:
- Fixed extraction logic to handle new ULB page structure
- Extracts all ~750 courses from program pages
- Includes program codes, course URLs, and titles
- Smart French title fallback (English when French unavailable)
- Parallel processing for efficiency
"""

import csv
import time
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from selenium import webdriver
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from bs4 import BeautifulSoup


PROGRAMS = {
    "Electromechanical Engineering": {
        "code": "MA-IREM",
        "credits": 120,
        "urls": [
            "https://www.ulb.be/en/programme/ma-irem",
            "https://www.ulb.be/en/programme/m-iremr",
            "https://www.ulb.be/en/programme/m-iremi"
        ]
    },
    "Computer Science and Engineering (Professional)": {
        "code": "MA-IRIF",
        "credits": 120,
        "urls": [
            "https://www.ulb.be/en/programme/ma-irif",
            "https://www.ulb.be/en/programme/m-irifs"
        ]
    },
    "Architecture and Engineering": {
        "code": "MA-IRAR",
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-irar"]
    },
    "Biomedical Engineering": {
        "code": "MA-IRCB",
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-ircb"]
    },
    "Civil Engineering": {
        "code": "MA-IRCN",
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-ircn"]
    },
    "Chemical and Materials Engineering": {
        "code": "MA-IRMA",
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-irma"]
    },
    "Physical Engineering": {
        "code": "MA-IRPH",
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-irph"]
    },
    "Electrical Engineering": {
        "code": "MA-IREL",
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-irel"]
    },
    "Nuclear engineering": {
        "code": "MS-NUAP",
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-nuap"]
    },
    "Heritage, conservation and restoration": {
        "code": "MS-GEPC",
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-gepc"]
    },
    "Nanotechnology": {
        "code": "MS-NATE",
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-nate"]
    },
    "Transition urbanism and regional planning": {
        "code": "MS-URDE",
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-urde"]
    },
    "Data Science, Big Data": {
        "code": "MS-BGDA",
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-bgda"]
    },
    "Bachelor in engineering sciences": {
        "code": "BA-IRCI",
        "credits": 180,
        "urls": [
            "https://www.ulb.be/en/programme/ba-irci",
            "https://www.ulb.be/en/programme/ba-ircib",
            "https://www.ulb.be/en/programme/ba-ircic"
        ]
    },
    "Bachelor in engineering: architecture": {
        "code": "BA-IRAR",
        "credits": 180,
        "urls": ["https://www.ulb.be/en/programme/ba-irar"]
    },
}


# Thread-safe caching for French titles
french_cache = {}
cache_lock = threading.Lock()


def is_valid_title(title):
    """Check if extracted title is valid (not metadata, not empty, etc)."""
    if not title or len(title) < 3:
        return False
    
    invalid_patterns = [
        'ce site utilise des cookies',
        'cookie',
        'consentement',
        'accepter',
        'refused',
        'refuser',
        'vous acceptez',
        'vous refusez',
        'titulaire(s)',
        'crédits ects',
        'credits ects'
    ]
    
    title_lower = title.lower()
    for pattern in invalid_patterns:
        if pattern in title_lower:
            return False
    
    # Require at least 2 words
    if len(title.split()) < 2:
        return False
    
    return True


def get_french_title(course_code, english_title):
    """Get French title with smart fallback to English."""
    global french_cache
    
    # Check cache first
    with cache_lock:
        if course_code in french_cache:
            return french_cache[course_code]
    
    french_url = f"https://www.ulb.be/fr/programme/{course_code.lower()}"
    
    try:
        response = requests.get(
            french_url,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Try multiple extraction methods
        french_title = ""
        
        # Method 1: h1 tag
        h1 = soup.find('h1')
        if h1:
            h1_text = h1.get_text().strip()
            if is_valid_title(h1_text):
                french_title = h1_text
        
        # Method 2: meta description
        if not french_title:
            meta = soup.find('meta', attrs={'name': 'description'})
            if meta:
                desc = meta.get('content', '').strip()
                if is_valid_title(desc):
                    french_title = desc
        
        # Method 3: other headings
        if not french_title:
            for heading in soup.find_all(['h2', 'h3']):
                heading_text = heading.get_text().strip()
                if is_valid_title(heading_text):
                    french_title = heading_text
                    break
        
        # Fallback: use English if no valid French found
        if not french_title:
            french_title = english_title
        
    except Exception:
        # On error, use English as fallback
        french_title = english_title
    
    # Cache result
    with cache_lock:
        french_cache[course_code] = french_title
    
    return french_title


def extract_courses_from_page(soup, program_name, program_code, url):
    """Extract courses using improved text parsing."""
    courses = []
    
    # Get text content
    main = soup.find('main') or soup.find('div', id='contenu_sans_nav_sans_encadres')
    if not main:
        return courses
    
    text = main.get_text()
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    # Parse lines to find courses
    current_block = ""
    current_section = ""
    seen_codes = set()
    
    for i, line in enumerate(lines):
        # Detect block/section headers
        if 'Block' in line or 'BLOCK' in line:
            current_block = line
        if 'Module' in line and i > 0:
            current_section = line
        
        # Match course code pattern
        code_match = re.match(r'^([A-Z]{2,4}-[A-Z]?\d{3,4})$', line)
        if not code_match:
            continue
        
        course_code = code_match.group(1)
        
        # Skip duplicates
        if course_code in seen_codes:
            continue
        seen_codes.add(course_code)
        
        # Extract title (next non-metadata line)
        title_en = ""
        term = ""
        credits = ""
        
        for j in range(i + 1, min(i + 15, len(lines))):
            next_line = lines[j]
            
            # Skip language indicators
            if next_line in ['en', 'fr', 'bilingual', 'English', 'French']:
                continue
            
            # Extract ECTS
            if 'ECTS' in next_line or 'ects' in next_line:
                ects_match = re.search(r'(\d+)\s*ECTS', next_line)
                if ects_match:
                    credits = ects_match.group(1)
                continue
            
            # Extract term
            if any(t in next_line.lower() for t in ['term', 'annual', 'q1', 'q2']):
                term = next_line
                continue
            
            # Extract title (first meaningful line)
            if not title_en and len(next_line) > 5:
                # Skip section headers and metadata
                if not any(k in next_line for k in ['Block', 'Module', 'Partially', 'common', 'Free elective']):
                    title_en = next_line
                    break
        
        if not title_en:
            continue
        
        # Determine year (1st or 2nd based on block/credits)
        year = ""
        if "Block 1" in current_block or "Q1" in current_block:
            year = "1st"
        elif "Block 2" in current_block or "Q2" in current_block:
            year = "2nd"
        
        course_url = f"https://www.ulb.be/en/programme/{course_code.lower()}"
        program_url = url
        
        courses.append({
            'ProgramCode': program_code,
            'Program': program_name,
            'CourseCode': course_code,
            'TitleEn': title_en[:200],
            'TitleFr': '',  # Will be filled later
            'Instructors': '',
            'Terms': term,
            'Credits': credits,
            'Year': year,
            'CourseURL': course_url,
            'ProgramURL': program_url
        })
    
    return courses


def scrape_page(url, program_name, program_code):
    """Scrape a single program page."""
    driver = None
    try:
        options = webdriver.ChromeOptions()
        options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        driver.get(url + "#programme")
        
        # Wait for page to load
        time.sleep(3)
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        courses = extract_courses_from_page(soup, program_name, program_code, url)
        
        return courses
    except Exception as e:
        print(f"    ✗ Error: {e}")
        return []
    finally:
        if driver:
            driver.quit()


def main():
    print("\n" + "=" * 70)
    print("ULB COURSE SCRAPER - FIXED VERSION")
    print("=" * 70 + "\n")
    
    all_courses = []
    url_count = 0
    
    for program_name, program_data in PROGRAMS.items():
        program_code = program_data['code']
        credits = program_data['credits']
        urls = program_data['urls']
        
        print(f"{program_name} ({credits} ECTS)")
        
        for i, url in enumerate(urls, 1):
            url_count += 1
            print(f"  [{url_count}/20]   Scraping: {program_name}")
            print(f"  URL: {url}")
            
            courses = scrape_page(url, program_name, program_code)
            all_courses.extend(courses)
            
            print(f"  ✓ Extracted {len(courses)} courses\n")
    
    print("\n" + "=" * 70)
    print("EXTRACTION COMPLETE")
    print("=" * 70)
    print(f"Total courses extracted: {len(all_courses)}")
    print(f"Programs: {len(PROGRAMS)}\n")
    
    # Deduplicate within each program by course code
    deduped = {}
    for course in all_courses:
        key = (course['ProgramCode'], course['CourseCode'])
        if key not in deduped:
            deduped[key] = course
    all_courses = list(deduped.values())

    # Now fetch French titles in parallel
    print("Fetching French titles...")
    unique_codes = {c['CourseCode'] for c in all_courses}
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {}
        for code in unique_codes:
            en_title = next(c['TitleEn'] for c in all_courses if c['CourseCode'] == code)
            futures[executor.submit(get_french_title, code, en_title)] = code
        
        completed = 0
        for future in as_completed(futures):
            completed += 1
            if completed % 50 == 0:
                print(f"  {completed}/{len(unique_codes)} courses processed")
    
    # Update French titles in courses
    for course in all_courses:
        course['TitleFr'] = french_cache.get(course['CourseCode'], course['TitleEn'])
    
    # Write to CSV
    output_file = 'ulb_courses.csv'
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['ProgramCode', 'Program', 'CourseCode', 'TitleEn', 'TitleFr',
                     'Instructors', 'Terms', 'Credits', 'Year', 'CourseURL', 'ProgramURL']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_courses)
    
    print(f"\nFile saved: {output_file}")
    print(f"Total rows: {len(all_courses)}")


if __name__ == "__main__":
    main()
