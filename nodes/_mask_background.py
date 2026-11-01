"""Shared helpers for the YANP mask application nodes."""
import torch


def _make_background(image, background_color):
    """Create an RGB background matching a ComfyUI IMAGE tensor [B,H,W,C]."""
    if not isinstance(image, torch.Tensor) or image.ndim != 4 or image.shape[-1] != 3:
        raise ValueError("Image must be an RGB IMAGE tensor with shape [B,H,W,3]")

    batch, height, width, _ = image.shape
    if background_color == "white":
        return torch.ones_like(image)
    if background_color == "black":
        return torch.zeros_like(image)
    if background_color != "chess":
        raise ValueError(f"Unsupported background color: {background_color}")

    y = torch.arange(height, device=image.device) // 64
    x = torch.arange(width, device=image.device) // 64
    dark = ((y[:, None] + x[None, :]) % 2 == 0)
    dark = dark.to(dtype=image.dtype)
    light = 1.0 - dark
    gray = dark * (85.0 / 255.0) + light * (170.0 / 255.0)
    return gray[None, :, :, None].expand(batch, height, width, 3).contiguous()


def _prepare_mask(mask, image):
    if not isinstance(mask, torch.Tensor) or mask.ndim != 3:
        raise ValueError("Mask must be a MASK tensor with shape [B,H,W]")
    if tuple(mask.shape[-2:]) != tuple(image.shape[1:3]):
        raise ValueError("Image and mask must have identical width and height")
    if mask.shape[0] == 1 and image.shape[0] > 1:
        mask = mask.expand(image.shape[0], -1, -1)
    elif mask.shape[0] != image.shape[0]:
        raise ValueError("Image and mask batch sizes must match, or mask batch must be 1")
    return mask.to(device=image.device, dtype=image.dtype).unsqueeze(-1).clamp(0.0, 1.0)
