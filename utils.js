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
    // The check for auth failure is now handled by the function that calls postToServer.
    return jsonResponse;
};

// --- Modal Logic ---
let modalResolve = null;
const showModal = (text, { showInput = false, inputType = 'text', confirmText = 'Confirm', cancelText = 'Cancel', isHtml = false } = {}) => {
    const modal = document.getElementById('custom-modal');
    const modalTextEl = document.getElementById('modal-text');
    const modalInputEl = document.getElementById('modal-input');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');

    if (isHtml) { modalTextEl.innerHTML = text; } 
    else { modalTextEl.textContent = text; }
    modalInputEl.style.display = showInput ? 'block' : 'none';
    modalInputEl.type = inputType;
    modalInputEl.value = '';
    modalConfirmBtn.textContent = confirmText;
    modalCancelBtn.textContent = cancelText;
    modal.style.display = 'flex';
    if (showInput) modalInputEl.focus();
    
    return new Promise(resolve => { 
        modalResolve = resolve; 
        
        modalConfirmBtn.onclick = () => {
            modal.style.display = 'none';
            if (modalResolve) modalResolve({ confirmed: true, value: modalInputEl.value });
        };
        modalCancelBtn.onclick = () => {
            modal.style.display = 'none';
            if (modalResolve) modalResolve({ confirmed: false, value: null });
        };
        modalInputEl.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); 
                modalConfirmBtn.click();
            }
        };
    });
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
