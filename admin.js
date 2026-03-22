import { signInWithEmailAndPassword, onAuthStateChanged, signOut, getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// DOM Elements
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userDisplay = document.getElementById('user-display');
const saveAllBtn = document.getElementById('save-all');
const statusMsg = document.getElementById('status-msg');

const trackersList = document.getElementById('trackers-list');
const deadlinesList = document.getElementById('deadlines-list');
const templatesList = document.getElementById('templates-list');
const pptsList = document.getElementById('ppts-list');
const coursesList = document.getElementById('courses-list');
const classFormatsList = document.getElementById('class-formats-list');
const routineSheetUrlInput = document.getElementById('routine-sheet-url');
const dataPreview = document.getElementById('data-preview');

let auth, db;
let currentData = {
    trackers: [],
    deadlines: [],
    templates: [],
    ppts: [],
    courses: [],
    class_formats: [],
    routine_sheet_url: ""
};

// Initialize Firebase
try {
    if (typeof firebaseConfig === 'undefined') {
        throw new Error('firebase-config.js is not loaded.');
    }
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (error) {
    if (statusMsg) statusMsg.innerText = 'Firebase Init Error: ' + error.message;
}

// Auth Listener
if (auth) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginSection.style.display = 'none';
            dashboardSection.classList.add('active');
            userDisplay.innerText = `Logged in as: ${user.email}`;
            loadAllData();
        } else {
            loginSection.style.display = 'flex';
            dashboardSection.classList.remove('active');
        }
    });
}

// Login
loginBtn.onclick = async () => {
    try {
        await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        showStatus('Logged in successfully!', 'lightgreen');
    } catch (error) {
        showStatus('Login failed: ' + error.message, '#ff6b6b');
    }
};

// Logout
logoutBtn.onclick = async () => {
    await signOut(auth);
};

// Data Management
async function loadAllData() {
    try {
        const knowledgeRef = doc(db, "config", "knowledge");
        const knowledgeSnap = await getDoc(knowledgeRef);
        if (knowledgeSnap.exists()) {
            const data = knowledgeSnap.data();

            // Migration and Initialization
            currentData = {
                trackers: data.trackers || [],
                deadlines: data.deadlines || [],
                templates: data.templates || [],
                ppts: data.ppts || [],
                courses: data.courses || [],
                class_formats: data.class_formats || [],
                routine_sheet_url: data.routine_sheet_url || ""
            };

            // Handle legacy single class_format string
            if (data.class_format && currentData.class_formats.length === 0) {
                currentData.class_formats.push({ detail: data.class_format });
            }
        } else {
            resetCurrentData();
        }
        renderDashboard();
    } catch (error) {
        showStatus('Error loading data: ' + error.message, '#ff6b6b');
    }
}

function resetCurrentData() {
    currentData = {
        trackers: [],
        deadlines: [],
        templates: [],
        ppts: [],
        courses: [],
        class_formats: [],
        routine_sheet_url: ""
    };
}

function renderDashboard() {
    renderList(trackersList, currentData.trackers, 'trackers');
    renderList(deadlinesList, currentData.deadlines, 'deadlines');
    renderList(templatesList, currentData.templates, 'templates');
    renderList(pptsList, currentData.ppts, 'ppts');
    renderList(coursesList, currentData.courses, 'courses');
    renderList(classFormatsList, currentData.class_formats, 'class_formats');
    if (routineSheetUrlInput) routineSheetUrlInput.value = currentData.routine_sheet_url || '';
    renderPreview();
}

function renderList(container, list, type) {
    container.innerHTML = '';
    list.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = `item-row ${type === 'deadlines' ? 'deadline' : ''} ${type === 'class_formats' ? 'full' : ''}`;

        if (type === 'deadlines') {
            row.innerHTML = `
                <input type="text" placeholder="Milestone" value="${item.milestone || ''}" oninput="updateItem('${type}', ${index}, 'milestone', this.value)">
                <input type="date" value="${item.date || ''}" oninput="updateItem('${type}', ${index}, 'date', this.value)">
            `;
        } else if (type === 'ppts') {
            row.innerHTML = `
                <input type="text" placeholder="PPT File Name" value="${item.name || ''}" oninput="updateItem('${type}', ${index}, 'name', this.value)">
                <input type="text" placeholder="Download Link" value="${item.url || ''}" oninput="updateItem('${type}', ${index}, 'url', this.value)">
            `;
        } else if (type === 'courses') {
            row.style.gridTemplateColumns = '1fr 1fr 1fr 1fr auto';
            row.innerHTML = `
                <input type="text" placeholder="Course Name" value="${item.name || ''}" oninput="updateItem('${type}', ${index}, 'name', this.value)">
                <input type="text" placeholder="Instructor" value="${item.instructor || ''}" oninput="updateItem('${type}', ${index}, 'instructor', this.value)">
                <input type="date" value="${item.date || ''}" oninput="updateItem('${type}', ${index}, 'date', this.value)">
                <input type="time" value="${item.time || ''}" oninput="updateItem('${type}', ${index}, 'time', this.value)">
            `;
        } else if (type === 'class_formats') {
            row.innerHTML = `
                <input type="text" placeholder="Class Platform/Link/Detail (e.g. Zoom: link)" value="${item.detail || ''}" oninput="updateItem('${type}', ${index}, 'detail', this.value)">
            `;
        } else {
            row.innerHTML = `
                <input type="text" placeholder="Name" value="${item.name || ''}" oninput="updateItem('${type}', ${index}, 'name', this.value)">
                <input type="text" placeholder="URL/Link" value="${item.url || ''}" oninput="updateItem('${type}', ${index}, 'url', this.value)">
            `;
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.innerText = 'Delete';
        deleteBtn.onclick = () => removeItem(type, index);

        row.appendChild(deleteBtn);
        container.appendChild(row);
    });
}

function renderPreview() {
    let html = '';

    const categories = {
        trackers: '🔗 Trackers',
        deadlines: '📅 Deadlines',
        templates: '📄 Templates',
        ppts: '📊 PPT Files',
        courses: '📚 Courses',
        routine_sheet_url: '📅 Routine Sheet',
        class_formats: '🎥 Class Formats'
    };

    for (const [key, label] of Object.entries(categories)) {
        if (currentData[key] && currentData[key].length > 0) {
            html += `<div class="preview-category">${label}</div>`;
            currentData[key].forEach(item => {
                if (key === 'deadlines') {
                    html += `<div class="preview-item">• ${item.milestone}: ${item.date}</div>`;
                } else if (key === 'courses') {
                    const schedule = `${item.date || ''} ${item.time || ''}`.trim();
                    html += `<div class="preview-item">• ${item.name} (${item.instructor}) - ${schedule || 'No schedule set'}</div>`;
                } else if (key === 'class_formats') {
                    html += `<div class="preview-item">• ${item.detail}</div>`;
                } else if (key === 'routine_sheet_url') {
                    html += `<div class="preview-item">• Link set: ${item}</div>`;
                } else {
                    html += `<div class="preview-item">• ${item.name}: ${item.url}</div>`;
                }
            });
        }
    }

    dataPreview.innerHTML = html || 'No data added yet.';
}

// Global functions
window.addItem = (type) => {
    if (!currentData[type]) currentData[type] = [];

    if (type === 'deadlines') {
        currentData[type].push({ milestone: '', date: '' });
    } else if (type === 'courses') {
        currentData[type].push({ name: '', instructor: '', date: '', time: '' });
    } else if (type === 'class_formats') {
        currentData[type].push({ detail: '' });
    } else {
        currentData[type].push({ name: '', url: '' });
    }
    renderDashboard();
};

window.removeItem = (type, index) => {
    currentData[type].splice(index, 1);
    renderDashboard();
};

window.updateItem = (type, index, field, value) => {
    currentData[type][index][field] = value;
    renderPreview();
};

window.updateRoutineUrl = (val) => {
    currentData.routine_sheet_url = val;
    renderPreview();
};

window.clearAllData = () => {
    if (confirm("Are you sure you want to clear all data?")) {
        resetCurrentData();
        renderDashboard();
        showStatus('Data cleared locally. Click Save to apply.', 'orange');
    }
};

saveAllBtn.onclick = async () => {
    showStatus('Saving...', 'white');
    try {
        await setDoc(doc(db, "config", "knowledge"), currentData);
        showStatus('All changes saved successfully!', 'lightgreen');
    } catch (error) {
        showStatus('Save failed: ' + error.message, '#ff6b6b');
    }
};

function showStatus(msg, color) {
    statusMsg.innerText = msg;
    statusMsg.style.color = color;
    setTimeout(() => { if (statusMsg.innerText === msg) statusMsg.innerText = ''; }, 3000);
}
