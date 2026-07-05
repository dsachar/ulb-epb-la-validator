#!/usr/bin/env python3
"""
ULB Course Data Scraper - Version 2
Enhanced scraper that extracts:
- Program codes (MA-IREM, MA-IRIF, etc.)
- Course URLs
- French course titles

Usage:
    python3 scrape_ulb_courses_v2.py

Requirements:
    - selenium
    - beautifulsoup4
    - webdriver-manager
    - requests
"""

import csv
import time
import re
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


def get_course_url(course_code):
    """Convert course code to course URL."""
    # Course codes are structured like: ARCH-H400, PHYS-H518, etc.
    # URL format: https://www.ulb.be/en/programme/{course_code_lowercase}
    if course_code:
        course_url_code = course_code.lower()
        return f"https://www.ulb.be/en/programme/{course_url_code}"
    return ""


def get_french_title(course_code, driver):
    """Fetch the French title of a course."""
    if not course_code:
        return ""
    
    try:
        # Convert to French URL
        french_url = f"https://www.ulb.be/fr/programme/{course_code.lower()}"
        
        # Load the French page
        driver.get(french_url)
        time.sleep(1)
        
        # Parse the page
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Look for the course title (usually in h1 or main content area)
        # Try to find title in various places
        h1 = soup.find('h1')
        if h1:
            title = h1.get_text().strip()
            # Remove the course code if it's at the beginning
            title = re.sub(rf'^{course_code}\s*-?\s*', '', title, flags=re.I)
            return title[:150]  # Limit to 150 characters
        
        # Fallback: look in main content
        main = soup.find('main') or soup.find('div', id='body')
        if main:
            text = main.get_text()
            lines = text.split('\n')
            for line in lines:
                line = line.strip()
                if line and len(line) > 20 and len(line) < 200:
                    return line
        
        return ""
    
    except Exception as e:
        print(f"  Warning: Could not fetch French title for {course_code}: {e}")
        return ""


def extract_courses_from_page(soup, program_name, program_code, url, driver):
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
            
            # Find title (usually after course code)
            title_en = ""
            terms = ""
            instructors = ""
            credits = ""
            
            for i, line in enumerate(lines):
                line = line.strip()
                
                # Extract terms
                if any(term in line.lower() for term in ['first term', 'second term', 'academic year', 'q1', 'q2', 'annual']):
                    terms = line
                
                # Extract ECTS/credits
                if 'ECTS' in line or 'ects' in line:
                    credits_match = re.search(r'(\d+)\s*ECTS', line)
                    if credits_match:
                        credits = credits_match.group(1)
                
                # Extract instructors (names with capital letters)
                if any(part in line for part in ['Prof', 'Dr', 'Mr', 'Ms']):
                    instructors = line[:100]
            
            # Look for title in h3 or h4 tags within the div
            for heading in div.find_all(['h3', 'h4']):
                heading_text = heading.get_text().strip()
                if course_code not in heading_text:
                    title_en = heading_text
                    break
            
            # If no title found, use first non-code line with sufficient length
            if not title_en:
                for line in lines:
                    line = line.strip()
                    if line and len(line) > 10 and course_code not in line:
                        title_en = line[:100]
                        break
            
            # Generate course URL and fetch French title
            course_url = get_course_url(course_code)
            title_fr = get_french_title(course_code, driver)
            
            course = {
                'ProgramCode': program_code,
                'Program': program_name,
                'CourseCode': course_code,
                'TitleEn': title_en or terms,
                'TitleFr': title_fr,
                'Instructors': instructors,
                'Terms': terms,
                'Credits': credits,
                'Year': '',
                'CourseURL': course_url,
                'ProgramURL': url
            }
            
            courses.append(course)
        
        except Exception as e:
            print(f"    Error extracting course: {e}")
            continue
    
    return courses


def scrape_program_page(url, program_name, program_code, driver):
    """Load a program page and extract all courses."""
    print(f"  Scraping: {program_name} ({program_code})")
    
    courses = []
    
    try:
        # Load the page
        driver.get(url)
        
        # Wait for page to load (JavaScript rendering)
        time.sleep(3)
        
        # Parse the rendered HTML
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Extract courses
        extracted = extract_courses_from_page(soup, program_name, program_code, url, driver)
        courses.extend(extracted)
        
        print(f"    ✓ Extracted {len(extracted)} courses")
    
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    return courses


def main():
    """Main function to scrape all ULB programs."""
    print("=" * 80)
    print("ULB COURSE SCRAPER - VERSION 2")
    print("(With Program Codes, Course URLs, and French Titles)")
    print("=" * 80)
    
    all_courses = []
    driver = setup_driver()
    
    try:
        total_urls = sum(len(config['urls']) for config in PROGRAMS.values())
        processed = 0
        
        for program_name, config in PROGRAMS.items():
            program_code = config['code']
            print(f"\n{program_name} ({program_code}) - {config['credits']} ECTS")
            
            for url in config['urls']:
                processed += 1
                print(f"  [{processed}/{total_urls}]", end=" ")
                
                courses = scrape_program_page(url, program_name, program_code, driver)
                all_courses.extend(courses)
                
                # Be nice to the server
                time.sleep(2)
    
    finally:
        driver.quit()
    
    # Remove duplicates (same program + same course code)
    unique_courses = []
    seen = set()
    
    for course in all_courses:
        key = (course['ProgramCode'], course['CourseCode'])
        if key not in seen:
            seen.add(key)
            unique_courses.append(course)
    
    # Write to CSV
    output_file = 'ulb_courses_enhanced.csv'
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
    print(f"Total courses extracted: {len(unique_courses)}")
    print(f"File saved: {output_file}")
    
    # Statistics
    programs = {}
    for course in unique_courses:
        prog = course['Program']
        programs[prog] = programs.get(prog, 0) + 1
    
    print(f"Programs: {len(programs)}")
    
    # Check for French titles
    french_count = sum(1 for c in unique_courses if c.get('TitleFr', '').strip())
    print(f"Courses with French titles: {french_count}/{len(unique_courses)}")
    
    print("\nTop 5 programs by course count:")
    for prog, count in sorted(programs.items(), key=lambda x: x[1], reverse=True)[:5]:
        code = next(c['ProgramCode'] for c in unique_courses if c['Program'] == prog)
        print(f"  • {code}: {prog} ({count} courses)")


if __name__ == "__main__":
    main()
