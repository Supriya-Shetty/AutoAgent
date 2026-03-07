// Admin Dashboard Logic
const state = {
    auth: null,
    stats: null,
    users: [],
    chart: null,
};

// Initialize Firebase
async function initFirebase() {
    try {
        const response = await fetch('/firebase-config');
        const firebaseConfig = await response.json();
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();

        auth.onAuthStateChanged(async user => {
            if (!user) {
                window.location.href = '/login';
                return;
            }

            // Show admin app if user is available
            document.getElementById('auth-guard').classList.add('hidden');
            document.getElementById('admin-app').classList.remove('hidden');

            state.auth = auth;
            loadDashboard();
        });
    } catch (error) {
        console.error('Firebase init error:', error);
        window.location.href = '/login';
    }
}

async function loadDashboard() {
    await Promise.all([
        fetchStats(),
        fetchUsers()
    ]);
}

async function fetchStats() {
    try {
        const token = await state.auth.currentUser.getIdToken();
        const response = await fetch('/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(await response.text());

        const stats = await response.json();
        state.stats = stats;

        document.getElementById('total-users').textContent = stats.total_users || 0;
        document.getElementById('today-logins').textContent = stats.today_logins || 0;
        document.getElementById('total-messages').textContent = stats.total_messages || 0;

        renderChart(stats.daily_activity);
    } catch (error) {
        console.error('Failed to fetch stats:', error);
    }
}

async function fetchUsers() {
    try {
        const token = await state.auth.currentUser.getIdToken();
        const response = await fetch('/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(await response.text());

        const users = await response.json();
        state.users = users;
        renderUsersTable(users);
    } catch (error) {
        console.error('Failed to fetch users:', error);
        document.getElementById('users-table-body').innerHTML = `<tr><td colspan="5" class="loading">Error: ${error.message}</td></tr>`;
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">No users found</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        const lastLogin = user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never';

        tr.innerHTML = `
            <td>
                <div class="user-email">${escapeHtml(user.email)}</div>
                <div class="subtitle" style="font-size: 0.7rem">${user.uid}</div>
            </td>
            <td>${user.message_count}</td>
            <td>${lastLogin}</td>
            <td>
                <span class="status-badge ${user.is_blocked ? 'status-blocked' : 'status-active'}">
                    ${user.is_blocked ? 'Blocked' : 'Active'}
                </span>
            </td>
            <td>
                <button class="btn ${user.is_blocked ? 'btn-success' : 'btn-danger'}" onclick="toggleBlock('${user.uid}', ${user.is_blocked})">
                    ${user.is_blocked ? 'Unblock' : 'Block'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function toggleBlock(uid, currentlyBlocked) {
    const action = currentlyBlocked ? 'unblock' : 'block';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
        const token = await state.auth.currentUser.getIdToken();
        const response = await fetch(`/admin/users/${uid}/${action}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            fetchUsers();
        } else {
            alert('Failed to update user status');
        }
    } catch (error) {
        console.error('Toggle block error:', error);
    }
}

function renderChart(data) {
    const ctx = document.getElementById('activityChart').getContext('2d');

    if (state.chart) state.chart.destroy();

    const labels = data.map(d => d.day);
    const values = data.map(d => d.count);

    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Messages Sent',
                data: values,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#6366f1',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global toggle for onclick handlers
window.toggleBlock = toggleBlock;

// Start initialization
initFirebase();
