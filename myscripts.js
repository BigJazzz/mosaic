// --- DOM Elements ---
const loginSection = document.getElementById('login-section');
const mainAppSection = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginStatus = document.getElementById('login-status');
const userDisplay = document.getElementById('user-display');
const adminPanel = document.getElementById('admin-panel');
const userListBody = document.getElementById('user-list-body');
const addUserBtn = document.getElementById('add-user-btn');
const changePasswordBtn = document.getElementById('change-password-btn');
const logoutBtn = document.getElementById('logout-btn');
const strataPlanWrapper = document.getElementById('strata-plan-wrapper');

const lotInput = document.getElementById('lot-number');
const checkboxContainer = document.getElementById('checkbox-container');
const ownerLabel = document.getElementById('owner-label');
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
const clearCacheBtn = document.getElementById('clear-cache-btn');
const modal = document.getElementById('custom-modal');
const modalText = document.getElementById('modal-text');
const modalInput = document.getElementById('modal-input');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

// --- State & Constants ---
let fetchedNames = [];
let strataPlanCache = null;
let isSyncing = false;
let currentSyncedAttendees = [];
let currentTotalLots = 0;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbww_UaQUfrSAVne8iZH_pety0FgQ1vPR4IleM3O1x2B0bRJbMoXjkJHWZFRvb1RxrYWzQ/exec';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

// --- Helper for making POST requests ---
const postToServer = async (body) => {
    const sessionUser = JSON.parse(sessionStorage.getItem('attendanceUser'));
    if (sessionUser) {
        body.user = sessionUser;
    }
    console.log('[CLIENT] Making POST request to server with body:', body);
    const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        console.error('[CLIENT] Network response was not ok.', response);
        throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    const jsonResponse = await response.json();
    console.log('[CLIENT] Received response from server:', jsonResponse);
    if (!jsonResponse.success && jsonResponse.error && jsonResponse.error.includes("Authentication failed")) {
        handleLogout();
    }
    return jsonResponse;
};

// --- Modal Logic ---
let modalResolve = null;
const showModal = (text, { showInput = false, inputType = 'text', confirmText = 'Confirm', cancelText = 'Cancel', isHtml = false } = {}) => {
    if (isHtml) { modalText.innerHTML = text; } 
    else { modalText.textContent = text; }
    modalInput.style.display = showInput ? 'block' : 'none';
    modalInput.type = inputType;
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

// --- Authentication & Session Logic ---
const handleLogin = async (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
        loginStatus.textContent = 'Username and password are required.';
        loginStatus.style.color = 'red';
        return;
    }
    loginStatus.textContent = 'Logging in...';
    loginStatus.style.color = 'blue';

    try {
        const result = await postToServer({ action: 'loginUser', username, password });
        if (result.success) {
            loginStatus.textContent = '';
            const user = { username: result.username, role: result.role, spAccess: result.spAccess };
            sessionStorage.setItem('attendanceUser', JSON.stringify(user));
            initializeApp(user);
        } else {
            throw new Error(result.error || 'Invalid username or password.');
        }
    } catch (error) {
        loginStatus.textContent = `Login failed: ${error.message}`;
        loginStatus.style.color = 'red';
    }
};

const handleLogout = () => {
    sessionStorage.removeItem('attendanceUser');
    location.reload();
};

const initializeApp = (user) => {
    loginSection.classList.add('hidden');
    mainAppSection.classList.remove('hidden');
    userDisplay.textContent = `${user.username} (${user.role})`;

    if (user.role === 'Admin') {
        adminPanel.classList.remove('hidden');
        loadUsers();
    }
    
    // MODIFIED: Handle SP Access restrictions
    if (user.spAccess) {
        strataPlanWrapper.classList.add('hidden');
        populateStrataPlans().then(() => {
            strataPlanSelect.value = user.spAccess;
            cacheAllNames(user.spAccess).then(() => {
                checkAndLoadMeeting(user.spAccess);
            });
        });
    } else {
        populateStrataPlans().then(() => {
            const initialSP = strataPlanSelect.value;
            if (initialSP) {
                cacheAllNames(initialSP).then(() => {
                    checkAndLoadMeeting(initialSP);
                });
            }
        });
    }

    updateSyncButton();
    setInterval(syncSubmissions, 60000);
};

// --- User Management (Admin) ---
const loadUsers = async () => {
    try {
        const sessionUser = JSON.parse(sessionStorage.getItem('attendanceUser'));
        if (!sessionUser) return;

        const result = await postToServer({ action: 'getUsers' });
        if (result.success) {
            userListBody.innerHTML = ''; // MODIFIED: Target table body
            result.users.forEach(user => {
                const tr = document.createElement('tr');
                const isCurrentUser = user.username === sessionUser.username;
                const removeButtonHtml = isCurrentUser ? '' : `<button class="delete-btn" data-username="${user.username}">Remove</button>`;
                
                tr.innerHTML = `
                    <td>${user.username}</td>
                    <td>${user.role}</td>
                    <td>${user.spAccess || 'All'}</td>
                    <td>${removeButtonHtml}</td>
                `;
                userListBody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Failed to load users:', error);
    }
};

const handleAddUser = async () => {
    const usernameRes = await showModal("Enter new user's username:", { showInput: true, confirmText: 'Next' });
    if (!usernameRes.confirmed || !usernameRes.value) return;
    
    const passwordRes = await showModal("Enter new user's password:", { showInput: true, inputType: 'password', confirmText: 'Next' });
    if (!passwordRes.confirmed || !passwordRes.value) return;

    const roleRes = await showModal("Enter role (Admin or User):", { showInput: true, confirmText: 'Next' });
    if (!roleRes.confirmed || !roleRes.value) return;
    
    const spAccessRes = await showModal("Enter SP Access number (or leave blank for all):", { showInput: true, confirmText: 'Add User' });
    if (!spAccessRes.confirmed) return; // Allow blank value

    const role = roleRes.value.trim();
    if (role !== 'Admin' && role !== 'User') {
        statusEl.textContent = 'Invalid role. Must be "Admin" or "User".';
        statusEl.style.color = 'red';
        return;
    }

    try {
        const result = await postToServer({ 
            action: 'addUser', 
            username: usernameRes.value, 
            password: passwordRes.value, 
            role,
            spAccess: spAccessRes.value 
        });
        if (result.success) {
            statusEl.textContent = 'User added successfully.';
            statusEl.style.color = 'green';
            loadUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        statusEl.textContent = `Failed to add user: ${error.message}`;
        statusEl.style.color = 'red';
    }
};

const handleRemoveUser = async (e) => {
    if (!e.target.matches('.delete-btn[data-username]')) return;
    const username = e.target.dataset.username;
    
    const confirmRes = await showModal(`Are you sure you want to remove user "${username}"?`, { confirmText: 'Yes, Remove' });
    if (!confirmRes.confirmed) return;

    try {
        const result = await postToServer({ action: 'removeUser', username });
        if (result.success) {
            statusEl.textContent = 'User removed successfully.';
            statusEl.style.color = 'green';
            loadUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        statusEl.textContent = `Failed to remove user: ${error.message}`;
        statusEl.style.color = 'red';
    }
};

// --- User Management (Self) ---
const handleChangePassword = async () => {
    const passwordRes = await showModal("Enter your new password:", { showInput: true, inputType: 'password', confirmText: 'Change Password' });
    if (!passwordRes.confirmed || !passwordRes.value) return;

    try {
        const result = await postToServer({ action: 'changePassword', newPassword: passwordRes.value });
        if (result.success) {
            statusEl.textContent = 'Password changed successfully.';
            statusEl.style.color = 'green';
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        statusEl.textContent = `Failed to change password: ${error.message}`;
        statusEl.style.color = 'red';
    }
};

// --- Caching & Queue Logic ---
const getSubmissionQueue = () => JSON.parse(localStorage.getItem('submissionQueue') || '[]');
const saveSubmissionQueue = (queue) => localStorage.setItem('submissionQueue', JSON.stringify(queue));
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
        const data = await postToServer({ action: 'getAllNamesForPlan', sp: sp });
        if (data.success) {
            const newCacheItem = { timestamp: new Date().getTime(), names: data.names };
            strataPlanCache = data.names;
            localStorage.setItem(cacheKey, JSON.stringify(newCacheItem));
            lotInput.disabled = false;
            checkboxContainer.innerHTML = '<p>Enter a Lot Number.</p>';
        } else { throw new Error(data.error); }
    } catch (error) {
       console.error(`[CLIENT] Could not load data for SP ${sp}. Error:`, error);
       checkboxContainer.innerHTML = `<p style="color: red;">Could not load data for this plan.</p>`;
    }
};

// --- Submission Syncing ---
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
    } finally {
        isSyncing = false;
        await checkAndLoadMeeting(strataPlanSelect.value); 
        updateSyncButton();
    }
};

// --- UI & Rendering ---
const updateDisplay = (sp) => {
    if (!sp) return;
    const queuedAttendees = getSubmissionQueue().filter(s => s.sp === sp).map(s => ({...s, status: 'queued'}));
    const allAttendees = [...currentSyncedAttendees, ...queuedAttendees];
    const attendedLots = new Set();
    allAttendees.forEach(attendee => attendedLots.add(String(attendee.lot)));
    renderAttendeeTable(allAttendees);
    updateQuorumDisplay(attendedLots.size, currentTotalLots);
};

const resetUiOnPlanChange = () => {
    currentSyncedAttendees = [];
    currentTotalLots = 0;
    attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Select a plan to see attendees.</td></tr>`;
    personCountSpan.textContent = `(0 people)`;
    quorumDisplay.innerHTML = `Quorum: ...%`;
    quorumDisplay.style.backgroundColor = '#6c757d';
    checkboxContainer.innerHTML = '<p>Select a Strata Plan to begin.</p>';
    lotInput.value = '';
    lotInput.disabled = true;
};

const renderStrataPlans = (plans) => {
    if (!plans) return;
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

const renderAttendeeTable = (attendees) => {
    const syncedCount = attendees.filter(item => item.status !== 'queued').length;
    const personLabel = (syncedCount === 1) ? 'person' : 'people';
    personCountSpan.textContent = `(${syncedCount} ${personLabel})`;
    attendeeTableBody.innerHTML = '';
    if (!attendees || attendees.length === 0) {
        attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No attendees yet.</td></tr>`;
        return;
    }
    attendees.sort((a, b) => a.lot - b.lot);
    attendees.forEach(item => {
        const isQueued = item.status === 'queued';
        const name = item.name || (item.proxyHolderLot ? `Proxy - Lot ${item.proxyHolderLot}` : item.names.join(', '));
        const isProxy = String(name).startsWith('Proxy - Lot');
        const isCompany = !isProxy && /\b(P\/L|Pty Ltd|Limited)\b/i.test(name);
        let ownerRepName = '', companyName = '', rowColor = isQueued ? '#f5e0df' : '#d4e3c1';
        if (isProxy) {
            ownerRepName = name;
            if (!isQueued) rowColor = '#c1e1e3';
        } else if (isCompany) {
            const parts = name.split(' - ');
            companyName = parts[0].trim();
            if (parts.length > 1) ownerRepName = parts[1].trim();
            if (!isQueued) rowColor = '#cbc1e3';
        } else {
            ownerRepName = name;
        }
        const row = document.createElement('tr');
        row.style.backgroundColor = rowColor;
        const deleteButton = isQueued 
            ? `<button class="delete-btn" data-type="queued" data-submission-id="${item.submissionId}">Delete</button>`
            : `<button class="delete-btn" data-type="synced" data-lot="${item.lot}">Delete</button>`;
        row.innerHTML = `<td>${item.lot}</td><td>${ownerRepName}</td><td>${companyName}</td><td>${deleteButton}</td>`;
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
        const data = await postToServer({ action: 'getStrataPlans' });
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

const checkAndLoadMeeting = async (sp) => {
    if (!sp) return;
    quorumDisplay.textContent = 'Loading...';
    attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>`;
    try {
        const columnCheck = await postToServer({ action: 'checkTodaysColumns', sp });
        if (!columnCheck.success) throw new Error(columnCheck.error);
        let initialData;
        if (columnCheck.columnsExist) {
            initialData = await postToServer({ action: 'getInitialData', sp });
        } else {
            const modalResponse = await showModal("Today's meeting has not been set up. Please enter the meeting type (e.g., AGM, EGM):", { showInput: true, confirmText: 'Set Up Meeting' });
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
    form.reset();
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
    // Auth listeners
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    addUserBtn.addEventListener('click', handleAddUser);
    userListBody.addEventListener('click', handleRemoveUser); // MODIFIED: Listener on table body
    changePasswordBtn.addEventListener('click', handleChangePassword);
    
    // App listeners
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
    strataPlanSelect.addEventListener('change', async (e) => {
        const sp = e.target.value;
        document.cookie = `selectedSP=${sp};max-age=21600;path=/`;
        resetUiOnPlanChange();
        if (sp) {
            await cacheAllNames(sp);
            await checkAndLoadMeeting(sp);
        }
    });

    const sessionUser = JSON.parse(sessionStorage.getItem('attendanceUser'));
    if (sessionUser) {
        initializeApp(sessionUser);
    }
});
