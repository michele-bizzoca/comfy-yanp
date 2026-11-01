"""Mask Majority with a configurable number of mask inputs (2..8)."""
import torch

MAX_INPUTS = 8
MIN_INPUTS = 2


class MaskMajority:
    """Independent vote requirements partition pixels into yes/no/maybe."""
    RETURN_TYPES = ("MASK", "MASK", "MASK")
    RETURN_NAMES = ("yes", "no", "maybe")
    FUNCTION = "run"
    CATEGORY = "Comfy YANP/masks"

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

    def run(self, threshold=0.5, yes_required=2, no_required=2, **kwargs):
        if not 0.0 <= threshold <= 1.0:
            raise ValueError("threshold must be within [0,1]")
        if any(type(count) is not int or not 1 <= count <= MAX_INPUTS
               for count in (yes_required, no_required)):
            raise ValueError("Vote requirements must be integers within [1,8]")

        masks = []
        for name in sorted(
            (key for key, value in kwargs.items()
             if key.startswith("mask_") and value is not None),
            key=lambda key: int(key.split("_", 1)[1]),
        ):
            mask = kwargs[name]
            if not isinstance(mask, torch.Tensor):
                raise ValueError("Mask Majority inputs must be MASK tensors")
            if mask.numel() == 0:
                continue
            masks.append(mask)

        if len(masks) < MIN_INPUTS:
            raise ValueError("Mask Majority requires at least two connected masks")

        reference = masks[0]
        if (reference.ndim != 3 or min(reference.shape) < 1
                or any(mask.ndim != 3 or tuple(mask.shape) != tuple(reference.shape)
                       or min(mask.shape) < 1 for mask in masks)):
            raise ValueError("Mask Majority requires connected masks with identical nonempty [B,H,W] dimensions")

        if yes_required > len(masks) or no_required > len(masks):
            raise ValueError(
                f"Vote requirements cannot exceed the number of connected masks ({len(masks)})"
            )

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


NODE_CLASS_MAPPINGS = {"mask_majority": MaskMajority}
NODE_DISPLAY_NAME_MAPPINGS = {"mask_majority": "Mask Majority"}
