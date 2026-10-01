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

        // Never compile/download at runtime. The installer is expected to
        // contain the native runtime already.
        llama = await getLlama({
            build: "never",
            skipDownload: true,
            gpu: false
        });

        model = await llama.loadModel({ modelPath });

        // Keep the context modest for the 0.5B model while leaving enough
        // room for short ESM conversations and tool-routing instructions.
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
                "Do not use canned disclaimers such as 'I am just a computer program, so I don't have feelings.' If the user casually asks how you are, answer naturally (for example, 'I'm good bro' or similar) without making a big philosophical point about being software.\n" +
                "When the user asks who you are, identify yourself naturally as Sync AI and briefly explain that you are the local natural-language layer inside ESM.\n" +
                "Do not repeatedly introduce yourself, restate your full capabilities, or sound scripted unless the user asks.\n" +
                "Keep ordinary conversation concise and human-sounding. Do not add unnecessary bullet points or formal language to simple questions.\n" +
                "You do not directly execute ESM actions and you must never claim that you changed ESM state.\n" +
                "The deterministic ESM tools are authoritative. Your job is to understand the user's intent.\n" +
                "For a request that matches an existing ESM capability, return mode=deterministic and rewrite the request into a concise canonical command that the existing ESM Assistant can understand.\n" +
                "For ordinary conversation or questions that do not map to an ESM action, return mode=chat and answer naturally.\n" +
                "IMPORTANT: Never classify ordinary conversation, greetings, jokes, opinions, or factual questions as deterministic. In particular, never return mode=deterministic with the user's conversational text copied into command.\n" +
                "Current deterministic commands include: 'help', 'open add load', 'find load <load-id>', and 'search load <load-id>'. Only use deterministic mode when the request clearly maps to one of those commands or to another already-implemented ESM action.\n" +
                "Do not invent current drivers, employees, loads, HOS data, or other live ESM state. If you do not know something about ESM's live state, say so rather than guessing.\n" +
                "For general factual questions, answer directly and accurately. If you are uncertain, say so briefly rather than confidently inventing an explanation.\n" +
                "Never claim that the moon, sky, employees, loads, or anything else has an ESM-specific status unless that information is actually provided in the current context.\n" +
                "Keep responses concise."
        });

        grammar = await llama.createGrammarForJsonSchema({
            type: "object",
            properties: {
                mode: {
                    enum: ["deterministic", "chat"]
                },
                command: {
                    type: "string"
                },
                response: {
                    type: "string"
                }
            },
            required: ["mode", "command", "response"]
        });

        return status();
    })().catch(async (error) => {
        lastError = error?.message || String(error);

        // Partial-load cleanup matters: a failed model load must not leave
        // a half-initialized native context behind.
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
    // Dispose dependants before their owners. model.dispose() also disposes
    // its contexts, but explicit session/llama disposal makes the lifecycle
    // clear and releases native resources as soon as the panel closes.
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
        result = {
            mode: "chat",
            command: "",
            response: String(raw || "").trim()
        };
    }

    if (result.mode !== "deterministic" && result.mode !== "chat") {
        result.mode = "chat";
    }

    let mode = result.mode;
    let command = String(result.command || "").trim();
    let response = String(result.response || "").trim();

    // Qwen 0.5B can occasionally over-route casual text into the structured
    // tool branch. Never let an unrecognized command reach the renderer's
    // deterministic execution path. This is a safety boundary, not a second
    // fuzzy conversation matcher.
    if (mode === "deterministic" && !isCanonicalDeterministicCommand(command)) {
        mode = "chat";
        command = "";
    }

    return {
        mode,
        command,
        response
    };
}

module.exports = {
    MODEL_FILENAME,
    load,
    unload,
    status,
    prompt
};
