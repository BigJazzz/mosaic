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
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

// --- Modal Logic ---
const showModal = (text, { showInput = false, confirmText = 'Confirm', cancelText = 'Cancel', isHtml = false } = {}) => {
    console.log('[CLIENT] > showModal called.');
    if (isHtml) { modalText.innerHTML = text; } 
    else { modalText.textContent = text; }
    modalInput.style.display = showInput ? 'block' : 'none';
    modalInput.value = '';
    modalConfirmBtn.textContent = confirmText;
    modalCancelBtn.textContent = cancelText;
    modal.style.display = 'flex';
    if (showInput) modalInput.focus();
    return new Promise(resolve => {
        modalResolve = resolve;
    });
};

// --- Caching Logic ---
const clearStrataCache = () => {
    console.log("[CLIENT] > clearStrataCache called.");
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('strata_')) {
            localStorage.removeItem(key);
        }
    });
};

const cacheAllNames = async (sp) => {
    console.log(`[CLIENT] > cacheAllNames started for SP: ${sp}`);
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
            console.log(`[CLIENT] Cache for SP ${sp} is valid. Loading from localStorage.`);
            strataPlanCache = names;
            lotInput.disabled = false;
            checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
            return;
        } else {
            console.log(`[CLIENT] Cache for SP ${sp} is expired. Removing.`);
            localStorage.removeItem(cacheKey);
        }
    }

    console.log(`[CLIENT] No valid cache for SP ${sp}. Fetching from server...`);
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getAllNamesForPlan&sp=${sp}`);
        const data = await response.json();
        console.log(`[CLIENT] < cacheAllNames received:`, data);
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
         console.error('[CLIENT] Could not cache strata plan data:', error);
         checkboxContainer.innerHTML = `<p style="color: red;">Could not load data for this plan.</p>`;
    }
};

// --- Submission Queue & Syncing ---
const updateSyncButton = () => {
    console.log('[CLIENT] > updateSyncButton called.');
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
    console.log('[CLIENT] > syncSubmissions called.');
    if (isSyncing) {
        console.log("[CLIENT] Sync already in progress. Skipping.");
        return;
    }
    const queue = JSON.parse(localStorage.getItem('submissionQueue') || '[]');
    if (queue.length === 0) {
        console.log("[CLIENT] Queue is empty. Nothing to sync.");
        updateSyncButton();
        return;
    }

    isSyncing = true;
    statusEl.textContent = `Syncing ${queue.length} items...`;
    statusEl.style.color = 'blue';
    syncBtn.disabled = true;

    const batchToSend = [...queue];

    try {
        console.log('[CLIENT] Sending batch to server:', batchToSend);
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'batchSubmit', submissions: batchToSend })
        });
        const result = await response.json();
        console.log('[CLIENT] < syncSubmissions received:', result);
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
        console.error("[CLIENT] Sync failed:", error);
        statusEl.textContent = `Sync failed. Items remain queued. Error: ${error.message}`;
        statusEl.style.color = 'red';
    } finally {
        isSyncing = false;
        updateSyncButton();
    }
};

// --- UI & Rendering ---
const resetUiOnPlanChange = () => { console.log('[CLIENT] > resetUiOnPlanChange called.'); /* ... unchanged ... */ };
const renderStrataPlans = (plans) => { console.log('[CLIENT] > renderStrataPlans called.'); /* ... unchanged ... */ };
const renderAttendeeTable = (attendees, personCount) => { console.log('[CLIENT] > renderAttendeeTable called.'); /* ... unchanged ... */ };
const updateQuorumDisplay = (count = 0, total = 0) => { console.log('[CLIENT] > updateQuorumDisplay called.'); /* ... unchanged ... */ };

// --- Data Fetching & API Calls ---
const populateStrataPlans = async () => {
    console.log('[CLIENT] > populateStrataPlans started.');
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getStrataPlans`);
        const data = await response.json();
        console.log('[CLIENT] < populateStrataPlans received:', data);
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
    console.log(`[CLIENT] > fetchInitialData started for SP: ${sp}`);
    if (!sp) return;
    quorumDisplay.textContent = 'Loading...';
    attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading attendees...</td></tr>`;

    try {
        const quorumResponse = await fetch(`${APPS_SCRIPT_URL}?action=getQuorum&sp=${sp}`);
        const quorumData = await quorumResponse.json();
        console.log('[CLIENT] < Quorum response received:', quorumData);
        if (quorumData.success) {
            updateQuorumDisplay(quorumData.attendanceCount, quorumData.totalLots);
        } else { updateQuorumDisplay(); }

        const attendeesResponse = await fetch(`${APPS_SCRIPT_URL}?action=getAttendees&sp=${sp}`);
        const attendeesData = await attendeesResponse.json();
        console.log('[CLIENT] < Attendees response received:', attendeesData);
        if (attendeesData.success) {
            renderAttendeeTable(attendeesData.attendees, attendeesData.personCount);
        } else { renderAttendeeTable([], 0); }
    } catch (error) {
        console.error("[CLIENT] Error in fetchInitialData:", error);
        updateQuorumDisplay();
        renderAttendeeTable([], 0);
    }
};

const fetchNames = () => { /* ... unchanged ... */ };
const handleDelete = async (lotNumber) => { /* ... unchanged ... */ };
const handleEmailPdf = async () => { /* ... unchanged ... */ };

// --- Event Handlers ---
const handleFormSubmit = async (event) => {
    console.log('[CLIENT] > handleFormSubmit called.');
    event.preventDefault();
    /* ... rest of function is unchanged ... */
};

proxyCheckbox.addEventListener('change', () => { /* ... unchanged ... */ });

strataPlanSelect.addEventListener('change', async (e) => {
    console.log(`[CLIENT] Event: Dropdown changed to SP ${e.target.value}`);
    const sp = e.target.value;
    document.cookie = `selectedSP=${sp};max-age=21600;path=/`;
    resetUiOnPlanChange();
    if (sp) {
        await cacheAllNames(sp);
        await fetchInitialData();
    }
});

attendeeTableBody.addEventListener('click', (e) => { /* ... unchanged ... */ });
emailPdfBtn.addEventListener('click', handleEmailPdf);
syncBtn.addEventListener('click', syncSubmissions);

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[CLIENT] Event: DOMContentLoaded. Initializing page.');
    await populateStrataPlans();
    const initialSP = strataPlanSelect.value;
    if (initialSP) {
      console.log(`[CLIENT] Found initial SP from cookie: ${initialSP}`);
      await cacheAllNames(initialSP);
      await fetchInitialData();
    }
    updateSyncButton();
    setInterval(syncSubmissions, 60000);
});

lotInput.addEventListener('blur', fetchNames);
form.addEventListener('submit', handleFormSubmit);
setInterval(fetchInitialData, 90000);
