"""ComfyUI output node that raises an error when its condition is false."""


class Assert:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "condition": ("BOOLEAN", {"default": True, "forceInput": True}),
                "message": ("STRING", {
                    "default": "Assertion failed.",
                    "multiline": True,
                }),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "assert_condition"
    OUTPUT_NODE = True
    CATEGORY = "YANP/utils"

    def assert_condition(self, condition, message):
        if not condition:
            raise RuntimeError(message)
        return ()


NODE_CLASS_MAPPINGS = {"YANP_Assert": Assert}
NODE_DISPLAY_NAME_MAPPINGS = {"YANP_Assert": "Assert"}
