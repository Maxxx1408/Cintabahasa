import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKPsc_FRRSiBHv9rHiKUqZ8Eqi2NJiOg4",
  authDomain: "cintabahasa-2f893.firebaseapp.com",
  projectId: "cintabahasa-2f893",
  storageBucket: "cintabahasa-2f893.firebasestorage.app",
  messagingSenderId: "337251773603",
  appId: "1:337251773603:web:d832492226271b642ee316",
  measurementId: "G-94DXG0834S"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);