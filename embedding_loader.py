import json
import os

import folder_paths
from aiohttp import web
from server import PromptServer


@PromptServer.instance.routes.get("/yanp/embedding_loader/embeddings")
async def yanp_embedding_loader_embeddings(request):
    names = folder_paths.get_filename_list("embeddings")
    # Return paths without the extension, matching ComfyUI textual-inversion syntax.
    cleaned = [os.path.splitext(name)[0].replace("\\", "/") for name in names]
    return web.json_response(cleaned)


class EmbeddingLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"forceInput": True}),
            },
            "optional": {
                "embedding_data": ("STRING", {"default": "[]"}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "build"
    CATEGORY = "yanp/prompt"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, prompt="", embedding_data="[]", **kwargs):
        return (prompt, embedding_data)

    def build(self, prompt="", embedding_data="[]"):
        try:
            rows = json.loads(embedding_data) if embedding_data else []
        except Exception:
            rows = []

        selected = []
        for row in rows:
            if not isinstance(row, dict) or not row.get("enabled", True):
                continue

            name = str(row.get("name", "")).strip()
            if not name:
                continue

            # Be tolerant of states created by older versions that stored extensions.
            for ext in (".safetensors", ".pt", ".pth", ".bin"):
                if name.lower().endswith(ext):
                    name = name[:-len(ext)]
                    break

            try:
                strength = round(float(row.get("strength", 1.0)), 2)
            except (TypeError, ValueError):
                strength = 1.0

            selected.append(f"(embedding:{name}:{strength:g})")

        prompt = str(prompt or "").strip()
        parts = selected + ([prompt] if prompt else [])
        return (", ".join(parts),)


NODE_CLASS_MAPPINGS = {
    "EmbeddingLoader": EmbeddingLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "EmbeddingLoader": "Embedding Loader",
}
