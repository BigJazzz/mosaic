// fileName: auth.js

// --- Authentication & Session Logic (Auth Revamp) ---
const handleLogin = async (event) => {
    event.preventDefault();
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
    
    console.log('Attempting login for username:', username);

    try {
        const result = await postToServer({ action: 'loginUser', username, password });
        
        console.log('Received response from server:', result);

        if (result.success && result.token) {
            console.log('Login successful, token received. Initializing app.');
            loginStatus.textContent = '';
            sessionStorage.setItem('attendanceAuthToken', result.token);
            initializeApp();
        } else {
            // FIX: Stringify the result object to see its contents instead of "[object Object]".
            console.error('Login condition not met. Server response:', JSON.stringify(result, null, 2));
            throw new Error(result.error || 'Server indicated failure but did not provide a specific error message.');
        }
    } catch (error) {
        console.error('Login process failed. Full error:', error);

        loginStatus.textContent = 'Login failed: Invalid username or password.';
        loginStatus.style.color = 'red';
    }
};

const handleLogout = () => {
    sessionStorage.removeItem('attendanceAuthToken');
    sessionStorage.removeItem('attendanceUser'); 
    location.reload();
};

// --- User Management (Admin) ---
const loadUsers = async () => {
    try {
        const sessionUser = JSON.parse(sessionStorage.getItem('attendanceUser'));
        if (!sessionUser) return;

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
