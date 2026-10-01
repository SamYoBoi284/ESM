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
                "You do not directly execute ESM actions and you must never claim that you changed ESM state.\n" +
                "The deterministic ESM tools are authoritative. Your job is to understand the user's intent.\n" +
                "For a request that matches an existing ESM capability, return mode=deterministic and rewrite the request into a concise command that the existing ESM Assistant can understand.\n" +
                "For ordinary conversation or questions that do not map to an ESM action, return mode=chat and answer naturally.\n" +
                "Do not invent current drivers, employees, loads, HOS data, or other live ESM state.\n" +
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

    return {
        mode: result.mode,
        command: String(result.command || "").trim(),
        response: String(result.response || "").trim()
    };
}

module.exports = {
    MODEL_FILENAME,
    load,
    unload,
    status,
    prompt
};
