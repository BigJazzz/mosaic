import { APPS_SCRIPT_URL } from './config.js';
import { handleLogout } from './auth.js'; // Import handleLogout to fix ReferenceError

// --- Helper for making POST requests ---
export const postToServer = async (body) => {
    const headers = { 'Content-Type': 'application/json' };

    // Add the token to the request headers if it exists

    // Get the token from cookies
    const token = document.cookie.split('; ').find(row => row.startsWith('authToken='))?.split('=')[1];
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }


    console.log('[CLIENT] Making POST request to server...');
    const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: headers,
        body: JSON.stringify(body),
        redirect: 'error' 
    });

    if (!response.ok) {
        console.error('[CLIENT] Network response was not ok.', response);
        const errorText = await response.text();
        throw new Error(`Network error: ${response.statusText} - ${errorText}`);
    }

    const jsonResponse = await response.json();
    console.log('[CLIENT] Received response from server:', jsonResponse);

    if (jsonResponse.error && jsonResponse.error.includes("Authentication failed")) {
        handleLogout();
    }
    
    return jsonResponse;
};

// --- Debounce helper function ---
export const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
};

// --- Modal Logic ---
let modalResolve = null;
export const showModal = (text, { showInput = false, inputType = 'text', confirmText = 'Confirm', cancelText = 'Cancel', isHtml = false } = {}) => {
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
export const getSubmissionQueue = () => JSON.parse(localStorage.getItem('submissionQueue') || '[]');
export const saveSubmissionQueue = (queue) => localStorage.setItem('submissionQueue', JSON.stringify(queue));
export const clearStrataCache = () => {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('strata_')) {
            localStorage.removeItem(key);
        }
    });
};

// --- Toaster Notification Logic ---
const ensureToastContainer = () => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
};

export const showToast = (message, type = 'info', duration = 3000) => {
    const container = ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
};
