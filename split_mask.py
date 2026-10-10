import torch


class SplitMask:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "width": ("INT", {"default": 1216, "min": 1, "max": 16384, "step": 8}),
                "height": ("INT", {"default": 832, "min": 1, "max": 16384, "step": 8}),
                "orientation": (["horizontal", "vertical"], {"default": "horizontal"}),
                "transition_point": (
                    "FLOAT",
                    {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01},
                ),
                "gradient_width": (
                    "INT",
                    {"default": 48, "min": 0, "max": 4096, "step": 1},
                ),
                "gradient_intensity": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01},
                ),
            }
        }

    RETURN_TYPES = ("MASK", "MASK")
    RETURN_NAMES = ("mask_a", "mask_b")
    FUNCTION = "generate"
    CATEGORY = "mask"

    def generate(
        self,
        width,
        height,
        orientation,
        transition_point,
        gradient_width,
        gradient_intensity,
    ):
        width = int(width)
        height = int(height)
        gradient_width = int(gradient_width)
        transition_point = float(transition_point)
        gradient_intensity = float(gradient_intensity)

        axis_length = width if orientation == "horizontal" else height
        coords = torch.arange(axis_length, dtype=torch.float32)

        center = transition_point * max(axis_length - 1, 0)
        half_width = gradient_width / 2.0

        if gradient_width <= 0:
            ramp = (coords < center).float()
        else:
            start = center - half_width
            ramp = 1.0 - ((coords - start) / float(gradient_width))
            ramp = ramp.clamp(0.0, 1.0)

        mask_a_line = ramp * gradient_intensity
        mask_b_line = (1.0 - ramp) * gradient_intensity

        if orientation == "horizontal":
            mask_a = mask_a_line.unsqueeze(0).repeat(height, 1)
            mask_b = mask_b_line.unsqueeze(0).repeat(height, 1)
        else:
            mask_a = mask_a_line.unsqueeze(1).repeat(1, width)
            mask_b = mask_b_line.unsqueeze(1).repeat(1, width)

        return (mask_a.unsqueeze(0), mask_b.unsqueeze(0))

NODE_CLASS_MAPPINGS = {
    "YANP_SplitMask": SplitMask,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANP_SplitMask": "Split Mask",
}
