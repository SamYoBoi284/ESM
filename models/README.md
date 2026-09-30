# ESM Local LLM Models

This directory is for the local GGUF model used by the ESM hybrid AI experiment.

Recommended first model:

- Qwen2.5-0.5B-Instruct-GGUF
- First choice: `qwen2.5-0.5b-instruct-q4_k_m.gguf`

The Q4_K_M file is about 491 MB according to the Qwen model repository. Do not upload the GGUF as a normal Git blob: GitHub rejects files over 100 MB. Use Git LFS or keep the model outside the repository and configure the local server to point at it.

Expected local filename:

`models/qwen2.5-0.5b-instruct-q4_k_m.gguf`

The ESM renderer talks to a local llama.cpp OpenAI-compatible server at:

`http://127.0.0.1:8080/v1`

The model itself never receives ESM credentials or Firebase access. ESM sends only the current user message, short conversation history, and a small amount of visible UI context to the local server.
