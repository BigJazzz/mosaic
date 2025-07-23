import {APPS_SCRIPT_URL} from './config.js';

// Import functions
import {
    handleLogin,
    handleLogout,
    loadUsers,
    handleAddUser,
    handleRemoveUser,
    handleChangePassword,
    handleChangeSpAccess,
    handleResetPassword
} from './auth.js';
import {
    debounce,
    postToServer,
    showModal,
    showToast,
    getSubmissionQueue,
    saveSubmissionQueue,
    clearStrataCache
} from './utils.js';
import {
    resetUiOnPlanChange,
    renderStrataPlans,
    updateDisplay
} from './ui.js';

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
const strataPlanWrapper = document.getElementById('strata-plan-wrapper');F
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
let autoSyncIntervalId = null;
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

const initializeApp = (user) => {
    try {
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
    } catch (error) {
        // This will catch the error and display it in the console without logging you out.
        console.error("A critical error occurred during application startup:", error);
    }
};

const handlePlanSelection = async (sp) => {
    document.cookie = `selectedSP=${sp};max-age=21600;path=/`;
    resetUiOnPlanChange();
    submitButton.disabled = true;
    
    if (autoSyncIntervalId) {
        clearInterval(autoSyncIntervalId);
        autoSyncIntervalId = null;
    }

    if (sp) {
        try {
            await cacheAllNames(sp);
            await checkAndLoadMeeting(sp);
            await populateReportDates(sp); // Add this line
            submitButton.disabled = false;
            
            autoSyncIntervalId = setInterval(syncSubmissions, 60000);
        } catch (error) {
            console.error("Failed to fully load plan:", error);
        }
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
        // --- FIX STARTS HERE ---
        // Refresh the initial data instead of re-checking for the meeting
        const initialData = await postToServer({ action: 'getInitialData', sp: strataPlanSelect.value });
        if (initialData && initialData.success) {
            currentSyncedAttendees = initialData.attendees.map(a => ({...a, status: 'synced'}));
            currentTotalLots = initialData.totalLots;
            cleanupQueuedSubmissions();
            updateDisplay(strataPlanSelect.value);
        }
        // --- FIX ENDS HERE ---
        updateSyncButton();
    }
};

const cacheAllNames = async (sp) => {
    if (!sp) return;
    const cacheKey = `strata_${sp}`;
    strataPlanCache = null;
    lotInput.disabled = true;
    checkboxContainer.innerHTML = '<p>Loading strata data...</p>';

    const enableInputs = () => {
        lotInput.disabled = false;
        checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
        lotInput.focus();
    };

    const cachedItem = localStorage.getItem(cacheKey);
    if (cachedItem) {
        const { timestamp, names } = JSON.parse(cachedItem);
        const isCacheValid = (new Date().getTime() - timestamp) < CACHE_DURATION_MS;
        if (isCacheValid) {
            console.log(`[CLIENT] Using cached names for SP ${sp}.`);
            strataPlanCache = names;
            showToast(`Strata Roll for SP ${sp} loaded from cache.`, 'info');
            enableInputs();
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
            showToast(`Strata Roll for SP ${sp} successfully loaded.`, 'success');
            enableInputs();
        } else { throw new Error(data.error); }
    } catch (error) {
       console.error(`[CLIENT] Could not load data for SP ${sp}. Error:`, error);
       checkboxContainer.innerHTML = `<p style="color: red;">Could not load data for this plan.</p>`;
       showToast(`Failed to load Strata Roll for SP ${sp}.`, 'error');
       if (error.message.includes("Authentication failed")) handleLogout();
    }
};

const populateStrataPlans = async () => {
    const cacheKey = 'strata_plan_list';

    // Check for a valid cached list first
    const cachedItem = localStorage.getItem(cacheKey);
    if (cachedItem) {
        const { timestamp, plans } = JSON.parse(cachedItem);
        const isCacheValid = (new Date().getTime() - timestamp) < CACHE_DURATION_MS;
        if (isCacheValid) {
            console.log('[CLIENT] Using cached strata plan list.');
            renderStrataPlans(plans);
            strataPlanSelect.disabled = false;
            return; // Use the cached data
        }
    }

    // If no valid cache, fetch from the server
    try {
        console.log('[CLIENT] Fetching strata plan list from server.');
        const data = await postToServer({ action: 'getStrataPlans' });
        if (data.success && data.plans) {
            // Render the new data
            renderStrataPlans(data.plans);
            strataPlanSelect.disabled = false;
            // Save the new data and timestamp to the cache
            const newCacheItem = { timestamp: new Date().getTime(), plans: data.plans };
            localStorage.setItem(cacheKey, JSON.stringify(newCacheItem));
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
    attendeeTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>`;
    try {
        const columnCheck = await postToServer({ action: 'checkTodaysColumns', sp });
        if (!columnCheck.success) throw new Error(columnCheck.error);
        let initialData;
        if (columnCheck.columnsExist) {
            initialData = await postToServer({ action: 'getInitialData', sp });
        } else {
            const meetingTypeRes = await showModal("Today's meeting has not been set up. Please enter the meeting type (e.g., AGM, EGM):", { showInput: true, confirmText: 'Next' });
            if (meetingTypeRes.confirmed && meetingTypeRes.value) {
                const meetingType = meetingTypeRes.value;
                let financialLots = null;
                let committeeMembers = null;

                if (meetingType.toUpperCase() === 'SCM') {
                    const committeeMembersRes = await showModal("Enter the Number of Committee Members:", { showInput: true, inputType: 'number', confirmText: 'Set Up Meeting' });
                    if (committeeMembersRes.confirmed && committeeMembersRes.value) {
                        financialLots = committeeMembersRes.value; // Use the same variable to pass the count
                    } else {
                         resetUiOnPlanChange();
                         return;
                    }
                } else {
                    const financialLotsRes = await showModal("Enter the Number of Financial Lots:", { showInput: true, inputType: 'number', confirmText: 'Set Up Meeting' });
                    if (financialLotsRes.confirmed && financialLotsRes.value) {
                        financialLots = financialLotsRes.value;
                    } else {
                         resetUiOnPlanChange();
                         return;
                    }
                }
                
                initialData = await postToServer({ 
                    action: 'createAndFetchInitialData', 
                    sp, 
                    meetingType,
                    financialLots
                });

            } else {
                resetUiOnPlanChange();
                return;
            }
        }
        if (initialData && initialData.success) {
            currentSyncedAttendees = initialData.attendees.map(a => ({...a, status: 'synced'}));
            currentTotalLots = initialData.totalLots;
            
            cleanupQueuedSubmissions();
            updateDisplay(sp);

            if (initialData.meetingType) {
                meetingTitle.textContent = `Attendance Form - ${initialData.meetingType}`;
                meetingDate.textContent = new Date().toLocaleDateString("en-AU", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                
                if (initialData.meetingType.toUpperCase() === 'SCM') {
                    financialLabel.lastChild.nodeValue = " Is Committee Member?";
                } else {
                    financialLabel.lastChild.nodeValue = " Is Financial?";
                }
            }
        } else {
            throw new Error(initialData ? initialData.error : "Failed to get initial data.");
        }
    } catch (error) {
        console.error("[CLIENT] A critical error occurred during meeting load:", error);
        currentSyncedAttendees = [];
        currentTotalLots = 0;
        cleanupQueuedSubmissions();
        updateDisplay(sp);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.style.color = 'red';
        // if (error.message.includes("Authentication failed")) handleLogout();
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
        // Corrected indices: [0] is now Unit, so names are at [1] and [2]
        const mainContactName = namesFromCache[1] || '';
        const fullNameOnTitle = namesFromCache[2] || '';
        
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
    const reportDate = document.getElementById('report-date').value;

    if (!sp) {
        showToast('Please select a Strata Plan first.', 'error');
        return;
    }
    if (!reportDate) {
        showToast('No report date is available or selected.', 'error');
        return;
    }

    const modalResponse = await showModal("Enter the email address to send the PDF report to:", { showInput: true, confirmText: 'Send Email' });
    if (modalResponse.confirmed && modalResponse.value) {
        // ... (rest of the function remains the same)
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
        showToast("Please select a strata plan first.", 'error'); // Use showToast
        return;
    }
    const modalResponse = await showModal("Enter the new meeting type:", { showInput: true, confirmText: 'Change Type' });
    if (modalResponse.confirmed && modalResponse.value) {
        const newMeetingType = modalResponse.value;
        try {
            const result = await postToServer({ action: 'changeMeetingType', sp, newMeetingType });
            if (result.success) {
                showToast("Meeting type updated successfully.", 'success'); // Use showToast
                await checkAndLoadMeeting(sp);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error'); // Use showToast
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

    const submissionDate = new Date().toLocaleDateString("en-AU", {timeZone: "Australia/Sydney"});
    const submission = {
        submissionId: `sub_${Date.now()}_${Math.random()}`,
        submissionDate: submissionDate, // Add the creation date
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

    checkboxContainer.style.display = 'block';
    ownerLabel.style.display = 'block';
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
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent default form submission
        const user = await handleLogin(event); // Await the result from the login function
        if (user) {
            initializeApp(user); // Initialize the app with the returned user object
        }
    });
    logoutBtn.addEventListener('click', handleLogout);
    addUserBtn.addEventListener('click', handleAddUser);
    userListBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('user-actions-select')) {
            const username = e.target.dataset.username;
            const action = e.target.value;

            switch(action) {
                case 'change_sp':
                    handleChangeSpAccess(username);
                    break;
                case 'reset_password':
                    handleResetPassword(username);
                    break;
                case 'remove':
                    // Create a temporary element to pass to the existing remove function
                    const fakeButton = document.createElement('button');
                    fakeButton.dataset.username = username;
                    handleRemoveUser({ target: fakeButton });
                    break;
            }
            e.target.value = ""; // Reset dropdown after action
        }
    });
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
    lotInput.addEventListener('input', debounce(fetchNames, 300)); // 300ms delay
    form.addEventListener('submit', handleFormSubmit);
    
    strataPlanSelect.addEventListener('change', (e) => {
        handlePlanSelection(e.target.value);
    });
    document.getElementById('check-in-tab-btn').addEventListener('click', (event) => {
        openTab(event, 'check-in-tab');
    });
    document.getElementById('admin-tab-btn').addEventListener('click', (event) => {
        openTab(event, 'admin-tab');
    });

    const sessionUser = JSON.parse(sessionStorage.getItem('attendanceUser'));
    if (sessionUser) {
        initializeApp(sessionUser);
    }

    const token = document.cookie.split('; ').find(row => row.startsWith('authToken='))?.split('=')[1];
    const userString = sessionStorage.getItem('attendanceUser');
    if (token && userString) {
        const user = JSON.parse(userString);
        initializeApp(user);
    }
});

const cleanupQueuedSubmissions = () => {
    if (currentSyncedAttendees.length === 0) return;

    const syncedLots = new Set(currentSyncedAttendees.map(a => String(a.lot)));
    const queue = getSubmissionQueue();
    if (queue.length === 0) return;

    const initialQueueSize = queue.length;
    const newQueue = queue.filter(item => !syncedLots.has(String(item.lot)));

    if (newQueue.length < initialQueueSize) {
        saveSubmissionQueue(newQueue);
        const removedCount = initialQueueSize - newQueue.length;
        const plural = removedCount === 1 ? 'entry' : 'entries';
        showToast(`${removedCount} queued ${plural} removed as already synced.`, 'info');
    }
};

// --- Tabbed View Logic ---
function openTab(evt, tabName) {
    // Get all elements with class="tab-content" and hide them
    const tabcontent = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Get all elements with class="tab-link" and remove the class "active"
    const tablinks = document.getElementsByClassName("tab-link");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

const populateReportDates = async (sp) => {
    const reportDateSelect = document.getElementById('report-date');
    reportDateSelect.disabled = true;
    reportDateSelect.innerHTML = '<option value="">No dates available</option>'; // Reset

    try {
        const result = await postToServer({ action: 'getReportDates', sp });
        if (result.success && result.dates.length > 0) {
            const availableDates = result.dates;
            // Sort dates in reverse chronological order
            availableDates.sort((a, b) => new Date(b) - new Date(a));
            
            reportDateSelect.innerHTML = ''; // Clear the default option
            availableDates.forEach(date => {
                const option = document.createElement('option');
                // The date is already YYYY-MM-DD, which is what we need
                option.value = date; 
                // Display the date in a more readable format (DD/MM/YYYY)
                const parts = date.split('-');
                option.textContent = `${parts[2]}/${parts[1]}/${parts[0]}`;
                reportDateSelect.appendChild(option);
            });
            
            reportDateSelect.disabled = false;
        }
    } catch (error) {
        console.error('Failed to get report dates:', error);
    }
};
