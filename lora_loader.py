"""Independent, bounded MODEL and CLIP LoRA chains for ComfyUI."""
import json
import math

import comfy.sd
import folder_paths
from aiohttp import web
from server import PromptServer

MAX_PAIRS = 8


@PromptServer.instance.routes.get('/yanp/lora_loader/loras')
async def yanp_lora_loader_loras(request):
    return web.json_response(folder_paths.get_filename_list('loras'))


class YANPLoraLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {}, 'optional': {
            **{f'model_{i}': ('MODEL',) for i in range(1, MAX_PAIRS + 1)},
            **{f'clip_{i}': ('CLIP',) for i in range(1, MAX_PAIRS + 1)},
            'loraData': ('STRING', {'default': '[]'}),
            'portOrder': ('STRING', {'default': '[]'}),
        }}

    # ComfyUI addresses outputs by positional index, not name. The frontend
    # compacts visible outputs, so return positions are resolved using portOrder.
    # Socket type restrictions are enforced in the frontend (MODEL or CLIP).
    RETURN_TYPES = ('*',) * (MAX_PAIRS * 2)
    RETURN_NAMES = tuple(f'model_{i}' for i in range(1, MAX_PAIRS + 1)) + tuple(
        f'clip_{i}' for i in range(1, MAX_PAIRS + 1))
    FUNCTION = 'load'
    CATEGORY = 'YANP/loaders'

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return json.dumps(kwargs, sort_keys=True, default=str)

    def load(self, loraData='[]', portOrder='[]', **kwargs):
        try:
            entries = json.loads(loraData)
        except (TypeError, ValueError):
            entries = []
        if not isinstance(entries, list):
            entries = []

        specs = []
        for entry in entries:
            if not isinstance(entry, dict) or not entry.get('enabled', True):
                continue
            name = str(entry.get('name') or '').strip()
            if not name:
                continue
            model_weight = float(entry.get('strength_model', 1))
            clip_weight = float(entry.get('strength_clip', 1))
            if not math.isfinite(model_weight) or not math.isfinite(clip_weight):
                raise ValueError(f'Invalid LoRA strengths for {name}')
            if model_weight == clip_weight == 0:
                continue
            path = folder_paths.get_full_path_or_raise('loras', name)
            specs.append((path, model_weight, clip_weight))

        # Load files only if at least one connected input needs them.
        has_models = any(kwargs.get(f'model_{i}') is not None for i in range(1, MAX_PAIRS + 1))
        has_clips = any(kwargs.get(f'clip_{i}') is not None for i in range(1, MAX_PAIRS + 1))
        from comfy.utils import load_torch_file
        loaded = [(load_torch_file(path, safe_load=True), mw, cw)
                  for path, mw, cw in specs
                  if (has_models and mw != 0) or (has_clips and cw != 0)]

        outputs = {}
        for kind in ('model', 'clip'):
            for index in range(1, MAX_PAIRS + 1):
                name = f'{kind}_{index}'
                value = kwargs.get(name)
                if value is not None:
                    for lora, mw, cw in loaded:
                        if kind == 'model' and mw:
                            value, _ = comfy.sd.load_lora_for_models(value, None, lora, mw, 0)
                        elif kind == 'clip' and cw:
                            _, value = comfy.sd.load_lora_for_models(None, value, lora, 0, cw)
                outputs[name] = value

        try:
            order = json.loads(portOrder)
        except (ValueError, TypeError):
            order = None
        if not isinstance(order, list) or not order:
            order = list(outputs)  # Fallback for older workflows.
        # Return precisely 16 slots, in the actual visible output order.
        return tuple([outputs.get(name) for name in order[:MAX_PAIRS * 2]] +
                     [None] * max(0, MAX_PAIRS * 2 - len(order)))


NODE_CLASS_MAPPINGS = {'YANPLoraLoader': YANPLoraLoader}
NODE_DISPLAY_NAME_MAPPINGS = {'YANPLoraLoader': 'LoRA Loader'}
