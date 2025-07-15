// fileName: ui.js

// --- UI & Rendering ---
const updateDisplay = (sp) => {
    if (!sp) return;
    const queuedAttendees = getSubmissionQueue().filter(s => s.sp === sp).map(s => ({...s, status: 'queued'}));
    const allAttendees = [...currentSyncedAttendees, ...queuedAttendees];
    const attendedLots = new Set();
    allAttendees.forEach(attendee => attendedLots.add(String(attendee.lot)));
    renderAttendeeTable(allAttendees);
    updateQuorumDisplay(attendedLots.size, currentTotalLots);
};

const resetUiOnPlanChange = () => {
    currentSyncedAttendees = [];
    currentTotalLots = 0;
    document.getElementById('attendee-table-body').innerHTML = `<tr><td colspan="4" style="text-align:center;">Select a plan to see attendees.</td></tr>`;
    document.getElementById('person-count').textContent = `(0 people)`;
    document.getElementById('quorum-display').innerHTML = `Quorum: ...%`;
    document.getElementById('quorum-display').style.backgroundColor = '#6c757d';
    document.getElementById('checkbox-container').innerHTML = '<p>Select a Strata Plan to begin.</p>';
    document.getElementById('lot-number').value = '';
    document.getElementById('lot-number').disabled = true;
    document.getElementById('financial-label').lastChild.nodeValue = " Is Financial?";
    document.getElementById('meeting-title').textContent = 'Attendance Form';
    document.getElementById('meeting-date').textContent = '';
};

const renderStrataPlans = (plans) => {
    const strataPlanSelect = document.getElementById('strata-plan-select');
    if (!plans) return;
    strataPlanSelect.innerHTML = '<option value="">Select a plan...</option>';
    plans.sort((a, b) => a.sp - b.sp);
    plans.forEach(plan => {
        const option = document.createElement('option');
        option.value = plan.sp;
        option.textContent = `${plan.sp} - ${plan.suburb}`;
        strataPlanSelect.appendChild(option);
    });
    const savedSP = document.cookie.split('; ').find(row => row.startsWith('selectedSP='))?.split('=')[1];
    if (savedSP) strataPlanSelect.value = savedSP;
};

const renderAttendeeTable = (attendees) => {
    const attendeeTableBody = document.getElementById('attendee-table-body');
    const personCountSpan = document.getElementById('person-count');
    const syncedCount = attendees.filter(item => item.status !== 'queued').length;
    const personLabel = (syncedCount === 1) ? 'person' : 'people';
    personCountSpan.textContent = `(${syncedCount} ${personLabel})`;
    attendeeTableBody.innerHTML = '';
    if (!attendees || attendees.length === 0) {
        attendeeTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No attendees yet.</td></tr>`;
        return;
    }
    attendees.sort((a, b) => a.lot - b.lot);
    attendees.forEach(item => {
        const isQueued = item.status === 'queued';
        const name = item.name || (item.proxyHolderLot ? `Proxy - Lot ${item.proxyHolderLot}` : item.names.join(', '));
        const isProxy = String(name).startsWith('Proxy - Lot');
        const isCompany = !isProxy && /\b(P\/L|Pty Ltd|Limited)\b/i.test(name);
        let ownerRepName = '', companyName = '', rowColor = isQueued ? '#f5e0df' : '#d4e3c1';
        if (isProxy) {
            ownerRepName = name;
            if (!isQueued) rowColor = '#c1e1e3';
        } else if (isCompany) {
            const parts = name.split(' - ');
            companyName = parts[0].trim();
            if (parts.length > 1) ownerRepName = parts[1].trim();
            if (!isQueued) rowColor = '#cbc1e3';
        } else {
            ownerRepName = name;
        }
        const row = document.createElement('tr');
        row.style.backgroundColor = rowColor;
        const deleteButton = isQueued 
            ? `<button class="delete-btn" data-type="queued" data-submission-id="${item.submissionId}">Delete</button>`
            : `<button class="delete-btn" data-type="synced" data-lot="${item.lot}">Delete</button>`;
        row.innerHTML = `<td>${item.lot}</td><td>${ownerRepName}</td><td>${companyName}</td><td>${deleteButton}</td>`;
        attendeeTableBody.appendChild(row);
    });
};

const updateQuorumDisplay = (count = 0, total = 0) => {
    const quorumDisplay = document.getElementById('quorum-display');
    const percentage = total > 0 ? Math.floor((count / total) * 100) : 0;
    quorumDisplay.innerHTML = `Quorum: ${percentage}%<br><small>(${count}/${total})</small>`;
    quorumDisplay.style.backgroundColor = percentage >= 25 ? '#28a745' : '#dc3545';
};
