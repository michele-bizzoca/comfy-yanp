"""Resolution-normalized equivalent of ComfyUI's Grow Mask node."""

import numpy as np
import torch


class MaskGrow:
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "run"
    CATEGORY = "Comfy YANP/Masks"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "distance-at-1024-px": ("INT", {
                    "default": 0,
                    "min": -8192,
                    "max": 8192,
                    "step": 1,
                }),
            }
        }

    def run(self, mask, **kwargs):
        from scipy import ndimage

        if not isinstance(mask, torch.Tensor) or mask.ndim != 3:
            raise ValueError("Mask Grow requires a [B,H,W] MASK tensor")
        if mask.shape[0] < 1 or mask.shape[1] < 1 or mask.shape[2] < 1:
            raise ValueError("Mask Grow requires nonempty [B,H,W] dimensions")

        short_edge = min(mask.shape[-2:])
        distance = kwargs["distance-at-1024-px"]
        # Scale the number of 3x3 morphology iterations with image resolution.
        # At a 1024 px short edge this is exactly ComfyUI Grow Mask's expand.
        expand = int(round(distance * short_edge / 1024.0))

        c = 0
        kernel = np.array([
            [c, 1, c],
            [1, 1, 1],
            [c, 1, c],
        ], dtype=np.uint8)

        source = mask.detach().to(device="cpu").numpy()
        output = []
        for item in source:
            result = item
            for _ in range(abs(expand)):
                if expand < 0:
                    result = ndimage.grey_erosion(result, footprint=kernel)
                elif expand > 0:
                    result = ndimage.grey_dilation(result, footprint=kernel)
            output.append(result)

        result = torch.from_numpy(np.stack(output)).to(
            device=mask.device, dtype=mask.dtype
        )
        return (result,)


NODE_CLASS_MAPPINGS = {"mask_grow": MaskGrow}
NODE_DISPLAY_NAME_MAPPINGS = {"mask_grow": "Mask Grow"}
