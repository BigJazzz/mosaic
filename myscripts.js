
// --- DOM Elements ---
const lotInput = document.getElementById('lot-number');
const checkboxContainer = document.getElementById('checkbox-container');
const strataPlanSelect = document.getElementById('strata-plan-select');

// --- State & Constants ---
let strataPlanCache = null; 
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwccn5PyK9fGhPtlXOlLTQp7JQNxyxDHxTLOlYE8_Iy4Fm9sGfCmF5-P9edv50edRhnVw/exec';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

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
    const cacheKey = `strata_${sp}`;
    strataPlanCache = null;
    lotInput.disabled = true;
    checkboxContainer.innerHTML = '<p>Loading strata data...</p>';
    console.log(`--- Step 2a: Caching logic for SP ${sp} ---`);

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

// --- Core Functions ---
const populateStrataPlans = async () => {
    console.log("--- Step 1: Attempting to fetch strata plans ---");
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getStrataPlans`);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        const data = await response.json();
        if (data.success && data.plans) {
            strataPlanSelect.innerHTML = '<option value="">Select a plan...</option>';
            data.plans.forEach(plan => {
                const option = document.createElement('option');
                option.value = plan.sp;
                option.textContent = `${plan.sp} - ${plan.suburb}`;
                strataPlanSelect.appendChild(option);
            });
            strataPlanSelect.disabled = false;
            console.log("Success: Dropdown populated!");
        } else { throw new Error(data.error || "Server did not return success or plans."); }
    } catch (error) {
        strataPlanSelect.innerHTML = `<option>Error loading plans.</option>`;
        console.error("Failure: A critical error occurred.", error);
    }
};

// --- Event Listeners ---
strataPlanSelect.addEventListener('change', (e) => {
    console.log(`--- Event: Strata plan changed to ${e.target.value} ---`);
    document.cookie = `selectedSP=${e.target.value};max-age=21600;path=/`;
    clearStrataCache();
    if (e.target.value) {
        cacheAllNames(e.target.value);
    }
});

document.addEventListener('DOMContentLoaded', populateStrataPlans);
