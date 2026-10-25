"""Dynamic mask reducers. Optional inputs are advertised for LiteGraph links."""
import torch

MAX_INPUTS = 8

class _MaskReduce:
    RETURN_TYPES = ('MASK',)
    RETURN_NAMES = ('mask',)
    FUNCTION = 'run'
    CATEGORY = 'Comfy Manga Rework/Masks'
    OPERATION = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            'required': {'mask_1': ('MASK',)},
            'optional': {f'mask_{i}': ('MASK',) for i in range(2, MAX_INPUTS + 1)},
        }

    def run(self, mask_1, **kwargs):
        if any(k.startswith('mask_') and (not k[5:].isdigit() or not 2 <= int(k[5:]) <= MAX_INPUTS) for k in kwargs):
            raise ValueError('Mask Min/Max supports at most 8 inputs')
        values = [mask_1] + [kwargs[k] for k in sorted(kwargs, key=lambda s: int(s.split('_')[1])) if k.startswith('mask_') and kwargs[k] is not None]
        shape = values[0].shape
        if any(value.shape != shape for value in values):
            raise ValueError(f'Mask Min/Max requires identical [B,H,W] shapes; expected {shape}')
        result = values[0]
        for value in values[1:]:
            result = torch.minimum(result, value) if self.OPERATION == 'min' else torch.maximum(result, value)
        return (result,)

class MaskMin(_MaskReduce):
    OPERATION = 'min'

class MaskMax(_MaskReduce):
    OPERATION = 'max'

NODE_CLASS_MAPPINGS = {'MangaReworkMaskMin': MaskMin, 'MangaReworkMaskMax': MaskMax}
NODE_DISPLAY_NAME_MAPPINGS = {'MangaReworkMaskMin': 'Mask Min', 'MangaReworkMaskMax': 'Mask Max'}
