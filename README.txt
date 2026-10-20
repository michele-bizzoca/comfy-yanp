Quadruple layout: MODEL_1 / CLIP_1, MODEL_2 / CLIP_2, etc.
Each quadruple provides both input and output for both kinds.
A spare quadruple is kept at the tail until reaching eight quadruples.
No physical reorder; each slot index statically determines its type.

IMPORTANT: Create a fresh LoRA Loader node when switching from previous
versions. Old graphs saved with grouped/dynamic ports cannot be reliably
migrated while preserving all links.

Replace the existing .py and .js; restart ComfyUI and hard-refresh browser.
