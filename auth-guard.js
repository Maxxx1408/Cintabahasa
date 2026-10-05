import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Menunggu status login Firebase. Kalau belum login -> arahkan ke login.html
export function requireUser(returnTo) {
    return new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, user => {
            unsub();
            if (user) resolve(user);
            else location.href = "login.html?returnTo=" + encodeURIComponent(returnTo);
        });
    });
}

// Ambil profil (nama, role) dari koleksi users
export async function getProfile(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.error("Gagal ambil profil:", e);
        return null;
    }
}
