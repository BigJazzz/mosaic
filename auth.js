// --- Authentication & Session Logic ---
const handleLogin = async (event) => {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const loginStatus = document.getElementById('login-status');
    
    if (!username) {
        loginStatus.textContent = 'Username is required.';
        loginStatus.style.color = 'red';
        return;
    }
    loginStatus.textContent = 'Logging in...';
    loginStatus.style.color = 'blue';

    try {
        const result = await postToServer({ action: 'loginUser', username, password });
        if (result.success) {
            const user = { username: result.username, role: result.role, spAccess: result.spAccess };
            sessionStorage.setItem('attendanceUser', JSON.stringify(user));

            if (result.resetRequired) {
                loginStatus.textContent = '';
                await showModal('This is your first login. Please set a new password.', { cancelText: 'OK', isHtml: true });
                await handleChangePassword();
                location.reload();
            } else {
                 initializeApp(user);
            }
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
            
            let actionsHtml = `
                <select class="user-actions-select" data-username="${user.username}">
                    <option value="">Select Action</option>
                    <option value="change_sp">Change SP Access</option>
                    <option value="reset_password">Reset Password</option>
            `;
            if (!isCurrentUser) {
                actionsHtml += `<option value="remove">Remove User</option>`;
            }
            actionsHtml += `</select>`;
            
            tr.innerHTML = `
                <td>${user.username}</td>
                <td>${user.role}</td>
                <td>${user.spAccess || 'All'}</td>
                <td>${actionsHtml}</td>
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
    
    const spAccessRes = await showModal("Enter SP Access number (or leave blank for all):", { showInput: true, confirmText: 'Add User' });
    if (!spAccessRes.confirmed) return;

    const role = roleRes.value.trim();
    if (role !== 'Admin' && role !== 'User') {
        document.getElementById('status').textContent = 'Invalid role. Must be "Admin" or "User".';
        document.getElementById('status').style.color = 'red';
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
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};

const handleRemoveUser = async (e) => {
    if (!e.target.dataset.username) return;
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
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};

const handleChangeSpAccess = async (username) => {
    const spAccessRes = await showModal(`Enter new SP Access for ${username} (or leave blank for all):`, { showInput: true, confirmText: 'Update' });
    if (!spAccessRes.confirmed) return;

    try {
        const result = await postToServer({ action: 'changeSpAccess', username, spAccess: spAccessRes.value });
        if (result.success) {
            showToast('SP Access updated successfully.', 'success');
            loadUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showToast(`Failed to update SP Access: ${error.message}`, 'error');
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};

const handleResetPassword = async (username) => {
    const confirmRes = await showModal(`Are you sure you want to reset the password for ${username}?`, { confirmText: 'Yes, Reset' });
    if (!confirmRes.confirmed) return;

    try {
        const result = await postToServer({ action: 'resetPassword', username });
        if (result.success) {
            showToast('Password reset successfully.', 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showToast(`Failed to reset password: ${error.message}`, 'error');
        if (error.message.includes("Authentication failed")) handleLogout();
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
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};