"use strict";

/* =====================================
   SKYQUEST - LOCAL QUIZ SYSTEM
   AI Tutor remains enabled in index.html
===================================== */

const QUESTION_BANK_URL = "./skyquest_questions.json";
const QUESTIONS_PER_QUIZ = 10;

const STORAGE_KEY = "skyquestProgressV2";
const SEEN_KEY = "skyquestSeenQuestionsV2";

let questionBank = [];

let totalXP = 0;
let quizzesPlayed = 0;
let totalQuestions = 0;
let totalCorrect = 0;
let bestScore = 0;

let currentQuestions = [];
let currentIndex = 0;
let currentScore = 0;
let answered = false;
let currentSubject = "";

let seenQuestions = {};
let quizBankReady = false;


/* =====================================
   LOAD SAVED PROGRESS
===================================== */

function loadProgress() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "{}"
        );

        totalXP = Number(saved.totalXP) || 0;
        quizzesPlayed = Number(saved.quizzesPlayed) || 0;
        totalQuestions = Number(saved.totalQuestions) || 0;
        totalCorrect = Number(saved.totalCorrect) || 0;
        bestScore = Number(saved.bestScore) || 0;

        seenQuestions = JSON.parse(
            localStorage.getItem(SEEN_KEY) || "{}"
        );

        if (
            !seenQuestions ||
            typeof seenQuestions !== "object" ||
            Array.isArray(seenQuestions)
        ) {
            seenQuestions = {};
        }

    } catch (error) {
        console.warn("Could not load saved progress:", error);

        totalXP = 0;
        quizzesPlayed = 0;
        totalQuestions = 0;
        totalCorrect = 0;
        bestScore = 0;
        seenQuestions = {};
    }
}


function saveProgress() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                totalXP: totalXP,
                quizzesPlayed: quizzesPlayed,
                totalQuestions: totalQuestions,
                totalCorrect: totalCorrect,
                bestScore: bestScore
            })
        );

        localStorage.setItem(
            SEEN_KEY,
            JSON.stringify(seenQuestions)
        );

    } catch (error) {
        console.warn("Could not save progress:", error);
    }
}


/* =====================================
   LOAD QUESTION BANK
===================================== */

async function loadQuestionBank() {
    const status = document.getElementById("questionBankStatus");

    if (status) {
        status.textContent = "Loading question bank...";
    }

    try {
        const response = await fetch(QUESTION_BANK_URL, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                "HTTP " + response.status +
                " while loading question bank."
            );
        }

        const data = await response.json();

        /*
          Supports BOTH formats:

          Format 1:
          [ { question }, { question } ]

          Format 2:
          {
              "version": 1,
              "language": "English",
              "questions": [ { question }, { question } ]
          }
        */

        let questionList;

        if (Array.isArray(data)) {
            questionList = data;
        } else if (
            data &&
            Array.isArray(data.questions)
        ) {
            questionList = data.questions;
        } else {
            throw new Error(
                'Invalid JSON format. Expected an array or an object containing "questions".'
            );
        }

        if (questionList.length === 0) {
            throw new Error("The question bank contains no questions.");
        }

        questionBank = questionList.filter(function(question) {
            return (
                question &&
                typeof question.subject === "string" &&
                typeof question.difficulty === "string" &&
                typeof question.q === "string" &&
                Array.isArray(question.options) &&
                question.options.length === 4 &&
                Number.isInteger(Number(question.answer)) &&
                Number(question.answer) >= 0 &&
                Number(question.answer) < 4
            );
        });

        if (questionBank.length === 0) {
            throw new Error(
                "The JSON file was opened, but no valid questions were found."
            );
        }

        quizBankReady = true;

        console.log(
            "SkyQuest question bank loaded:",
            questionBank.length,
            "questions"
        );

        console.log(
            "Available subjects:",
            [...new Set(questionBank.map(function(q) {
                return q.subject;
            }))]
        );

        if (status) {
            status.textContent =
                "✅ Question bank ready: " +
                questionBank.length +
                " questions loaded.";
        }

    } catch (error) {
        quizBankReady = false;
        questionBank = [];

        console.error("Question bank error:", error);

        if (status) {
            status.textContent =
                "❌ Question bank failed to load: " +
                error.message;
        }
    }
}


/* =====================================
   PAGE NAVIGATION
===================================== */

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(function(page) {
        page.classList.add("hidden");
    });

    const target = document.getElementById(pageId);

    if (target) {
        target.classList.remove("hidden");
    }

    document.querySelectorAll(".nav-link").forEach(function(link) {
        link.classList.toggle(
            "active",
            link.dataset.page === pageId
        );
    });

    if (pageId === "progress") {
        updateStats();
    }
}


document.querySelectorAll(".nav-link").forEach(function(link) {
    link.addEventListener("click", function(event) {
        event.preventDefault();
        showPage(link.dataset.page);
    });
});


/* =====================================
   START LOCAL QUIZ
===================================== */

function startQuiz(subject) {
    if (!quizBankReady) {
        alert(
            "Question bank is still loading or failed to load. " +
            "Please refresh the page and check the question bank status."
        );
        return;
    }

    currentSubject = subject;

    const difficultyElement =
        document.getElementById("quizDifficulty");

    const selectedDifficulty = difficultyElement
        ? difficultyElement.value
        : "Easy";

    const categoryQuestions = questionBank.filter(function(question) {
        return (
            question.subject.trim().toLowerCase() ===
                subject.trim().toLowerCase() &&
            question.difficulty.trim().toLowerCase() ===
                selectedDifficulty.trim().toLowerCase()
        );
    });

    if (categoryQuestions.length === 0) {
        alert(
            "No questions found for " +
            subject +
            " at " +
            selectedDifficulty +
            " difficulty.\n\nCheck the subject and difficulty names in your JSON file."
        );

        console.warn("Available categories:", [
            ...new Set(questionBank.map(function(q) {
                return q.subject + " / " + q.difficulty;
            }))
        ]);

        return;
    }

    const categoryKey = subject + "|" + selectedDifficulty;

    if (!Array.isArray(seenQuestions[categoryKey])) {
        seenQuestions[categoryKey] = [];
    }

    const seenIds = seenQuestions[categoryKey];

    let unseenQuestions = categoryQuestions.filter(function(question) {
        return !seenIds.includes(String(question.id));
    });

    if (unseenQuestions.length === 0) {
        const shouldReset = confirm(
            "You have completed all questions in " +
            subject +
            " (" +
            selectedDifficulty +
            ").\n\nWould you like to reset this category and play again?"
        );

        if (!shouldReset) {
            return;
        }

        seenQuestions[categoryKey] = [];
        unseenQuestions = categoryQuestions.slice();

        saveProgress();
    }

    shuffleArray(unseenQuestions);

    currentQuestions = unseenQuestions.slice(
        0,
        Math.min(QUESTIONS_PER_QUIZ, unseenQuestions.length)
    );

    currentQuestions.forEach(function(question) {
        const id = String(question.id);

        if (!seenQuestions[categoryKey].includes(id)) {
            seenQuestions[categoryKey].push(id);
        }
    });

    saveProgress();

    currentIndex = 0;
    currentScore = 0;
    answered = false;

    const area = document.getElementById("quizArea");

    if (area) {
        area.classList.remove("hidden");
    }

    showPage("quiz");
    renderQuestion();
}


/* =====================================
   SHUFFLE QUESTIONS
===================================== */

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }

    return array;
}


/* =====================================
   SAFE HTML TEXT
===================================== */

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function(character) {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return replacements[character];
    });
}


/* =====================================
   RENDER QUESTION
===================================== */

function renderQuestion() {
    answered = false;

    const area = document.getElementById("quizArea");
    const question = currentQuestions[currentIndex];

    if (!area || !question) {
        if (area) {
            area.textContent =
                "Question unavailable. Please start another quiz.";
        }

        return;
    }

    const safeOptions = question.options.map(function(option, index) {
        return `
            <button
                class="answer-btn"
                data-index="${index}"
                onclick="selectAnswer(${index})"
            >
                ${String.fromCharCode(65 + index)}.
                ${escapeHTML(option)}
            </button>
        `;
    }).join("");

    area.innerHTML = `
        <p class="muted">
            ${escapeHTML(currentSubject)}
            · QUESTION ${currentIndex + 1} OF ${currentQuestions.length}
        </p>

        <div class="quiz-question"></div>

        <div id="answers">
            ${safeOptions}
        </div>

        <p id="feedback" class="feedback"></p>

        <button
            id="nextButton"
            class="primary-btn hidden"
            onclick="nextQuestion()"
        >
            ${currentIndex === currentQuestions.length - 1
                ? "See Results →"
                : "Next Question →"}
        </button>
    `;

    area.querySelector(".quiz-question").textContent = question.q;

    area.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


/* =====================================
   ANSWER QUESTION
===================================== */

function selectAnswer(selectedIndex) {
    if (answered) {
        return;
    }

    answered = true;

    const question = currentQuestions[currentIndex];
    const correctIndex = Number(question.answer);

    const buttons = document.querySelectorAll("#answers .answer-btn");
    const feedback = document.getElementById("feedback");

    totalQuestions++;

    buttons.forEach(function(button, index) {
        button.disabled = true;

        if (index === correctIndex) {
            button.style.borderColor = "#2ce0a1";
            button.style.background = "#103c38";
        }
    });

    if (selectedIndex === correctIndex) {
        currentScore++;
        totalCorrect++;

        feedback.textContent =
            "✅ Correct answer! +10 XP — " +
            (question.explanation || "Well done!");

        feedback.style.color = "#2ce0a1";

    } else {
        if (buttons[selectedIndex]) {
            buttons[selectedIndex].style.borderColor = "#ff647c";
            buttons[selectedIndex].style.background = "#401d35";
        }

        feedback.textContent =
            "❌ Not quite! " +
            (question.explanation || "Keep practising!");

        feedback.style.color = "#ff8b9d";
    }

    saveProgress();

    const nextButton = document.getElementById("nextButton");

    if (nextButton) {
        nextButton.classList.remove("hidden");
    }

    updateStats();
}


/* =====================================
   NEXT QUESTION
===================================== */

function nextQuestion() {
    if (!answered) {
        return;
    }

    if (currentIndex < currentQuestions.length - 1) {
        currentIndex++;
        renderQuestion();
    } else {
        finishQuiz();
    }
}


/* =====================================
   FINISH QUIZ
===================================== */

function finishQuiz() {
    quizzesPlayed++;

    const earnedXP = currentScore * 10;

    totalXP += earnedXP;

    if (currentScore > bestScore) {
        bestScore = currentScore;
    }

    const percentage = currentQuestions.length
        ? Math.round(
            (currentScore / currentQuestions.length) * 100
        )
        : 0;

    const level = Math.floor(totalXP / 100) + 1;

    const area = document.getElementById("quizArea");

    if (!area) {
        return;
    }

    area.innerHTML = `
        <div style="text-align:center;padding:20px 0">
            <div style="font-size:55px">🏆</div>

            <h2 style="margin:15px 0">Quest Completed!</h2>

            <p class="muted">
                Great job, champion! Keep learning.
            </p>

            <h1 style="font-size:42px;margin:20px 0">
                ${currentScore}/${currentQuestions.length}
            </h1>

            <p>Accuracy: ${percentage}%</p>

            <h3 style="color:#45d9ff;margin-top:15px">
                ⭐ +${earnedXP} XP Earned
            </h3>

            <p style="margin-top:10px">
                Player Level: ${level}
            </p>

            <button
                class="primary-btn"
                onclick="startQuiz(currentSubject)"
            >
                Play Again ↻
            </button>

            <button
                class="primary-btn"
                onclick="showPage('home')"
            >
                Dashboard →
            </button>
        </div>
    `;

    saveProgress();
    updateStats();
}


/* =====================================
   UPDATE PLAYER STATS
===================================== */

function updateStats() {
    const accuracy = totalQuestions
        ? Math.round((totalCorrect / totalQuestions) * 100)
        : 0;

    const totalXPElement = document.getElementById("totalXP");
    const quizCountElement = document.getElementById("quizCount");
    const accuracyElement = document.getElementById("accuracy");
    const bestScoreElement = document.getElementById("bestScore");

    if (totalXPElement) {
        totalXPElement.textContent = totalXP;
    }

    if (quizCountElement) {
        quizCountElement.textContent = quizzesPlayed;
    }

    if (accuracyElement) {
        accuracyElement.textContent = accuracy + "%";
    }

    if (bestScoreElement) {
        bestScoreElement.textContent = bestScore;
    }

    const progressXP = document.getElementById("progressXP");
    const progressQuizzes = document.getElementById("progressQuizzes");
    const progressAccuracy = document.getElementById("progressAccuracy");
    const leaderXP = document.getElementById("leaderXP");

    if (progressXP) {
        progressXP.textContent = "Total XP: " + totalXP;
    }

    if (progressQuizzes) {
        progressQuizzes.textContent =
            "Quizzes Played: " + quizzesPlayed;
    }

    if (progressAccuracy) {
        progressAccuracy.textContent =
            "Accuracy: " + accuracy + "%";
    }

    if (leaderXP) {
        leaderXP.textContent = totalXP + " XP";
    }

    const level = Math.floor(totalXP / 100) + 1;
    const levelXP = totalXP % 100;

    const playerLevel = document.querySelector(".player-level span");
    const playerLevelSmall = document.querySelector(".player-level small");
    const xpBar = document.querySelector(".xp-bar div");

    if (playerLevel) {
        playerLevel.textContent = "⭐ Level " + level;
    }

    if (playerLevelSmall) {
        playerLevelSmall.textContent = levelXP + " / 100 XP";
    }

    if (xpBar) {
        xpBar.style.width = levelXP + "%";
    }
}


/* =====================================
   INITIALIZE APP
===================================== */

loadProgress();
updateStats();
loadQuestionBank();