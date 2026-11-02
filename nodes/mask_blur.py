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
                "radius-at-1024-px": ("INT", {
                    "default": 10,
                    "min": 0,
                    "max": 1024,
                    "step": 1,
                }),
                "fade": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01,
                }),
            }
        }

    @staticmethod
    def _gaussian_kernel1d(kernel_size, sigma, device, dtype):
        coords = torch.arange(
            kernel_size, device=device, dtype=dtype
        ) - kernel_size // 2
        kernel = torch.exp(-(coords * coords) / (2.0 * sigma * sigma))
        return kernel / kernel.sum()

    def run(self, mask, **kwargs):
        if not isinstance(mask, torch.Tensor) or mask.ndim != 3:
            raise ValueError("Mask Blur requires a [B,H,W] MASK tensor")
        if mask.shape[0] < 1 or mask.shape[1] < 1 or mask.shape[2] < 1:
            raise ValueError("Mask Blur requires nonempty [B,H,W] dimensions")

        radius_at_1024 = int(kwargs["radius-at-1024-px"])
        fade = float(kwargs["fade"])
        if radius_at_1024 < 0:
            raise ValueError("radius-at-1024-px must be nonnegative")
        if not torch.isfinite(torch.tensor(fade)) or not 0.0 <= fade <= 1.0:
            raise ValueError("fade must be between 0 and 1")

        if radius_at_1024 == 0 or fade == 0.0:
            return (mask,)

        height, width = mask.shape[-2:]
        short_edge = min(height, width)
        radius = int(round(radius_at_1024 * short_edge / 1024.0))
        if radius == 0:
            return (mask,)

        kernel_size = 2 * radius + 1

        # Keep the filter valid for small masks, following Gaussian Blur Mask's
        # small-image safeguard.
        if short_edge <= kernel_size:
            kernel_size = int(short_edge / 2)
            if kernel_size % 2 == 0:
                kernel_size += 1
            if kernel_size < 3:
                return (mask,)
            radius = kernel_size // 2

        # fade=1 gives the conventional Gaussian relation radius ~= 3*sigma.
        # Lower fade narrows the Gaussian while preserving the kernel extent.
        sigma = max((radius * fade) / 3.0, 1e-6)

        work_dtype = (
            torch.float32
            if mask.dtype in (torch.float16, torch.bfloat16)
            else mask.dtype
        )
        source = mask.to(dtype=work_dtype).unsqueeze(1)
        kernel = self._gaussian_kernel1d(
            kernel_size, sigma, mask.device, work_dtype
        )

        horizontal = kernel.view(1, 1, 1, kernel_size)
        vertical = kernel.view(1, 1, kernel_size, 1)

        pad_mode = "reflect"
        if radius >= min(height, width):
            pad_mode = "replicate"

        source = F.pad(source, (radius, radius, 0, 0), mode=pad_mode)
        source = F.conv2d(source, horizontal)
        source = F.pad(source, (0, 0, radius, radius), mode=pad_mode)
        blurred = F.conv2d(source, vertical)

        return (blurred.squeeze(1).to(dtype=mask.dtype),)


NODE_CLASS_MAPPINGS = {"mask_blur": MaskBlur}
NODE_DISPLAY_NAME_MAPPINGS = {"mask_blur": "Mask Blur"}
