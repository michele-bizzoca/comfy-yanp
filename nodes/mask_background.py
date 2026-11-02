"""Create a solid or checkerboard background matching an IMAGE tensor."""
from ._mask_background import _make_background


class YANPMaskBackground:
    CATEGORY = "Comfy YANP / masks"
    FUNCTION = "run"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("background",)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "background-color": (["white", "black", "chess"], {"default": "white"}),
        }}

    def run(self, image, **kwargs):
        background_color = kwargs.pop("background-color", "white")
        if kwargs:
            raise ValueError(f"Unexpected parameters: {sorted(kwargs)}")
        return (_make_background(image, background_color),)


NODE_CLASS_MAPPINGS = {"YANPMaskBackground": YANPMaskBackground}
NODE_DISPLAY_NAME_MAPPINGS = {"YANPMaskBackground": "YANP Mask Background"}
