"""Connected-component alpha mask filter (YANP)."""
import numpy as np
import torch


def _cc_alpha_filter(alpha, radius_at_1024_px, alpha_threshold, area_threshold_at_1024_px):
    """Disk mean -> threshold -> 8-connected area filter; preserve retained alpha.

    The component-area threshold is expressed in pixels at a 1024-pixel short
    edge and scales quadratically with the actual short edge.
    """
    from scipy import ndimage
    from scipy.signal import fftconvolve

    alpha = np.asarray(alpha, dtype=np.float64)
    if alpha.ndim != 2 or min(alpha.shape) < 1:
        raise ValueError("Expected nonempty alpha [H,W]")
    if not np.isfinite(alpha).all() or np.any((alpha < 0) | (alpha > 1)):
        raise ValueError("mask values must be finite and in [0,1]")
    if not np.isfinite(radius_at_1024_px) or not 0 <= radius_at_1024_px <= 1024:
        raise ValueError("radius-at-1024-px must be within [0,1024]")
    if not np.isfinite(alpha_threshold) or not 0 <= alpha_threshold <= 1:
        raise ValueError("alpha-threshold must be within [0,1]")
    if (not np.isfinite(area_threshold_at_1024_px)
            or area_threshold_at_1024_px < 0):
        raise ValueError("area-threshold-at-1024-px must be finite and nonnegative")

    short_edge = min(alpha.shape)
    radius = radius_at_1024_px * short_edge / 1024.0
    bound = int(np.ceil(radius))
    y, x = np.ogrid[-bound:bound + 1, -bound:bound + 1]
    disk = (x * x + y * y <= radius * radius).astype(np.float64)
    disk /= disk.sum()
    if bound <= 16:
        mean = ndimage.convolve(alpha, disk, mode="constant", cval=0.0)
    else:
        mean = fftconvolve(alpha, disk, mode="same")

    # Outside-image pixels are zero; avoid numerical noise at an exact threshold.
    support = (alpha > 0) & (np.clip(mean, 0, 1) >= alpha_threshold - 1e-12)
    labels, count = ndimage.label(support, ndimage.generate_binary_structure(2, 2))
    areas = np.bincount(labels.ravel(), minlength=count + 1)
    area_threshold = area_threshold_at_1024_px * (short_edge / 1024.0) ** 2
    accepted = areas > area_threshold
    accepted[0] = False
    return np.where(accepted[labels], alpha, 0).astype(np.float32)


class CCAlphaFilter:
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "run"
    CATEGORY = "YANP/Utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "mask": ("MASK",),
            "radius-at-1024-px": ("FLOAT", {
                "default": 5.0, "min": 0.0, "max": 1024.0, "step": 0.1,
            }),
            "alpha-threshold": ("FLOAT", {
                "default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01,
            }),
            "area-threshold-at-1024-px": ("FLOAT", {
                "default": 64.0, "min": 0.0, "max": 10737418240.0, "step": 1.0,
            }),
        }}

    def run(self, mask, **kwargs):
        from comfy.model_management import throw_exception_if_processing_interrupted

        if mask.ndim != 3 or min(mask.shape) < 1:
            raise ValueError("mask must have nonempty [B,H,W] dimensions")
        masks = mask.detach().to(device="cpu", dtype=torch.float32).numpy()
        results = []
        for alpha in masks:
            throw_exception_if_processing_interrupted()
            results.append(_cc_alpha_filter(
                alpha,
                kwargs["radius-at-1024-px"],
                kwargs["alpha-threshold"],
                kwargs["area-threshold-at-1024-px"],
            ))
        filtered = torch.from_numpy(np.stack(results)).to(
            device=mask.device, dtype=mask.dtype
        )
        return (filtered,)


NODE_CLASS_MAPPINGS = {"cc_alpha_filter": CCAlphaFilter}
NODE_DISPLAY_NAME_MAPPINGS = {"cc_alpha_filter": "CC Alpha Filter"}
