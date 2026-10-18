require("dotenv").config();

var express = require("express");
var cors = require("cors");
var fetch = require("node-fetch");

var app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

async function askAI(url, apiKey, model, message, extraHeaders) {
    var headers = {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
    };

    if (extraHeaders) {
        Object.keys(extraHeaders).forEach(function (key) {
            headers[key] = extraHeaders[key];
        });
    }

    var response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: "system",
                    content:
                        "You are SkyQuest AI, a friendly educational assistant. " +
                        "Explain concepts simply. When asked to generate a quiz, " +
                        "follow the requested JSON format exactly."
                },
                {
                    role: "user",
                    content: message
                }
            ],
            temperature: 0.7
        })
    });

    var data = await response.json();

    if (!response.ok) {
        var errorMessage = "AI request failed: " + response.status;

        if (data.error && data.error.message) {
            errorMessage = data.error.message;
        }

        throw new Error(errorMessage);
    }

    if (
        !data.choices ||
        !data.choices.length ||
        !data.choices[0].message ||
        typeof data.choices[0].message.content !== "string"
    ) {
        throw new Error("The AI returned no answer.");
    }

    return data.choices[0].message.content;
}

function parseQuizResponse(answer) {
    var cleaned = answer
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    var first = cleaned.indexOf("{");
    var last = cleaned.lastIndexOf("}");

    if (first === -1 || last === -1) {
        throw new Error("AI did not return valid JSON.");
    }

    var data = JSON.parse(cleaned.substring(first, last + 1));

    if (!Array.isArray(data.questions)) {
        throw new Error("Quiz questions are missing.");
    }

    var validQuestions = data.questions.filter(function (q) {
        return q &&
            typeof q.q === "string" &&
            q.q.trim().length > 0 &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            q.options.every(function (option) {
                return typeof option === "string" && option.trim().length > 0;
            }) &&
            Number.isInteger(q.answer) &&
            q.answer >= 0 &&
            q.answer <= 3 &&
            typeof q.explanation === "string";
    });

    if (validQuestions.length === 0) {
        throw new Error("AI did not generate valid questions.");
    }

    return validQuestions;
}

async function requestAI(message) {
    var errors = [];

    if (process.env.OPENROUTER_API_KEY) {
        try {
            var answer = await askAI(
                "https://openrouter.ai/api/v1/chat/completions",
                process.env.OPENROUTER_API_KEY,
                "openrouter/free",
                message,
                {
                    "HTTP-Referer": "http://localhost:5000",
                    "X-Title": "SkyQuest"
                }
            );

            console.log("AI provider used: OpenRouter");

            return {
                answer: answer,
                provider: "OpenRouter"
            };
        } catch (error) {
            console.log("OpenRouter failed: " + error.message);
            errors.push(error.message);
        }
    }

    if (process.env.GROQ_API_KEY) {
        try {
            var answer2 = await askAI(
                "https://api.groq.com/openai/v1/chat/completions",
                process.env.GROQ_API_KEY,
                "openai/gpt-oss-20b",
                message,
                null
            );

            console.log("AI provider used: Groq");

            return {
                answer: answer2,
                provider: "Groq"
            };
        } catch (error) {
            console.log("Groq failed: " + error.message);
            errors.push(error.message);
        }
    }

    throw new Error(
        errors.length
            ? errors.join(" | ")
            : "No AI API key configured. Check your .env file."
    );
}

// Backend status
app.get("/api/status", function (req, res) {
    res.json({
        success: true,
        message: "SkyQuest backend is running"
    });
});

// Existing AI Tutor
app.post("/api/ai", async function (req, res) {
    var message = req.body && req.body.message;

    if (!message || typeof message !== "string") {
        return res.status(400).json({
            success: false,
            error: "Please enter a question."
        });
    }

    try {
        var result = await requestAI(message);

        return res.json({
            success: true,
            provider: result.provider,
            answer: result.answer
        });
    } catch (error) {
        console.log("AI Tutor error: " + error.message);

        return res.status(502).json({
            success: false,
            error: "AI services are unavailable. Check your API keys, internet, and model availability."
        });
    }
});

// AI Quiz Generator
app.post("/api/generate-quiz", async function (req, res) {
    var subject = req.body && req.body.subject;
    var difficulty = req.body && req.body.difficulty;
    var count = Number(req.body && req.body.count);

    var allowedSubjects = [
        "C Programming",
        "Python",
        "Mathematics",
        "Science"
    ];

    var allowedDifficulties = [
        "Easy",
        "Medium",
        "Hard"
    ];

    if (allowedSubjects.indexOf(subject) === -1) {
        return res.status(400).json({
            success: false,
            error: "Please choose a valid subject."
        });
    }

    if (allowedDifficulties.indexOf(difficulty) === -1) {
        return res.status(400).json({
            success: false,
            error: "Please choose a valid difficulty."
        });
    }

    if (count !== 5 && count !== 10) {
        return res.status(400).json({
            success: false,
            error: "Choose either 5 or 10 questions."
        });
    }

    var prompt =
        "Create exactly " + count + " multiple-choice quiz questions. " +
        "Subject: " + subject + ". " +
        "Difficulty: " + difficulty + ". " +
        "Return ONLY valid JSON, without Markdown or code fences, " +
        'using this format: {"questions":[{"q":"Question","options":' +
        '["Option A","Option B","Option C","Option D"],"answer":0,' +
        '"explanation":"Short explanation"}]}. ' +
        "Each question must have exactly four distinct options. " +
        "The answer field must be a zero-based integer from 0 to 3. " +
        "Make the questions accurate, clear, and appropriate for students. " +
        "Do not include any text outside the JSON.";

    try {
        var result = await requestAI(prompt);
        var validQuestions = parseQuizResponse(result.answer);

        if (validQuestions.length !== count) {
            throw new Error(
                "AI generated " + validQuestions.length +
                " valid questions instead of " + count + ". Please try again."
            );
        }

        return res.json({
            success: true,
            provider: result.provider,
            questions: validQuestions
        });
    } catch (error) {
        console.log("AI Quiz error: " + error.message);

        return res.status(502).json({
            success: false,
            error: "Quiz generation failed. Please try again or check your AI service."
        });
    }
});

// Start server
app.listen(5000, function () {
    console.log("SkyQuest server running at http://localhost:5000");
});