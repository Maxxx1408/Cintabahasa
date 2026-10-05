import { db } from "./firebase-config.js";
import { requireUser, getProfile } from "./auth-guard.js";
import {
    doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const joinView = document.getElementById("joinView");
const waitingView = document.getElementById("waitingView");
const articleView = document.getElementById("articleView");
const playView = document.getElementById("playView");
const scoreView = document.getElementById("scoreView");

let currentUser = null;
let gameCode = null;
let playerRoom = null;      // data game terbaru (realtime)
let playerIndex = -1;
let playerScore = 0;
let playerName = "";
let playerTimerId = null;
let playerTimeLeft = 30;
let selected = false;
let hasReadArticle = false;
let historySaved = false;

// Wajib login supaya jawaban tersimpan di akun pemain
(async function init() {
    currentUser = await requireUser("player.html");
    const profile = await getProfile(currentUser.uid);
    const nameInput = document.getElementById("playerNameInput");
    if (profile?.nama && !nameInput.value) nameInput.value = profile.nama;
})();

function showJoinMessage(message) {
    document.getElementById("joinMessage").textContent = message;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
}

function hasArticle(game) { return !!game?.article?.content?.trim(); }

// ---------- Gabung ke game ----------
async function joinRoom() {
    if (!currentUser) return showJoinMessage("Tunggu sebentar, memeriksa login...");

    const code = document.getElementById("gameCodeInput").value.trim();
    playerName = document.getElementById("playerNameInput").value.trim();

    if (!/^\d{6}$/.test(code)) return showJoinMessage("Enter a 6-digit game code.");
    if (!playerName) return showJoinMessage("Enter your nickname.");

    const joinBtn = document.getElementById("joinBtn");
    joinBtn.disabled = true;
    showJoinMessage("Mencari kode di server...");

    try {
        const gRef = doc(db, "games", code);
        const gSnap = await getDoc(gRef);
        if (!gSnap.exists()) {
            return showJoinMessage("Kode game tidak ditemukan. Periksa kodenya dan coba lagi.");
        }
        const game = gSnap.data();

        const pRef = doc(db, "games", code, "players", currentUser.uid);
        const pSnap = await getDoc(pRef);

        // Pemain baru hanya boleh masuk saat game masih menunggu.
        // Pemain lama (misalnya halaman ter-refresh) boleh masuk lagi.
        if (game.status !== "waiting" && !pSnap.exists()) {
            return showJoinMessage("This game has already started or finished.");
        }

        if (pSnap.exists()) {
            playerScore = pSnap.data().score || 0;
            hasReadArticle = game.status !== "waiting";
            await setDoc(pRef, { name: playerName }, { merge: true });
        } else {
            playerScore = 0;
            hasReadArticle = false;
            await setDoc(pRef, { uid: currentUser.uid, name: playerName, score: 0, joinedAt: serverTimestamp() });
        }

        gameCode = code;
        document.getElementById("joinedName").textContent = playerName;
        document.getElementById("joinedCode").textContent = code;
        joinView.classList.add("hidden");
        waitingView.classList.remove("hidden");
        showJoinMessage("");

        // Pantau game secara realtime: host menekan mulai / soal berikutnya -> layar ikut berubah
        onSnapshot(gRef, snap => { if (snap.exists()) onGameUpdate(snap.data()); },
            err => console.error("Gagal memantau game:", err));
    } catch (error) {
        console.error("Error Firebase:", error);
        showJoinMessage(error.code === "permission-denied"
            ? "Ditolak oleh Firestore Rules. Cek rules di Firebase Console."
            : "Gagal terhubung ke database. Periksa koneksi.");
    } finally {
        joinBtn.disabled = false;
    }
}

document.getElementById("joinBtn").addEventListener("click", joinRoom);

// ---------- Sinkron dengan host ----------
function onGameUpdate(game) {
    playerRoom = game;

    if (game.status === "waiting") {
        if (!hasReadArticle && hasArticle(game)) showArticle();
    } else if (game.status === "playing") {
        if (!hasReadArticle && hasArticle(game)) { showArticle(); return; }

        const idx = Number(game.current || 0);
        if (playView.classList.contains("hidden") || idx !== playerIndex) {
            playerIndex = idx;
            articleView.classList.add("hidden");
            waitingView.classList.add("hidden");
            playView.classList.remove("hidden");
            showPlayerQuestion();
        }
    } else if (game.status === "finished") {
        finishPlayer();
    }
}

function showArticle() {
    const article = playerRoom?.article;
    waitingView.classList.add("hidden");
    playView.classList.add("hidden");
    articleView.classList.remove("hidden");
    document.getElementById("playerArticleTitle").textContent = article.title || "Reading Article";
    document.getElementById("playerArticleContent").textContent = article.content;
}

document.getElementById("articleDoneBtn").addEventListener("click", () => {
    hasReadArticle = true;
    articleView.classList.add("hidden");
    if (playerRoom?.status === "playing") onGameUpdate(playerRoom);
    else waitingView.classList.remove("hidden");
});

// ---------- Soal & jawaban ----------
function showPlayerQuestion() {
    selected = false;
    const q = playerRoom.questions[playerIndex];
    if (!q) return;

    document.getElementById("playerProgress").textContent =
        `Question ${playerIndex + 1} / ${playerRoom.questions.length}`;
    document.getElementById("playerQuestion").textContent = q.question;
    document.getElementById("answerMessage").textContent = "";

    document.getElementById("playerAnswers").innerHTML = q.options.map((o, i) =>
        `<button class="answer" data-option="${i}" type="button">
            ${String.fromCharCode(65 + i)}. ${escapeHtml(o)}
        </button>`
    ).join("");

    document.querySelectorAll("#playerAnswers .answer").forEach(btn => {
        btn.addEventListener("click", () => chooseAnswer(Number(btn.dataset.option)));
    });

    startPlayerTimer();
}

// Simpan jawaban ke games/{kode}/answers/{uid_nomorSoal}
async function saveAnswer(option, earned) {
    const q = playerRoom.questions[playerIndex];
    await setDoc(doc(db, "games", gameCode, "answers", `${currentUser.uid}_${playerIndex}`), {
        uid: currentUser.uid,
        name: playerName,
        questionIndex: playerIndex,
        option,
        correct: option === q.correct,
        earned,
        answeredAt: serverTimestamp()
    });
    if (earned > 0) {
        playerScore += earned;
        await updateDoc(doc(db, "games", gameCode, "players", currentUser.uid), { score: playerScore });
    }
}

async function chooseAnswer(option) {
    if (selected || !playerRoom) return;
    selected = true;
    clearInterval(playerTimerId);

    const q = playerRoom.questions[playerIndex];
    const buttons = document.querySelectorAll("#playerAnswers .answer");
    buttons.forEach(btn => { btn.disabled = true; });

    const earned = option === q.correct ? 100 + Math.max(0, playerTimeLeft) * 10 : 0;
    const msg = document.getElementById("answerMessage");

    try {
        await saveAnswer(option, earned);
    } catch (e) {
        console.error("Gagal simpan jawaban:", e);
        msg.textContent = e.code === "permission-denied"
            ? "Jawaban untuk soal ini sudah tercatat."
            : "Gagal menyimpan jawaban. Periksa koneksi.";
        return;
    }

    buttons.forEach((btn, i) => {
        if (i === q.correct) btn.classList.add("correct");
        if (i === option && i !== q.correct) btn.classList.add("wrong");
    });
    msg.textContent = earned > 0 ? `Correct! +${earned} points` : "Not quite!";

    setTimeout(() => {
        if (playerRoom?.status === "playing" && playerIndex < playerRoom.questions.length - 1) {
            msg.textContent = "Answer locked. Waiting for the host...";
        }
    }, 800);
}

function startPlayerTimer() {
    clearInterval(playerTimerId);
    playerTimeLeft = 30;
    document.getElementById("playerTimer").textContent = playerTimeLeft;

    playerTimerId = setInterval(async () => {
        playerTimeLeft--;
        document.getElementById("playerTimer").textContent = playerTimeLeft;

        if (playerTimeLeft <= 0) {
            clearInterval(playerTimerId);

            if (!selected && playerRoom) {
                selected = true;
                document.querySelectorAll("#playerAnswers .answer").forEach(btn => { btn.disabled = true; });
                document.getElementById("answerMessage").textContent = "Time's up! Waiting for the host...";
                try { await saveAnswer(-1, 0); } catch (e) { console.error(e); }
            }
        }
    }, 1000);
}

// ---------- Selesai ----------
async function finishPlayer() {
    clearInterval(playerTimerId);

    playView.classList.add("hidden");
    articleView.classList.add("hidden");
    waitingView.classList.add("hidden");
    scoreView.classList.remove("hidden");

    document.getElementById("finalScore").textContent = playerScore;
    document.getElementById("finalPlayerName").textContent = playerName;

    // Riwayat permainan tersimpan di akun: users/{uid}/history/{kode}
    if (!historySaved && gameCode) {
        historySaved = true;
        try {
            await setDoc(doc(db, "users", currentUser.uid, "history", gameCode), {
                gameCode,
                title: playerRoom?.title || "",
                score: playerScore,
                total: playerRoom?.questions?.length || 0,
                finishedAt: serverTimestamp()
            });
        } catch (e) {
            console.error("Gagal simpan riwayat:", e);
        }
    }
}
