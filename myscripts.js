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
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbww_UaQUfrSAVne8iZH_pety0FgQ1vPR4IleM3O1x2B0bRJbMoXjkJHWZFRvb1RxrYWzQ/exec';
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
    if (isSyncing) {
        console.log("[SYNC] Sync already in progress. Skipping.");
        return;
    }

    const queue = JSON.parse(localStorage.getItem('submissionQueue') || '[]');
    if (queue.length === 0) {
        console.log("[SYNC] Queue is empty. Nothing to sync.");
        return;
    }

    isSyncing = true;
    statusEl.textContent = `Syncing ${queue.length} items...`;
    statusEl.style.color = 'blue';
    syncBtn.disabled = true;

    const batchToSend = [...queue]; // Create a copy of the batch to send

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'batchSubmit', submissions: batchToSend })
        });
        const result = await response.json();
        if (result.success) {
            // Read the queue again in case new items were added during the sync
            const currentQueue = JSON.parse(localStorage.getItem('submissionQueue') || '[]');
            
            // Get the IDs of the items that were successfully sent
            const sentIds = new Set(batchToSend.map(item => item.submissionId));

            // Filter out the sent items from the current queue
            const newQueue = currentQueue.filter(item => !sentIds.has(item.submissionId));
            
            localStorage.setItem('submissionQueue', JSON.stringify(newQueue));
            statusEl.textContent = `Successfully synced ${batchToSend.length} items.`;
            statusEl.style.color = 'green';
            fetchInitialData(); // Refresh the live data
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error("[SYNC] Sync failed:", error);
        statusEl.textContent = `Sync failed. Items remain queued. Error: ${error.message}`;
        statusEl.style.color = 'red';
    } finally {
        isSyncing = false;
        updateSyncButton();
    }
};


// --- UI & Rendering ---
const resetUiOnPlanChange = () => { /* ... unchanged ... */ };
const renderStrataPlans = (plans) => { /* ... unchanged ... */ };
const renderAttendeeTable = (attendees, personCount) => { /* ... unchanged, but now handles "person" vs "people" */ };
const updateQuorumDisplay = (count = 0, total = 0) => { /* ... unchanged ... */ };
const populateStrataPlans = async () => { /* ... unchanged ... */ };
const fetchInitialData = async () => { /* ... unchanged ... */ };
const fetchNames = () => { /* ... unchanged ... */ };
const handleDelete = async (lotNumber) => { /* ... unchanged ... */ };
const handleEmailPdf = async () => { /* ... unchanged ... */ };

// --- Event Handlers ---
// UPDATED: handleFormSubmit now saves to a local queue instead of submitting directly
const handleFormSubmit = async (event) => {
    event.preventDefault();
    statusEl.textContent = '';

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
    
    // Validation logic...
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

    // Create the submission object with a unique ID
    const submission = {
        submissionId: `sub_${Date.now()}_${Math.random()}`,
        sp, lot, names: selectedNames, financial: isFinancial, proxyHolderLot, companyRep
    };

    // Add to the queue in localStorage
    const queue = JSON.parse(localStorage.getItem('submissionQueue') || '[]');
    queue.push(submission);
    localStorage.setItem('submissionQueue', JSON.stringify(queue));

    // Provide instant feedback and reset form
    statusEl.textContent = `Lot ${lot} queued for submission.`;
    statusEl.style.color = 'green';
    form.reset();
    companyRepGroup.style.display = 'none';
    proxyHolderGroup.style.display = 'none';
    checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
    lotInput.focus();

    updateSyncButton(); // Update the button state
    
    // Clear success message after a few seconds
    setTimeout(() => { if (statusEl.textContent === `Lot ${lot} queued for submission.`) statusEl.textContent = ''; }, 3000);
};

// --- Other Event Listeners ---
proxyCheckbox.addEventListener('change', () => { /* ... unchanged ... */ });
strataPlanSelect.addEventListener('change', async (e) => { /* ... unchanged ... */ });
attendeeTableBody.addEventListener('click', (e) => { /* ... unchanged ... */ });
emailPdfBtn.addEventListener('click', handleEmailPdf);
syncBtn.addEventListener('click', syncSubmissions);

document.addEventListener('DOMContentLoaded', async () => {
    await populateStrataPlans();
    const initialSP = strataPlanSelect.value;
    if (initialSP) {
      await cacheAllNames(initialSP);
      await fetchInitialData();
    }
    updateSyncButton(); // Set initial button state
    setInterval(syncSubmissions, 60000); // Sync every 60 seconds
});

lotInput.addEventListener('blur', fetchNames);
form.addEventListener('submit', handleFormSubmit);
setInterval(fetchInitialData, 90000);
