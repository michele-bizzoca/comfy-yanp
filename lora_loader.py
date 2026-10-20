"""YANP LoRA loader: up to eight dynamically exposed, polymorphic I/O chains."""
import json
import math
import re

import comfy.sd
import folder_paths
from aiohttp import web
from server import PromptServer

MAX_PAIRS = 8
IO_NAME = re.compile(r'^io_([1-8])$')


class DynamicInputs(dict):
    """Tell ComfyUI how to validate runtime-created io_N sockets."""
    def __contains__(self, key):
        return key in self.keys() or bool(IO_NAME.fullmatch(str(key)))

    def __getitem__(self, key):
        if IO_NAME.fullmatch(str(key)):
            return ('*',)
        return super().__getitem__(key)


@PromptServer.instance.routes.get('/yanp/lora_loader/loras')
async def yanp_lora_loader_loras(request):
    return web.json_response(folder_paths.get_filename_list('loras'))


def kind_of(value):
    """Identify actual ComfyUI objects, never rely on renamed frontend labels."""
    if value is None:
        return None
    if isinstance(value, comfy.sd.CLIP):
        return 'clip'
    # Deliberately avoid importing Comfy internals at module import time.
    from comfy.model_patcher import ModelPatcher
    if isinstance(value, ModelPatcher):
        return 'model'
    # Some custom nodes expose transparent wrappers/subclasses.
    if hasattr(value, 'patcher') and hasattr(value, 'tokenize'):
        return 'clip'
    if hasattr(value, 'add_patches') and hasattr(value, 'model_options'):
        return 'model'
    raise TypeError(f'YANP LoRA Loader received an unsupported I/O object: {type(value).__name__}')


class YANPLoraLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {}, 'optional': DynamicInputs({
            'loraData': ('STRING', {'default': '[]'}),
            'portOrder': ('STRING', {'default': '[]'}),
        })}

    # Classic ComfyUI binds outputs by *index*. JS maintains portOrder in that
    # exact index order. No legacy MODEL/CLIP outputs are declared.
    RETURN_TYPES = ('*',) * MAX_PAIRS
    RETURN_NAMES = tuple(f'io_{i}' for i in range(1, MAX_PAIRS + 1))
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
            if not isinstance(entries, list):
                entries = []
        except (TypeError, ValueError):
            entries = []
        try:
            order = json.loads(portOrder)
        except (TypeError, ValueError):
            order = None
        if not isinstance(order, list):
            order = []
        order = [s for s in order if isinstance(s, str) and IO_NAME.fullmatch(s)]
        if not order:
            order = [f'io_{i}' for i in range(1, MAX_PAIRS + 1)]

        inputs = {k: v for k, v in kwargs.items() if IO_NAME.fullmatch(k)}
        kinds = {k: kind_of(v) for k, v in inputs.items()}
        specs = []
        for entry in entries:
            if not isinstance(entry, dict) or not entry.get('enabled', True):
                continue
            name = str(entry.get('name') or '').strip()
            if not name:
                continue
            mw = float(entry.get('strength_model', 1))
            cw = float(entry.get('strength_clip', 1))
            if not (math.isfinite(mw) and math.isfinite(cw)):
                raise ValueError(f'Invalid LoRA strengths: {name}')
            if mw == cw == 0:
                continue
            specs.append((name, mw, cw))

        has_model = 'model' in kinds.values()
        has_clip = 'clip' in kinds.values()
        loaded = []
        if has_model or has_clip:
            from comfy.utils import load_torch_file
            for name, mw, cw in specs:
                if (has_model and mw) or (has_clip and cw):
                    path = folder_paths.get_full_path_or_raise('loras', name)
                    loaded.append((load_torch_file(path, safe_load=True), mw, cw))

        result = {}
        for key, value in inputs.items():
            kind = kinds[key]
            if kind == 'model':
                for lora, mw, _ in loaded:
                    if mw:
                        value, _ = comfy.sd.load_lora_for_models(value, None, lora, mw, 0)
            elif kind == 'clip':
                for lora, _, cw in loaded:
                    if cw:
                        _, value = comfy.sd.load_lora_for_models(None, value, lora, 0, cw)
            result[key] = value

        return tuple([result.get(key) for key in order[:MAX_PAIRS]] +
                     [None] * (MAX_PAIRS - min(len(order), MAX_PAIRS)))


NODE_CLASS_MAPPINGS = {'YANPLoraLoader': YANPLoraLoader}
NODE_DISPLAY_NAME_MAPPINGS = {'YANPLoraLoader': 'LoRA Loader'}
