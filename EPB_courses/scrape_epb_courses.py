#!/usr/bin/env python3
"""
ULB Course Data Scraper
Extracts course information from ULB (Université libre de Bruxelles) program pages
using Selenium for JavaScript rendering and BeautifulSoup for HTML parsing.

Usage:
    python3 scrape_ulb_courses.py

Requirements:
    - selenium
    - beautifulsoup4
    - webdriver-manager
    - requests

Install with: pip install selenium beautifulsoup4 webdriver-manager requests
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
        "credits": 120,
        "urls": [
            "https://www.ulb.be/en/programme/ma-irem",
            "https://www.ulb.be/en/programme/m-iremr",
            "https://www.ulb.be/en/programme/m-iremi"
        ]
    },
    "Computer Science and Engineering (Professional)": {
        "credits": 120,
        "urls": [
            "https://www.ulb.be/en/programme/ma-irif",
            "https://www.ulb.be/en/programme/m-irifs"
        ]
    },
    "Architecture and Engineering": {
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-irar"]
    },
    "Biomedical Engineering": {
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-ircb"]
    },
    "Civil Engineering": {
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-ircn"]
    },
    "Chemical and Materials Engineering": {
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-irma"]
    },
    "Physical Engineering": {
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-irph"]
    },
    "Electrical Engineering": {
        "credits": 120,
        "urls": ["https://www.ulb.be/en/programme/ma-irel"]
    },
    # 60 credits Masters
    "Nuclear engineering": {
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-nuap"]
    },
    "Heritage, conservation and restoration": {
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-gepc"]
    },
    "Nanotechnology": {
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-nate"]
    },
    "Transition urbanism and regional planning": {
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-urde"]
    },
    "Data Science, Big Data": {
        "credits": 60,
        "urls": ["https://www.ulb.be/en/programme/ms-bgda"]
    },
    # 180 credits Bachelors
    "Bachelor in engineering sciences": {
        "credits": 180,
        "urls": [
            "https://www.ulb.be/en/programme/ba-irci",
            "https://www.ulb.be/en/programme/ba-ircib",
            "https://www.ulb.be/en/programme/ba-ircic"
        ]
    },
    "Bachelor in engineering: architecture": {
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


def extract_courses_from_page(soup, program_name, url):
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
            title = ""
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
                    title = heading_text
                    break
            
            # If no title found, use first non-code line with sufficient length
            if not title:
                for line in lines:
                    line = line.strip()
                    if line and len(line) > 10 and course_code not in line:
                        title = line[:100]
                        break
            
            course = {
                'Program': program_name,
                'CourseCode': course_code,
                'TitleEn': title or terms,
                'TitleFr': '',
                'Instructors': instructors,
                'Terms': terms,
                'Credits': credits,
                'Year': '',
                'URL': url
            }
            
            courses.append(course)
        
        except Exception as e:
            print(f"  Error extracting course: {e}")
            continue
    
    return courses


def scrape_program_page(url, program_name, driver):
    """Load a program page and extract all courses."""
    print(f"  Scraping: {program_name}")
    print(f"  URL: {url}")
    
    courses = []
    
    try:
        # Load the page
        driver.get(url)
        
        # Wait for page to load (JavaScript rendering)
        time.sleep(3)
        
        # Parse the rendered HTML
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        # Extract courses
        extracted = extract_courses_from_page(soup, program_name, url)
        courses.extend(extracted)
        
        print(f"  ✓ Extracted {len(extracted)} courses")
    
    except Exception as e:
        print(f"  ✗ Error: {e}")
    
    return courses


def main():
    """Main function to scrape all ULB programs."""
    print("=" * 70)
    print("ULB COURSE SCRAPER")
    print("=" * 70)
    
    all_courses = []
    driver = setup_driver()
    
    try:
        total_urls = sum(len(config['urls']) for config in PROGRAMS.values())
        processed = 0
        
        for program_name, config in PROGRAMS.items():
            print(f"\n{program_name} ({config['credits']} ECTS)")
            
            for url in config['urls']:
                processed += 1
                print(f"  [{processed}/{total_urls}]", end=" ")
                
                courses = scrape_program_page(url, program_name, driver)
                all_courses.extend(courses)
                
                # Be nice to the server
                time.sleep(2)
    
    finally:
        driver.quit()
    
    # Remove duplicates (same program + same course code)
    unique_courses = []
    seen = set()
    
    for course in all_courses:
        key = (course['Program'], course['CourseCode'])
        if key not in seen:
            seen.add(key)
            unique_courses.append(course)
    
    # Write to CSV
    output_file = 'ulb_courses.csv'
    fieldnames = ['Program', 'CourseCode', 'TitleEn', 'TitleFr', 'Instructors', 'Terms', 'Credits', 'Year', 'URL']
    
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(unique_courses)
    
    # Print summary
    print("\n" + "=" * 70)
    print("EXTRACTION COMPLETE")
    print("=" * 70)
    print(f"Total courses extracted: {len(unique_courses)}")
    print(f"File saved: {output_file}")
    
    # Statistics
    programs = {}
    for course in unique_courses:
        prog = course['Program']
        programs[prog] = programs.get(prog, 0) + 1
    
    print(f"Programs: {len(programs)}")
    print("\nTop 5 programs by course count:")
    for prog, count in sorted(programs.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  • {prog}: {count}")


if __name__ == "__main__":
    main()
