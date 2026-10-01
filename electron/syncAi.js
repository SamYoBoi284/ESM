// ===========================================
// Sync AI — Embedded Local LLM Manager
// ===========================================
// Main-process-only bridge for node-llama-cpp.
// The renderer never loads native llama.cpp directly.
//
// Lifecycle:
//   ESM starts -> nothing loaded
//   Sync AI opens -> Qwen model/context loads
//   Sync AI closes -> session/model/llama are disposed
//
// Failure is intentionally non-fatal: deterministic ESM features continue
// working if node-llama-cpp or the GGUF model is unavailable.

const path = require("path");
const fs = require("fs");

const MODEL_FILENAME = "qwen2.5-0.5b-instruct-q4_k_m.gguf";

let llama = null;
let model = null;
let context = null;
let session = null;
let grammar = null;
let llamaClasses = null;
let loadingPromise = null;
let lastError = null;

function modelCandidates() {
    return [
        path.join(process.resourcesPath || "", "models", MODEL_FILENAME),
        path.join(__dirname, "..", "models", MODEL_FILENAME)
    ].filter(Boolean);
}

function getModelPath() {
    return modelCandidates().find((candidate) => {
        try {
            return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
        } catch (_) {
            return false;
        }
    }) || null;
}

function status() {
    return {
        available: !!model,
        loading: !!loadingPromise,
        modelLoaded: !!model,
        modelPath: getModelPath(),
        modelFilename: MODEL_FILENAME,
        error: lastError
    };
}

async function load() {
    if (model) return status();
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        lastError = null;

        const modelPath = getModelPath();
        if (!modelPath) {
            throw new Error("Sync AI model file is missing: " + MODEL_FILENAME);
        }

        let mod;
        try {
            mod = await import("node-llama-cpp");
        } catch (error) {
            throw new Error("Embedded node-llama-cpp runtime is unavailable: " + (error?.message || error));
        }

        const { getLlama, LlamaChatSession } = mod;
        llamaClasses = { LlamaChatSession };

        llama = await getLlama({
            build: "never",
            skipDownload: true,
            gpu: false
        });

        model = await llama.loadModel({ modelPath });

        context = await model.createContext({
            contextSize: 2048,
            sequences: 1
        });

        session = new LlamaChatSession({
            contextSequence: context.getSequence(),
            systemPrompt:
                "You are Sync AI, the natural-language layer inside ESM (Employee Status Monitor).\n" +
                "You are a local assistant running entirely on the user's computer.\n" +
                "Your personality is friendly, natural, relaxed, and conversational. Talk like a helpful coworker who happens to live inside ESM, not like a corporate help-desk bot.\n" +
                "You may use light humor, casual wording, and occasional emojis when they fit the conversation. Match the user's tone without becoming obnoxious.\n" +
                "Never use canned disclaimers such as 'I am just a computer program, so I don't have feelings.' If asked how you are, answer naturally.\n" +
                "When asked who you are, identify yourself naturally as Sync AI and briefly explain that you are the local natural-language layer inside ESM.\n" +
                "Do not repeatedly introduce yourself, restate your capabilities, or sound scripted unless asked.\n" +
                "Keep ordinary conversation concise and human-sounding.\n" +
                "You do not directly execute ESM actions and must never claim that you changed ESM state.\n" +
                "The deterministic ESM tools are authoritative. Your job is to understand intent and route clear tool requests.\n" +
                "For a request that matches an existing ESM capability, return mode=deterministic and rewrite it into one concise canonical command.\n" +
                "For ordinary conversation, jokes, greetings, opinions, or factual questions that do not map to an ESM action, return mode=chat and answer naturally.\n" +
                "IMPORTANT ROUTING EXAMPLES: 'open add load', 'open the add load thingy', 'can you open the add load thingy', 'can you open the load thingy', 'show me add load', and 'i need the add load screen' all mean mode=deterministic with command='open add load'.\n" +
                "IMPORTANT ROUTING EXAMPLES: 'help', 'what commands do you have', and 'what can you do around here' may use mode=deterministic with command='help' only when the user is clearly asking for ESM capabilities.\n" +
                "IMPORTANT ROUTING EXAMPLES: 'find load ABC12345', 'search for load ABC12345', and 'can you find ABC12345' mean mode=deterministic with the canonical command 'find load ABC12345'.\n" +
                "Do not classify ordinary conversation as deterministic. Never copy a conversational request into command.\n" +
                "Current deterministic commands include: 'help', 'open add load', 'find load <load-id>', and 'search load <load-id>'. Only use deterministic mode for a clearly matching implemented ESM action.\n" +
                "Do not invent current drivers, employees, loads, HOS data, or other live ESM state.\n" +
                "For general factual questions, answer directly and accurately. If uncertain, say so briefly rather than inventing an explanation.\n" +
                "Keep responses concise."
        });

        grammar = await llama.createGrammarForJsonSchema({
            type: "object",
            properties: {
                mode: { enum: ["deterministic", "chat"] },
                command: { type: "string" },
                response: { type: "string" }
            },
            required: ["mode", "command", "response"]
        });

        return status();
    })().catch(async (error) => {
        lastError = error?.message || String(error);
        try { session?.dispose({ disposeSequence: true }); } catch (_) {}
        try { await context?.dispose?.(); } catch (_) {}
        try { await model?.dispose?.(); } catch (_) {}
        try { await llama?.dispose?.(); } catch (_) {}
        session = null;
        context = null;
        model = null;
        grammar = null;
        llama = null;
        llamaClasses = null;
        return {
            available: false,
            loading: false,
            modelLoaded: false,
            modelPath: getModelPath(),
            modelFilename: MODEL_FILENAME,
            error: lastError
        };
    }).finally(() => {
        loadingPromise = null;
    });

    return loadingPromise;
}

async function unload() {
    try { session?.dispose({ disposeSequence: true }); } catch (_) {}
    try { await context?.dispose?.(); } catch (_) {}
    try { await model?.dispose?.(); } catch (_) {}
    try { await llama?.dispose?.(); } catch (_) {}
    session = null;
    context = null;
    model = null;
    grammar = null;
    llama = null;
    llamaClasses = null;
    loadingPromise = null;
    return status();
}

function normalizeToolText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/[^a-z0-9_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractToolIntent(text) {
    const value = normalizeToolText(text);

    // Tool-specific language normalization belongs here rather than in the
    // conversation layer. This is intentionally narrow: it handles natural
    // variants of implemented tools without fuzzy-matching ordinary chat.
    if (
        /\b(?:open|show|bring up|pull up|launch)\b.*\b(?:add load|load modal|load screen|load thingy|load thing)\b/.test(value) ||
        /\b(?:add load|load modal|load screen|load thingy|load thing)\b.*\b(?:open|show|bring up|pull up)\b/.test(value) ||
        /\bneed\b.*\badd load\b/.test(value)
    ) {
        return "open add load";
    }

    if (/^(?:commands?|help)$/.test(value) || /\b(?:what can you do|what do you help with)\b/.test(value)) {
        return "help";
    }

    const loadMatch = value.match(/\b(?:find|search)(?: for)?(?: load)?\s+([a-z0-9_-]{7,})\b/);
    if (loadMatch) return "find load " + loadMatch[1];

    const findBare = value.match(/\b(?:can you|could you|please)?\s*(?:find|locate)\s+([a-z0-9_-]{7,})\b/);
    if (findBare) return "find load " + findBare[1];

    return "";
}

function isCanonicalDeterministicCommand(command) {
    const value = String(command || "").trim();
    if (!value) return false;
    if (/^(?:commands?|help)$/i.test(value)) return true;
    if (/^(?:open|show)\s+(?:the\s+)?(?:add\s+load|load\s+modal)$/i.test(value)) return true;
    if (/^(?:find|search)\s+(?:load\s+)?[a-z0-9_-]{7,}$/i.test(value)) return true;
    return false;
}

async function prompt(payload = {}) {
    const text = String(payload.text || "").trim();
    if (!text) throw new Error("Sync AI received an empty prompt.");

    if (!model || !session || !grammar) {
        const loaded = await load();
        if (!loaded.available) {
            throw new Error(loaded.error || "Sync AI model is unavailable.");
        }
    }

    const directToolCommand = extractToolIntent(text);
    if (directToolCommand) {
        return {
            mode: "deterministic",
            command: directToolCommand,
            response: ""
        };
    }

    const appContext = String(payload.context || "").trim().slice(0, 1200);
    const promptText =
        (appContext
            ? "CURRENT ESM CONTEXT (informational only):\n" + appContext + "\n\n"
            : "") +
        "USER REQUEST:\n" + text +
        "\n\nReturn only the required JSON object.";

    const raw = await session.prompt(promptText, {
        grammar,
        temperature: 0.1,
        topP: 0.85,
        maxTokens: 180
    });

    let result;
    try {
        result = JSON.parse(raw);
    } catch (_) {
        result = { mode: "chat", command: "", response: String(raw || "").trim() };
    }

    if (result.mode !== "deterministic" && result.mode !== "chat") result.mode = "chat";

    let mode = result.mode;
    let command = String(result.command || "").trim();
    let response = String(result.response || "").trim();

    if (mode === "deterministic") {
        const normalizedIntent = extractToolIntent(text);
        if (normalizedIntent) {
            command = normalizedIntent;
        } else if (!isCanonicalDeterministicCommand(command)) {
            mode = "chat";
            command = "";
        }
    }

    return { mode, command, response };
}

module.exports = {
    MODEL_FILENAME,
    load,
    unload,
    status,
    prompt
};
