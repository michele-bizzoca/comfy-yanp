import torch


class Background:
    CATEGORY = "Comfy YANP/Images"
    FUNCTION = "run"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)

    @classmethod
    def INPUT_TYPES(cls):
        dimensions = {"default": 512, "min": 1, "max": 16384, "step": 1}
        return {"required": {
            "width": ("INT", dict(dimensions)),
            "height": ("INT", dict(dimensions)),
            "color": (["white", "black", "chess"], {"default": "white"}),
        }}

    def run(self, width, height, color):
        if color == "chess":
            rows = torch.arange(height) // 64
            columns = torch.arange(width) // 64
            cells = (rows[:, None] + columns[None, :]) % 2
            gray = (cells.to(torch.float32) + 1.0) / 3.0
            return (gray[None, :, :, None].expand(-1, -1, -1, 3).contiguous(),)

        value = {"white": 1.0, "black": 0.0}[color]
        return (torch.full((1, height, width, 3), value, dtype=torch.float32),)


NODE_CLASS_MAPPINGS = {"yanp_background": Background}
NODE_DISPLAY_NAME_MAPPINGS = {"yanp_background": "Background"}
