// fileName: auth.js

// --- Authentication & Session Logic (Auth Revamp) ---
const handleLogin = async (event) => {
    event.preventDefault();
    // FIX: Convert username to lowercase to handle mixed-case entries.
    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const loginStatus = document.getElementById('login-status');
    
    if (!username || !password) {
        loginStatus.textContent = 'Username and password are required.';
        loginStatus.style.color = 'red';
        return;
    }
    loginStatus.textContent = 'Logging in...';
    loginStatus.style.color = 'blue';

    try {
        // The backend must be updated to return a { success: true, token: '...' } object on successful login.
        const result = await postToServer({ action: 'loginUser', username, password });
        
        if (result.success && result.token) {
            loginStatus.textContent = '';
            // Store ONLY the secure token. User details will be fetched on app initialization.
            sessionStorage.setItem('attendanceAuthToken', result.token);
            // Trigger the app initialization, which now fetches user details securely.
            initializeApp();
        } else {
            throw new Error(result.error || 'Invalid username or password.');
        }
    } catch (error) {
        // FIX: Make the login error message more generic for security.
        loginStatus.textContent = 'Login failed: Invalid username or password.';
        loginStatus.style.color = 'red';
    }
};

const handleLogout = () => {
    // Clear the token and any stored user data, then reload to the login screen.
    sessionStorage.removeItem('attendanceAuthToken');
    sessionStorage.removeItem('attendanceUser'); 
    location.reload();
};

// --- User Management (Admin) ---
const loadUsers = async () => {
    try {
        const sessionUser = JSON.parse(sessionStorage.getItem('attendanceUser'));
        if (!sessionUser) return;

        // The backend will validate the token sent by postToServer to authorize this action.
        const result = await postToServer({ action: 'getUsers' });
        if (!result.success) throw new Error(result.error);
        
        const userListBody = document.getElementById('user-list-body');
        userListBody.innerHTML = '';
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
    } catch (error) {
        console.error('Failed to load users:', error);
        showToast(`Error loading users: ${error.message}`, 'error');
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
    if (!spAccessRes.confirmed) return;

    const role = roleRes.value.trim();
    if (role !== 'Admin' && role !== 'User') {
        showToast('Invalid role. Must be "Admin" or "User".', 'error');
        return;
    }

    try {
        // The backend must validate the token before adding a user.
        const result = await postToServer({ 
            action: 'addUser', 
            username: usernameRes.value, 
            password: passwordRes.value, 
            role,
            spAccess: spAccessRes.value 
        });

        if (result.success) {
            showToast('User added successfully.', 'success');
            loadUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showToast(`Failed to add user: ${error.message}`, 'error');
    }
};

const handleRemoveUser = async (e) => {
    if (!e.target.matches('.delete-btn[data-username]')) return;
    const username = e.target.dataset.username;
    
    const confirmRes = await showModal(`Are you sure you want to remove user "${username}"?`, { confirmText: 'Yes, Remove' });
    if (!confirmRes.confirmed) return;

    try {
        // The backend must validate the token before removing a user.
        const result = await postToServer({ action: 'removeUser', username });
        if (result.success) {
            showToast('User removed successfully.', 'success');
            loadUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showToast(`Failed to remove user: ${error.message}`, 'error');
    }
};

// --- User Management (Self) ---
const handleChangePassword = async () => {
    const passwordRes = await showModal("Enter your new password:", { showInput: true, inputType: 'password', confirmText: 'Change Password' });
    if (!passwordRes.confirmed || !passwordRes.value) return;

    try {
        const result = await postToServer({ action: 'changePassword', newPassword: passwordRes.value });
        if (result.success) {
            showToast('Password changed successfully.', 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showToast(`Failed to change password: ${error.message}`, 'error');
    }
};
