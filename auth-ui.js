import { auth, db } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

function tampilkan(el, teks, tipe = "error") {
    if (!el) { alert(teks); return; }
    el.textContent = teks;
    el.className = "message " + tipe;
}

function pesanError(err) {
    const map = {
        "auth/email-already-in-use": "Email sudah terdaftar. Silakan login.",
        "auth/weak-password": "Password minimal 6 karakter.",
        "auth/invalid-email": "Format email tidak valid.",
        "auth/invalid-credential": "Email atau password salah.",
        "auth/user-not-found": "Akun tidak ditemukan.",
        "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
        "auth/network-request-failed": "Koneksi internet bermasalah.",
        "auth/operation-not-allowed": "Login Email/Password belum diaktifkan di Firebase Console.",
        "auth/unauthorized-domain": "Domain web ini belum ditambahkan di Firebase (Authentication > Settings > Authorized domains).",
        "permission-denied": "Ditolak oleh Firestore Rules. Cek rules di Firebase Console."
    };
    return map[err.code] || err.message;
}

// Hanya izinkan redirect ke file .html di folder yang sama
function tujuanSetelahLogin() {
    const r = new URLSearchParams(location.search).get("returnTo");
    return r && /^[\w-]+\.html$/.test(r) ? r : "dashboard.html";
}

// ---------- SIGNUP ----------
const signupForm = document.getElementById("signupForm");
signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("signupMessage");
    const nama = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const role = document.querySelector('input[name="role"]:checked').value;
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), {
            nama, email, role, createdAt: serverTimestamp()
        });
        tampilkan(msg, "Akun berhasil dibuat!", "success");
        setTimeout(() => location.href = tujuanSetelahLogin(), 700);
    } catch (err) {
        console.error(err);
        tampilkan(msg, "Gagal mendaftar: " + pesanError(err));
    }
});

// ---------- LOGIN ----------
const loginForm = document.getElementById("loginForm");
loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("loginMessage");
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const ingat = document.getElementById("rememberMe")?.checked;
    try {
        await setPersistence(auth, ingat ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        location.href = tujuanSetelahLogin();
    } catch (err) {
        console.error(err);
        tampilkan(msg, "Login gagal: " + pesanError(err));
    }
});

// ---------- LUPA PASSWORD ----------
const forgotForm = document.getElementById("forgotPasswordForm");
forgotForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("forgotMessage");
    const email = document.getElementById("forgotEmail").value.trim();
    try {
        await sendPasswordResetEmail(auth, email);
        tampilkan(msg, "Link reset password sudah dikirim ke email kamu.", "success");
    } catch (err) {
        console.error(err);
        tampilkan(msg, pesanError(err));
    }
});

// ---------- LOGOUT ----------
document.querySelector(".logout-btn")?.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "index.html";
});
// ---------- PILIHAN ROLE (Student / Teacher) ----------
document.querySelectorAll('input[name="role"]').forEach(radio => {
    radio.addEventListener("change", () => {
        document.querySelectorAll(".role-option").forEach(label => {
            label.classList.toggle("selected", label.querySelector("input").checked);
        });
    });
});
