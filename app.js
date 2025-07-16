// fileName: app.js

// --- DOM Elements ---
const loginSection = document.getElementById('login-section');
const mainAppSection = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const userDisplay = document.getElementById('user-display');
const adminPanel = document.getElementById('admin-panel');
const addUserBtn = document.getElementById('add-user-btn');
const changePasswordBtn = document.getElementById('change-password-btn');
const logoutBtn = document.getElementById('logout-btn');
const strataPlanWrapper = document.getElementById('strata-plan-wrapper');
const userListBody = document.getElementById('user-list-body');
const meetingTitle = document.getElementById('meeting-title');
const meetingDate = document.getElementById('meeting-date');
const changeMeetingTypeBtn = document.getElementById('change-meeting-type-btn');

const lotInput = document.getElementById('lot-number');
const checkboxContainer = document.getElementById('checkbox-container');
const ownerLabel = document.getElementById('owner-label');
const form = document.getElementById('attendance-form');
const statusEl = document.getElementById('status');
const submitButton = document.getElementById('submit-button');
const financialCheckbox = document.getElementById('is-financial');
const financialLabel = document.getElementById('financial-label');
const proxyCheckbox = document.getElementById('is-proxy');
const companyRepGroup = document.getElementById('company-rep-group');
const companyRepInput = document.getElementById('company-rep');
const proxyHolderGroup = document.getElementById('proxy-holder-group');
const proxyHolderLotInput = document.getElementById('proxy-holder-lot');
const strataPlanSelect = document.getElementById('strata-plan-select');
const emailPdfBtn = document.getElementById('email-pdf-btn');
const syncBtn = document.getElementById('sync-btn');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const attendeeTableBody = document.getElementById('attendee-table-body');

// --- State & Constants ---
let fetchedNames = [];
let strataPlanCache = null;
let isSyncing = false;
let currentSyncedAttendees = [];
let currentTotalLots = 0;
// NOTE: These constants are now defined in utils.js or config.js in some versions.
// This version assumes they are defined here for simplicity of a single-file fix.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbww_UaQUfrSAVne8iZH_pety0FgQ1vPR4IleM3O1x2B0bRJbMoXjkJHWZFRvb1RxrYWzQ/exec';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

// FIX: This initializeApp function now correctly accepts a user object as an argument.
const initializeApp = (user) => {
    loginSection.classList.add('hidden');
    mainAppSection.classList.remove('hidden');
    userDisplay.textContent = `${user.username} (${user.role})`;

    if (user.role === 'Admin') {
        adminPanel.classList.remove('hidden');
        changeMeetingTypeBtn.classList.remove('hidden');
        loadUsers();
    }
    
    if (user.spAccess) {
        strataPlanWrapper.classList.add('hidden');
        populateStrataPlans().then(() => {
            strataPlanSelect.value = user.spAccess;
            handlePlanSelection(user.spAccess);
        });
    } else {
        populateStrataPlans();
    }

    updateSyncButton();
    setInterval(syncSubmissions, 60000);
};

// --- Core App Logic ---

const handlePlanSelection = async (sp) => {
    document.cookie = `selectedSP=${sp};max-age=21600;path=/`;
    resetUiOnPlanChange();
    if (sp) {
        await cacheAllNames(sp);
        await checkAndLoadMeeting(sp);
    }
};

const updateSyncButton = () => {
    const queue = getSubmissionQueue();
    if (queue.length > 0) {
        syncBtn.disabled = isSyncing;
        const plural = queue.length === 1 ? '' : 's';
        syncBtn.textContent = `Sync ${queue.length} Submission${plural}`;
    } else {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Submissions Synced';
    }
};

const syncSubmissions = async () => {
    if (isSyncing || !navigator.onLine) return;
    const queue = getSubmissionQueue();
    if (queue.length === 0) return;
    
    isSyncing = true;
    statusEl.textContent = `Syncing ${queue.length} items...`;
    statusEl.style.color = 'blue';
    updateSyncButton();
    document.querySelectorAll('.delete-btn[data-submission-id]').forEach(btn => btn.disabled = true);

    const batchToSend = [...queue];
    try {
        const result = await postToServer({ action: 'batchSubmit', submissions: batchToSend });
        if (result.success) {
            const currentQueue = getSubmissionQueue();
            const sentIds = new Set(batchToSend.map(item => item.submissionId));
            const newQueue = currentQueue.filter(item => !sentIds.has(item.submissionId));
            saveSubmissionQueue(newQueue);
            statusEl.textContent = `Successfully synced ${batchToSend.length} items.`;
            statusEl.style.color = 'green';
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('[CLIENT] Sync failed! Error:', error);
        statusEl.textContent = `Sync failed. Items remain queued.`;
        statusEl.style.color = 'red';
        if (error.message.includes("Authentication failed")) handleLogout();
    } finally {
        isSyncing = false;
        await checkAndLoadMeeting(strataPlanSelect.value); 
        updateSyncButton();
    }
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
            console.log(`[CLIENT] Using cached names for SP ${sp}.`);
            strataPlanCache = names;
            return;
        } else {
            console.log(`[CLIENT] Cache for SP ${sp} is expired. Refetching.`);
            localStorage.removeItem(cacheKey);
        }
    }

    try {
        console.log(`[CLIENT] Fetching all names for SP ${sp} from server.`);
        const data = await postToServer({ action: 'getAllNamesForPlan', sp: sp });
        if (data.success) {
            const newCacheItem = { timestamp: new Date().getTime(), names: data.names };
            strataPlanCache = data.names;
            localStorage.setItem(cacheKey, JSON.stringify(newCacheItem));
        } else { throw new Error(data.error); }
    } catch (error) {
       console.error(`[CLIENT] Could not load data for SP ${sp}. Error:`, error);
       checkboxContainer.innerHTML = `<p style="color: red;">Could not load data for this plan.</p>`;
       if (error.message.includes("Authentication failed")) handleLogout();
    }
};

const populateStrataPlans = async () => {
    try {
        const data = await postToServer({ action: 'getStrataPlans' });
        if (data.success) {
            renderStrataPlans(data.plans);
            strataPlanSelect.disabled = false;
        } else {
            throw new Error(data.error || "Server returned no plans.");
        }
    } catch (error) {
        console.error("[CLIENT] Could not fetch strata plans:", error);
        strataPlanSelect.innerHTML = '<option value="">Could not load plans</option>';
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};

const checkAndLoadMeeting = async (sp) => {
    if (!sp) return;
    document.getElementById('quorum-display').textContent = 'Loading...';
    attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>`;
    try {
        const columnCheck = await postToServer({ action: 'checkTodaysColumns', sp });
        if (!columnCheck.success) throw new Error(columnCheck.error);
        let initialData;
        if (columnCheck.columnsExist) {
            initialData = await postToServer({ action: 'getInitialData', sp });
        } else {
            const modalResponse = await showModal("Today's meeting has not been set up. Please enter the meeting type (e.g., AGM, EGM, SCM):", { showInput: true, confirmText: 'Set Up Meeting' });
            if (modalResponse.confirmed && modalResponse.value) {
                initialData = await postToServer({ action: 'createAndFetchInitialData', sp, meetingType: modalResponse.value });
            } else {
                resetUiOnPlanChange();
                return;
            }
        }
        if (initialData && initialData.success) {
            currentSyncedAttendees = initialData.attendees.map(a => ({...a, status: 'synced'}));
            currentTotalLots = initialData.totalLots;
            updateDisplay(sp);

            if (initialData.meetingType) {
                meetingTitle.textContent = `Attendance Form - ${initialData.meetingType}`;
                meetingDate.textContent = new Date().toLocaleDateString("en-AU", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            }

            if (initialData.meetingType && initialData.meetingType.toUpperCase() === 'SCM') {
                financialLabel.lastChild.nodeValue = " Is Committee Member?";
            } else {
                financialLabel.lastChild.nodeValue = " Is Financial?";
            }
            lotInput.disabled = false;
            checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
            lotInput.focus();
        } else {
            throw new Error(initialData ? initialData.error : "Failed to get initial data.");
        }
    } catch (error) {
        console.error("[CLIENT] A critical error occurred during meeting load:", error);
        currentSyncedAttendees = [];
        currentTotalLots = 0;
        updateDisplay(sp);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.style.color = 'red';
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};

const fetchNames = () => {
    const lot = lotInput.value.trim();
    companyRepGroup.style.display = 'none';
    companyRepInput.value = '';
    fetchedNames = [];
    if (!lot) { checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>'; return; }
    if (!strataPlanCache) { checkboxContainer.innerHTML = `<p style="color: red;">Strata data is not loaded.</p>`; return; }
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

const handleDeleteQueued = (submissionId) => {
    let queue = getSubmissionQueue();
    queue = queue.filter(item => item.submissionId !== submissionId);
    saveSubmissionQueue(queue);
    updateDisplay(strataPlanSelect.value);
    updateSyncButton();
};

const handleDelete = async (lotNumber) => {
    const sp = strataPlanSelect.value;
    if (!sp) return;
    const modalResponse = await showModal(`Are you sure you want to delete the attendance record for Lot ${lotNumber}?`);
    if (modalResponse.confirmed) {
        statusEl.textContent = `Deleting Lot ${lotNumber}...`;
        try {
            const result = await postToServer({ action: 'delete', lot: lotNumber, sp: sp });
            if (result.success) {
                statusEl.textContent = `Lot ${lotNumber} deleted successfully.`;
                checkAndLoadMeeting(sp);
            } else { throw new Error(result.error); }
        } catch (error) {
            console.error('Deletion Error:', error);
            statusEl.textContent = `Error deleting Lot ${lotNumber}: ${error.message}`;
            if (error.message.includes("Authentication failed")) handleLogout();
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

        const body = { action: 'emailPdfReport', sp, email };
        const sessionUser = JSON.parse(sessionStorage.getItem('attendanceUser'));
        if (sessionUser) {
            body.user = sessionUser;
        }
        
        fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body)
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

const handleClearCache = async () => {
    const modalResponse = await showModal(
        "Are you sure you want to clear all cached data? This will remove any unsynced submissions.",
        { confirmText: 'Yes, Clear Data', cancelText: 'Cancel' }
    );
    if (modalResponse.confirmed) {
        localStorage.removeItem('submissionQueue');
        clearStrataCache(); 
        document.cookie = 'selectedSP=; Max-Age=0; path=/;';
        resetUiOnPlanChange();
        updateDisplay(strataPlanSelect.value);
    }
};

const handleChangeMeetingType = async () => {
    const sp = strataPlanSelect.value;
    if (!sp) {
        statusEl.textContent = "Please select a strata plan first.";
        statusEl.style.color = 'red';
        return;
    }
    const modalResponse = await showModal("Enter the new meeting type:", { showInput: true, confirmText: 'Change Type' });
    if (modalResponse.confirmed && modalResponse.value) {
        const newMeetingType = modalResponse.value;
        try {
            const result = await postToServer({ action: 'changeMeetingType', sp, newMeetingType });
            if (result.success) {
                statusEl.textContent = "Meeting type updated successfully.";
                statusEl.style.color = 'green';
                await checkAndLoadMeeting(sp); // Refresh to show changes
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.style.color = 'red';
            if (error.message.includes("Authentication failed")) handleLogout();
        }
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
    const queue = getSubmissionQueue();
    queue.push(submission);
    saveSubmissionQueue(queue);
    updateDisplay(sp);
    updateSyncButton();
    statusEl.textContent = `Lot ${lot} queued for submission.`;
    statusEl.style.color = 'green';
    
    const selectedSP = strataPlanSelect.value;
    form.reset();
    strataPlanSelect.value = selectedSP;

    companyRepGroup.style.display = 'none';
    proxyHolderGroup.style.display = 'none';
    checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
    lotInput.focus();
    setTimeout(() => { if (statusEl.textContent === `Lot ${lot} queued for submission.`) statusEl.textContent = ''; }, 3000);
};

proxyCheckbox.addEventListener('change', () => {
    const isChecked = proxyCheckbox.checked;
    proxyHolderGroup.style.display = isChecked ? 'block' : 'none';
    checkboxContainer.style.display = isChecked ? 'none' : 'block';
    ownerLabel.style.display = isChecked ? 'none' : 'block';
    companyRepGroup.style.display = 'none';
    if (!isChecked && fetchedNames.length > 0 && /\b(P\/L|Pty Ltd|Limited)\b/i.test(fetchedNames[0])) {
        companyRepGroup.style.display = 'block';
    }
});

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    addUserBtn.addEventListener('click', handleAddUser);
    userListBody.addEventListener('click', handleRemoveUser);
    changePasswordBtn.addEventListener('click', handleChangePassword);
    changeMeetingTypeBtn.addEventListener('click', handleChangeMeetingType);
    
    attendeeTableBody.addEventListener('click', (e) => {
        if (e.target.matches('.delete-btn[data-submission-id]')) {
            handleDeleteQueued(e.target.dataset.submissionId);
        } else if (e.target.matches('.delete-btn[data-lot]')) {
            handleDelete(e.target.dataset.lot);
        }
    });
    emailPdfBtn.addEventListener('click', handleEmailPdf);
    syncBtn.addEventListener('click', syncSubmissions);
    clearCacheBtn.addEventListener('click', handleClearCache);
    lotInput.addEventListener('blur', fetchNames);
    form.addEventListener('submit', handleFormSubmit);
    
    strataPlanSelect.addEventListener('change', (e) => {
        handlePlanSelection(e.target.value);
    });

    /*
    // --- COMMENTED OUT THIS BLOCK ---
    const sessionUser = JSON.parse(sessionStorage.getItem('attendanceUser'));
    if (sessionUser) {
        initializeApp(sessionUser);
    }
    */

    // --- ADDED THIS BLOCK TO BYPASS LOGIN ---
    // Create a dummy user with Admin privileges to bypass login
    const tempUser = { username: 'Temp Admin', role: 'Admin', spAccess: null };
    // Initialize the app directly
    initializeApp(tempUser);
});
