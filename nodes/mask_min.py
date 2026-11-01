"""Mask Min node migrated from Comfy Manga Rework."""
import torch

MAX_INPUTS = 4


class MaskMin:
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "run"
    CATEGORY = "Comfy YAMP"

    @classmethod
    def INPUT_TYPES(cls):
        return {"optional": {f"mask_{i}": ("MASK",) for i in range(1, MAX_INPUTS + 1)}}

    def run(self, mask_1=None, mask_2=None, mask_3=None, mask_4=None):
        values = [value for value in (mask_1, mask_2, mask_3, mask_4) if value is not None]
        if not values:
            raise ValueError("Mask Min requires at least one connected mask")
        if any(not isinstance(value, torch.Tensor) or value.ndim != 3 for value in values):
            raise ValueError("Mask Min requires [B,H,W] MASK tensors")
        shape = values[0].shape
        if any(value.shape != shape for value in values):
            raise ValueError(f"Mask Min requires identical [B,H,W] shapes; expected {shape}")
        result = values[0]
        for value in values[1:]:
            result = torch.minimum(result, value)
        return (result,)


NODE_CLASS_MAPPINGS = {"mask_min": MaskMin}
NODE_DISPLAY_NAME_MAPPINGS = {"mask_min": "Mask Min"}
