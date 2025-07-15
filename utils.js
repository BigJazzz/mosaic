// fileName: utils.js

// This import assumes you are using a module-aware environment.
// Ensure your main script tag in index.html has type="module".
import { APPS_SCRIPT_URL } from './config.js';

// --- Helper for making POST requests (Auth Revamp) ---
const postToServer = async (body) => {
    // Token is now retrieved and sent in the header, not the body.
    const token = sessionStorage.getItem('attendanceAuthToken');
    const headers = { 'Content-Type': 'text/plain' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    console.log('[CLIENT] Making POST request to server with body:', body);
    const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: headers,
        body: JSON.stringify(body)
    });

    // Centralized check for authentication failure.
    if (response.status === 401 || response.status === 403) {
        console.error('[CLIENT] Authentication failed. Logging out.');
        // This function is defined in auth.js but should be available globally.
        handleLogout(); 
        throw new Error('Authentication failed. Please log in again.');
    }
    
    if (!response.ok) {
        console.error('[CLIENT] Network response was not ok.', response);
        const errorText = await response.text();
        throw new Error(`Network Error: ${response.statusText} - ${errorText}`);
    }

    const jsonResponse = await response.json();
    console.log('[CLIENT] Received response from server:', jsonResponse);
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


// --- Notification "Toast" System ---
const showToast = (message, type = 'info', duration = 4000) => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
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
