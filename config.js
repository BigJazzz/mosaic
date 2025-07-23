/**
 * URL for the Google Apps Script backend.
 */
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzX_Jm8gOUVHWJHAbBeAmAR9RxI79pNHVCsf16IdBQshGZK7AiAqwy5GY06vTm1aZjpKA/exec';

/**
 * Duration for how long strata plan data is cached in the browser in milliseconds.
 * (6 hours = 6 * 60 minutes * 60 seconds * 1000 ms)
 */
export const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

/**
 * Regular expression for validating email addresses.
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
