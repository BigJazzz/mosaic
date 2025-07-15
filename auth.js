// fileName: auth.js

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

    try {
        const result = await postToServer({ action: 'loginUser', username, password });
        
        // This relies on the server returning the user object on success
        if (result.success && result.username) {
            loginStatus.textContent = '';
            const user = { username: result.username, role: result.role, spAccess: result.spAccess };
            sessionStorage.setItem('attendanceUser', JSON.stringify(user));
            initializeApp(user); 
        } else {
            throw new Error(result.error || 'Invalid username or password.');
        }
    } catch (error) {
        loginStatus.textContent = `Login failed: Invalid username or password.`;
        loginStatus.style.color = 'red';
    }
};

const handleLogout = () => {
    sessionStorage.removeItem('attendanceUser');
    location.reload();
};

// NEW: A helper function to generate a secure, random token.
const generateToken = () => {
    const randomValues = new Uint32Array(32);
    window.crypto.getRandomValues(randomValues);
    return Array.from(randomValues, val => val.toString(36)).join('');
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

    // NEW: Generate the token automatically.
    const token = generateToken();
    console.log(`Generated Token for new user "${usernameRes.value}": ${token}`);

    try {
        // NEW: Send the generated token with the new user's data.
        const result = await postToServer({ 
            action: 'addUser', 
            username: usernameRes.value, 
            password: passwordRes.value, 
            role,
            spAccess: spAccessRes.value,
            token: token 
        });

        if (result.success) {
            document.getElementById('status').textContent = 'User added successfully.';
            document.getElementById('status').style.color = 'green';
            loadUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        document.getElementById('status').textContent = `Failed to add user: ${error.message}`;
        document.getElementById('status').style.color = 'red';
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};

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

const handleRemoveUser = async (e) => {
    if (!e.target.matches('.delete-btn[data-username]')) return;
    const username = e.target.dataset.username;
    
    const confirmRes = await showModal(`Are you sure you want to remove user "${username}"?`, { confirmText: 'Yes, Remove' });
    if (!confirmRes.confirmed) return;

    try {
        const result = await postToServer({ action: 'removeUser', username });
        if (result.success) {
            document.getElementById('status').textContent = 'User removed successfully.';
            document.getElementById('status').style.color = 'green';
            loadUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        document.getElementById('status').textContent = `Failed to remove user: ${error.message}`;
        document.getElementById('status').style.color = 'red';
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};

const handleChangePassword = async () => {
    const passwordRes = await showModal("Enter your new password:", { showInput: true, inputType: 'password', confirmText: 'Change Password' });
    if (!passwordRes.confirmed || !passwordRes.value) return;

    try {
        const result = await postToServer({ action: 'changePassword', newPassword: passwordRes.value });
        if (result.success) {
            document.getElementById('status').textContent = 'Password changed successfully.';
            document.getElementById('status').style.color = 'green';
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        document.getElementById('status').textContent = `Failed to change password: ${error.message}`;
        document.getElementById('status').style.color = 'red';
        if (error.message.includes("Authentication failed")) handleLogout();
    }
};
