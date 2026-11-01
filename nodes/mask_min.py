"""Dynamic Mask Min node migrated from Comfy Manga Rework."""
import torch

MAX_INPUTS = 64


class MaskMin:
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "run"
    CATEGORY = "Comfy YAMP"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"mask_1": ("MASK",)},
            "optional": {f"mask_{i}": ("MASK",) for i in range(2, MAX_INPUTS + 1)},
        }

    def run(self, mask_1, **kwargs):
        values = [mask_1]
        values.extend(
            kwargs[name]
            for name in sorted(
                (key for key, value in kwargs.items()
                 if key.startswith("mask_") and value is not None),
                key=lambda key: int(key.split("_", 1)[1]),
            )
        )
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
