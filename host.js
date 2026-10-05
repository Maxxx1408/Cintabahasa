import { db } from "./firebase-config.js";
import { requireUser, getProfile } from "./auth-guard.js";
import {
    doc, getDoc, setDoc, updateDoc, onSnapshot, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const setupView = document.getElementById("setupView");
const lobbyView = document.getElementById("lobbyView");
const questionView = document.getElementById("questionView");
const resultView = document.getElementById("resultView");
const questionList = document.getElementById("questionList");

let hostQuestions = structuredClone(QuizApp.defaultQuestions);
let hostRoom = null;       // data game yang sedang dihost
let hostPlayers = [];      // daftar pemain (realtime dari Firestore)
let hostIndex = 0;
let hostTimerId = null;
let hostTimeLeft = 30;
let currentUser = null;
let hostName = "";

// Wajib login untuk membuat quiz
(async function init() {
    currentUser = await requireUser("host.html");
    const profile = await getProfile(currentUser.uid);
    hostName = profile?.nama || currentUser.email || "Host";
})();

function gameRef() { return doc(db, "games", hostRoom.code); }

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
}

function setStatus(message) {
    const el = document.getElementById("hostStatus");
    if (el) el.textContent = message;
}

// ---------- Editor soal ----------
function renderQuestionEditors() {
    questionList.innerHTML = "";
    hostQuestions.forEach((q, index) => {
        const item = document.createElement("div");
        item.className = "question-item";
        item.innerHTML = `
            <div class="question-title">
                <span>Question ${index + 1}</span>
                ${hostQuestions.length > 1 ? `<button class="remove-question" data-index="${index}" type="button">Remove</button>` : ""}
            </div>
            <input class="q-text" data-index="${index}" value="${escapeHtml(q.question)}" placeholder="Question">
            <div class="option-row">
                ${q.options.map((o, oi) => `<input class="q-option" data-index="${index}" data-option="${oi}" value="${escapeHtml(o)}" placeholder="Option ${oi + 1}">`).join("")}
            </div>
            <select class="correct-select" data-index="${index}">
                ${q.options.map((_, oi) => `<option value="${oi}" ${q.correct === oi ? "selected" : ""}>Correct answer: Option ${oi + 1}</option>`).join("")}
            </select>
        `;
        questionList.appendChild(item);
    });

    questionList.querySelectorAll(".q-text").forEach(el => {
        el.addEventListener("input", e => hostQuestions[e.target.dataset.index].question = e.target.value);
    });
    questionList.querySelectorAll(".q-option").forEach(el => {
        el.addEventListener("input", e => hostQuestions[e.target.dataset.index].options[e.target.dataset.option] = e.target.value);
    });
    questionList.querySelectorAll(".correct-select").forEach(el => {
        el.addEventListener("change", e => hostQuestions[e.target.dataset.index].correct = Number(e.target.value));
    });
    questionList.querySelectorAll(".remove-question").forEach(el => {
        el.addEventListener("click", () => {
            hostQuestions.splice(Number(el.dataset.index), 1);
            renderQuestionEditors();
        });
    });
}

document.getElementById("addQuestionBtn").addEventListener("click", () => {
    hostQuestions.push({
        question: "New question",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correct: 0
    });
    renderQuestionEditors();
});

// ---------- Buat room ----------
async function makeUniqueCode() {
    for (let i = 0; i < 5; i++) {
        const code = QuizApp.randomCode();
        const snap = await getDoc(doc(db, "games", code));
        if (!snap.exists()) return code;
    }
    throw new Error("Gagal membuat kode unik, coba lagi.");
}

async function startRoom() {
    if (!currentUser) { alert("Tunggu sebentar, memeriksa login..."); return; }

    const title = document.getElementById("quizTitle").value.trim() || "Untitled Quiz";
    const articleTitle = document.getElementById("articleTitle").value.trim();
    const articleContent = document.getElementById("articleContent").value.trim();

    if (hostQuestions.some(q => !q.question.trim() || q.options.some(o => !o.trim()))) {
        alert("Please fill in every question and option.");
        return;
    }

    const btn = document.getElementById("startHostBtn");
    btn.disabled = true;
    setStatus("Membuat room...");

    try {
        const code = await makeUniqueCode();
        hostRoom = {
            code,
            title,
            article: { title: articleTitle, content: articleContent },
            questions: structuredClone(hostQuestions),
            hostId: currentUser.uid,
            hostName,
            status: "waiting",
            current: 0
        };

        // Simpan game ke Firestore: games/{kode}
        await setDoc(gameRef(), { ...hostRoom, createdAt: serverTimestamp() });

        // Pantau pemain yang bergabung secara realtime (HP maupun laptop)
        onSnapshot(collection(db, "games", code, "players"), snap => {
            hostPlayers = snap.docs.map(d => d.data());
            renderPlayers();
            renderLeaderboard();
        }, err => console.error("Gagal memantau pemain:", err));

        document.getElementById("roomCode").textContent = code;
        document.getElementById("lobbyTitle").textContent = title;
        setupView.classList.add("hidden");
        lobbyView.classList.remove("hidden");
        setStatus("Quiz room created. Share the game code with your players.");
        renderPlayers();
        renderLeaderboard();
    } catch (e) {
        console.error(e);
        alert("Gagal membuat room: " + (e.code === "permission-denied" ? "ditolak Firestore Rules" : e.message));
        setStatus("Build your questions and create an online quiz room.");
        btn.disabled = false;
    }
}

document.getElementById("startHostBtn").addEventListener("click", startRoom);

// ---------- Tampilan pemain & leaderboard ----------
function renderPlayers() {
    const list = document.getElementById("playerList");
    list.innerHTML = hostPlayers.length
        ? hostPlayers.map(p => `<div class="player-chip">👤 ${escapeHtml(p.name)}</div>`).join("")
        : `<div class="muted">No players yet.</div>`;
    document.getElementById("playerCount").textContent = hostPlayers.length;
}

function renderLeaderboard() {
    const players = [...hostPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));

    const html = players.length
        ? players.map((p, i) => `
            <div class="rank-row ${i < 3 ? "top-rank" : ""}">
                <span class="rank">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                <span>${escapeHtml(p.name)}</span>
                <strong>${p.score || 0} pts</strong>
            </div>`).join("")
        : `<div class="muted">Waiting for players...</div>`;

    [document.getElementById("hostLeaderboard"), document.getElementById("finalLeaderboard")]
        .forEach(board => { if (board) board.innerHTML = html; });
}

// ---------- Jalannya quiz ----------
document.getElementById("startQuizBtn").addEventListener("click", async () => {
    if (!hostRoom) return;
    try {
        await updateDoc(gameRef(), { status: "playing", current: 0 });
    } catch (e) {
        console.error(e);
        alert("Gagal memulai quiz: " + e.message);
        return;
    }
    hostRoom.status = "playing";
    hostIndex = 0;
    lobbyView.classList.add("hidden");
    questionView.classList.remove("hidden");
    showHostQuestion();
});

function showHostQuestion() {
    const q = hostRoom.questions[hostIndex];
    if (!q) return;

    document.getElementById("hostProgress").textContent =
        `Question ${hostIndex + 1} / ${hostRoom.questions.length}`;
    document.getElementById("hostQuestion").textContent = q.question;
    document.getElementById("hostAnswers").innerHTML = q.options.map((o, i) =>
        `<button class="answer ${i === q.correct ? "correct" : ""}" type="button">
            ${String.fromCharCode(65 + i)}. ${escapeHtml(o)}
        </button>`
    ).join("");

    document.getElementById("nextQuestionBtn").textContent =
        hostIndex === hostRoom.questions.length - 1 ? "Finish Quiz" : "Next Question";

    startHostTimer();
}

function startHostTimer() {
    clearInterval(hostTimerId);
    hostTimeLeft = 30;
    document.getElementById("hostTimer").textContent = hostTimeLeft;

    hostTimerId = setInterval(() => {
        hostTimeLeft--;
        document.getElementById("hostTimer").textContent = hostTimeLeft;
        if (hostTimeLeft <= 0) clearInterval(hostTimerId);
    }, 1000);
}

document.getElementById("nextQuestionBtn").addEventListener("click", async () => {
    if (!hostRoom) return;

    try {
        if (hostIndex < hostRoom.questions.length - 1) {
            await updateDoc(gameRef(), { current: hostIndex + 1 });
            hostIndex++;
            showHostQuestion();
        } else {
            await finishHostQuiz();
        }
    } catch (e) {
        console.error(e);
        alert("Gagal menyimpan ke database: " + e.message);
    }
});

async function finishHostQuiz() {
    clearInterval(hostTimerId);
    await updateDoc(gameRef(), { status: "finished" });
    hostRoom.status = "finished";

    questionView.classList.add("hidden");
    resultView.classList.remove("hidden");
    renderLeaderboard();
}

document.getElementById("restartBtn").addEventListener("click", () => location.reload());

renderQuestionEditors();
