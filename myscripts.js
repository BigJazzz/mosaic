// --- DOM Elements ---
const lotInput = document.getElementById('lot-number');
const checkboxContainer = document.getElementById('checkbox-container');
const form = document.getElementById('attendance-form');
const statusEl = document.getElementById('status');
const submitButton = document.getElementById('submit-button');
const financialCheckbox = document.getElementById('is-financial');
const proxyCheckbox = document.getElementById('is-proxy');
const quorumDisplay = document.getElementById('quorum-display');
const attendeeTableBody = document.getElementById('attendee-table-body');
const companyRepGroup = document.getElementById('company-rep-group');
const companyRepInput = document.getElementById('company-rep');
const personCountSpan = document.getElementById('person-count');
const proxyHolderGroup = document.getElementById('proxy-holder-group');
const proxyHolderLotInput = document.getElementById('proxy-holder-lot');
const strataPlanSelect = document.getElementById('strata-plan-select');
const emailPdfBtn = document.getElementById('email-pdf-btn');
const modal = document.getElementById('custom-modal');
const modalText = document.getElementById('modal-text');
const modalInput = document.getElementById('modal-input');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

// --- State & Constants ---
let fetchedNames = [];
let strataPlanCache = null;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwccn5PyK9fGhPtlXOlLTQp7JQNxyxDHxTLOlYE8_Iy4Fm9sGfCmF5-P9edv50edRhnVw/exec';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

// --- Modal Logic ---
let modalResolve = null;
const showModal = (text, { showInput = false, confirmText = 'Confirm', cancelText = 'Cancel', isHtml = false } = {}) => {
    if (isHtml) { modalText.innerHTML = text; }
    else { modalText.textContent = text; }
    modalInput.style.display = showInput ? 'block' : 'none';
    modalInput.value = '';
    modalConfirmBtn.textContent = confirmText;
    modalCancelBtn.textContent = cancelText;
    modal.style.display = 'flex';
    if (showInput) modalInput.focus();
    return new Promise(resolve => { modalResolve = resolve; });
};
modalConfirmBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    if (modalResolve) modalResolve({ confirmed: true, value: modalInput.value });
});
modalCancelBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    if (modalResolve) modalResolve({ confirmed: false, value: null });
});
modalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        modalConfirmBtn.click();
    }
});

// --- Caching Logic ---
const clearStrataCache = () => {
    console.log("[CACHE] Clearing all strata-related keys from local storage.");
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('strata_')) {
            localStorage.removeItem(key);
        }
    });
};

const cacheAllNames = async (sp) => {
    if (!sp) return;
    const cacheKey = `strata_${sp}`;
    strataPlanCache = null;
    lotInput.disabled = true;
    checkboxContainer.innerHTML = '<p>Loading strata data...</p>';

    const cachedItem = localStorage.getItem(cacheKey);
    if (cachedItem) {
        const { timestamp, names } = JSON.parse(cachedItem);
        const isCacheValid = (new Date().getTime() - timestamp) < CACHE_DURATION_MS;
        if (isCacheValid) {
            console.log(`[CACHE] Found valid cache for SP ${sp}. Loading from local storage.`);
            strataPlanCache = names;
            lotInput.disabled = false;
            checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
            return;
        } else {
            console.log(`[CACHE] Cache for SP ${sp} is expired. Removing.`);
            localStorage.removeItem(cacheKey);
        }
    }

    console.log(`[CACHE] No valid cache for SP ${sp}. Fetching from server...`);
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getAllNamesForPlan&sp=${sp}`);
        const data = await response.json();
        if (data.success) {
            const newCacheItem = { timestamp: new Date().getTime(), names: data.names };
            strataPlanCache = data.names;
            localStorage.setItem(cacheKey, JSON.stringify(newCacheItem));
            lotInput.disabled = false;
            checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
            console.log(`[CACHE] Successfully fetched and cached data for SP ${sp}.`);
        } else { throw new Error(data.error); }
    } catch (error) {
         console.error('[CACHE] Failed to cache strata plan data:', error);
         checkboxContainer.innerHTML = `<p style="color: red;">Could not load data for this plan.</p>`;
    }
};

// --- UI & Rendering ---
const resetUiOnPlanChange = () => {
    console.log("[UI] Resetting UI for plan change.");
    attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Select a plan to see attendees.</td></tr>`;
    personCountSpan.textContent = `(0 people)`;
    quorumDisplay.innerHTML = `Quorum: ...%`;
    quorumDisplay.style.backgroundColor = '#6c757d';
    checkboxContainer.innerHTML = '<p>Select a Strata Plan to begin.</p>';
    lotInput.value = '';
    lotInput.disabled = true;
};

const renderStrataPlans = (plans) => {
    if (!plans) { return; }
    strataPlanSelect.innerHTML = '<option value="">Select a plan...</option>';
    plans.sort((a, b) => a.sp - b.sp);
    plans.forEach(plan => {
        const option = document.createElement('option');
        option.value = plan.sp;
        option.textContent = `${plan.sp} - ${plan.suburb}`;
        strataPlanSelect.appendChild(option);
    });
    const savedSP = document.cookie.split('; ').find(row => row.startsWith('selectedSP='))?.split('=')[1];
    if (savedSP) strataPlanSelect.value = savedSP;
};

const renderAttendeeTable = (attendees, personCount) => {
    attendeeTableBody.innerHTML = '';
    personCountSpan.textContent = `(${personCount || 0} people)`;
    if (!attendees || attendees.length === 0) {
        attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No attendees yet.</td></tr>`;
        return;
    }
    attendees.sort((a, b) => a.lot - b.lot);
    attendees.forEach(attendee => {
        const isProxy = String(attendee.name).startsWith('Proxy - Lot');
        const isCompany = !isProxy && /\b(P\/L|Pty Ltd|Limited)\b/i.test(attendee.name);
        let ownerRepName = '';
        let companyName = '';
        let rowColor = '#d4e3c1';
        if (isProxy) { ownerRepName = attendee.name; rowColor = '#c1e1e3'; }
        else if (isCompany) {
            const parts = attendee.name.split(' - ');
            companyName = parts[0].trim();
            if (parts.length > 1) ownerRepName = parts[1].trim();
            rowColor = '#cbc1e3';
        } else { ownerRepName = attendee.name; }
        const row = document.createElement('tr');
        row.style.backgroundColor = rowColor;
        row.innerHTML = `<td>${attendee.lot}</td><td>${ownerRepName}</td><td>${companyName}</td><td><button class="delete-btn" data-lot="${attendee.lot}">Delete</button></td>`;
        attendeeTableBody.appendChild(row);
    });
};

const updateQuorumDisplay = (count = 0, total = 0) => {
    const percentage = total > 0 ? Math.floor((count / total) * 100) : 0;
    quorumDisplay.innerHTML = `Quorum: ${percentage}%<br><small>(${count}/${total})</small>`;
    quorumDisplay.style.backgroundColor = percentage >= 25 ? '#28a745' : '#dc3545';
};

// --- Data Fetching & API Calls ---
const populateStrataPlans = async () => {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getStrataPlans`);
        const data = await response.json();
        if (data.success && data.plans) {
            renderStrataPlans(data.plans);
            strataPlanSelect.disabled = false;
        } else {
            throw new Error(data.error || "Server returned no plans.");
        }
    } catch (error) {
        console.error("[CLIENT] Could not fetch strata plans:", error);
        strataPlanSelect.innerHTML = '<option value="">Could not load plans</option>';
    }
};

const fetchAttendees = async () => {
    const sp = strataPlanSelect.value;
    if (!sp) return;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getAttendees&sp=${sp}`);
        const data = await response.json();
        if (data.success) {
            renderAttendeeTable(data.attendees, data.personCount);
        }
    } catch (error) { console.error("Could not fetch attendee list:", error); }
};

const fetchInitialData = async () => {
    const sp = strataPlanSelect.value;
    console.log(`[DATA] Starting to fetch initial data for SP: ${sp}`);
    if (!sp) {
        console.log("[DATA] No SP selected. Aborting.");
        return;
    }
    quorumDisplay.textContent = 'Loading...';
    attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading attendees...</td></tr>`;

    try {
        // Fetch Quorum
        console.log("[DATA] Fetching quorum...");
        const quorumResponse = await fetch(`${APPS_SCRIPT_URL}?action=getQuorum&sp=${sp}`);
        const quorumData = await quorumResponse.json();
        console.log("[DATA] Quorum response received:", quorumData);
        if (quorumData.success) {
            updateQuorumDisplay(quorumData.attendanceCount, quorumData.totalLots);
        } else {
            updateQuorumDisplay(); // Reset to 0
        }

        // Fetch Attendees (now inside the same try...catch block)
        console.log("[DATA] Fetching attendees...");
        const attendeesResponse = await fetch(`${APPS_SCRIPT_URL}?action=getAttendees&sp=${sp}`);
        const attendeesData = await attendeesResponse.json();
        console.log("[DATA] Attendees response received:", attendeesData);
        if (attendeesData.success) {
            renderAttendeeTable(attendeesData.attendees, attendeesData.personCount);
        } else {
           renderAttendeeTable([], 0); // Clear table on failure
        }

    } catch (error) {
        console.error("[DATA] A critical error occurred in fetchInitialData:", error);
        updateQuorumDisplay();
        renderAttendeeTable([], 0);
    }
};

// You can now REMOVE the old fetchAttendees function, as its logic is included above.
const fetchAttendees = async () => { /* This function is no longer needed */ };

const fetchNames = () => {
    const lot = lotInput.value.trim();
    companyRepGroup.style.display = 'none';
    companyRepInput.value = '';
    fetchedNames = [];
    if (!lot) { checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>'; return; }
    if (!strataPlanCache) { checkboxContainer.innerHTML = `<p style="color: red;">Strata data is not loaded. Please re-select the plan.</p>`; return; }

    const namesFromCache = strataPlanCache[lot];
    if (namesFromCache) {
        const mainContactName = namesFromCache[0] || '';
        const fullNameOnTitle = namesFromCache[1] || '';
        let finalNameString = mainContactName;
        const hasTitles = /\b(Mr|Mrs|Ms|Miss)\b/i.test(mainContactName);
        const firstWord = mainContactName.split(' ')[0] || '';
        const firstNameIsInitial = /^[A-Z]\.?$/.test(firstWord);
        if (!mainContactName || hasTitles || firstNameIsInitial) { finalNameString = fullNameOnTitle; }

        const isCompany = /\b(P\/L|Pty Ltd|Limited)\b/i.test(finalNameString);
        let parsedNames = [];
        if (isCompany) {
            parsedNames = [finalNameString.replace(/\s*\(ref:\d+\)/gi, '').trim()];
        } else {
            parsedNames = finalNameString.split(/\s+and\s+|\s*&\s*|\s*,\s*/i)
                .map(name => name.trim().replace(/\s*\(ref:\d+\)/gi, '').replace(/^Per\s/i, '')).filter(name => name);
        }
        fetchedNames = [...new Set(parsedNames)];
        checkboxContainer.innerHTML = '';
        if (fetchedNames.length > 0) {
            fetchedNames.forEach(name => {
                const div = document.createElement('div');
                div.className = 'checkbox-item';
                div.innerHTML = `<label><input type="checkbox" name="attendee" value="${name}"> ${name}</label>`;
                if (/\b(P\/L|Pty Ltd|Limited)\b/i.test(name)) { companyRepGroup.style.display = 'block'; }
                checkboxContainer.appendChild(div);
            });
        } else { checkboxContainer.innerHTML = '<p style="color: red;">No valid names found for this Lot Number.</p>';}
    } else {
        checkboxContainer.innerHTML = '<p style="color: red;">No names found for this Lot Number.</p>';
    }
};

const handleDelete = async (lotNumber) => {
    const sp = strataPlanSelect.value;
    if (!sp) return;
    const modalResponse = await showModal(`Are you sure you want to delete the attendance record for Lot ${lotNumber}?`);
    if (modalResponse.confirmed) {
        statusEl.textContent = `Deleting Lot ${lotNumber}...`;
        try {
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'delete', lot: lotNumber, sp: sp })
            });
            const result = await response.json();
            if (result.success) {
                statusEl.textContent = `Lot ${lotNumber} deleted successfully.`;
                fetchInitialData();
            } else { throw new Error(result.error); }
        } catch (error) {
            console.error('Deletion Error:', error);
            statusEl.textContent = `Error deleting Lot ${lotNumber}: ${error.message}`;
        }
    }
};

const handleEmailPdf = async () => {
    const sp = strataPlanSelect.value;
    if (!sp) {
        statusEl.textContent = 'Please select a Strata Plan first.';
        statusEl.style.color = 'red';
        return;
    }
    const modalResponse = await showModal("Enter the email address to send the PDF report to:", { showInput: true, confirmText: 'Send Email' });
    if (modalResponse.confirmed && modalResponse.value) {
        const email = modalResponse.value;
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            statusEl.textContent = 'Invalid email address.';
            statusEl.style.color = 'red';
            return;
        }
        statusEl.textContent = 'Sending request... The PDF will be emailed shortly.';
        statusEl.style.color = 'blue';
        emailPdfBtn.disabled = true;
        fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'emailPdfReport', sp: sp, email: email })
        }).catch(err => {
            console.warn("Ignoring expected 'Failed to fetch' error for long-running process.", err);
        });
        setTimeout(() => {
            statusEl.textContent = `Report generation started. Please check ${email} in a moment.`;
            statusEl.style.color = 'green';
            emailPdfBtn.disabled = false;
        }, 1500);
    }
};

// --- Event Handlers ---
const handleFormSubmit = async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    statusEl.textContent = 'Submitting...';
    statusEl.style.color = '#333';
    const sp = strataPlanSelect.value;
    const lot = lotInput.value.trim();
    let selectedNames = Array.from(document.querySelectorAll('input[name="attendee"]:checked')).map(cb => cb.value);
    const isFinancial = financialCheckbox.checked;
    const isProxy = proxyCheckbox.checked;
    const companyRep = companyRepInput.value.trim();
    const proxyHolderLot = proxyHolderLotInput.value.trim();
    if (!sp) { statusEl.textContent = 'Please select a Strata Plan.'; statusEl.style.color = 'red'; submitButton.disabled = false; return; }
    if (isProxy) {
        if (!proxyHolderLot) { statusEl.textContent = 'Please enter the Lot Number holding the proxy.'; statusEl.style.color = 'red'; submitButton.disabled = false; return; }
        selectedNames = [];
    } else {
        if (selectedNames.length === 0 && fetchedNames.length > 0) {
            const isCompany = /\b(P\/L|Pty Ltd|Limited)\b/i.test(fetchedNames[0]);
            if (isCompany) selectedNames = [fetchedNames[0]];
        }
        if (selectedNames.length === 0) { statusEl.textContent = 'Please select at least one owner.'; statusEl.style.color = 'red'; submitButton.disabled = false; return; }
    }
    try {
        statusEl.textContent = 'Checking for existing records...';
        const existingCheckResponse = await fetch(`${APPS_SCRIPT_URL}?action=checkExistingRecord&sp=${sp}&lot=${lot}`);
        const existingData = await existingCheckResponse.json();
        if (existingData.success && existingData.exists) {
            const details = existingData.details;
            const confirmationMessage = `An attendance record for Lot ${lot} already exists:<br><br><b>Owner/Rep:</b> ${details.name}<br><b>Financial:</b> ${details.financial}<br><br>Do you want to overwrite it?`;
            const overwriteResponse = await showModal(confirmationMessage, { confirmText: 'Overwrite', cancelText: 'Cancel', isHtml: true });
            if (!overwriteResponse.confirmed) { statusEl.textContent = 'Submission cancelled.'; submitButton.disabled = false; return; }
        }
        statusEl.textContent = 'Checking for existing columns...';
        const checkResponse = await fetch(`${APPS_SCRIPT_URL}?action=checkDate&sp=${sp}`);
        const checkData = await checkResponse.json();
        let meetingName = null;
        if (checkData.success && !checkData.dateExists) {
            const modalResponse = await showModal("Columns for today's date were not found. Please enter the meeting name (e.g., EGM, AGM):", { showInput: true });
            if (!modalResponse.confirmed || !modalResponse.value) { statusEl.textContent = "Submission cancelled."; submitButton.disabled = false; return; }
            meetingName = modalResponse.value;
        } else if (!checkData.success) { throw new Error(checkData.error); }
        statusEl.textContent = 'Submitting attendance...';
        const postBody = { action: 'submit', lot, names: selectedNames, financial: isFinancial, proxyHolderLot, meetingName, companyRep, sp };
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(postBody)
        });
        const result = await response.json();
        if (result.success) {
            statusEl.textContent = 'Submission successful!';
            statusEl.style.color = 'green';
            updateQuorumDisplay(result.attendanceCount, result.totalLots);
            fetchAttendees();
            form.reset();
            companyRepGroup.style.display = 'none';
            proxyHolderGroup.style.display = 'none';
            checkboxContainer.innerHTML = '<p>Select a Strata Plan and enter a Lot Number.</p>';
        } else { throw new Error(result.error); }
    } catch (error) {
        console.error('Submission Error:', error);
        statusEl.textContent = `Submission failed: ${error.message}`;
        statusEl.style.color = 'red';
    } finally {
        submitButton.disabled = false;
    }
};

proxyCheckbox.addEventListener('change', () => {
    const isChecked = proxyCheckbox.checked;
    proxyHolderGroup.style.display = isChecked ? 'block' : 'none';
    checkboxContainer.style.display = isChecked ? 'none' : 'block';
    companyRepGroup.style.display = 'none';
    if (!isChecked && fetchedNames.length > 0 && /\b(P\/L|Pty Ltd|Limited)\b/i.test(fetchedNames[0])) {
        companyRepGroup.style.display = 'block';
    }
});

strataPlanSelect.addEventListener('change', async (e) => {
    const sp = e.target.value;
    console.log(`--- Event: Strata plan changed to ${sp} ---`);
    document.cookie = `selectedSP=${sp};max-age=21600;path=/`;
    resetUiOnPlanChange();
    clearStrataCache();
    if (sp) {
        await cacheAllNames(sp);
        await fetchInitialData();
    }
});

attendeeTableBody.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('delete-btn')) {
        const lotNumber = e.target.dataset.lot;
        handleDelete(lotNumber);
    }
});

emailPdfBtn.addEventListener('click', handleEmailPdf);

document.addEventListener('DOMContentLoaded', async () => {
    await populateStrataPlans();
    const initialSP = strataPlanSelect.value;
    if (initialSP) {
      await cacheAllNames(initialSP);
      await fetchInitialData();
    }
});

lotInput.addEventListener('blur', fetchNames);
form.addEventListener('submit', handleFormSubmit);
setInterval(fetchAttendees, 90000);
