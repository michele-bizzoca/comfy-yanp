class UnitSelector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (
                    "FLOAT",
                    {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01},
                ),
            }
        }

    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("value",)
    FUNCTION = "select"
    CATEGORY = "utils"

    def select(self, value):
        return (float(value),)


NODE_CLASS_MAPPINGS = {
    "YANP_UnitSelector": UnitSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANP_UnitSelector": "Unit Selector",
}
