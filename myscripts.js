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
const syncBtn = document.getElementById('sync-btn');
const modal = document.getElementById('custom-modal');
const modalText = document.getElementById('modal-text');
const modalInput = document.getElementById('modal-input');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

// --- State & Constants ---
let fetchedNames = [];
let strataPlanCache = null; 
let isSyncing = false;
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
            strataPlanCache = names;
            lotInput.disabled = false;
            checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
            return;
        } else {
            localStorage.removeItem(cacheKey);
        }
    }

    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getAllNamesForPlan&sp=${sp}`);
        const data = await response.json();
        if (data.success) {
            const newCacheItem = { timestamp: new Date().getTime(), names: data.names };
            strataPlanCache = data.names;
            localStorage.setItem(cacheKey, JSON.stringify(newCacheItem));
            lotInput.disabled = false;
            checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
         checkboxContainer.innerHTML = `<p style="color: red;">Could not load data for this plan.</p>`;
    }
};

// --- Submission Queue & Syncing ---
const updateSyncButton = () => {
    const queue = JSON.parse(localStorage.getItem('submissionQueue') || '[]');
    if (queue.length > 0) {
        syncBtn.disabled = false;
        const plural = queue.length === 1 ? '' : 's';
        syncBtn.textContent = `Sync ${queue.length} Submission${plural}`;
    } else {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Submissions Synced';
    }
};

const syncSubmissions = async () => {
    if (isSyncing) { return; }
    const queue = JSON.parse(localStorage.getItem('submissionQueue') || '[]');
    if (queue.length === 0) { updateSyncButton(); return; }

    isSyncing = true;
    statusEl.textContent = `Syncing ${queue.length} items...`;
    statusEl.style.color = 'blue';
    syncBtn.disabled = true;

    const batchToSend = [...queue];

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'batchSubmit', submissions: batchToSend })
        });
        const result = await response.json();
        if (result.success) {
            const currentQueue = JSON.parse(localStorage.getItem('submissionQueue') || '[]');
            const sentIds = new Set(batchToSend.map(item => item.submissionId));
            const newQueue = currentQueue.filter(item => !sentIds.has(item.submissionId));
            localStorage.setItem('submissionQueue', JSON.stringify(newQueue));
            statusEl.textContent = `Successfully synced ${batchToSend.length} items.`;
            statusEl.style.color = 'green';
            fetchInitialData();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        statusEl.textContent = `Sync failed. Items remain queued. Error: ${error.message}`;
        statusEl.style.color = 'red';
    } finally {
        isSyncing = false;
        updateSyncButton();
    }
};

// --- UI & Rendering ---
const resetUiOnPlanChange = () => {
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
    const count = personCount || 0;
    const personLabel = (count === 1) ? 'person' : 'people';
    personCountSpan.textContent = `(${count} ${personLabel})`;
    
    attendeeTableBody.innerHTML = '';
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

const fetchInitialData = async () => {
    const sp = strataPlanSelect.value;
    if (!sp) {
        return;
    }
    quorumDisplay.textContent = 'Loading...';
    attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading attendees...</td></tr>`;

    try {
        const quorumResponse = await fetch(`${APPS_SCRIPT_URL}?action=getQuorum&sp=${sp}`);
        const quorumData = await quorumResponse.json();
        if (quorumData.success) {
            updateQuorumDisplay(quorumData.attendanceCount, quorumData.totalLots);
        } else {
            updateQuorumDisplay();
        }

        const attendeesResponse = await fetch(`${APPS_SCRIPT_URL}?action=getAttendees&sp=${sp}`);
        const attendeesData = await attendeesResponse.json();
        if (attendeesData.success) {
            renderAttendeeTable(attendeesData.attendees, attendeesData.personCount);
        } else {
           renderAttendeeTable([], 0);
        }
    } catch (error) {
        console.error("[DATA] A critical error occurred in fetchInitialData:", error);
        updateQuorumDisplay();
        renderAttendeeTable([], 0);
    }
};

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
    const sp = strataPlanSelect.value;
    const lot = lotInput.value.trim();
    if (!sp || !lot) {
        statusEl.textContent = 'Please select a plan and enter a lot number.';
        statusEl.style.color = 'red';
        return;
    }
    
    let selectedNames = Array.from(document.querySelectorAll('input[name="attendee"]:checked')).map(cb => cb.value);
    const isFinancial = financialCheckbox.checked;
    const isProxy = proxyCheckbox.checked;
    const companyRep = companyRepInput.value.trim();
    const proxyHolderLot = proxyHolderLotInput.value.trim();

    if (isProxy) {
        if (!proxyHolderLot) { statusEl.textContent = 'Please enter the Proxy Holder Lot Number.'; statusEl.style.color = 'red'; return; }
        selectedNames = [];
    } else {
        if (selectedNames.length === 0 && fetchedNames.length > 0) {
            const isCompany = /\b(P\/L|Pty Ltd|Limited)\b/i.test(fetchedNames[0]);
            if (isCompany) selectedNames = [fetchedNames[0]];
        }
        if (selectedNames.length === 0) { statusEl.textContent = 'Please select at least one owner.'; statusEl.style.color = 'red'; return; }
    }

    const submission = {
        submissionId: `sub_${Date.now()}_${Math.random()}`,
        sp, lot, names: selectedNames, financial: isFinancial, proxyHolderLot, companyRep
    };

    const queue = JSON.parse(localStorage.getItem('submissionQueue') || '[]');
    queue.push(submission);
    localStorage.setItem('submissionQueue', JSON.stringify(queue));

    statusEl.textContent = `Lot ${lot} queued for submission.`;
    statusEl.style.color = 'green';
    form.reset();
    companyRepGroup.style.display = 'none';
    proxyHolderGroup.style.display = 'none';
    checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
    lotInput.focus();

    updateSyncButton();
    setTimeout(() => { if (statusEl.textContent === `Lot ${lot} queued for submission.`) statusEl.textContent = ''; }, 3000);
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
syncBtn.addEventListener('click', syncSubmissions);

document.addEventListener('DOMContentLoaded', async () => {
    await populateStrataPlans();
    const initialSP = strataPlanSelect.value;
    if (initialSP) {
      await cacheAllNames(initialSP);
      await fetchInitialData();
    }
    updateSyncButton();
    setInterval(syncSubmissions, 60000);
});

lotInput.addEventListener('blur', fetchNames);
form.addEventListener('submit', handleFormSubmit);
setInterval(fetchInitialData, 90000);
