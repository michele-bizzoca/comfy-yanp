import json
import os
import re

import folder_paths
from aiohttp import web
from server import PromptServer


@PromptServer.instance.routes.get('/yanp/embedding_loader/embeddings')
async def yanp_embedding_loader_embeddings(request):
    names = folder_paths.get_filename_list('embeddings')
    cleaned = [os.path.splitext(name)[0].replace('\\', '/') for name in names]
    return web.json_response(cleaned)


class _AnyOptional(dict):
    """Accept extra prompt_N connections registered by the frontend."""
    def __contains__(self, key):
        return True


class EmbeddingLoader:
    MAX_PAIRS = 8

    @classmethod
    def INPUT_TYPES(cls):
        optional = {
            'embeddingData': ('STRING', {'default': '[]'}),
        }

        for i in range(2, cls.MAX_PAIRS + 1):
            optional[f'prompt_{i}'] = (
                'STRING',
                {'forceInput': True}
            )

        return {
            'required': {
                'Position': (
                    ['Before', 'After'],
                    {'default': 'Before'}
                ),
                'prompt': (
                    'STRING',
                    {'forceInput': True}
                ),
            },
            'optional': optional,
        }

    # Fixed backend slots, dynamically shown in the frontend. ComfyUI's legacy
    # executor requires the actual output indices to exist in RETURN_TYPES.
    RETURN_TYPES = ('STRING',) * MAX_PAIRS
    RETURN_NAMES = ('prompt',) + tuple(f'prompt_{i}' for i in range(2, MAX_PAIRS + 1))
    FUNCTION = 'build'
    CATEGORY = 'YANP/prompt'

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, Position='Before', prompt='', embeddingData='[]', **kwargs):
        return (Position, prompt, embeddingData,
                tuple(sorted((k, str(v)) for k, v in kwargs.items() if k.startswith('prompt_'))))

    def build(self, Position='Before', prompt='', embeddingData='[]', **kwargs):
        try:
            rows = json.loads(embeddingData) if embeddingData else []
        except (TypeError, ValueError):
            rows = []

        before = []
        after = []
        for row in rows:
            if not isinstance(row, dict) or not row.get('enabled', True):
                continue
            name = str(row.get('name', '')).strip()
            if not name:
                continue
            for ext in ('.safetensors', '.pt', '.pth', '.bin'):
                if name.lower().endswith(ext):
                    name = name[:-len(ext)]
                    break
            try:
                strength = round(float(row.get('strength', 1.0)), 2)
            except (TypeError, ValueError):
                strength = 1.0
            token = f'(embedding:{name}:{strength:g})'
            # Legacy rows without a position inherit the old global setting.
            position = row.get('position', Position)
            (after if position == 'After' else before).append(token)

        before_text = ', '.join(before)
        after_text = ', '.join(after)

        def apply(value):
            value = str(value or '').strip()
            parts = [part for part in (before_text, value, after_text) if part]
            result = '. '.join(parts)
            result = re.sub(r'\.{2,}', '.', result)
            return result.rstrip().rstrip('.') + '.'

        values = [prompt] + [kwargs.get(f'prompt_{i}', '') for i in range(2, self.MAX_PAIRS + 1)]
        return tuple(apply(value) for value in values)


NODE_CLASS_MAPPINGS = {'EmbeddingLoader': EmbeddingLoader}
NODE_DISPLAY_NAME_MAPPINGS = {'EmbeddingLoader': 'Embedding Loader'}
