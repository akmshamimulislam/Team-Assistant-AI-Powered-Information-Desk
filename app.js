import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const clearChatBtn = document.getElementById('clear-chat');
const quickRepliesContainer = document.getElementById('quick-replies');

let knowledgeBase = null;
let db = null;

// Initialize
async function init() {
    try {
        if (typeof firebaseConfig === 'undefined') {
            throw new Error('firebase-config.js is not loaded.');
        }

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);

        await refreshKnowledge();
        renderQuickReplies();
        console.log('Knowledge base loaded from Firestore');
    } catch (error) {
        console.error('Firebase Init Error:', error);
        addMessage('bot', `System Error: ${error.message}\nPlease check your firebase-config.js.`);
    }
}

async function refreshKnowledge() {
    try {
        const knowledgeRef = doc(db, "config", "knowledge");
        const knowledgeSnap = await getDoc(knowledgeRef);

        if (knowledgeSnap.exists()) {
            knowledgeBase = knowledgeSnap.data();
        } else {
            addMessage('bot', 'System: Knowledge base is empty. Please add data via the Admin Dashboard.');
        }
    } catch (error) {
        console.error('Data Fetch Error:', error);
        throw new Error('Failed to fetch data from Firestore.');
    }
}

// Google Sheets CSV Helper
async function getRoutineFromSheet(url) {
    try {
        let csvUrl = url;
        if (url.includes('/edit')) {
            csvUrl = url.split('/edit')[0] + '/export?format=csv';
        } else if (!url.includes('format=csv')) {
            csvUrl = url.endsWith('/') ? url + 'export?format=csv' : url + '/export?format=csv';
        }

        const response = await fetch(csvUrl);
        const csvText = await response.text();

        const cleanText = csvText.replace(/^\uFEFF/, "");
        const lines = cleanText.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return [];

        const firstLine = lines[0];
        const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
        const headers = firstLine.split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

        return lines.slice(1).map(line => {
            const values = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, i) => {
                obj[h] = values[i] || "";
            });
            return obj;
        });
    } catch (error) {
        console.error('Sheet Fetch Error:', error);
        return null;
    }
}

// Search Logic
async function findResponse(query) {
    if (!knowledgeBase) return "I'm still loading my knowledge base. Please try again in a moment.";

    const q = query.toLowerCase();
    let response = "";

    // Greetings
    if (q === "hi" || q === "hello" || q === "hey") {
        return "Hello! How can I help you today? You can ask about routines, deadlines, or trackers.";
    }

    // Help command
    if (q === "help" || q === "what can you do") {
        return "I can help you with:\n" +
            "- **Class Routine**: Try 'today routine' or 'routine 15 Jan'\n" +
            "- **Deadlines**: Try 'all deadlines' or 'any deadlines due?'\n" +
            "- **Trackers**: Try 'tracker links' or 'where is the sheet?'\n" +
            "- **PPTs**: Try 'ppt links' or 'presentation slides'\n" +
            "- **Courses**: Try 'course info' or 'who is the instructor?'\n" +
            "- **Class Formats**: Try 'class format' or 'is it on zoom?'";
    }

    // 0. Search Class Routine (Google Sheets Integration)
    if (q.includes("routine") || q.includes("schedule")) {
        const sheetUrl = knowledgeBase.routine_sheet_url || "Your_Sheet_Link";

        // Advanced Multi-Interpretation Date Parser
        const getDateInterpretations = (str) => {
            if (!str || str.length < 3) return [];
            const cleanStr = str.replace(/[-\.]/g, '/');
            const parts = cleanStr.split('/');
            const results = [];

            if (parts.length === 3) {
                const p1 = parseInt(parts[0]);
                const p2 = parseInt(parts[1]);
                let y = parseInt(parts[2]);
                if (y < 100) y += 2000;

                // Interpretation 1: DD/MM/YYYY
                if (p1 >= 1 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
                    const d = new Date(y, p2 - 1, p1);
                    if (!isNaN(d) && d.getMonth() === p2 - 1) results.push(d.toDateString());
                }
                // Interpretation 2: MM/DD/YYYY
                if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
                    const d = new Date(y, p1 - 1, p2);
                    if (!isNaN(d) && d.getMonth() === p1 - 1) {
                        const ds = d.toDateString();
                        if (!results.includes(ds)) results.push(ds);
                    }
                }
            } else {
                // Try to parse text dates (e.g. "15 Jan")
                const d = new Date(str);
                if (!isNaN(d)) {
                    // Fix year for short dates
                    if (d.getFullYear() < 2000) d.setFullYear(new Date().getFullYear());
                    // Normalize to midnight
                    const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                    results.push(normalized.toDateString());
                }
            }
            return results;
        };

        const numericMatch = query.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        const textMatch = query.match(/(\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i);

        let searchInterpretations = [];
        let displayTitle = "";
        let isSpecificDate = false;
        let dateQueryText = "";

        if (numericMatch) {
            dateQueryText = numericMatch[1];
            searchInterpretations = getDateInterpretations(dateQueryText);
            isSpecificDate = true;
        } else if (textMatch) {
            dateQueryText = textMatch[0];
            searchInterpretations = getDateInterpretations(dateQueryText);
            isSpecificDate = true;
        }

        if (isSpecificDate && searchInterpretations.length > 0) {
            displayTitle = `📅 Class Routine for ${dateQueryText}`;
        } else {
            const today = new Date();
            searchInterpretations = [new Date(today.getFullYear(), today.getMonth(), today.getDate()).toDateString()];
            displayTitle = "📅 Today's Class Routine";
        }

        const botMsgDiv = document.querySelector('.message.bot-message:last-child');
        if (botMsgDiv) botMsgDiv.innerText = `Fetching routine for ${displayTitle.replace('📅 ', '')}...`;

        const routineData = await getRoutineFromSheet(sheetUrl);

        if (routineData) {
            response += `### ${displayTitle}\n`;

            const matches = routineData.filter(row => {
                // Scan all values in the row for a date that matches ANY interpretation of the search date
                const rowDateStrings = Object.values(row).flatMap(val => getDateInterpretations(val));
                const found = rowDateStrings.some(rds => searchInterpretations.includes(rds));

                if (found) return true;

                // Fallback to day name match if it's "today" or no exact date matched a default query
                if (!isSpecificDate || q.includes("today")) {
                    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                    const rowDay = (row.day || row.date || "").toLowerCase();
                    return rowDay.includes(todayName);
                }
                return false;
            });

            if (matches.length > 0) {
                matches.forEach(m => {
                    const time = m.time || m.slot || m['time slot'] || m['timeslot'] || "TBD";
                    const subject = m.subject || m.class || m.course || Object.values(m)[3] || "Class";
                    const teacher = m.teacher || m.instructor || "";
                    const room = m.room || m.location || "";
                    response += `- **${time}**: ${subject} ${teacher ? `by ${teacher}` : ""} ${room ? `(Room: ${room})` : ""}\n`;
                });
            } else {
                response += `_No classes found for **${displayTitle.replace('📅 ', '')}**._\n`;
            }
        } else {
            response += "⚠️ _Error fetching the routine. Check Admin Dashboard URL._\n";
        }
        return response;
    }

    // 1. Search Deadlines
    if (q.includes("deadline") || q.includes("due") || q.includes("date") || q.includes("when")) {
        const matches = (knowledgeBase.deadlines || []).filter(d =>
            q.includes(d.milestone.toLowerCase()) || q.includes("deadline") || q.includes("all")
        );
        if (matches.length > 0) {
            response += "### 📅 Deadlines\n";
            matches.forEach(m => response += `- **${m.milestone}**: ${m.date}\n`);
        }
    }

    // 2. Search Trackers
    if (q.includes("tracker") || q.includes("link") || q.includes("sheet") || q.includes("where")) {
        const matches = (knowledgeBase.trackers || []).filter(t =>
            q.includes(t.name.toLowerCase()) || q.includes("tracker") || q.includes("all")
        );
        if (matches.length > 0) {
            response += "### 🔗 Trackers & Links\n";
            matches.forEach(m => response += `- [${m.name}](${m.url})\n`);
        }
    }

    // 3. Search PPT Files
    if (q.includes("ppt") || q.includes("presentation") || q.includes("slide") || q.includes("powerpoint")) {
        const matches = (knowledgeBase.ppts || []).filter(p =>
            q.includes(p.name.toLowerCase()) || q.includes("ppt") || q.includes("all")
        );
        if (matches.length > 0) {
            response += "### 📊 PPT Files & Links\n";
            matches.forEach(m => response += `- [${m.name}](${m.url})\n`);
        }
    }

    // 4. Search Templates
    if (q.includes("template") || q.includes("file") || q.includes("doc")) {
        const matches = (knowledgeBase.templates || []).filter(t =>
            q.includes(t.name.toLowerCase()) || q.includes("template")
        );
        if (matches.length > 0) {
            response += "### 📄 Templates\n";
            matches.forEach(m => response += `- [${m.name}](${m.url})\n`);
        }
    }

    // 5. Search Courses
    if (q.includes("course") || q.includes("class") || q.includes("instructor") || q.includes("who")) {
        const matches = (knowledgeBase.courses || []).filter(c =>
            q.includes(c.name.toLowerCase()) || q.includes(c.instructor.toLowerCase()) || q.includes("course")
        );
        if (matches.length > 0) {
            response += "### 📚 Course Information\n";
            matches.forEach(m => {
                const schedule = `${m.date || ''} ${m.time || ''}`.trim();
                response += `- **${m.name}**: Taught by ${m.instructor} (${schedule || 'No schedule set'})\n`;
            });
        }
    }

    // 6. Search Class Formats
    if (q.includes("format") || q.includes("how") || q.includes("conducted") || q.includes("zoom") || q.includes("recorded") || q.includes("platform")) {
        const formats = knowledgeBase.class_formats || [];
        if (formats.length === 0 && knowledgeBase.class_format) {
            formats.push({ detail: knowledgeBase.class_format });
        }

        if (formats.length > 0) {
            response += "### 🎥 Class Formats & Platforms\n";
            formats.forEach(f => response += `- ${f.detail}\n`);
        }
    }

    if (response) return response;

    return "I'm sorry, I couldn't find a specific answer for that. You can ask about **class routine**, **deadlines**, **trackers**, **PPTs**, **courses**, or **class formats**.";
}

// UI Handlers

if (clearChatBtn) {
    clearChatBtn.onclick = () => {
        chatMessages.innerHTML = '';
        addMessage('bot', 'Hello! I am your team assistant. I can help you with course details, tracker links, deadlines, and more.');
    };
}

chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const query = userInput.value.trim();
    if (!query) return;

    addMessage('user', query);
    userInput.value = '';

    const botMsgDiv = addMessage('bot', 'Searching...');

    try {
        const response = await findResponse(query);
        botMsgDiv.innerHTML = marked.parse(response);
    } catch (error) {
        botMsgDiv.innerText = "Error: " + error.message;
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

function addMessage(sender, text) {
    const div = document.createElement('div');
    div.className = `message ${sender}-message`;
    div.innerText = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
}

function renderQuickReplies() {
    const suggestions = [
        "Today Routine",
        "All Deadlines",
        "Course Info",
        "Tracker Links",
        "PPT Links",
        "Help"
    ];

    if (!quickRepliesContainer) return;

    quickRepliesContainer.innerHTML = '';
    suggestions.forEach(text => {
        const chip = document.createElement('div');
        chip.className = 'reply-chip';
        chip.innerText = text;
        chip.onclick = () => {
            userInput.value = text;
            chatForm.dispatchEvent(new Event('submit'));
        };
        quickRepliesContainer.appendChild(chip);
    });
}

init();
