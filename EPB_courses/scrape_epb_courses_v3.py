#!/usr/bin/env python3
"""
ULB Course Data Scraper - Version 3 (Optimized)
Extracts complete course information including:
- Program codes (MA-IREM, MA-IRIF, etc.)
- Course URLs
- French course titles (fetched in parallel for speed)

Usage:
    python3 scrape_ulb_courses_v3.py

Requirements:
    - selenium
    - beautifulsoup4
    - webdriver-manager
"""

import csv
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


# Configuration: All ULB programs and their URLs
PROGRAMS = {
    # 120 credits Masters
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
    # 60 credits Masters
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
    # 180 credits Bachelors
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

# Thread-safe cache for French titles
french_titles_cache = {}
cache_lock = threading.Lock()


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


def get_french_title(course_code):
    """Fetch the French title of a course using a dedicated driver."""
    if not course_code:
        return ""
    
    # Check cache first
    with cache_lock:
        if course_code in french_titles_cache:
            return french_titles_cache[course_code]
    
    driver = setup_driver()
    try:
        french_url = f"https://www.ulb.be/fr/programme/{course_code.lower()}"
        driver.get(french_url)
        time.sleep(0.5)
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Look for the course title in h1 or main content
        h1 = soup.find('h1')
        if h1:
            title = h1.get_text().strip()
            # Remove course code prefix if present
            title = re.sub(rf'^{course_code}\s*-?\s*', '', title, flags=re.I)
            title = title[:150]  # Limit length
            
            # Cache it
            with cache_lock:
                french_titles_cache[course_code] = title
            return title
        
        # Fallback: return empty
        with cache_lock:
            french_titles_cache[course_code] = ""
        return ""
    
    except Exception as e:
        # On error, cache empty string
        with cache_lock:
            french_titles_cache[course_code] = ""
        return ""
    
    finally:
        driver.quit()


def extract_courses_from_page(soup, program_name, program_code, url):
    """Extract course information from parsed HTML."""
    courses = []
    
    # Find all divs that might contain course information
    course_divs = soup.find_all('div', id=re.compile(r'prg-.*', re.I))
    
    for div in course_divs:
        try:
            text = div.get_text()
            
            # Extract course code (pattern: XXXX-HYYY or similar)
            code_match = re.search(r'([A-Z]{2,4}-[A-Z]?\d{3,4})', text)
            if not code_match:
                continue
            
            course_code = code_match.group(1)
            
            # Extract other information from the div text
            lines = text.split('\n')
            
            # Initialize fields
            title_en = ""
            terms = ""
            instructors = ""
            credits = ""
            
            for line in lines:
                line = line.strip()
                
                # Extract terms
                if any(term in line.lower() for term in ['first term', 'second term', 'academic year', 'q1', 'q2', 'annual']):
                    terms = line
                
                # Extract ECTS/credits
                if 'ECTS' in line or 'ects' in line:
                    credits_match = re.search(r'(\d+)\s*ECTS', line)
                    if credits_match:
                        credits = credits_match.group(1)
                
                # Extract instructors
                if any(part in line for part in ['Prof', 'Dr', 'Mr', 'Ms']):
                    instructors = line[:100]
            
            # Look for title in h3/h4 tags
            for heading in div.find_all(['h3', 'h4']):
                heading_text = heading.get_text().strip()
                if course_code not in heading_text:
                    title_en = heading_text
                    break
            
            # Fallback: first non-code line with sufficient length
            if not title_en:
                for line in lines:
                    line = line.strip()
                    if line and len(line) > 10 and course_code not in line:
                        title_en = line[:100]
                        break
            
            # Build course URL
            course_url = f"https://www.ulb.be/en/programme/{course_code.lower()}"
            
            course = {
                'ProgramCode': program_code,
                'Program': program_name,
                'CourseCode': course_code,
                'TitleEn': title_en or terms,
                'TitleFr': '',  # Will be filled later in parallel
                'Instructors': instructors,
                'Terms': terms,
                'Credits': credits,
                'Year': '',
                'CourseURL': course_url,
                'ProgramURL': url
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
    print("ULB COURSE SCRAPER - VERSION 3 (OPTIMIZED)")
    print("With Program Codes, Course URLs, and French Titles")
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
    
    # PHASE 2: Fetch French titles in parallel
    print("\nPHASE 2: Fetching French titles in parallel...")
    print(f"  Using 8 parallel threads...")
    
    course_codes = list(set(c['CourseCode'] for c in unique_courses))
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(get_french_title, code): code for code in course_codes}
        
        completed = 0
        for future in as_completed(futures):
            completed += 1
            if completed % 50 == 0:
                print(f"  Progress: {completed}/{len(course_codes)} course titles fetched")
            try:
                future.result()
            except Exception as e:
                pass
    
    # Fill in French titles from cache
    for course in unique_courses:
        course_code = course['CourseCode']
        with cache_lock:
            course['TitleFr'] = french_titles_cache.get(course_code, '')
    
    french_count = sum(1 for c in unique_courses if c['TitleFr'].strip())
    print(f"  Completed! French titles found: {french_count}/{len(unique_courses)}")
    
    # Write to CSV
    output_file = 'ulb_courses.csv'
    fieldnames = ['ProgramCode', 'Program', 'CourseCode', 'TitleEn', 'TitleFr', 
                  'Instructors', 'Terms', 'Credits', 'Year', 'CourseURL', 'ProgramURL']
    
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(unique_courses)
    
    # Print summary
    print("\n" + "=" * 80)
    print("EXTRACTION COMPLETE")
    print("=" * 80)
    print(f"Total courses: {len(unique_courses)}")
    print(f"File saved: {output_file}")
    
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
