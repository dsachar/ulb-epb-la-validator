#!/usr/bin/env python3
"""
ULB Course Data Scraper - Version 4 (Final)
Improved French title extraction with fallback logic

Features:
- Filters out cookie notices and invalid content
- Falls back to English title if French extraction fails
- Better HTML parsing for course titles
- Validates extracted titles for quality
"""

import csv
import urllib.request
import time
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from bs4 import BeautifulSoup


PROGRAMS = {
    "Electromechanical Engineering": {
        "code": "MA-IREM",
        "credits": 120,
        "in_epb": True,
        "urls": [
            "https://www.ulb.be/en/programme/ma-irem",
            "https://www.ulb.be/en/programme/m-iremr",
            "https://www.ulb.be/en/programme/m-iremi"
        ]
    },
    "Computer Science and Engineering (Professional)": {
        "code": "MA-IRIF",
        "credits": 120,
        "in_epb": True,
        "urls": [
            "https://www.ulb.be/en/programme/ma-irif",
            "https://www.ulb.be/en/programme/m-irifs"
        ]
    },
    "Architecture and Engineering": {
        "code": "MA-IRAR",
        "credits": 120,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ma-irar"]
    },
    "Biomedical Engineering": {
        "code": "MA-IRCB",
        "credits": 120,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ma-ircb"]
    },
    "Civil Engineering": {
        "code": "MA-IRCN",
        "credits": 120,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ma-ircn"]
    },
    "Chemical and Materials Engineering": {
        "code": "MA-IRMA",
        "credits": 120,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ma-irma"]
    },
    "Physical Engineering": {
        "code": "MA-IRPH",
        "credits": 120,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ma-irph"]
    },
    "Electrical Engineering": {
        "code": "MA-IREL",
        "credits": 120,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ma-irel"]
    },
    "Nuclear engineering": {
        "code": "MS-NUAP",
        "credits": 60,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ms-nuap"]
    },
    "Heritage, conservation and restoration": {
        "code": "MS-GEPC",
        "credits": 60,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ms-gepc"]
    },
    "Nanotechnology": {
        "code": "MS-NATE",
        "credits": 60,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ms-nate"]
    },
    "Transition urbanism and regional planning": {
        "code": "MS-URDE",
        "credits": 60,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ms-urde"]
    },
    "Data Science, Big Data": {
        "code": "MS-BGDA",
        "credits": 60,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ms-bgda"]
    },
    "Bachelor in engineering sciences": {
        "code": "BA-IRCI",
        "credits": 180,
        "in_epb": True,
        "urls": [
            "https://www.ulb.be/en/programme/ba-irci",
            "https://www.ulb.be/en/programme/ba-ircib",
            "https://www.ulb.be/en/programme/ba-ircic"
        ]
    },
    "Bachelor in engineering: architecture": {
        "code": "BA-IRAR",
        "credits": 180,
        "in_epb": True,
        "urls": ["https://www.ulb.be/en/programme/ba-irar"]
    },
    "Computer Science and Engineering (Research/International)": {
        "code": "M-IRIFI",
        "credits": 120,
        "in_epb": False,
        "urls": ["https://www.ulb.be/en/programme/m-irifi"]
    },
    "Master in Cybersecurity (Research)": {
        "code": "M-SECUC",
        "credits": 120,
        "in_epb": False,
        "urls": ["https://www.ulb.be/en/programme/m-secuc"]
    },
    "Master in Cybersecurity (Professional)": {
        "code": "M-SECUM",
        "credits": 120,
        "in_epb": False,
        "urls": ["https://www.ulb.be/en/programme/m-secum"]
    }
}

french_titles_cache = {}
cache_lock = threading.Lock()

# Invalid content patterns to filter out
INVALID_PATTERNS = [
    "Ce site utilise des cookies",
    "cookie",
    "consentement",
    "accepter",
    "refused",
    "refuser",
    "vous acceptez",
    "vous refusez",
    "lire la",
    "politique de"
]


def setup_driver():
    """Configure and return a Selenium WebDriver instance."""
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    return driver


def is_valid_title(title):
    """Check if extracted title is valid (not cookie notice or spam)."""
    if not title or len(title) < 3:
        return False
    
    # Check for invalid patterns (case-insensitive)
    title_lower = title.lower()
    for pattern in INVALID_PATTERNS:
        if pattern.lower() in title_lower:
            return False
    
    # Check if it's mostly meaningful (contains letters and words)
    word_count = len(title.split())
    if word_count < 2:
        return False
    
    return True


def get_french_title(course_code, english_title):
    """
    Fetch the French title of a course with smart fallback logic using static urllib.
    
    Returns: French title if found and valid, otherwise returns English title
    """
    if not course_code:
        return english_title
    
    # Check cache first
    with cache_lock:
        if course_code in french_titles_cache:
            cached_title = french_titles_cache[course_code]
            if cached_title == "USE_ENGLISH":
                return english_title
            return cached_title
    
    try:
        french_url = f"https://www.ulb.be/fr/programme/{course_code.lower()}"
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        req = urllib.request.Request(french_url, headers=headers)
        
        with urllib.request.urlopen(req, timeout=5) as response:
            html = response.read()
            soup = BeautifulSoup(html, 'html.parser')
            
        french_title = None
        
        # Method 1: Look for h1 tag (most reliable)
        h1 = soup.find('h1')
        if h1:
            title_text = h1.get_text().strip()
            title_text = re.sub(rf'^{course_code}\s*-?\s*', '', title_text, flags=re.I).strip()
            if is_valid_title(title_text):
                french_title = title_text[:150]
        
        # Method 2: Look in meta description
        if not french_title:
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            if meta_desc and meta_desc.get('content'):
                title_text = meta_desc['content'].strip()
                if is_valid_title(title_text):
                    french_title = title_text[:150]
        
        # Method 3: Look for other title-like elements
        if not french_title:
            for selector in ['h2', 'h3', '[role="heading"]']:
                elements = soup.select(selector)
                for elem in elements[:3]:
                    title_text = elem.get_text().strip()
                    title_text = re.sub(rf'^{course_code}\s*-?\s*', '', title_text, flags=re.I).strip()
                    if is_valid_title(title_text) and len(title_text) > 10:
                        french_title = title_text[:150]
                        break
                if french_title:
                    break
        
        if not french_title:
            with cache_lock:
                french_titles_cache[course_code] = "USE_ENGLISH"
            return english_title
            
        with cache_lock:
            french_titles_cache[course_code] = french_title
            
        return french_title
        
    except Exception as e:
        with cache_lock:
            french_titles_cache[course_code] = "USE_ENGLISH"
        return english_title


def extract_courses_from_page(soup, program_name, program_code, url):
    """Extract course information from parsed HTML using CSS class targeted extraction."""
    courses = []
    
    # Find all divs representing courses
    course_divs = soup.find_all('div', class_='prg-coursContent')
    
    for div in course_divs:
        try:
            # 1. Course Code
            code_elem = div.find('div', class_='prg-coursMnemonique')
            if not code_elem:
                continue
            course_code = code_elem.get_text().strip()
            
            # 2. Term
            term_elem = div.find('span', class_='prg-coursQuadrimestreCarte')
            terms = term_elem.get_text().strip() if term_elem else ""
            
            # 3. Title
            title_elem = div.find('div', class_='prg-coursIntitule')
            title_en = ""
            if title_elem:
                a_elem = title_elem.find('a')
                title_en = a_elem.get_text().strip() if a_elem else title_elem.get_text().strip()
            
            if not title_en:
                continue
                
            # 4. Instructors
            inst_elem = div.find('div', class_='prg-coursTitulaires')
            instructors = inst_elem.get_text().strip() if inst_elem else ""
            
            # 5. Credits
            credits_elem = div.find('div', class_='prg-coursCredits')
            credits = ""
            if credits_elem:
                txt = credits_elem.get_text()
                match = re.search(r'(\d+)\s*(?:credits|credit|ECTS|ects)', txt, re.I)
                if match:
                    credits = match.group(1)
            
            course_url = f"https://www.ulb.be/en/programme/{course_code.lower()}"
            
            # Check if this program is in EPB
            prog_info = PROGRAMS.get(program_name, {})
            in_epb_val = "True" if prog_info.get("in_epb", True) else "False"
            
            course = {
                'ProgramCode': program_code,
                'Program': program_name,
                'CourseCode': course_code,
                'TitleEn': title_en,
                'TitleFr': '',  # Will be filled later in parallel
                'Instructors': instructors,
                'Terms': terms,
                'Credits': credits,
                'Year': '',
                'CourseURL': course_url,
                'ProgramURL': url,
                'Eligible': in_epb_val
            }
            
            courses.append(course)
        
        except Exception as e:
            continue
    return courses



def scrape_program_page(url, program_name, program_code, driver):
    """Load a program page and extract all courses."""
    courses = []
    
    try:
        driver.get(url)
        time.sleep(3)
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        extracted = extract_courses_from_page(soup, program_name, program_code, url)
        courses.extend(extracted)
    
    except Exception as e:
        print(f"    Error scraping {program_name}: {e}")
    
    return courses


def main():
    """Main function to scrape all ULB programs."""
    print("=" * 80)
    print("ULB COURSE SCRAPER - VERSION 4 (FINAL)")
    print("With Smart French Title Extraction & Fallback Logic")
    print("=" * 80)
    
    # PHASE 1: Extract all courses from program pages
    print("\nPHASE 1: Extracting courses from program pages...")
    all_courses = []
    driver = setup_driver()
    
    try:
        total_urls = sum(len(config['urls']) for config in PROGRAMS.values())
        processed = 0
        
        for program_name, config in PROGRAMS.items():
            program_code = config['code']
            print(f"\n{program_name} ({program_code})")
            
            for url in config['urls']:
                processed += 1
                print(f"  [{processed}/{total_urls}] Scraping...", end=" ")
                
                courses = scrape_program_page(url, program_name, program_code, driver)
                all_courses.extend(courses)
                print(f"✓ {len(courses)} courses")
                
                time.sleep(2)
    
    finally:
        driver.quit()
    
    # Remove duplicates
    unique_courses = []
    seen = set()
    
    for course in all_courses:
        key = (course['ProgramCode'], course['CourseCode'])
        if key not in seen:
            seen.add(key)
            unique_courses.append(course)
    
    print(f"\nTotal unique courses extracted: {len(unique_courses)}")
    
    # PHASE 2: Fetch French titles in parallel with smart fallback
    print("\nPHASE 2: Fetching French titles (with smart fallback)...")
    print(f"  Using 8 parallel threads...")
    
    # Create list of (course_code, english_title) tuples
    course_data = [(c['CourseCode'], c['TitleEn']) for c in unique_courses]
    unique_course_data = list(set(course_data))
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(get_french_title, code, en_title): code 
            for code, en_title in unique_course_data
        }
        
        completed = 0
        for future in as_completed(futures):
            completed += 1
            if completed % 50 == 0:
                print(f"  Progress: {completed}/{len(unique_course_data)} titles processed")
            try:
                future.result()
            except Exception as e:
                pass
    
    # Fill in French titles from cache or fallback to English
    for course in unique_courses:
        course_code = course['CourseCode']
        english_title = course['TitleEn']
        
        with cache_lock:
            cached = french_titles_cache.get(course_code)
        
        if cached and cached != "USE_ENGLISH":
            course['TitleFr'] = cached
        else:
            # Use English title as fallback
            course['TitleFr'] = english_title
    
    french_unique = sum(1 for c in unique_courses if c['TitleFr'] != c['TitleEn'])
    print(f"  Completed! Unique French titles: {french_unique}/{len(unique_courses)}")
    
    # Write to CSV
    output_file = 'EPB_courses/epb_courses.csv'
    fieldnames = ['ProgramCode', 'Program', 'CourseCode', 'TitleEn', 'TitleFr', 
                  'Instructors', 'Terms', 'Credits', 'Year', 'CourseURL', 'ProgramURL', 'Eligible']
    
    import os
    existing_courses = {}
    if os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    key = (row.get('ProgramCode', ''), row.get('CourseCode', ''))
                    existing_courses[key] = row
        except Exception as e:
            print(f"Warning: Could not read existing CSV for comparison: {e}")

    differences = []
    new_keys = set((c['ProgramCode'], c['CourseCode']) for c in unique_courses)
    existing_keys = set(existing_courses.keys())
    
    added = new_keys - existing_keys
    for key in sorted(added):
        differences.append(f"ADDED: Course {key[1]} under program {key[0]}")
        
    removed = existing_keys - new_keys
    for key in sorted(removed):
        differences.append(f"REMOVED: Course {key[1]} under program {key[0]}")
        
    common_keys = new_keys & existing_keys
    fields_to_compare = ['TitleEn', 'TitleFr', 'Credits', 'Terms', 'Instructors', 'Eligible']
    new_courses_dict = {(c['ProgramCode'], c['CourseCode']): c for c in unique_courses}
    
    for key in sorted(common_keys):
        new_c = new_courses_dict[key]
        old_c = existing_courses[key]
        changes = []
        for field in fields_to_compare:
            new_val = str(new_c.get(field, '')).strip()
            old_val = str(old_c.get(field, '')).strip()
            # Normalize whitespace/newlines for comparison
            new_norm = " ".join(new_val.split())
            old_norm = " ".join(old_val.split())
            if new_norm != old_norm:
                changes.append(f"{field}: '{old_val}' -> '{new_val}'")
        if changes:
            differences.append(f"MODIFIED: Course {key[1]} under program {key[0]}:\n    " + "\n    ".join(changes))
            
    if differences:
        print("\n" + "!" * 80)
        print("CRITICAL: SCRAPED METADATA DIFFERS FROM THE CLEAN CSV!")
        print("!" * 80)
        print(f"Found {len(differences)} difference(s):")
        for diff in differences[:15]:
            print(f"  • {diff}")
        if len(differences) > 15:
            print(f"  • ... and {len(differences) - 15} more differences.")
        
        # Save to temporary file instead of overwriting
        diff_file = 'EPB_courses/epb_courses_new.csv'
        with open(diff_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()
            writer.writerows(unique_courses)
        print("\nTo prevent overwriting the clean CSV, the new scraped data was saved to:")
        print(f"  --> {diff_file}")
        print("Please review the differences and manually update the clean CSV if needed.")
        print("!" * 80 + "\n")
        raise ValueError("Scrape validation failed: new metadata differs from the clean CSV.")
    else:
        # No differences, safe to update/overwrite the clean CSV
        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()
            writer.writerows(unique_courses)
        print(f"No differences found. Clean CSV updated successfully: {output_file}")
    
    # Print summary
    print("\n" + "=" * 80)
    print("EXTRACTION COMPLETE")
    print("=" * 80)
    print(f"Total courses: {len(unique_courses)}")
    print(f"File saved: {output_file}")
    print(f"Unique French titles: {french_unique}")
    print(f"Fallback to English: {len(unique_courses) - french_unique}")
    
    # Statistics by program
    programs = {}
    for course in unique_courses:
        prog = f"{course['ProgramCode']}: {course['Program']}"
        programs[prog] = programs.get(prog, 0) + 1
    
    print(f"\nCourses by Program:")
    for prog in sorted(programs.keys()):
        print(f"  • {prog:<60} {programs[prog]:>4} courses")


if __name__ == "__main__":
    main()
