// Data & helper umum. Status login dan data game sekarang ada di Firebase
// (lihat auth-guard.js, host.js, player.js), bukan localStorage lagi.
const QuizApp = {
    defaultQuestions: [
        { question: "What is 2 + 2?", options: ["3", "4", "5", "6"], correct: 1 },
        { question: "Which planet is known as the Red Planet?", options: ["Earth", "Mars", "Jupiter", "Venus"], correct: 1 },
        { question: "What is the capital of Indonesia?", options: ["Jakarta", "Bandung", "Surabaya", "Medan"], correct: 0 },
        { question: "Which language runs in the browser?", options: ["Python", "Java", "JavaScript", "C++"], correct: 2 },
        { question: "How many days are in a week?", options: ["5", "6", "7", "8"], correct: 2 }
    ],
    randomCode() { return String(Math.floor(100000 + Math.random() * 900000)); },
    escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
    }
};
