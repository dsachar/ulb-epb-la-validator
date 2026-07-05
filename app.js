// ULB EPB Incoming Learning Agreement Validator App Logic

// Configure PDF.js worker
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Application State
let appState = {
  courses: [],
  metadata: { studentName: '', sendingInstitution: '', mobilityPeriod: '' },
  mobilityContext: 'semester-1', // 'semester-1', 'semester-2', 'full-year', 'double-diploma'
  rules: [
    {
      id: 'rule-builtin-term-ects',
      name: 'Rule 1: Credits per Term',
      type: 'term_ects',
      builtin: true,
      description: 'At least 21 ECTS per term (30 recommended for single-term mobility)'
    },
    {
      id: 'rule-builtin-dd-compliance',
      name: 'Rule 1: Program Compliance',
      type: 'dd_compliance',
      builtin: true,
      description: 'Comply with standard program rules (typically 60 ECTS per year)'
    },
    {
      id: 'rule-builtin-60-percent',
      name: 'Rule 2: 60% EPB Course Origin',
      type: 'epb_60_percent',
      builtin: true,
      description: 'At least 60% of all credits must be selected from official EPB programs'
    },
    {
      id: 'rule-builtin-dd-core-only',
      name: 'Rule 2: Core Master Modules Only',
      type: 'dd_core_only',
      builtin: true,
      description: 'Double Degree students must select courses exclusively from 120-credit Master programs'
    },
    {
      id: 'rule-builtin-prior-permission',
      name: 'Rule 3: Prior Permission / Exclusions',
      type: 'prior_permission',
      builtin: true,
      description: 'Prior approval is required for 60-credit Master courses or courses from other faculties'
    },
    {
      id: 'rule-builtin-majority-120',
      name: 'Rule 4: Majority Core Master Courses',
      type: 'majority_120',
      builtin: true,
      description: 'Master students must select a majority (>50%) of credits within one of the eight core 120-credit Master programs'
    },
    {
      id: 'rule-builtin-no-internship',
      name: 'Rule 6: No Internships',
      type: 'no_internship',
      builtin: true,
      description: 'Internships STAG-H501 and STAG-H502 are not allowed'
    },
    {
      id: 'rule-builtin-project-limits',
      name: 'Rule 7: Project Limitations',
      type: 'project_limits',
      builtin: true,
      description: 'PROJ-H417 is prohibited. PROJ-H418 requires C1 French and full-year stay'
    },
    {
      id: 'rule-builtin-dd-thesis',
      name: 'Rule 8: Master Thesis',
      type: 'dd_thesis',
      builtin: true,
      description: 'Double Degree students typically must complete a Master Thesis or Project'
    },
    {
      id: 'rule-builtin-no-ineligible',
      name: 'No Ineligible Courses',
      type: 'no_ineligible',
      builtin: true,
      description: 'All courses must belong to at least one eligible EPB program. A course shared between an eligible and an ineligible program is considered eligible.'
    }
  ]
};

// UI Element Refs
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusIndicator = document.getElementById('upload-status-message');
const coursesTbody = document.getElementById('courses-tbody');
const totalCoursesCount = document.getElementById('total-courses-count');
const totalEctsCount = document.getElementById('total-ects-count');
const resultsGrid = document.getElementById('results-grid');
const rulesContainer = document.getElementById('rules-container');
const mobilityContextSelect = document.getElementById('mobility-context-select');
const btnClearCourses = document.getElementById('btn-clear-courses');

let ulbCoursesDatabase = [];

function parseCSV(text) {
  const data = [];
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      currentRow.push(currentField.trim());
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];
  
  const headers = rows[0].map(h => h.replace(/^"|"$/g, '').trim());
  
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (cols.length === 1 && cols[0] === '') continue;
    
    if (cols.length >= headers.length) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx].replace(/^"|"$/g, '').trim();
      });
      data.push(row);
    }
  }
  return data;
}

async function loadUlbCoursesDatabase() {
  try {
    const response = await fetch('EPB_courses/epb_courses.csv');
    if (response.ok) {
      const text = await response.text();
      ulbCoursesDatabase = parseCSV(text);
      console.log(`Loaded ${ulbCoursesDatabase.length} ULB courses from CSV.`);
      updateAppView();
    }
  } catch (error) {
    console.error("Error loading ULB courses CSV:", error);
  }
}

// Resolve course status from DB lookup results
// 'verified'    = found in CSV with Eligible=True
// 'ineligible'  = found in CSV but only Eligible=False (in EPB but not eligible program)
// 'not-in-epb'  = not found in CSV at all
function resolveStatus(dbMatches, epbMatch) {
  if (dbMatches.length === 0) return 'not-in-epb';
  if (epbMatch) return 'verified';
  return 'ineligible';
}

function isRuleApplicable(rule, context) {
  const isDD = context === 'double-diploma';
  const isExchange = !isDD;
  
  if (rule.id === 'rule-builtin-dd-compliance' || rule.id === 'rule-builtin-dd-core-only' || rule.id === 'rule-builtin-dd-thesis') {
    return isDD;
  }
  if (rule.id === 'rule-builtin-term-ects' || rule.id === 'rule-builtin-60-percent' || rule.id === 'rule-builtin-majority-120' || rule.id === 'rule-builtin-no-internship' || rule.id === 'rule-builtin-project-limits') {
    return isExchange;
  }
  return true;
}

// Helper to resolve the best program code attribution when a course belongs to multiple programs
function resolveProgramCode(courseCode, currentCourseId, eligibleSet) {
  const dbMatches = ulbCoursesDatabase.filter(x => x.CourseCode.toUpperCase() === courseCode.toUpperCase());
  if (dbMatches.length === 0) return null;
  
  const matchCodes = dbMatches.map(m => m.ProgramCode);
  
  // Find which matches are eligible based on the Eligible flag or the eligible set
  let eligibleMatches = dbMatches.filter(m => {
    if (m.Eligible !== undefined) {
      return m.Eligible === 'True';
    }
    return eligibleSet.has(m.ProgramCode);
  });
  
  if (eligibleMatches.length > 0) {
    // Priority: if any eligible match is a core master program (starts with MA-IR), prioritize those
    const coreMasterMatches = eligibleMatches.filter(m => m.ProgramCode.toUpperCase().startsWith('MA-IR'));
    if (coreMasterMatches.length > 0) {
      eligibleMatches = coreMasterMatches;
    }

    let bestMatch = eligibleMatches[0];
    let maxCoincidences = -1;
    
    eligibleMatches.forEach(m => {
      let coincidences = 0;
      appState.courses.forEach(otherC => {
        if (otherC.id !== currentCourseId) {
          const otherMatches = ulbCoursesDatabase.filter(x => x.CourseCode.toUpperCase() === otherC.code.toUpperCase());
          if (otherMatches.some(om => om.ProgramCode === m.ProgramCode)) {
            coincidences += (otherC.ects || 0);
          }
        }
      });
      if (coincidences > maxCoincidences) {
        maxCoincidences = coincidences;
        bestMatch = m;
      }
    });
    
    return {
      chosenCode: bestMatch.ProgramCode,
      chosenName: bestMatch.Program,
      allCodes: matchCodes,
      isEligible: true
    };
  }
  
  // If no codes are eligible, check if any matches in general start with MA-IR to prioritize
  const generalCoreMatches = dbMatches.filter(m => m.ProgramCode.toUpperCase().startsWith('MA-IR'));
  const fallbackList = generalCoreMatches.length > 0 ? generalCoreMatches : dbMatches;

  return {
    chosenCode: fallbackList[0].ProgramCode,
    chosenName: fallbackList[0].Program,
    allCodes: matchCodes,
    isEligible: false
  };
}

// On Document Load
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadUlbCoursesDatabase();
  renderRulesList();
  evaluateRules();
});

// Event Listeners Configuration
function setupEventListeners() {
  // Drag & Drop
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handlePDFUpload(files[0]);
    }
  });

  // Browse click
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handlePDFUpload(e.target.files[0]);
    }
  });



  // Collapsible Rules Toggle
  const rulesToggleHeader = document.getElementById('rules-toggle-header');
  const rulesToggleArrow = document.getElementById('rules-toggle-arrow');
  const rContainer = document.getElementById('rules-container');
  if (rulesToggleHeader && rulesToggleArrow && rContainer) {
    rulesToggleHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = rContainer.style.display === 'none';
      if (isCollapsed) {
        rContainer.style.display = 'flex';
        rulesToggleArrow.style.transform = 'rotate(0deg)';
      } else {
        rContainer.style.display = 'none';
        rulesToggleArrow.style.transform = 'rotate(180deg)';
      }
    });
  }

  // Collapsible Upload Toggle
  const uploadToggleHeader = document.getElementById('upload-toggle-header');
  const uploadToggleArrow = document.getElementById('upload-toggle-arrow');
  const uContainer = document.getElementById('upload-collapsible-content');
  if (uploadToggleHeader && uploadToggleArrow && uContainer) {
    uploadToggleHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = uContainer.style.display === 'none';
      if (isCollapsed) {
        uContainer.style.display = 'flex';
        uploadToggleArrow.style.transform = 'rotate(0deg)';
      } else {
        uContainer.style.display = 'none';
        uploadToggleArrow.style.transform = 'rotate(180deg)';
      }
    });
  }

  // Inline add course by code
  const btnAddCourseCode = document.getElementById('btn-add-course-code');
  if (btnAddCourseCode) {
    btnAddCourseCode.addEventListener('click', () => {
      const codeInput = document.getElementById('add-course-code-input');
      const code = codeInput.value.trim().toUpperCase();
      
      if (!code) {
        showToast('Please enter a course code.', 'error');
        return;
      }
      
      // Look up in database
      const dbMatches = ulbCoursesDatabase.filter(x => x.CourseCode.toUpperCase() === code);
      const epbMatch = dbMatches.find(x => x.Eligible === 'True');
      
      if (dbMatches.length > 0) {
        const match = epbMatch || dbMatches[0];
        
        // Normalize Term
        let normalizedTerm = '1st';
        const rawTerms = (match.Terms || '').toLowerCase();
        if (rawTerms.includes('second term') || rawTerms.includes('q2')) {
          normalizedTerm = '2nd';
        } else if (rawTerms.includes('first and second') || rawTerms.includes('academic year') || rawTerms.includes('annual')) {
          normalizedTerm = '1st+2nd';
        }
        
        // Parse credits
        let creditsVal = 0;
        if (match.Credits) {
          creditsVal = parseInt(match.Credits, 10) || 0;
        }
        
        const newCourse = {
          id: 'course-' + Date.now(),
          code: match.CourseCode,
          title: match.TitleEn || match.TitleFr || 'Unknown Title',
          parsedTitle: '',
          titleMismatch: false,
          courseStatus: resolveStatus(dbMatches, epbMatch),
          isUnknown: !epbMatch,
          url: match.CourseURL || `https://www.ulb.be/en/programme/${match.CourseCode.toLowerCase()}`,
          term: normalizedTerm,
          ects: creditsVal
        };
        
        appState.courses.push(newCourse);
        updateAppView();
        
        if (!epbMatch) {
          showToast(`⚠️ Course ${code} found but is not part of an eligible EPB program.`, 'error');
        } else if (!match.Credits) {
          showToast(`Course ${code} added, but ECTS is missing in database. Please enter manually in the table.`, 'info');
        } else {
          showToast(`Course ${code} added successfully!`, 'success');
        }
      } else {
        // Unknown course! Added with empty details
        const newCourse = {
          id: 'course-' + Date.now(),
          code: code,
          title: '',
          parsedTitle: '',
          titleMismatch: false,
          courseStatus: 'not-in-epb',
          isUnknown: true,
          url: `https://www.ulb.be/en/programme/${code.toLowerCase()}`,
          term: '1st',
          ects: 0
        };
        
        appState.courses.push(newCourse);
        updateAppView();
        showToast(`⚠️ Course code ${code} not found in ULB database. Added with empty title and ECTS.`, 'error');
      }
      
      codeInput.value = ''; // clear input
    });
    
    // Also trigger add course on Enter keypress
    const codeInput = document.getElementById('add-course-code-input');
    if (codeInput) {
      codeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          btnAddCourseCode.click();
        }
      });
    }
    // Mobility Type selection change
    if (mobilityContextSelect) {
      mobilityContextSelect.addEventListener('change', (e) => {
        appState.mobilityContext = e.target.value;
        updateAppView();
        showToast(`Mobility type updated: ${e.target.options[e.target.selectedIndex].text}`, 'info');
      });
    }

    // Clear Courses button
    if (btnClearCourses) {
      btnClearCourses.addEventListener('click', () => {
        appState.courses = [];
        appState.metadata = { studentName: '', sendingInstitution: '', mobilityPeriod: '' };
        renderStudentInfoBar();
        updateAppView();
        showToast('All courses and student metadata cleared.', 'info');
      });
    }
  }
}


// Fetch and load local examples
function loadExamplePDF(url) {
  setAppStatus('parsing', 'Fetching LA...');
  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error('Example LA file not found on local workspace.');
      }
      return response.arrayBuffer();
    })
    .then(arrayBuffer => {
      processPDFData(arrayBuffer);
    })
    .catch(err => {
      console.error(err);
      setAppStatus('error', 'Fetch failed');
      showToast(`Error fetching example PDF: ${err.message}. Make sure the local web server is running.`, 'error');
    });
}

// Handle PDF file upload input
function handlePDFUpload(file) {
  // Accept by MIME type OR by file extension (macOS sometimes reports empty MIME)
  const isMimePDF = file.type === 'application/pdf';
  const isExtPDF = file.name && file.name.toLowerCase().endsWith('.pdf');
  if (!isMimePDF && !isExtPDF) {
    showToast('Please upload a valid PDF file.', 'error');
    return;
  }

  setAppStatus('parsing', 'Reading LA...');
  const reader = new FileReader();
  reader.onload = function(e) {
    const arrayBuffer = e.target.result;
    processPDFData(arrayBuffer);
  };
  reader.onerror = function() {
    setAppStatus('error', 'Upload failed');
    showToast('Failed to read PDF file.', 'error');
  };
  reader.readAsArrayBuffer(file);
}

// Parse LA PDF data using PDF.js
async function processPDFData(arrayBuffer) {
  setAppStatus('parsing', 'Extracting Text...');
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let allItems = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      setAppStatus('parsing', `Reading Page ${pageNum}/${pdf.numPages}...`);
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      textContent.items.forEach(item => {
        const x = item.transform[4];
        const y = item.transform[5];
        allItems.push({
          str: item.str,
          x,
          y,
          pageNum
        });
      });
    }

    setAppStatus('parsing', 'Parsing Courses Table...');
    const parsedCourses = parsePdfDataToCourses(allItems);
    const parsedMeta   = extractLAMetadata(allItems);
    
    if (parsedCourses.length === 0) {
      setAppStatus('error', 'No courses found');
      showToast('Could not extract any Table A receiving courses from this PDF. Please check the layout, or manually add courses.', 'error');
      appState.courses = [];
      appState.metadata = { studentName: '', sendingInstitution: '', mobilityPeriod: '' };
      renderStudentInfoBar();
      updateAppView();
      return;
    }

    // Assign unique IDs, override with DB values, and detect mismatches
    appState.courses = parsedCourses.map((c, i) => {
      const dbMatches = ulbCoursesDatabase.filter(x => x.CourseCode.toUpperCase() === c.code.toUpperCase());
      const epbMatch = dbMatches.find(x => x.Eligible === 'True');
      const matchedCourse = epbMatch || dbMatches[0];

      const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

      // Always use DB title if available; fall back to parsed
      let finalTitle = c.title;
      let titleMismatch = false;
      let ectsWarning = false;
      let termWarning = false;
      let parsedTitle = c.title;
      let parsedEcts = c.ects;
      let parsedTerm = c.term;

      if (matchedCourse) {
        const dbTitle = matchedCourse.TitleEn || matchedCourse.TitleFr || '';
        finalTitle = dbTitle || c.title;

        // Title mismatch
        const pClean = clean(c.title);
        const enClean = clean(matchedCourse.TitleEn);
        const frClean = clean(matchedCourse.TitleFr);
        if (pClean && (enClean || frClean)) {
          titleMismatch = (pClean !== enClean && pClean !== frClean);
        }

        // ECTS: always use DB value; warn if parsed differed
        const dbEcts = matchedCourse.Credits ? parseInt(matchedCourse.Credits, 10) || 0 : 0;
        if (dbEcts > 0) {
          ectsWarning = c.ects > 0 && c.ects !== dbEcts;
          parsedEcts = c.ects;
          c.ects = dbEcts;
        }

        // Term: derive canonical DB term and warn if parsed differed
        const rawTerms = (matchedCourse.Terms || '').toLowerCase();
        let dbTerm = '1st';
        if (rawTerms.includes('second term') || rawTerms.includes('q2') || rawTerms.includes('2nd')) dbTerm = '2nd';
        else if (rawTerms.includes('first and second') || rawTerms.includes('academic year') || rawTerms.includes('annual') || rawTerms.includes('1st+2nd')) dbTerm = '1st+2nd';
        
        if (c.term && c.term !== '1st' && c.term !== dbTerm) {
          termWarning = true;
          parsedTerm = c.term;
          c.term = dbTerm; // use DB term
        }
      }

      return {
        id: `course-${Date.now()}-${i}`,
        code: c.code,
        title: finalTitle,
        parsedTitle,
        parsedEcts,
        parsedTerm,
        titleMismatch,
        ectsWarning,
        termWarning,
        courseStatus: resolveStatus(dbMatches, epbMatch),
        isUnknown: !epbMatch,
        url: matchedCourse && matchedCourse.CourseURL ? matchedCourse.CourseURL : `https://www.ulb.be/en/programme/${c.code.toLowerCase()}`,
        term: c.term,
        ects: c.ects
      };
    });
    appState.metadata = parsedMeta;

    // Auto-detect mobility context based on metadata and courses
    let autoContext = 'semester-1'; // default fallback
    const periodText = (parsedMeta.mobilityPeriod || '').toLowerCase();
    const has1st = parsedCourses.some(c => c.term === '1st' || c.term === '1st+2nd');
    const has2nd = parsedCourses.some(c => c.term === '2nd' || c.term === '1st+2nd');

    if (periodText.includes('full year') || periodText.includes('annual') || periodText.includes('academic year') || periodText.includes('10 months') || periodText.includes('9 months') || (has1st && has2nd)) {
      autoContext = 'full-year';
    } else if (periodText.includes('second semester') || periodText.includes('2nd semester') || periodText.includes('secondo semestre') || periodText.includes('spring') || periodText.includes('2 sem') || periodText.includes('2° sem') || periodText.includes('2º sem') || (has2nd && !has1st)) {
      autoContext = 'semester-2';
    } else {
      autoContext = 'semester-1';
    }

    appState.mobilityContext = autoContext;
    if (mobilityContextSelect) {
      mobilityContextSelect.value = autoContext;
    }

    setAppStatus('success', 'LA Parsed Successfully');
    showToast(`LA Parsed! Detected: ${autoContext === 'full-year' ? 'Full Year' : (autoContext === 'semester-2' ? '2nd Semester' : '1st Semester')}`, 'success');
    renderStudentInfoBar();
    updateAppView();

  } catch (error) {
    console.error("PDF.js Parsing Error: ", error);
    setAppStatus('error', 'Parser Failure');
    showToast('An error occurred during PDF parsing. Ensure standard PDF structure.', 'error');
  }
}

// Normalize raw term strings → '1st', '2nd', or '1st+2nd'
function normalizeTerm(raw) {
  const t = (raw || '').trim();
  if (!t) return '1st';
  // Both semesters / annual
  if (/annuel|annual|anual|annuale|ann[eé]e|academic\s*year|full.*year/i.test(t)) return '1st+2nd';
  // Second semester — check before first to avoid "primo/secondo" overlap
  if (/\b(2\s*nd|2[eè]me|2\.)\b|2[°º]\s*sem|second[oa]\s*sem|segundo\s*sem|deuxi[eè]me\s*sem|spring|printemps|fr.hling|verano|\b[QS]2\b|sem(?:estre|ester|cuatrimestre)?\s*2/i.test(t)) return '2nd';
  // First semester
  if (/\b(1\s*st|1er|1\.)\b|1[°º]\s*sem|prim[oo]\s*sem|primer\s*sem|premier\s*sem|primeiro\s*sem|autumn|herbst|oto[nñ]o|fall|automne|\b[QS]1\b|sem(?:estre|ester|cuatrimestre)?\s*1/i.test(t)) return '1st';
  // Unknown: return as-is
  return t;
}

// Extract student metadata from all PDF text items
function extractLAMetadata(allItems) {
  // Sort page-first, then top-to-bottom
  const sorted = [...allItems].sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    return b.y - a.y;
  });

  // Group items into text lines (within ±5px on same page)
  const linesByPage = {};
  sorted.forEach(item => {
    const p = item.pageNum;
    if (!linesByPage[p]) linesByPage[p] = [];
    let found = linesByPage[p].find(l => Math.abs(l.y - item.y) < 5);
    if (found) found.items.push(item);
    else linesByPage[p].push({ y: item.y, items: [item] });
  });

  // Flatten first 3 pages into ordered line strings
  const earlyLines = [];
  [1, 2, 3].forEach(p => {
    if (!linesByPage[p]) return;
    linesByPage[p].sort((a, b) => b.y - a.y);
    linesByPage[p].forEach(l => {
      l.items.sort((a, b) => a.x - b.x);
      earlyLines.push(l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim());
    });
  });

  let studentName = '';
  let sendingInstitution = '';
  let mobilityPeriod = '';
  let fromDate = '';
  let toDate = '';

  for (let i = 0; i < earlyLines.length; i++) {
    const line = earlyLines[i];
    const lc = line.toLowerCase();

    // ── Student name ──────────────────────────────────────────
    // Pattern A: Erasmus+ Digital / template: header row then data row
    if (/last name\(s\)/i.test(line) || /nom\s*\(s\).*pr[eé]nom/i.test(line)) {
      const next = (earlyLines[i + 1] || '').trim();
      if (next) {
        // next line: "LASTNAME   Firstname   date   nationality   gender"
        const parts = next.split(/\s{2,}/);
        if (parts.length >= 2) {
          studentName = toTitleCase(`${parts[1].trim()} ${parts[0].trim()}`);
        } else {
          studentName = toTitleCase(next.split(/\s/)[0]);
        }
      }
    }

    // Pattern B: Italian format: "Studente:   [ID] NAME"
    if (!studentName && /Studente:/i.test(line)) {
      const m = line.match(/Studente:\s*(?:\[\d+\])?\s*(.+)/i);
      if (m) studentName = toTitleCase(m[1].trim());
    }

    // Pattern C: Spanish format: "Apellidos y nombre / Surname, Name"
    if (!studentName && /Apellidos.*nombre|Surname.*Name/i.test(line)) {
      const next = (earlyLines[i + 1] || '').trim();
      if (next) {
        // Strip trailing DNI (8 digits + letter), gender, dates
        let name = next.replace(/\s+\d{8}[A-Z].*/, '').trim();
        name = name.replace(/,\s*/, ' ').trim(); // "PÉREZ, PABLO" → "PÉREZ PABLO"
        studentName = toTitleCase(name);
      }
    }

    // Pattern D: EU template commitment block: "Student   Firstname LASTNAME   email   ..."
    if (!studentName && /^Commitment/i.test(line)) {
      // look in next 3 lines for student row
      for (let j = i + 1; j < Math.min(i + 4, earlyLines.length); j++) {
        const m = earlyLines[j].match(/^Student\s+([A-Z][a-zÀ-ÖØ-öø-ÿ]+(?:\s[A-Z][a-zÀ-ÖØ-öø-ÿ]+)+)/i);
        if (m) { studentName = m[1].trim(); break; }
      }
    }

    // ── Sending Institution ───────────────────────────────────
    // Pattern A: Erasmus Digital — look for non-BRUXEL Erasmus code then back-trace institution name
    if (!sendingInstitution) {
      // An Erasmus code looks like: F GRENOBL2, E VALENCI02, FTOULOUS28, NANTES07, PADOVA01
      const erasmusMatch = line.match(/\b([A-Z]{1,2}\s?[A-Z]{3,8}\d{1,2})\b/);
      if (erasmusMatch) {
        const code = erasmusMatch[1].replace(/\s/, '');
        if (!/BRUXEL/i.test(code)) {
          // Scan lines around ±4 for institution name (exclude email, country, dept noise)
          const candidates = [];
          for (let j = Math.max(0, i - 4); j <= Math.min(earlyLines.length - 1, i + 4); j++) {
            const c = earlyLines[j];
            if (/Sending|Receiving|Faculty|Department|Erasmus|Country|email|contact|name;/i.test(c)) continue;
            if (/BRUXEL|Bruxelles|alice\.hoslet/i.test(c)) continue;
            if (/@|France|Spain|Italy|Belgium|Italie|Espagne|http/i.test(c)) continue;
            if (c.length < 4) continue;
            // Keep lines that look like an institution name (mixed-case, no pure numbers)
            if (/[A-Za-z]{3}/.test(c) && !/^\d+$/.test(c)) {
              candidates.push(c.replace(/\s+/g, ' ').trim());
            }
          }
          if (candidates.length > 0) {
            // Prefer the longest candidate (usually the full institution name)
            sendingInstitution = candidates.reduce((a, b) => a.length >= b.length ? a : b);
          }
        }
      }
    }

    // Pattern B: Spanish format — institution name at the top of document
    if (!sendingInstitution && /UNIVERSIDAD|UNIVERSITAT|UNIVERSITE|UNIVERSITY/i.test(line)) {
      if (!/Bruxelles|BRUXEL|Libre de Bruxelles/i.test(line)) {
        // Strip bilingual suffixes "/ UNIVERSITY OF ..."
        sendingInstitution = line.replace(/\s*\/\s*UNIVERSITY OF.*/i, '').trim();
      }
    }

    // ── Mobility Period ───────────────────────────────────────
    // Italian: "Periodo di mobilità:   Primo Semestre"
    if (!mobilityPeriod && /Periodo di mobilit/i.test(line)) {
      const m = line.match(/Periodo di mobilit[aà]:\s*(.+)/i);
      if (m) mobilityPeriod = m[1].trim();
    }

    // Spanish: "10 Meses /Months"
    if (!mobilityPeriod && /\d+\s*Meses\s*\/\s*Months/i.test(line)) {
      const m = line.match(/(\d+)\s*Meses/i);
      if (m) mobilityPeriod = `${m[1]} months`;
    }

    // Erasmus Digital: "Semester" or "Full academic year" in the duration type box
    if (!mobilityPeriod && /^Semester\s*$/i.test(line)) {
      mobilityPeriod = 'Semester';
    }
    if (!mobilityPeriod && /Full\s*academic\s*year/i.test(line)) {
      mobilityPeriod = 'Full academic year';
    }

    // From / To dates
    if (!fromDate) {
      const m = line.match(/\bfrom\s+(\S+)/i);
      if (m && /\d/.test(m[1])) fromDate = m[1];
    }
    if (!toDate) {
      const m = line.match(/\bto\s+(\S+)/i);
      if (m && /\d/.test(m[1])) toDate = m[1];
    }

    // Academic year
    if (!mobilityPeriod) {
      const m = line.match(/Academic\s*year\s*[:\s]+([\d]{4}[-\/][\d]{2,4})/i);
      if (m) mobilityPeriod = `AY ${m[1]}`;
    }
  }

  // Combine from/to into period if no label was found
  if (!mobilityPeriod && fromDate) {
    mobilityPeriod = toDate ? `${fromDate} – ${toDate}` : `From ${fromDate}`;
  }

  return { studentName, sendingInstitution, mobilityPeriod };
}

// Title-case helper (handles ALL-CAPS names)
function toTitleCase(str) {
  return str.replace(/\w+/g, w => {
    if (w.length <= 2) return w; // keep "de", "le" etc. lowercase? no, keep simple
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

// Render the student info bar after parsing
function renderStudentInfoBar() {
  const bar = document.getElementById('student-info-bar');
  const { studentName, sendingInstitution, mobilityPeriod } = appState.metadata;
  const hasAny = studentName || sendingInstitution || mobilityPeriod;
  if (!hasAny) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  document.getElementById('meta-student').textContent = studentName || '—';
  document.getElementById('meta-institution').textContent = sendingInstitution || '—';
  document.getElementById('meta-period').textContent = mobilityPeriod || '—';
}

// Robust coordinate-based LA parser
function parsePdfDataToCourses(allItems) {
  const codeRegex = /\b([A-Z]{2,4}\s*-\s*[A-Z0-9]*\d[A-Z0-9]*|[A-Z]{2,4}\d+[A-Z0-9]*)\b/;

  const termPatterns = [
    // Numeric patterns (matches e.g. "1st semester", "2ème semestre", "1º cuatrimestre", "2. Semester", "2do sem", "1ra sem")
    /\b[1-4](?:st|nd|rd|th|er|ere|ème|eme|o|º|°|\.|do|da|ra)?\s*(?:semestre|semester|cuatrimestre|sem\.|sem)\b/i,
    // Reverse numeric patterns (matches e.g. "Semester 1", "Sem. 2", "Sem 1", "Semester 2.o")
    /\b(?:semestre|semester|cuatrimestre|sem\.|sem)\s*[1-4](?:st|nd|rd|th|er|ere|ème|eme|o|º|°|\.|do|da|ra)?\b/i,
    // Standalone code patterns (matches e.g. "Q1", "Q2", "S1", "S2")
    /\b[SQ][12]\b/i,
    // Word-based patterns (German)
    /\bErstes\s*Semester\b/i,
    /\bZweites\s*Semester\b/i,
    /\bWintersemester\b/i,
    /\bSommersemester\b/i,
    /\bHerbstsemester\b/i,
    /\bFrühlingssemester\b/i,
    /\bFruehlingssemester\b/i,
    // Word-based patterns (French/Spanish/Italian/Portuguese)
    /\bFirst\s*Semester\b/i,
    /\bSecond\s*Semester\b/i,
    /\bPrimer\s*Semestre\b/i,
    /\bSegundo\s*Semestre\b/i,
    /\bPrimer\s*Cuatrimestre\b/i,
    /\bSegundo\s*Cuatrimestre\b/i,
    /\bPremier\s*Semestre\b/i,
    /\bSecond\s*Semestre\b/i,
    /\bDeuxième\s*Semestre\b/i,
    /\bPrimeiro\s*Semestre\b/i,
    /\bPrimo\s*Semestre\b/i,
    /\bSecondo\s*Semestre\b/i,
    // Term/Autumn/Spring/Summer/Winter patterns in different languages
    /\bautumn\s*term\b/i,
    /\bspring\s*term\b/i,
    /\bautumn\b/i,
    /\bspring\b/i,
    /\bwinter\b/i,
    /\bsummer\b/i,
    /\bautomne\b/i,
    /\bprintemps\b/i,
    /\bété\b/i,
    /\botoño\b/i,
    /\bprimavera\b/i,
    /\bverano\b/i,
    /\bautunno\b/i,
    /\bestate\b/i,
    /\bherbst\b/i,
    /\bfrühling\b/i,
    /\bfruehling\b/i,
    /\bsommer\b/i,
    /\boutono\b/i,
    /\bverão\b/i,
    /\bverao\b/i,
    // Annual patterns
    /\bAcademic\s*Year\b/i,
    /\bFull\s*Year\b/i,
    /\bWhole\s*Year\b/i,
    /\bYear\s*Long\b/i,
    /\bannual\b/i,
    /\banual\b/i,
    /\bannuel\b/i,
    /\bannuale\b/i
  ];

  const headerPatterns = [
    /Study Programme/i,
    /Tableau A/i,
    /Table A/i,
    /Attività da sostenere all'estero/i
  ];

  const footerPatterns = [
    /Recognition at the Sending Institution/i,
    /Tableau B/i,
    /Table B/i,
    /Attività da riconoscere/i,
    /Totale CFU No TAF D/i,
    /Totale CFU TAF D/i,
    /TOTAL CREDITOS/i,
    /TOTAL CREDITS/i,
    /Total:/i
  ];

  function isErasmusUniCode(code) {
    const cleaned = code.replace(/\s/g, '');
    return /^[A-Z]{5,9}\d{1,2}$/.test(cleaned);
  }

  // Sort items globally by page, then y desc, then x asc
  allItems.sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
    return a.x - b.x;
  });

  // Reconstruct lines to find table boundaries
  let startItemIdx = -1;
  let endItemIdx = -1;

  for (let i = 0; i < allItems.length; i++) {
    const str = allItems[i].str;
    if (startItemIdx === -1) {
      if (headerPatterns.some(regex => regex.test(str))) {
        startItemIdx = i;
      }
    } else {
      if (footerPatterns.some(regex => regex.test(str))) {
        endItemIdx = i;
        break;
      }
    }
  }

  if (startItemIdx === -1) startItemIdx = 0;
  if (endItemIdx === -1) endItemIdx = allItems.length;

  const tableItems = allItems.slice(startItemIdx, endItemIdx);

  // Group tableItems into lines
  const linesByPage = {};
  tableItems.forEach(item => {
    if (!linesByPage[item.pageNum]) {
      linesByPage[item.pageNum] = [];
    }
    const lines = linesByPage[item.pageNum];
    let foundLine = lines.find(l => Math.abs(l.y - item.y) < 5);
    if (foundLine) {
      foundLine.items.push(item);
    } else {
      lines.push({ y: item.y, pageNum: item.pageNum, items: [item] });
    }
  });

  const allLines = [];
  for (const pageNum in linesByPage) {
    const lines = linesByPage[pageNum];
    lines.sort((a, b) => b.y - a.y);
    lines.forEach(line => {
      line.items.sort((a, b) => a.x - b.x);
      line.joinedStr = line.items.map(item => item.str).join(' ');
      allLines.push(line);
    });
  }

  // Identify anchors
  const anchors = [];
  allLines.forEach(line => {
    const codeMatch = line.joinedStr.match(codeRegex);
    if (codeMatch) {
      const code = codeMatch[1].trim();
      if (isErasmusUniCode(code)) return;

      const codeItem = line.items.find(item => item.str.includes(code)) || line.items[0];

      const exists = anchors.some(a => a.code === code && a.pageNum === line.pageNum && Math.abs(a.y - line.y) < 5);
      if (!exists) {
        anchors.push({
          code,
          y: line.y,
          pageNum: line.pageNum,
          x: codeItem.x,
          isFallback: false
        });
      }
    }
  });

  const hasCodes = anchors.length > 0;

  // Fallback: If no code anchors found, scan lines for terms to use as anchors
  if (!hasCodes) {
    allLines.forEach(line => {
      let isTerm = false;
      for (const termRegex of termPatterns) {
        if (termRegex.test(line.joinedStr)) {
          isTerm = true;
          break;
        }
      }
      if (isTerm) {
        const exists = anchors.some(a => a.pageNum === line.pageNum && Math.abs(a.y - line.y) < 5);
        if (!exists) {
          anchors.push({
            code: '',
            y: line.y,
            pageNum: line.pageNum,
            x: line.items[0].x,
            isFallback: true,
            termText: line.joinedStr
          });
        }
      }
    });
  }

  if (anchors.length === 0) {
    return [];
  }

  const pageFirstAnchorY = {};
  anchors.forEach(a => {
    if (pageFirstAnchorY[a.pageNum] === undefined || a.y > pageFirstAnchorY[a.pageNum]) {
      pageFirstAnchorY[a.pageNum] = a.y;
    }
  });

  const courseGroups = anchors.map(anchor => ({
    anchor,
    items: []
  }));

  tableItems.forEach(item => {
    if (item.str.startsWith('http://') || item.str.startsWith('https://') || item.str.startsWith('www.')) {
      return;
    }
    if (headerPatterns.some(regex => regex.test(item.str)) || footerPatterns.some(regex => regex.test(item.str))) {
      return;
    }

    const firstY = pageFirstAnchorY[item.pageNum];
    if (firstY !== undefined && item.y > firstY + 8) {
      return;
    }

    const samePageAnchors = courseGroups.filter(g => g.anchor.pageNum === item.pageNum);
    if (samePageAnchors.length === 0) return;

    let minDistance = Infinity;
    let bestGroup = null;

    samePageAnchors.forEach(g => {
      const dist = Math.abs(item.y - g.anchor.y);
      if (dist < minDistance) {
        minDistance = dist;
        bestGroup = g;
      }
    });

    const distanceThreshold = hasCodes ? 100 : 35;
    if (bestGroup && minDistance < distanceThreshold) {
      bestGroup.items.push(item);
    }
  });

  const courses = courseGroups.map(g => {
    const { anchor, items } = g;

    const rows = [];
    items.forEach(item => {
      let found = rows.find(r => Math.abs(r.y - item.y) < 3);
      if (found) {
        found.items.push(item);
      } else {
        rows.push({ y: item.y, items: [item] });
      }
    });

    rows.sort((a, b) => b.y - a.y);

    let code = anchor.code;
    let term = '';
    let ects = '';
    let titleParts = [];

    if (anchor.isFallback) {
      for (const termRegex of termPatterns) {
        const match = anchor.termText.match(termRegex);
        if (match) {
          term = match[0].trim();
          break;
        }
      }
    }

    rows.forEach(row => {
      row.items.sort((a, b) => a.x - b.x);
      let lineStr = row.items.map(item => item.str).join(' ');

      if (code) {
        const codeIdx = lineStr.indexOf(code);
        if (codeIdx !== -1) {
          lineStr = lineStr.substring(codeIdx);
        }
        
        lineStr = lineStr.replace(code, '');
        const codeClean = code.replace(/\s/g, '');
        const lineClean = lineStr.replace(/\s/g, '');
        if (lineClean.includes(codeClean)) {
          const codeParts = code.split(/\s*-\s*/);
          codeParts.forEach(p => {
            if (p) {
              lineStr = lineStr.replace(new RegExp('\\b' + p + '\\b', 'g'), '');
            }
          });
          lineStr = lineStr.replace(/-/g, '');
        }
      }

      for (const termRegex of termPatterns) {
        const match = lineStr.match(termRegex);
        if (match) {
          if (!anchor.isFallback) term = match[0].trim();
          lineStr = lineStr.replace(match[0], '');
          break;
        }
      }

      const ectsMatch = lineStr.match(/\b\d+\b$/);
      if (ectsMatch) {
        const num = ectsMatch[0];
        if (row.items.some(item => item.str.includes(num) && item.x > anchor.x + 80)) {
          ects = num;
          lineStr = lineStr.substring(0, lineStr.lastIndexOf(num));
        }
      } else {
        const rightmostNum = row.items.filter(item => /^\d+$/.test(item.str.trim()) && item.x > anchor.x + 80);
        if (rightmostNum.length > 0) {
          ects = rightmostNum[rightmostNum.length - 1].str.trim();
          lineStr = lineStr.replace(new RegExp('\\b' + ects + '\\b', 'g'), '');
        }
      }

      lineStr = lineStr
        .replace(/\b(yes|no|si|sí)\b/gi, '')
        .trim();

      if (lineStr) {
        titleParts.push(lineStr);
      }
    });

    const title = titleParts.join(' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–—]+|[\s\-–—]+$/g, '')
      .trim();

    let finalTitle = title || 'Unknown Course';
    let finalEcts = ects ? parseInt(ects, 10) : 0;
    let finalTerm = normalizeTerm(term);

    if (code && typeof ulbCoursesDatabase !== 'undefined' && ulbCoursesDatabase.length > 0) {
      const dbMatches = ulbCoursesDatabase.filter(x => x.CourseCode.toUpperCase() === code.toUpperCase());
      if (dbMatches.length > 0) {
        // Title alignment
        const cleanStr = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const cleanParsed = cleanStr(finalTitle);
        let matchedDbTitle = null;
        
        for (const match of dbMatches) {
          const titles = [match.TitleEn, match.TitleFr].filter(Boolean);
          for (const t of titles) {
            const cleanDb = cleanStr(t);
            if (cleanParsed.startsWith(cleanDb) || cleanDb.startsWith(cleanParsed)) {
              matchedDbTitle = t;
              break;
            }
          }
          if (matchedDbTitle) break;
        }
        if (matchedDbTitle) {
          finalTitle = matchedDbTitle;
        }

        // ECTS and Term alignment
        const match = dbMatches[0];
        const dbEcts = match.Credits ? parseInt(match.Credits, 10) || 0 : 0;
        const dbTerm = normalizeTerm(match.Term);

        if (dbEcts > 0 && finalEcts !== dbEcts) {
          const hasDbEctsInRow = items.some(item => {
            const val = parseInt(item.str.trim(), 10);
            return val === dbEcts && item.x > anchor.x + 80;
          });
          if (hasDbEctsInRow) {
            finalEcts = dbEcts;
          }
        }

        if (dbTerm && finalTerm !== dbTerm) {
          let hasDbTermInRow = false;
          if (dbTerm === '1st') {
            hasDbTermInRow = items.some(item => {
              const s = item.str.toLowerCase();
              return /\b(1|1st|1er|1\.|q1|s1|first|autumn|fall|premier|primo|primer|primeiro)\b/i.test(s) || s.includes('1º') || s.includes('1°');
            });
          } else if (dbTerm === '2nd') {
            hasDbTermInRow = items.some(item => {
              const s = item.str.toLowerCase();
              return /\b(2|2nd|2ème|2eme|2\.|q2|s2|second|spring|printemps|deuxième|secondo|segundo)\b/i.test(s) || s.includes('2º') || s.includes('2°');
            });
          } else if (dbTerm === '1st+2nd') {
            hasDbTermInRow = items.some(item => {
              const s = item.str.toLowerCase();
              return /annual|anual|annuel|annuale|academic|year/i.test(s);
            });
          }
          if (hasDbTermInRow) {
            finalTerm = dbTerm;
          }
        }
      }
    }

    return {
      code: code || '(No Code)',
      title: finalTitle,
      term: finalTerm,
      ects: finalEcts
    };
  });

  return courses.filter(c => c.title && !/component\s*code|component\s*title|term|credits/i.test(c.title));
}

// Update View State
function updateAppView() {
  renderCoursesTable();
  evaluateRules();
  renderRulesList();
}

// Escape special HTML characters to prevent injection / broken layouts
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Render Table Rows
function renderCoursesTable() {
  const emptyState = document.getElementById('empty-state');
  
  if (appState.courses.length === 0) {
    coursesTbody.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'table-row';
      coursesTbody.appendChild(emptyState);
    }
    if (btnClearCourses) btnClearCourses.style.display = 'none';
    totalCoursesCount.innerText = '0';
    totalEctsCount.innerText = '0';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (btnClearCourses) btnClearCourses.style.display = 'inline-flex';
  coursesTbody.innerHTML = '';

  appState.courses.forEach(course => {
    const tr = document.createElement('tr');
    tr.dataset.id = course.id;

    const warnSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

    const makeTri = (tooltip) =>
      `<span class="warn-triangle">${warnSvg}<span class="warn-tooltip">${tooltip}</span></span>`;

    const titleWarn = course.titleMismatch
      ? makeTri(`Title in LA ("${escapeHtml(course.parsedTitle)}") does not match the official name.`)
      : '';

    const ectsWarn = course.ectsWarning
      ? makeTri(`ECTS in LA (${course.parsedEcts}) differs from the official value (${course.ects}).`)
      : '';

    const termWarn = course.termWarning
      ? makeTri(`Term in LA ("${escapeHtml(course.parsedTerm)}") differs from official term ("${course.term}").`)
      : '';

    let titleCellContent = `<div class="table-cell editable-cell" style="display:flex;align-items:center;gap:2px;" contenteditable="false"><span contenteditable="true" onblur="updateCourseState('${course.id}', 'title', this.innerText.trim())" style="flex:1;outline:none;">${escapeHtml(course.title)}</span>${titleWarn}</div>`;

    // Status badge markup (no mismatch badge — that is now a triangle)
    let statusMarkup = '';
    const cs = course.courseStatus || (course.isUnknown ? 'not-in-epb' : 'verified');
    if (cs === 'not-in-epb') {
      statusMarkup = `<span class="status-badge unknown">External</span>`;
    } else if (cs === 'ineligible') {
      statusMarkup = `<span class="status-badge ineligible">Ineligible</span>`;
    } else {
      statusMarkup = `<span class="status-badge verified">Internal</span>`;
    }

    // Info link markup
    let infoMarkup = '—';
    if (course.url) {
      infoMarkup = `
        <a href="${escapeHtml(course.url)}" target="_blank" class="course-link-icon" title="View Course Details">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      `;
    }

    tr.innerHTML = `
      <td><div class="table-cell editable-cell" contenteditable="true" onblur="updateCourseState('${course.id}', 'code', this.innerText.trim())">${escapeHtml(course.code)}</div></td>
      <td>${titleCellContent}</td>
      <td><div class="table-cell">${statusMarkup}</div></td>
      <td class="center-align"><div class="table-cell center-align">${infoMarkup}</div></td>
      <td>
        <select class="table-select-inline" onchange="updateCourseState('${course.id}', 'term', this.value)">
          <option value="1st" ${course.term === '1st' ? 'selected' : ''}>1st</option>
          <option value="2nd" ${course.term === '2nd' ? 'selected' : ''}>2nd</option>
          <option value="1st+2nd" ${course.term === '1st+2nd' ? 'selected' : ''}>1st+2nd</option>
        </select>${termWarn}
      </td>
      <td class="center-align"><div class="table-cell center-align editable-cell" contenteditable="true" onblur="updateCourseState('${course.id}', 'ects', parseInt(this.innerText) || 0)">${escapeHtml(String(course.ects))}</div>${ectsWarn}</td>
      <td class="center-align">
        <button class="btn-danger-link" onclick="deleteCourse('${course.id}')" title="Delete Course">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 7L5 7M10 11V17M14 11V17M4 7H20M9 7V4C9 3.46957 9.21071 2.96086 9.58579 2.58579C9.96086 2.21071 10.4696 2 11 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </td>
    `;

    coursesTbody.appendChild(tr);
  });

  // Calculate totals
  const totalECTS = appState.courses.reduce((sum, c) => sum + (c.ects || 0), 0);
  totalCoursesCount.innerText = appState.courses.length;
  totalEctsCount.innerText = totalECTS;
}

// Modify state cell values
function updateCourseState(id, field, value) {
  const course = appState.courses.find(c => c.id === id);
  if (course) {
    course[field] = value;
    
    // Clear mismatch if user manually overrides the title
    if (field === 'title') {
      course.titleMismatch = false;
    }
    
    // Re-verify code with CSV database if changed
    if (field === 'code') {
      const code = value.trim().toUpperCase();
      const dbMatches = ulbCoursesDatabase.filter(x => x.CourseCode.toUpperCase() === code);
      const epbMatch = dbMatches.find(x => x.Eligible === 'True');
      
      if (dbMatches.length > 0) {
        const dbMatch = epbMatch || dbMatches[0];
        course.title = dbMatch.TitleEn || dbMatch.TitleFr || '';
        if (dbMatch.Credits) {
          course.ects = parseInt(dbMatch.Credits, 10) || 0;
        }
        course.isUnknown = !epbMatch;
        course.courseStatus = resolveStatus(dbMatches, epbMatch);
        course.url = dbMatch.CourseURL || `https://www.ulb.be/en/programme/${code.toLowerCase()}`;
        
        if (course.parsedTitle) {
          const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
          const pClean = clean(course.parsedTitle);
          const enClean = clean(dbMatch.TitleEn);
          const frClean = clean(dbMatch.TitleFr);
          
          if (pClean && (enClean || frClean)) {
            course.titleMismatch = (pClean !== enClean && pClean !== frClean);
          } else {
            course.titleMismatch = false;
          }
        } else {
          course.titleMismatch = false;
        }
        
        if (!epbMatch) {
          showToast(`⚠️ Course ${code} found in database but is not part of an eligible EPB program.`, 'error');
        }
      } else {
        course.title = '';
        course.ects = 0;
        course.isUnknown = true;
        course.courseStatus = 'not-in-epb';
        course.url = `https://www.ulb.be/en/programme/${code.toLowerCase()}`;
        course.titleMismatch = false;
        showToast(`⚠️ Unknown course code ${code}. Title and ECTS left empty. Please enter manually.`, 'error');
      }
    }

    evaluateRules();
    const totalECTS = appState.courses.reduce((sum, c) => sum + (c.ects || 0), 0);
    totalEctsCount.innerText = totalECTS;
    if (field === 'term' || field === 'code') {
      updateAppView();
    }
  }
}

// Remove course
window.deleteCourse = function(id) {
  const course = appState.courses.find(c => c.id === id);
  appState.courses = appState.courses.filter(c => c.id !== id);
  updateAppView();
  if (course) {
    showToast(`Removed course: ${course.code}`, 'info');
  }
}

// Update student metadata manually
window.updateMetadataState = function(key, value) {
  if (appState.metadata) {
    appState.metadata[key] = value.trim();
    
    // If the mobility period changed, trigger context auto-detection
    if (key === 'mobilityPeriod') {
      const periodText = value.trim().toLowerCase();
      const has1st = appState.courses.some(c => c.term === '1st' || c.term === '1st+2nd');
      const has2nd = appState.courses.some(c => c.term === '2nd' || c.term === '1st+2nd');
      let autoContext = appState.mobilityContext;
      
      if (periodText.includes('full year') || periodText.includes('annual') || periodText.includes('academic year') || periodText.includes('10 months') || periodText.includes('9 months') || (has1st && has2nd)) {
        autoContext = 'full-year';
      } else if (periodText.includes('second semester') || periodText.includes('2nd semester') || periodText.includes('secondo semestre') || periodText.includes('spring') || periodText.includes('2 sem') || periodText.includes('2° sem') || periodText.includes('2º sem') || (has2nd && !has1st)) {
        autoContext = 'semester-2';
      } else if (periodText.includes('first semester') || periodText.includes('1st semester') || periodText.includes('primo semestre') || periodText.includes('autumn') || (has1st && !has2nd)) {
        autoContext = 'semester-1';
      }
      
      if (autoContext !== appState.mobilityContext) {
        appState.mobilityContext = autoContext;
        if (mobilityContextSelect) {
          mobilityContextSelect.value = autoContext;
        }
        showToast(`Auto-detected new mobility type: ${autoContext === 'full-year' ? 'Full Year' : (autoContext === 'semester-2' ? '2nd Semester' : '1st Semester')}`, 'info');
      }
    }
    
    evaluateRules();
  }
}

// Render Rules list in sidebar
function renderRulesList() {
  rulesContainer.innerHTML = '';
  
  const applicableRules = appState.rules
    .filter(r => isRuleApplicable(r, appState.mobilityContext))
    .sort((a, b) => (a.type === 'no_ineligible' ? 1 : b.type === 'no_ineligible' ? -1 : 0));
  
  if (applicableRules.length === 0) {
    rulesContainer.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);text-align:center;padding:1rem 0;">No criteria active.</p>`;
    return;
  }

  applicableRules.forEach(rule => {
    const item = document.createElement('div');
    item.className = 'rule-item' + (rule.builtin ? ' rule-builtin' : '');
    
    let badgeText = '';
    if (rule.type === 'total_ects') badgeText = 'Total Credits';
    else if (rule.type === 'prefix_ects') badgeText = `Prefix: ${rule.prefix}`;
    else if (rule.type === 'required_course') badgeText = `Required`;
    else if (rule.type === 'term_ects') badgeText = 'Per-Term Credits';
    else if (rule.type === 'epb_60_percent') badgeText = 'Course Origin';
    else if (rule.type === 'majority_120') badgeText = 'Core Master';
    else if (rule.type === 'no_internship') badgeText = 'No Internship';
    else if (rule.type === 'project_limits') badgeText = 'Project Limit';
    else if (rule.type === 'no_ineligible') badgeText = 'Eligibility';
    else if (rule.type === 'dd_core_only') badgeText = 'DD Core';
    else if (rule.type === 'dd_thesis') badgeText = 'DD Thesis';

    const deleteBtn = rule.builtin ? '' : `
      <button class="btn-danger-link" onclick="deleteRule('${rule.id}')" title="Delete Rule">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 7L5 7M10 11V17M14 11V17M4 7H20M9 7V4C9 3.46957 9.21071 2.96086 9.58579 2.58579C9.96086 2.21071 10.4696 2 11 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>`;

    item.innerHTML = `
      <div class="rule-top-flex">
        <div>
          <span class="rule-title-label">${rule.name}</span>
          <p class="rule-description-label">${rule.description}</p>
        </div>
        ${deleteBtn}
      </div>
      <div>
        <span class="rule-badge">${badgeText}</span>
        ${rule.builtin ? '<span class="rule-badge rule-badge-builtin">Built-in</span>' : ''}
      </div>
    `;
    rulesContainer.appendChild(item);
  });
}

// Remove rule (built-in rules cannot be deleted)
window.deleteRule = function(id) {
  const rule = appState.rules.find(r => r.id === id);
  if (rule && rule.builtin) {
    showToast('Built-in rules cannot be deleted.', 'error');
    return;
  }
  appState.rules = appState.rules.filter(r => r.id !== id);
  renderRulesList();
  evaluateRules();
};



// Real-time evaluation of all validation rules
function evaluateRules() {
  resultsGrid.innerHTML = '';
  
  const summaryCard = document.getElementById('validation-summary-card');

  const applicableRules = appState.rules
    .filter(r => isRuleApplicable(r, appState.mobilityContext))
    .sort((a, b) => (a.type === 'no_ineligible' ? 1 : b.type === 'no_ineligible' ? -1 : 0));

  if (applicableRules.length === 0) {
    resultsGrid.innerHTML = `<p style="font-size:0.9rem;color:var(--text-muted);">No rules active. Add a rule to verify the courses.</p>`;
    if (summaryCard) summaryCard.style.display = 'none';
    return;
  }
  
  const evaluationResults = [];

  const ELIGIBLE_PROGRAM_CODES = new Set([
    'MA-IREM', 'MA-IRIF', 'MA-IRAR', 'MA-IRCB', 'MA-IRCN', 'MA-IRMA', 'MA-IRPH', 'MA-IREL',
    'MS-NUAP', 'MS-GEPC', 'MS-NATE', 'MS-URDE', 'MS-BGDA',
    'BA-IRCI', 'BA-IRAR'
  ]);

  const CORE_120_PROGRAM_CODES = new Set([
    'MA-IREM', 'MA-IRIF', 'MA-IRAR', 'MA-IRCB', 'MA-IRCN', 'MA-IRMA', 'MA-IRPH', 'MA-IREL'
  ]);

  applicableRules.forEach(rule => {
    let result = { passed: false, details: '', currentVal: '' };

    if (rule.type === 'total_ects') {
      let target = rule.targetValue;
      if (rule.id === 'rule-1') {
        target = (appState.mobilityContext === 'full-year' || appState.mobilityContext === 'double-diploma') ? 60 : 30;
        rule.targetValue = target;
        rule.description = `Total receiving credits must be at least ${target} ECTS`;
      }
      const sum = appState.courses.reduce((acc, c) => acc + (c.ects || 0), 0);
      result.passed = sum >= target;
      result.currentVal = `${sum} / ${target} ECTS`;
      result.details = result.passed 
        ? 'Total credits criteria satisfies the requirement.' 
        : `Currently short by ${target - sum} ECTS credits.`;
    } 
    else if (rule.type === 'dd_compliance') {
      const sum = appState.courses.reduce((acc, c) => acc + (c.ects || 0), 0);
      if (sum < 60) {
        result.passed = false;
        result.currentVal = `${sum} / 60 ECTS`;
        result.details = `Study load (${sum} ECTS) is below the typical 60 ECTS annual program requirement.`;
      } else if (sum > 60) {
        result.passed = true;
        result.warn = true;
        result.currentVal = `${sum} / 60 ECTS`;
        result.details = `Study load exceeds 60 ECTS. Requires signing a declaration of awareness of a higher risk of failure.`;
      } else {
        result.passed = true;
        result.currentVal = '60 ECTS';
        result.details = 'Study load satisfies the typical 60 ECTS annual program requirement.';
      }
    }
    else if (rule.type === 'prefix_ects') {
      const prefixSum = appState.courses
        .filter(c => c.code.toUpperCase().startsWith(rule.prefix.toUpperCase()))
        .reduce((acc, c) => acc + (c.ects || 0), 0);
      
      result.passed = prefixSum >= rule.targetValue;
      result.currentVal = `${prefixSum} / ${rule.targetValue} ECTS`;
      result.details = result.passed
        ? `Found ${prefixSum} credits starting with prefix "${rule.prefix}".`
        : `Need ${rule.targetValue - prefixSum} more credits of code prefix "${rule.prefix}".`;
    } 
    else if (rule.type === 'required_course') {
      const match = appState.courses.find(c => 
        c.code.toUpperCase().includes(rule.keyword.toUpperCase()) || 
        c.title.toUpperCase().includes(rule.keyword.toUpperCase())
      );
      result.passed = !!match;
      result.currentVal = result.passed ? 'Found' : 'Missing';
      result.details = result.passed
        ? `Matched: "${match.code} - ${match.title}"`
        : `Could not find any course matching code/title keyword "${rule.keyword}".`;
    }
    else if (rule.type === 'term_ects') {
      const termTotals = { '1st': 0, '2nd': 0 };
      let hasOutofMobilityCourses = false;
      let outOfMobilityDetails = '';

      appState.courses.forEach(c => {
        const t = c.term;
        if (t === '1st+2nd') {
          termTotals['1st'] += c.ects / 2;
          termTotals['2nd'] += c.ects / 2;
          if (appState.mobilityContext === 'semester-1' || appState.mobilityContext === 'semester-2') {
            hasOutofMobilityCourses = true;
            outOfMobilityDetails = 'Found annual (1st+2nd term) course(s) during a single-semester mobility.';
          }
        } else if (t === '1st') {
          termTotals['1st'] += c.ects;
          if (appState.mobilityContext === 'semester-2') {
            hasOutofMobilityCourses = true;
            outOfMobilityDetails = 'Found 1st Semester course(s) during a 2nd Semester mobility.';
          }
        } else if (t === '2nd') {
          termTotals['2nd'] += c.ects;
          if (appState.mobilityContext === 'semester-1') {
            hasOutofMobilityCourses = true;
            outOfMobilityDetails = 'Found 2nd Semester course(s) during a 1st Semester mobility.';
          }
        }
      });

      const MIN = 21;
      const REC = 30;

      if (appState.courses.length === 0) {
        result.passed = false;
        result.currentVal = '0 ECTS';
        result.details = 'No courses added yet.';
      } else if (hasOutofMobilityCourses) {
        result.passed = false;
        result.currentVal = 'Term Error';
        result.details = outOfMobilityDetails;
      } else if (appState.mobilityContext === 'semester-1') {
        const total = termTotals['1st'];
        result.passed = total >= MIN;
        result.currentVal = `${total} / ${MIN} ECTS`;
        if (!result.passed) {
          result.details = `1st Semester credits (${total} ECTS) below the 21 ECTS minimum.`;
        } else if (total < REC) {
          result.details = `Minimum met (${total} ECTS), but 30 ECTS are recommended for single-term mobility.`;
          result.warn = true;
        } else {
          result.details = `1st Semester study load satisfies requirements (${total} ECTS).`;
        }
      } else if (appState.mobilityContext === 'semester-2') {
        const total = termTotals['2nd'];
        result.passed = total >= MIN;
        result.currentVal = `${total} / ${MIN} ECTS`;
        if (!result.passed) {
          result.details = `2nd Semester credits (${total} ECTS) below the 21 ECTS minimum.`;
        } else if (total < REC) {
          result.details = `Minimum met (${total} ECTS), but 30 ECTS are recommended for single-term mobility.`;
          result.warn = true;
        } else {
          result.details = `2nd Semester study load satisfies requirements (${total} ECTS).`;
        }
      } else {
        // full-year or double-diploma
        const failedTerms = [];
        if (termTotals['1st'] < MIN) failedTerms.push(`1st Sem (${termTotals['1st']} ECTS)`);
        if (termTotals['2nd'] < MIN) failedTerms.push(`2nd Sem (${termTotals['2nd']} ECTS)`);

        result.passed = failedTerms.length === 0;
        result.currentVal = `1st: ${termTotals['1st']} | 2nd: ${termTotals['2nd']} ECTS`;
        if (!result.passed) {
          result.details = `Term(s) below 21 ECTS minimum: ${failedTerms.join(', ')}. Each semester needs at least 21 credits.`;
        } else {
          result.details = 'Both semesters satisfy the 21 ECTS minimum requirement.';
        }
      }
    }
    else if (rule.type === 'epb_60_percent') {
      const totalCredits = appState.courses.reduce((acc, c) => acc + (c.ects || 0), 0);
      if (totalCredits === 0) {
        result.passed = false;
        result.currentVal = '0%';
        result.details = 'No courses added yet.';
      } else {
        let eligibleCredits = 0;
        const programGroups = {}; // programCode -> { name, count, ects, coursesList }
        const otherCoursesList = [];
        let otherCredits = 0;
        let otherCount = 0;

        appState.courses.forEach(c => {
          const resolved = resolveProgramCode(c.code, c.id, ELIGIBLE_PROGRAM_CODES);
          if (resolved && resolved.isEligible) {
            eligibleCredits += c.ects;
            const code = resolved.chosenCode;
            if (!programGroups[code]) {
              programGroups[code] = { name: resolved.chosenName, count: 0, ects: 0, coursesList: [] };
            }
            programGroups[code].count++;
            programGroups[code].ects += c.ects;
            
            const extraCodes = resolved.allCodes.filter(x => x !== code && x.toUpperCase().startsWith('MA-IR'));
            const extraStr = extraCodes.length > 0 ? ` [also in: ${extraCodes.join(', ')}]` : '';
            programGroups[code].coursesList.push(`${c.code} - ${c.title} (${c.ects} ECTS)${extraStr}`);
          } else {
            otherCredits += c.ects;
            otherCount++;
            const coreCodesOnly = resolved ? resolved.allCodes.filter(x => x.toUpperCase().startsWith('MA-IR')) : [];
            const extraStr = coreCodesOnly.length > 0 ? ` [in: ${coreCodesOnly.join(', ')}]` : '';
            otherCoursesList.push(`${c.code} - ${c.title} (${c.ects} ECTS)${extraStr}`);
          }
        });

        const percent = Math.round((eligibleCredits / totalCredits) * 100);
        result.passed = percent >= 60;
        result.currentVal = `${percent}%`;

        let detailsHtml = result.passed
          ? `Satisfies requirements: ${eligibleCredits} / ${totalCredits} ECTS from eligible programs.<br>`
          : `Currently only ${percent}% of credits (${eligibleCredits} / ${totalCredits} ECTS) are from eligible EPB programs (needs ≥60%).<br>`;

        detailsHtml += '<div style="margin-top: 5px; font-size: 0.78rem; opacity: 0.95;">';
        detailsHtml += '<strong>Breakdown by Program:</strong>';
        detailsHtml += '<ul style="margin: 3px 0 0 15px; padding: 0; list-style-type: disc;">';
        
        Object.keys(programGroups).forEach(code => {
          const group = programGroups[code];
          detailsHtml += `<li><strong>${group.name} (${code})</strong>: ${group.count} course(s), ${group.ects} ECTS`;
          detailsHtml += '<ul style="margin: 2px 0 5px 15px; padding: 0; list-style-type: circle; opacity: 0.9;">';
          group.coursesList.forEach(courseText => {
            detailsHtml += `<li>${courseText}</li>`;
          });
          detailsHtml += '</ul></li>';
        });
        if (otherCount > 0) {
          detailsHtml += `<li><strong>Other / Non-EPB</strong>: ${otherCount} course(s), ${otherCredits} ECTS`;
          detailsHtml += '<ul style="margin: 2px 0 5px 15px; padding: 0; list-style-type: circle; opacity: 0.9;">';
          otherCoursesList.forEach(courseText => {
            detailsHtml += `<li>${courseText}</li>`;
          });
          detailsHtml += '</ul></li>';
        }
        detailsHtml += '</ul></div>';

        result.details = detailsHtml;
      }
    }
    else if (rule.type === 'prior_permission') {
      const approvalsNeeded = [];
      appState.courses.forEach(c => {
        const dbCourse = ulbCoursesDatabase.find(x => x.CourseCode.toUpperCase() === c.code.toUpperCase());
        if (dbCourse) {
          if (dbCourse.ProgramCode.startsWith('MS-')) {
            approvalsNeeded.push(`${c.code} (60-credit Master ${dbCourse.ProgramCode})`);
          }
        } else {
          // Courses not found in database are assumed to belong to other faculties
          approvalsNeeded.push(`${c.code} (Other Faculty)`);
        }
      });
      
      if (approvalsNeeded.length === 0) {
        result.passed = true;
        result.currentVal = '0 flagged';
        result.details = 'All courses are standard EPB courses.';
      } else {
        result.passed = false;
        result.currentVal = `${approvalsNeeded.length} flagged`;
        result.details = `Prior coordinator or professor approval required for: ${approvalsNeeded.join(', ')}.`;
      }
    }
    else if (rule.type === 'majority_120') {
      let hasMasterCourse = false;
      appState.courses.forEach(c => {
        const dbCourse = ulbCoursesDatabase.find(x => x.CourseCode.toUpperCase() === c.code.toUpperCase());
        if (dbCourse) {
          if (dbCourse.ProgramCode.startsWith('MA-') || dbCourse.ProgramCode.startsWith('MS-')) {
            hasMasterCourse = true;
          }
        } else {
          if (/[HF][45]/i.test(c.code)) {
            hasMasterCourse = true;
          }
        }
      });

      const totalCredits = appState.courses.reduce((acc, c) => acc + (c.ects || 0), 0);

      if (totalCredits === 0) {
        result.passed = true;
        result.currentVal = 'N/A';
        result.details = 'No courses added yet.';
      } else if (!hasMasterCourse) {
        result.passed = true;
        result.currentVal = 'N/A';
        result.details = 'Not applicable: student has no Master-level courses.';
      } else {
        const programCredits = {}; // programCode -> credits
        const programCourses = {}; // programCode -> array of course objects
        
        CORE_120_PROGRAM_CODES.forEach(code => {
          programCredits[code] = 0;
          programCourses[code] = [];
        });
        
        const nonCoreCourses = [];
        let nonCoreCredits = 0;
        
        appState.courses.forEach(c => {
          const dbMatches = ulbCoursesDatabase.filter(x => x.CourseCode.toUpperCase() === c.code.toUpperCase());
          const matchCodes = dbMatches.map(m => m.ProgramCode.toUpperCase());
          const coreMatches = matchCodes.filter(code => CORE_120_PROGRAM_CODES.has(code));
          
          if (coreMatches.length > 0) {
            coreMatches.forEach(code => {
              programCredits[code] += c.ects;
              programCourses[code].push(c);
            });
          } else {
            nonCoreCredits += c.ects;
            nonCoreCourses.push(c);
          }
        });

        let maxCoreCredits = 0;
        let bestProgramCode = null;
        let bestProgramName = '';
        
        CORE_120_PROGRAM_CODES.forEach(code => {
          if (programCredits[code] > maxCoreCredits) {
            maxCoreCredits = programCredits[code];
            bestProgramCode = code;
            const match = ulbCoursesDatabase.find(x => x.ProgramCode.toUpperCase() === code);
            bestProgramName = match ? match.Program : code;
          }
        });

        const percent = Math.round((maxCoreCredits / totalCredits) * 100);
        result.passed = maxCoreCredits > totalCredits / 2;
        result.currentVal = `${percent}%`;
        
        let detailsHtml = '';
        if (result.passed) {
          detailsHtml += `Satisfies majority: <strong>${bestProgramName} (${bestProgramCode})</strong> has the majority with ${maxCoreCredits} / ${totalCredits} ECTS (${percent}%).<br>`;
        } else {
          if (bestProgramCode) {
            detailsHtml += `Does not satisfy majority in a single program. The leading program is <strong>${bestProgramName} (${bestProgramCode})</strong> with ${maxCoreCredits} / ${totalCredits} ECTS (${percent}%), which is not a strict majority (>50%).<br>`;
          } else {
            detailsHtml += `No courses selected from core 120-credit Master programs.<br>`;
          }
        }

        detailsHtml += '<div style="margin-top: 5px; font-size: 0.78rem; opacity: 0.95;">';
        detailsHtml += '<strong>Breakdown of Core 120-credit Master Programs:</strong>';
        detailsHtml += '<ul style="margin: 3px 0 0 15px; padding: 0; list-style-type: disc;">';

        CORE_120_PROGRAM_CODES.forEach(code => {
          const credits = programCredits[code];
          if (credits > 0) {
            const match = ulbCoursesDatabase.find(x => x.ProgramCode.toUpperCase() === code);
            const name = match ? match.Program : code;
            const progPercent = Math.round((credits / totalCredits) * 100);
            
            detailsHtml += `<li><strong>${name} (${code})</strong>: ${programCourses[code].length} course(s), ${credits} ECTS (${progPercent}% of total)`;
            detailsHtml += '<ul style="margin: 2px 0 5px 15px; padding: 0; list-style-type: circle; opacity: 0.9;">';
            programCourses[code].forEach(c => {
              const dbMatches = ulbCoursesDatabase.filter(x => x.CourseCode.toUpperCase() === c.code.toUpperCase());
              const extraCodes = dbMatches.map(m => m.ProgramCode).filter(xc => xc.toUpperCase() !== code && CORE_120_PROGRAM_CODES.has(xc.toUpperCase()));
              const extraStr = extraCodes.length > 0 ? ` [also in: ${extraCodes.join(', ')}]` : '';
              detailsHtml += `<li>${c.code} - ${c.title} (${c.ects} ECTS)${extraStr}</li>`;
            });
            detailsHtml += '</ul></li>';
          }
        });

        if (nonCoreCourses.length > 0) {
          const nonCorePercent = Math.round((nonCoreCredits / totalCredits) * 100);
          detailsHtml += `<li><strong>Non-Core / Other</strong>: ${nonCoreCourses.length} course(s), ${nonCoreCredits} ECTS (${nonCorePercent}% of total)`;
          detailsHtml += '<ul style="margin: 2px 0 5px 15px; padding: 0; list-style-type: circle; opacity: 0.9;">';
          nonCoreCourses.forEach(c => {
            detailsHtml += `<li>${c.code} - ${c.title} (${c.ects} ECTS)</li>`;
          });
          detailsHtml += '</ul></li>';
        }
        
        detailsHtml += '</ul></div>';
        result.details = detailsHtml;
      }
    }
    else if (rule.type === 'no_internship') {
      const internships = appState.courses.filter(c => c.code.toUpperCase().startsWith('STAG-H501') || c.code.toUpperCase().startsWith('STAG-H502'));
      result.passed = internships.length === 0;
      result.currentVal = result.passed ? '0 found' : `${internships.length} found`;
      result.details = result.passed
        ? 'No prohibited internships are included in the study plan.'
        : `Prohibited internship course(s) detected: ${internships.map(i => i.code).join(', ')}.`;
    }
    else if (rule.type === 'project_limits') {
      const proj417 = appState.courses.find(c => c.code.toUpperCase().startsWith('PROJ-H417'));
      const proj418 = appState.courses.find(c => c.code.toUpperCase().startsWith('PROJ-H418'));
      
      if (proj417) {
        result.passed = false;
        result.currentVal = 'Failed';
        result.details = 'PROJ-H417 (Development Cooperation Project) is prohibited for exchange students.';
      } else if (proj418) {
        result.passed = true;
        result.warn = true;
        result.currentVal = 'Warning';
        result.details = 'PROJ-H418 is open only if student has French C1 level and stays for the full year.';
      } else {
        result.passed = true;
        result.currentVal = 'Passed';
        result.details = 'All project selections comply with guidelines.';
      }
    }
    else if (rule.type === 'dd_core_only') {
      const totalCredits = appState.courses.reduce((acc, c) => acc + (c.ects || 0), 0);
      if (totalCredits === 0) {
        result.passed = false;
        result.currentVal = '0 ECTS';
        result.details = 'No courses added yet.';
      } else {
        const invalidCourses = [];
        const programGroups = {}; // programCode -> { name, count, ects, coursesList }
        const otherCoursesList = [];
        let otherCredits = 0;
        let otherCount = 0;

        appState.courses.forEach(c => {
          const resolved = resolveProgramCode(c.code, c.id, CORE_120_PROGRAM_CODES);
          if (resolved && resolved.isEligible) {
            const code = resolved.chosenCode;
            if (!programGroups[code]) {
              programGroups[code] = { name: resolved.chosenName, count: 0, ects: 0, coursesList: [] };
            }
            programGroups[code].count++;
            programGroups[code].ects += c.ects;
            
            const extraCodes = resolved.allCodes.filter(x => x !== code && x.toUpperCase().startsWith('MA-IR'));
            const extraStr = extraCodes.length > 0 ? ` [also in: ${extraCodes.join(', ')}]` : '';
            programGroups[code].coursesList.push(`${c.code} - ${c.title} (${c.ects} ECTS)${extraStr}`);
          } else {
            invalidCourses.push(c.code);
            otherCredits += c.ects;
            otherCount++;
            const coreCodesOnly = resolved ? resolved.allCodes.filter(x => x.toUpperCase().startsWith('MA-IR')) : [];
            const extraStr = coreCodesOnly.length > 0 ? ` [in: ${coreCodesOnly.join(', ')}]` : '';
            otherCoursesList.push(`${c.code} - ${c.title} (${c.ects} ECTS)${extraStr}`);
          }
        });
        
        result.passed = invalidCourses.length === 0;
        result.currentVal = result.passed ? 'Core Only' : 'Outside Core';
        
        let detailsHtml = result.passed
          ? 'All courses are selected from the core 120-credit Master programs.<br>'
          : `Courses outside the core 120-credit Masters detected: ${invalidCourses.join(', ')}.<br>`;

        detailsHtml += '<div style="margin-top: 5px; font-size: 0.78rem; opacity: 0.95;">';
        detailsHtml += '<strong>Breakdown by Program:</strong>';
        detailsHtml += '<ul style="margin: 3px 0 0 15px; padding: 0; list-style-type: disc;">';
        
        Object.keys(programGroups).forEach(code => {
          const group = programGroups[code];
          detailsHtml += `<li><strong>${group.name} (${code})</strong>: ${group.count} course(s), ${group.ects} ECTS`;
          detailsHtml += '<ul style="margin: 2px 0 5px 15px; padding: 0; list-style-type: circle; opacity: 0.9;">';
          group.coursesList.forEach(courseText => {
            detailsHtml += `<li>${courseText}</li>`;
          });
          detailsHtml += '</ul></li>';
        });
        if (otherCount > 0) {
          detailsHtml += `<li><strong>Other / Non-Core</strong>: ${otherCount} course(s), ${otherCredits} ECTS`;
          detailsHtml += '<ul style="margin: 2px 0 5px 15px; padding: 0; list-style-type: circle; opacity: 0.9;">';
          otherCoursesList.forEach(courseText => {
            detailsHtml += `<li>${courseText}</li>`;
          });
          detailsHtml += '</ul></li>';
        }
        detailsHtml += '</ul></div>';

        result.details = detailsHtml;
      }
    }
    else if (rule.type === 'dd_thesis') {
      const thesisKeywords = [/thesis/i, /projet/i, /project/i, /dissertation/i, /memoria/i, /trabajo/i, /tfg/i, /tfm/i];
      const match = appState.courses.find(c => 
        thesisKeywords.some(regex => regex.test(c.title) || regex.test(c.code))
      );
      
      if (match) {
        result.passed = true;
        result.currentVal = 'Detected';
        result.details = `Found thesis/project course: "${match.code} - ${match.title}"`;
      } else {
        result.passed = true; // Soft check, so pass but warn
        result.warn = true;
        result.currentVal = 'Not Found';
        result.details = 'No Master Thesis or Capstone Project course detected in study plan.';
      }
    }
    else if (rule.type === 'no_ineligible') {
      if (appState.courses.length === 0) {
        result.passed = true;
        result.currentVal = 'N/A';
        result.details = 'No courses added yet.';
      } else {
        const ineligibleCourses = appState.courses.filter(c => {
          const cs = c.courseStatus || (c.isUnknown ? 'not-in-epb' : 'verified');
          return cs === 'ineligible';
        });
        result.passed = ineligibleCourses.length === 0;
        result.currentVal = result.passed ? '0 flagged' : `${ineligibleCourses.length} flagged`;
        if (result.passed) {
          result.details = 'All courses belong to at least one eligible EPB program.';
        } else {
          const list = ineligibleCourses.map(c => c.code).join(', ');
          result.details = `${ineligibleCourses.length} course(s) found in EPB but not in any eligible program: ${list}. Remove or replace them.`;
        }
      }
    }

    renderRuleResultCard(rule, result);
    evaluationResults.push({ rule, result });
  });
  
  appState.lastEvaluationResults = evaluationResults;
  renderValidationSummary(evaluationResults);
}

// Generate a summary sentence like "Rule 2 and Rule 3 were violated, and there are ineligible courses"
function getSummarySentence(results) {
  const failedRules = results.filter(r => !r.result.passed && r.rule.type !== 'no_ineligible');
  const hasIneligible = appState.courses.some(c => {
    const cs = c.courseStatus || (c.isUnknown ? 'not-in-epb' : 'verified');
    return cs === 'ineligible';
  });

  const formatNames = (list) => {
    const names = list.map(f => {
      const match = f.rule.name.match(/^(Rule\s+\d+)/i);
      return match ? match[1] : f.rule.name;
    });
    const unique = [...new Set(names)];
    if (unique.length === 0) return '';
    if (unique.length === 1) return unique[0];
    if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
    const last = unique.pop();
    return `${unique.join(', ')}, and ${last}`;
  };

  const rulesText = formatNames(failedRules);
  
  if (rulesText && hasIneligible) {
    const uniqueNamesCount = [...new Set(failedRules.map(f => {
      const match = f.rule.name.match(/^(Rule\s+\d+)/i);
      return match ? match[1] : f.rule.name;
    }))].length;
    const verb = uniqueNamesCount === 1 ? 'was' : 'were';
    return `${rulesText} ${verb} violated, and there are ineligible courses.`;
  } else if (rulesText) {
    const uniqueNamesCount = [...new Set(failedRules.map(f => {
      const match = f.rule.name.match(/^(Rule\s+\d+)/i);
      return match ? match[1] : f.rule.name;
    }))].length;
    const verb = uniqueNamesCount === 1 ? 'was' : 'were';
    return `${rulesText} ${verb} violated.`;
  } else if (hasIneligible) {
    return 'There are ineligible courses.';
  } else {
    return 'No validation rules were violated.';
  }
}

// Render validation summary alert details
function renderValidationSummary(results) {
  const summaryCard = document.getElementById('validation-summary-card');
  const summaryContent = document.getElementById('validation-summary-content');
  const recommendationSection = document.getElementById('recommendation-section');
  if (!summaryCard || !summaryContent) return;

  summaryCard.style.display = 'flex';
  if (recommendationSection) recommendationSection.style.display = 'block';

  const failed = results.filter(r => !r.result.passed);
  const warned = results.filter(r => r.result.passed && r.result.warn);

  // Collect parsing-mismatch warnings from course table
  const parsingWarnings = [];
  appState.courses.forEach(c => {
    if (c.titleMismatch) {
      parsingWarnings.push(`<strong style="color: #ffa502;">${escapeHtml(c.code)}</strong>: title in LA ("${escapeHtml(c.parsedTitle)}") differs from official name ("${escapeHtml(c.title)}").`);
    }
    if (c.ectsWarning) {
      parsingWarnings.push(`<strong style="color: #ffa502;">${escapeHtml(c.code)}</strong>: ECTS in LA (${c.parsedEcts}) differs from official value (${c.ects} ECTS) — table updated to official value.`);
    }
    if (c.termWarning) {
      parsingWarnings.push(`<strong style="color: #ffa502;">${escapeHtml(c.code)}</strong>: term in LA ("${escapeHtml(c.parsedTerm)}") differs from official term ("${c.term}") — table updated to official value.`);
    }
  });

  let html = `
    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.5; padding: 0.75rem 1rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px;">
      For more details, see Chapter 6 (in English) in <a href="https://polytech.ulb.be/fr/international/reglement-interieur-de-la-mobilite-internationale" target="_blank" style="color: var(--accent-cyan); text-decoration: underline;">https://polytech.ulb.be/fr/international/reglement-interieur-de-la-mobilite-internationale</a>.
    </div>
    <div style="font-size: 1rem; font-weight: 600; margin-bottom: 1.25rem; color: ${failed.length > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)'};">
      ${getSummarySentence(results)}
    </div>
  `;

  if (failed.length === 0 && warned.length === 0 && parsingWarnings.length === 0) {
    html += `
      <div class="validation-summary-alert success">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0;">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <div>
          <strong>All rules satisfied.</strong> The study program is fully compliant with EPB requirements.
        </div>
      </div>
    `;
  } else {
    if (failed.length > 0) {
      html += `
        <div class="validation-summary-alert danger">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div>
            <strong style="color: var(--text-primary);">Violations Detected:</strong> The following validation rules are not satisfied:
            <ul style="margin: 8px 0 0 16px; padding: 0; list-style-type: disc;">
              ${failed.map(f => `
                <li style="margin-bottom: 6px;">
                  <strong style="color: #ff4757;">${escapeHtml(f.rule.name)}</strong>:
                  <span style="opacity: 0.95;">${f.result.details}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      `;
    }

    if (warned.length > 0) {
      html += `
        <div class="validation-summary-alert warning" style="margin-top: 1rem;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <div>
            <strong style="color: var(--text-primary);">Rule Warnings:</strong> Please double-check the following:
            <ul style="margin: 8px 0 0 16px; padding: 0; list-style-type: disc;">
              ${warned.map(w => `
                <li style="margin-bottom: 6px;">
                  <strong style="color: #ffa502;">${escapeHtml(w.rule.name)}</strong>:
                  <span style="opacity: 0.95;">${w.result.details}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      `;
    }

    if (parsingWarnings.length > 0) {
      html += `
        <div class="validation-summary-alert warning" style="margin-top: 1rem;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <div>
            <strong style="color: var(--text-primary);">Parsing Mismatches:</strong> The following discrepancies were found between the LA PDF and the official course database. The table has been populated with the official values.
            <ul style="margin: 8px 0 0 16px; padding: 0; list-style-type: disc;">
              ${parsingWarnings.map(w => `<li style="margin-bottom: 5px;">${w}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    }
  }

  summaryContent.innerHTML = html;
}

// Copy validation summary to clipboard as plain text
function copyValidationSummary() {
  const lines = [];

  // Title and dynamic status summary
  lines.push('# LA Validation Report');
  lines.push('');
  
  const statusText = getSummarySentence(appState.lastEvaluationResults || []);
  lines.push(`## STATUS: ${statusText}`);
  lines.push('');
  
  lines.push('> For more details, see Chapter 6 (in English) in https://polytech.ulb.be/fr/international/reglement-interieur-de-la-mobilite-internationale');
  lines.push('');

  // Violations & Warnings (Most obvious)
  const resultCards = document.querySelectorAll('#results-grid .result-card');
  const nonPassedCards = Array.from(resultCards).filter(card => 
    card.classList.contains('failed') || card.classList.contains('warn')
  );
  
  if (nonPassedCards.length > 0) {
    lines.push('### Rule Violations & Warnings');
    nonPassedCards.forEach(card => {
      const nameEl   = card.querySelector('.result-title');
      const statusEl = card.querySelector('.result-badge-pill');
      const detailEl = card.querySelector('.result-desc');
      const name   = nameEl   ? nameEl.innerText.trim()   : '';
      const status = statusEl ? statusEl.innerText.trim() : '';
      const detail = detailEl ? detailEl.innerText.trim() : '';
      if (name) {
        lines.push(`* **${name}** [${status}]: ${detail}`);
      }
    });
    lines.push('');
  } else {
    lines.push('### Rules Compliance');
    lines.push('No rule violations or warnings detected.');
    lines.push('');
  }

  // Parsing mismatches
  const parseWarns = [];
  appState.courses.forEach(c => {
    if (c.titleMismatch) parseWarns.push(`* **${c.code}**: title mismatch — LA: "${c.parsedTitle}" / Official: "${c.title}"`);
    if (c.ectsWarning)   parseWarns.push(`* **${c.code}**: ECTS mismatch — LA: ${c.parsedEcts} / Official: ${c.ects}`);
    if (c.termWarning)   parseWarns.push(`* **${c.code}**: term mismatch — LA: "${c.parsedTerm}" / Official: "${c.term}"`);
  });
  if (parseWarns.length > 0) {
    lines.push('### Parsing Mismatches');
    parseWarns.forEach(w => lines.push(w));
    lines.push('');
  }

  // Student Information
  const student = (document.getElementById('meta-student')     || {}).innerText || '';
  const origin  = (document.getElementById('meta-institution') || {}).innerText || '';
  const period  = (document.getElementById('meta-period')      || {}).innerText || '';
  
  lines.push('### Student Information');
  if (student) lines.push(`* **Student**: ${student}`);
  if (origin)  lines.push(`* **Institution**: ${origin}`);
  if (period)  lines.push(`* **Mobility Period**: ${period}`);
  lines.push('');

  // Course list
  lines.push('### Selected Courses');
  appState.courses.forEach(c => {
    const cs = c.courseStatus || (c.isUnknown ? 'not-in-epb' : 'verified');
    const statusLabel = cs === 'not-in-epb' ? 'External' : cs === 'ineligible' ? 'Ineligible' : 'Internal';
    lines.push(`* \`${c.code}\` ${c.title} (${c.ects} ECTS) [${c.term}] - **[${statusLabel}]**`);
  });
  const totalEcts = appState.courses.reduce((s, c) => s + (c.ects || 0), 0);
  lines.push(`* **Total**: ${appState.courses.length} courses, ${totalEcts} ECTS`);
  lines.push('');

  // Coordinator recommendation
  const rec = (document.getElementById('recommendation-input') || {}).innerText || '';
  if (rec.trim()) {
    lines.push('### Coordinator Recommendation');
    lines.push(rec.trim());
    lines.push('');
  }

  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy-summary');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }
  }).catch(() => showToast('Could not copy to clipboard.', 'error'));
}

// Inject Result Dashboard Card

function renderRuleResultCard(rule, result) {
  const card = document.createElement('div');
  // Support a 'warn' state (passes but recommendation not met)
  const stateClass = !result.passed ? 'failed' : (result.warn ? 'warn' : 'passed');
  card.className = `result-card ${stateClass}`;

  let iconSvg;
  if (result.passed && !result.warn) {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
         <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
       </svg>`;
  } else if (result.warn) {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
         <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
         <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
         <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
       </svg>`;
  } else {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
         <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
         <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
         <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
       </svg>`;
  }
  card.innerHTML = `
    <div class="result-icon">${iconSvg}</div>
    <div class="result-info">
      <span class="result-title">${rule.name}</span>
      <span class="result-desc">${result.details}</span>
      <span class="result-badge-pill">${result.currentVal}</span>
    </div>
  `;

  resultsGrid.appendChild(card);
}

// Helper to set parsing UI status indicator
function setAppStatus(state, text) {
  if (!statusIndicator) return;
  statusIndicator.className = `upload-status-info ${state}`;
  statusIndicator.innerText = text;
}

// Show custom toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  } else if (type === 'error') {
    iconSvg = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
        <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  } else {
    iconSvg = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
        <line x1="12" y1="16" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="8" x2="12.01" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-message">${message}</div>
    <button class="toast-close" title="Close">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  });

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }
  }, 4000);
}
