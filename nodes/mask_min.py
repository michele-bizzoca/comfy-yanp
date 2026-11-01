"""Dynamic Mask Min: reduce every mask in every input batch to one mask."""
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

        spatial_shape = values[0].shape[1:]
        for value in values:
            if value.shape[0] < 1 or value.shape[1] < 1 or value.shape[2] < 1:
                raise ValueError("Mask Min requires nonempty [B,H,W] tensors")
            if value.shape[1:] != spatial_shape:
                raise ValueError(
                    f"Mask Min requires identical spatial dimensions [H,W]; expected {spatial_shape}, "
                    f"got {value.shape[1:]}"
                )

        # Reduce all batch items from all connected inputs into one [1,H,W] mask.
        result = torch.amin(values[0], dim=0, keepdim=True)
        for value in values[1:]:
            result = torch.minimum(result, torch.amin(value, dim=0, keepdim=True))
        return (result,)
        

NODE_CLASS_MAPPINGS = {"mask_min": MaskMin}
NODE_DISPLAY_NAME_MAPPINGS = {"mask_min": "Mask Minimum"}
