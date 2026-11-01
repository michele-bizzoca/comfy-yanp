"""Mask reduction and voting nodes migrated from Comfy Manga Rework."""
import torch

MAX_INPUTS = 4


class _MaskReduce:
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "run"
    CATEGORY = "Comfy YAMP"
    OPERATION = None

    @classmethod
    def INPUT_TYPES(cls):
        return {"optional": {f"mask_{i}": ("MASK",) for i in range(1, MAX_INPUTS + 1)}}

    def run(self, mask_1=None, mask_2=None, mask_3=None, mask_4=None):
        values = [value for value in (mask_1, mask_2, mask_3, mask_4) if value is not None]
        if not values:
            raise ValueError("Mask Min/Max requires at least one connected mask")
        shape = values[0].shape
        if any(not isinstance(value, torch.Tensor) or value.ndim != 3 or value.shape != shape for value in values):
            raise ValueError(f"Mask Min/Max requires identical [B,H,W] masks; expected {shape}")
        result = values[0]
        for value in values[1:]:
            result = torch.minimum(result, value) if self.OPERATION == "min" else torch.maximum(result, value)
        return (result,)


class MaskMin(_MaskReduce):
    OPERATION = "min"


class MaskMax(_MaskReduce):
    OPERATION = "max"


class MaskMajority:
    """Independent vote requirements partition pixels into yes/no/maybe."""
    RETURN_TYPES = ("MASK", "MASK", "MASK")
    RETURN_NAMES = ("yes", "no", "maybe")
    FUNCTION = "run"
    CATEGORY = "Comfy YAMP"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "threshold": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "yes_required": ("INT", {"default": 2, "min": 1, "max": MAX_INPUTS}),
                "no_required": ("INT", {"default": 2, "min": 1, "max": MAX_INPUTS}),
            },
            "optional": {f"mask_{i}": ("MASK",) for i in range(1, MAX_INPUTS + 1)},
        }

    def run(self, mask_1=None, mask_2=None, mask_3=None, mask_4=None,
            threshold=0.5, yes_required=2, no_required=2):
        if not 0.0 <= threshold <= 1.0:
            raise ValueError("threshold must be within [0,1]")
        if any(type(count) is not int or not 1 <= count <= MAX_INPUTS
               for count in (yes_required, no_required)):
            raise ValueError("Vote requirements must be integers within [1,4]")
        masks = []
        for mask in (mask_1, mask_2, mask_3, mask_4):
            if mask is None:
                continue
            if not isinstance(mask, torch.Tensor):
                raise ValueError("Mask Majority inputs must be MASK tensors")
            if mask.numel() == 0:
                continue
            masks.append(mask)
        if not masks:
            raise ValueError("Mask Majority requires at least one connected mask")
        reference = masks[0]
        if (reference.ndim != 3 or min(reference.shape) < 1
                or any(mask.ndim != 3 or tuple(mask.shape) != tuple(reference.shape)
                       or min(mask.shape) < 1 for mask in masks)):
            raise ValueError("Mask Majority requires connected masks with identical nonempty [B,H,W] dimensions")
        votes = torch.zeros_like(reference, dtype=torch.int16)
        for mask in masks:
            if not torch.isfinite(mask).all():
                raise ValueError("Mask Majority requires finite mask values")
            votes += (mask.to(device=reference.device) > threshold).to(torch.int16)
        yes_condition = votes >= yes_required
        no_condition = (len(masks) - votes) >= no_required
        yes = yes_condition & ~no_condition
        no = no_condition & ~yes_condition
        maybe = yes_condition == no_condition
        return tuple(region.to(dtype=torch.float32) for region in (yes, no, maybe))


NODE_CLASS_MAPPINGS = {
    "mask_min": MaskMin,
    "mask_max": MaskMax,
    "mask_majority": MaskMajority,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "mask_min": "Mask Min",
    "mask_max": "Mask Max",
    "mask_majority": "Mask Majority",
}
