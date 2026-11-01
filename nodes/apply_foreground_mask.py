"""Apply a foreground mask over a selected solid or checkerboard background."""
from ._mask_background import _make_background, _prepare_mask


class ApplyForegroundMask:
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "run"
    CATEGORY = "YANP/masks"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "background_color": (["white", "black", "chess"],),
            }
        }

    def run(self, image, mask, background_color="white"):
        background = _make_background(image, background_color)
        alpha = _prepare_mask(mask, image)
        result = image * alpha + background * (1.0 - alpha)
        return (result.clamp(0.0, 1.0),)


NODE_CLASS_MAPPINGS = {"apply_foreground_mask": ApplyForegroundMask}
NODE_DISPLAY_NAME_MAPPINGS = {"apply_foreground_mask": "Apply Foreground Mask"}
