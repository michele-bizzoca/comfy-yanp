"""Resolution-normalized Gaussian blur for MASK tensors."""

import torch
import torch.nn.functional as F


class MaskBlur:
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "run"
    CATEGORY = "Comfy YANP/Masks"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "kernel-at-1024-px": ("INT", {
                    "default": 3,
                    "min": 1,
                    "max": 255,
                    "step": 2,
                }),
                "sigma": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.1,
                    "max": 100.0,
                    "step": 0.1,
                }),
            }
        }

    def run(self, mask, **kwargs):
        if not isinstance(mask, torch.Tensor) or mask.ndim != 3:
            raise ValueError("Mask Blur requires a [B,H,W] MASK tensor")
        if mask.shape[0] < 1 or mask.shape[1] < 1 or mask.shape[2] < 1:
            raise ValueError("Mask Blur requires nonempty [B,H,W] dimensions")

        kernel_at_1024 = int(kwargs["kernel-at-1024-px"])
        sigma = float(kwargs["sigma"])
        if kernel_at_1024 < 1:
            raise ValueError("kernel-at-1024-px must be at least 1")
        if not torch.isfinite(torch.tensor(sigma)) or sigma <= 0:
            raise ValueError("sigma must be finite and greater than zero")

        short_edge = min(mask.shape[-2:])
        scaled_kernel = max(1, int(round(kernel_at_1024 * short_edge / 1024.0)))
        # A centered Gaussian kernel must have an odd number of samples.
        if scaled_kernel % 2 == 0:
            scaled_kernel += 1
        if scaled_kernel == 1:
            return (mask,)

        device = mask.device
        dtype = torch.float32 if mask.dtype in (torch.float16, torch.bfloat16) else mask.dtype
        coords = torch.linspace(-1.0, 1.0, scaled_kernel, device=device, dtype=dtype)
        yy, xx = torch.meshgrid(coords, coords, indexing="ij")
        distance_squared = xx.square() + yy.square()
        kernel = torch.exp(-distance_squared / (2.0 * sigma * sigma))
        kernel = kernel / kernel.sum()
        kernel = kernel.reshape(1, 1, scaled_kernel, scaled_kernel)

        radius = scaled_kernel // 2
        source = mask.to(dtype=dtype).unsqueeze(1)
        pad_mode = "reflect"
        if radius >= min(mask.shape[-2:]):
            pad_mode = "replicate"
        padded = F.pad(source, (radius, radius, radius, radius), mode=pad_mode)
        blurred = F.conv2d(padded, kernel)
        return (blurred.squeeze(1).to(dtype=mask.dtype),)


NODE_CLASS_MAPPINGS = {"mask_blur": MaskBlur}
NODE_DISPLAY_NAME_MAPPINGS = {"mask_blur": "Mask Blur"}
