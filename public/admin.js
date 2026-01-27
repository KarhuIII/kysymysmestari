
let allQuestions = [];
let allStats = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchQuestions();
    fetchStats();

    document.getElementById('search-questions').addEventListener('input', (e) => {
        renderQuestions(e.target.value);
    });
});

function showTab(tab) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`view-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');
}

async function fetchQuestions() {
    try {
        const res = await fetch('/api/questions');
        allQuestions = await res.json();
        renderQuestions();
    } catch (e) {
        console.error('Failed to fetch questions', e);
    }
}

function renderQuestions(filter = '') {
    const container = document.getElementById('questions-container');
    container.innerHTML = '';

    const filtered = allQuestions.filter(q =>
        q.question.toLowerCase().includes(filter.toLowerCase()) ||
        q.id.toLowerCase().includes(filter.toLowerCase())
    );

    filtered.forEach(q => {
        const div = document.createElement('div');
        div.className = 'question-item';
        div.innerHTML = `
            <div class="question-content">
                <div style="font-weight: bold;">${q.question}</div>
                <div class="question-meta">ID: ${q.id} | Diff: ${q.difficulty} | Type: ${q.cardType || 'normal'} | Source: ${q._sourceFile || 'Batch'}</div>
            </div>
            <div class="actions">
                <button class="btn btn-secondary" onclick="editQuestion('${q.id}')">Muokkaa</button>
                <button class="btn btn-secondary" style="background-color: #ff7675;" onclick="deleteQuestion('${q.id}')">Poista</button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        allStats = await res.json();
        renderStats();
    } catch (e) {
        console.error('Failed to fetch stats', e);
    }
}

function renderStats() {
    // Summary
    document.getElementById('total-users').innerText = allStats.length;

    const totalGames = allStats.reduce((sum, p) => sum + p.stats.gamesPlayed, 0);
    // Since stats are per player, total games played is roughly sum/2 (if 1v1 always), but let's just show sum of plays
    document.getElementById('total-games').innerText = totalGames;

    // Players List
    const list = document.getElementById('players-list');
    list.innerHTML = '';

    // Sort by wins
    const sorted = [...allStats].sort((a, b) => b.stats.wins - a.stats.wins);

    sorted.forEach(p => {
        const div = document.createElement('div');
        div.className = 'history-item';
        // Add class based on win rate? Just default for now.
        div.innerHTML = `
            <div>
                <strong>${p.username}</strong>
                <div style="font-size: 0.8rem; color: #666;">
                    Voitot: ${p.stats.wins} | Tappiot: ${p.stats.losses} | Tasapelit: ${p.stats.draws}
                </div>
            </div>
            <div style="font-size: 1.2rem; font-weight: bold; color: var(--primary-color);">
                ${p.stats.gamesPlayed > 0 ? Math.round((p.stats.wins / p.stats.gamesPlayed) * 100) : 0}% Win Rate
            </div>
        `;
        list.appendChild(div);
    });
}

// Modal Logic
const modal = document.getElementById('question-modal');

function openAddModal() {
    document.getElementById('modal-title').innerText = 'Lisää kysymys';
    document.getElementById('edit-id').value = '';

    document.getElementById('edit-question').value = '';
    document.getElementById('edit-opt-0').value = '';
    document.getElementById('edit-opt-1').value = '';
    document.getElementById('edit-opt-2').value = '';
    document.getElementById('edit-opt-3').value = '';
    document.getElementById('edit-correct').value = '0';
    document.getElementById('edit-difficulty').value = '1';
    document.getElementById('edit-card-type').value = 'normal';

    modal.style.display = 'flex';
}

function editQuestion(id) {
    const q = allQuestions.find(q => q.id === id);
    if (!q) return;

    document.getElementById('modal-title').innerText = 'Muokkaa kysymystä';
    document.getElementById('edit-id').value = q.id;

    document.getElementById('edit-question').value = q.question;
    document.getElementById('edit-opt-0').value = q.options[0] || '';
    document.getElementById('edit-opt-1').value = q.options[1] || '';
    document.getElementById('edit-opt-2').value = q.options[2] || '';
    document.getElementById('edit-opt-3').value = q.options[3] || '';
    document.getElementById('edit-correct').value = q.correctIndex;
    document.getElementById('edit-difficulty').value = q.difficulty;
    document.getElementById('edit-card-type').value = q.cardType || 'normal';

    modal.style.display = 'flex';
}

function closeModal() {
    modal.style.display = 'none';
}

window.onclick = function (event) {
    if (event.target == modal) {
        closeModal();
    }
}

async function saveQuestion() {
    const id = document.getElementById('edit-id').value;
    const question = document.getElementById('edit-question').value;
    const opt0 = document.getElementById('edit-opt-0').value;
    const opt1 = document.getElementById('edit-opt-1').value;
    const opt2 = document.getElementById('edit-opt-2').value;
    const opt3 = document.getElementById('edit-opt-3').value;
    const correctIndex = parseInt(document.getElementById('edit-correct').value);
    const difficulty = parseInt(document.getElementById('edit-difficulty').value);
    const cardType = document.getElementById('edit-card-type').value;

    // Validation
    if (!question || !opt0 || !opt1) {
        alert('Täytä kysymys ja vähintään kaksi vaihtoehtoa');
        return;
    }

    const payload = {
        question,
        options: [opt0, opt1, opt2, opt3].filter(o => o && o.trim() !== ''), // Remove empty options if any
        correctIndex,
        difficulty,
        cardType
    };

    if (id) {
        // Update
        await fetch(`/api/questions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } else {
        // Create
        await fetch('/api/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    closeModal();
    fetchQuestions();
}

async function deleteQuestion(id) {
    if (!confirm('Haluatko varmasti poistaa tämän kysymyksen?')) return;

    await fetch(`/api/questions/${id}`, {
        method: 'DELETE'
    });
    fetchQuestions();
}
