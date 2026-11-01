class NaturalSelector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (
                    "INT",
                    {"default": 1, "min": 0, "step": 1},
                ),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("value",)
    FUNCTION = "select"
    CATEGORY = "utils"

    def select(self, value):
        return (float(value),)


NODE_CLASS_MAPPINGS = {
    "YANP_NaturalSelector": NaturalSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANP_NaturalSelector": "Natural Selector",
}
