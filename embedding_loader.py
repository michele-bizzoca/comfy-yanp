import json
import os

import folder_paths
from aiohttp import web
from server import PromptServer


@PromptServer.instance.routes.get("/yanp/embedding_loader/embeddings")
async def yanp_embedding_loader_embeddings(request):
    names = folder_paths.get_filename_list("embeddings")
    cleaned = [os.path.splitext(name)[0].replace("\\", "/") for name in names]
    return web.json_response(cleaned)


class EmbeddingLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Position": (["Before", "After"], {"default": "Before"}),
                "prompt": ("STRING", {"forceInput": True}),
            },
            "optional": {
                "embeddingData": ("STRING", {"default": "[]"}),
                # Backward compatibility with workflows made with the old version.
                "embedding_data": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "build"
    CATEGORY = "YANP/prompt"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(
        cls,
        Position="Before",
        prompt="",
        embeddingData="[]",
        embedding_data="",
        **kwargs,
    ):
        effectiveData = embeddingData if embeddingData not in (None, "", "[]") else embedding_data
        return (Position, prompt, effectiveData)

    def build(
        self,
        Position="Before",
        prompt="",
        embeddingData="[]",
        embedding_data="",
    ):
        effectiveData = embeddingData if embeddingData not in (None, "", "[]") else embedding_data

        try:
            rows = json.loads(effectiveData) if effectiveData else []
        except Exception:
            rows = []

        selected = []
        for row in rows:
            if not isinstance(row, dict) or not row.get("enabled", True):
                continue

            name = str(row.get("name", "")).strip()
            if not name:
                continue

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
        embeddings = ", ".join(selected)

        if Position == "After":
            parts = ([prompt] if prompt else []) + ([embeddings] if embeddings else [])
        else:
            parts = ([embeddings] if embeddings else []) + ([prompt] if prompt else [])

        return (", ".join(parts),)


NODE_CLASS_MAPPINGS = {
    "EmbeddingLoader": EmbeddingLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "EmbeddingLoader": "Embedding Loader",
}
