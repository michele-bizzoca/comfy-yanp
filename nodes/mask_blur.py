"""Resolution-normalized Gaussian mask blur, matching Impact Pack's Gaussian Blur Mask."""

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
                    "default": 10,
                    "min": 0,
                    "max": 1024,
                    "step": 1,
                }),
                "sigma": ("FLOAT", {
                    "default": 10.0,
                    "min": 0.1,
                    "max": 100.0,
                    "step": 0.1,
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

        kernel_at_1024 = int(kwargs["kernel-at-1024-px"])
        sigma = float(kwargs["sigma"])
        if kernel_at_1024 < 0:
            raise ValueError("kernel-at-1024-px must be nonnegative")
        if not torch.isfinite(torch.tensor(sigma)) or sigma <= 0:
            raise ValueError("sigma must be finite and greater than zero")
        if kernel_at_1024 == 0:
            return (mask,)

        height, width = mask.shape[-2:]
        short_edge = min(height, width)

        # Impact Pack's kernel_size is a radius: the actual kernel width is
        # 2 * kernel_size + 1. Scale that radius relative to a 1024 px short edge.
        scaled_radius = int(round(kernel_at_1024 * short_edge / 1024.0))
        if scaled_radius == 0:
            return (mask,)

        kernel_size = 2 * scaled_radius + 1

        # Match Impact Pack's safeguard for masks smaller than the requested kernel.
        if short_edge <= kernel_size:
            kernel_size = int(short_edge / 2)
            if kernel_size % 2 == 0:
                kernel_size += 1
            if kernel_size < 3:
                return (mask,)
        radius = kernel_size // 2

        work_dtype = (
            torch.float32
            if mask.dtype in (torch.float16, torch.bfloat16)
            else mask.dtype
        )
        source = mask.to(dtype=work_dtype).unsqueeze(1)
        kernel = self._gaussian_kernel1d(
            kernel_size, sigma, mask.device, work_dtype
        )

        # torchvision.transforms.GaussianBlur uses separable 1D Gaussian
        # kernels. Apply the horizontal and vertical passes independently.
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
