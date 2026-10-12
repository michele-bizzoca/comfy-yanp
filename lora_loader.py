import json
import os

import folder_paths
import comfy.sd
from aiohttp import web
from server import PromptServer


@PromptServer.instance.routes.get('/yanp/lora_loader/loras')
async def yanp_lora_loader_loras(request):
    return web.json_response(folder_paths.get_filename_list('loras'))


class YANPLoraLoader:
    MAX_PAIRS = 8

    @classmethod
    def INPUT_TYPES(cls):
        return {
            'required': {},
            'optional': {
                **{name: (kind,) for i in range(1, cls.MAX_PAIRS + 1)
                   for name, kind in ((f'model_{i}', 'MODEL'), (f'clip_{i}', 'CLIP'))},
                'loraData': ('STRING', {'default': '[]'}),
            },
        }

    RETURN_TYPES = ('MODEL', 'CLIP') * MAX_PAIRS
    RETURN_NAMES = tuple(name for i in range(1, MAX_PAIRS + 1) for name in (f'model_{i}', f'clip_{i}'))
    FUNCTION = 'load'
    CATEGORY = 'YANP/loaders'

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return json.dumps(kwargs, sort_keys=True, default=str)

    def load(self, loraData='[]', **kwargs):
        try:
            rows = json.loads(loraData or '[]')
        except (ValueError, TypeError):
            rows = []

        active = []
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict) or not row.get('enabled', True):
                continue
            name = str(row.get('name', '')).strip()
            if not name:
                continue
            try:
                path = folder_paths.get_full_path_or_raise('loras', name)
                strength_model = float(row.get('strength_model', 1))
                strength_clip = float(row.get('strength_clip', 1))
            except (ValueError, TypeError):
                continue
            active.append((path, strength_model, strength_clip))

        output = []
        for i in range(1, self.MAX_PAIRS + 1):
            model = kwargs.get(f'model_{i}')
            clip = kwargs.get(f'clip_{i}')
            if model is not None or clip is not None:
                for path, strength_model, strength_clip in active:
                    if strength_model == 0 and strength_clip == 0:
                        continue
                    # ComfyUI can load a LoRA with only one side connected.
                    lora = None
                    try:
                        from comfy.utils import load_torch_file
                        lora = load_torch_file(path, safe_load=True)
                        model, clip = comfy.sd.load_lora_for_models(
                            model, clip, lora, strength_model, strength_clip
                        )
                    finally:
                        del lora
            output.extend((model, clip))
        return tuple(output)


NODE_CLASS_MAPPINGS = {'YANPLoraLoader': YANPLoraLoader}
NODE_DISPLAY_NAME_MAPPINGS = {'YANPLoraLoader': 'LoRA Loader'}
