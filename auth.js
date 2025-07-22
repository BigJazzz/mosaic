// --- Authentication & Session Logic ---
const handleLogin = async (event) => {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
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
        const result = await postToServer({ action: 'loginUser', username, password });
        if (result.success) {
            loginStatus.textContent = '';
            // --- FIX STARTS HERE ---
            // Construct the user object from the flat response
            const user = { 
                username: result.username, 
                role: result.role, 
                spAccess: result.spAccess 
            };
            // --- FIX ENDS HERE ---
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
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};

const handleAddUser = async () => {
    const usernameRes = await showModal("Enter new user's username:", { showInput: true, confirmText: 'Next' });
    if (!usernameRes.confirmed || !usernameRes.value) return;
    
    const passwordRes = await showModal("Enter new user's password:", { showInput: true, inputType: 'password', confirmText: 'Next' });
    if (!passwordRes.confirmed || !passwordRes.value) return;

    const roleRes = await showModal("Enter role (Admin or User):", { showInput: true, confirmText: 'Next' });
    if (!roleRes.confirmed || !roleRes.value) return;

    const role = roleRes.value.trim();
    if (role !== 'Admin' && role !== 'User') {
        showToast('Invalid role. Must be "Admin" or "User".', 'error');
        return;
    }

    let spAccess = '';
    if (role === 'User') {
        const spAccessRes = await showModal("Enter SP Access number for this user:", { showInput: true, confirmText: 'Add User' });
        if (!spAccessRes.confirmed || !spAccessRes.value) {
            showToast('SP Access is required for the User role.', 'error');
            return;
        }
        spAccess = spAccessRes.value;
    }

    try {
        const result = await postToServer({ 
            action: 'addUser', 
            username: usernameRes.value, 
            password: passwordRes.value, 
            role,
            spAccess
        });
        if (result.success) {
            showToast('User added successfully.', 'success');
            loadUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showToast(`Failed to add user: ${error.message}`, 'error');
        if (error.message.includes("Authentication failed")) handleLogout();
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
            showToast('User removed successfully.', 'success'); // Use showToast
            loadUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showToast(`Failed to remove user: ${error.message}`, 'error'); // Use showToast
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};

// --- User Management (Self) ---
const handleChangePassword = async () => {
    const passwordRes = await showModal("Enter your new password:", { showInput: true, inputType: 'password', confirmText: 'Change Password' });
    if (!passwordRes.confirmed) return;
    
    if (!passwordRes.value) {
        showToast('Password cannot be blank.', 'error');
        return;
    }

    try {
        const result = await postToServer({ action: 'changePassword', newPassword: passwordRes.value });
        if (result.success) {
            showToast('Password changed successfully.', 'success'); // Use showToast
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showToast(`Failed to change password: ${error.message}`, 'error'); // Use showToast
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};
