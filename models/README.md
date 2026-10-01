# Sync AI model

Place the bundled Sync AI model in this directory:

`qwen2.5-0.5b-instruct-q4_k_m.gguf`

ESM loads this GGUF only when the **Sync AI** panel is opened and disposes the native model/context when the panel is closed.

The model is intentionally tracked with Git LFS because it is a large binary. Do not upload it to the normal Git object store.

The Electron installer copies the model to its packaged `resources/models` directory so the model is delivered with ESM.

The native runtime is provided by `node-llama-cpp`; ESM does not launch `llama-server.exe`, a localhost server, or a PowerShell AI process.
