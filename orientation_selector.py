class OrientationSelector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "orientation": (["horizontal", "vertical"], {"default": "horizontal"}),
            }
        }

    RETURN_TYPES = (["horizontal", "vertical"],)
    RETURN_NAMES = ("orientation",)
    FUNCTION = "select"
    CATEGORY = "utils"

    def select(self, orientation):
        return (orientation,)


NODE_CLASS_MAPPINGS = {
    "YANP_OrientationSelector": OrientationSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANP_OrientationSelector": "Orientation Selector",
}
