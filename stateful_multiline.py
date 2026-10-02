class StatefulMultiline:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Text": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                    },
                ),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "get_text"
    CATEGORY = "YANP/input"
    DESCRIPTION = "Multiline text input with save and recall functions."

    def get_text(self, Text=""):
        return (Text,)


NODE_CLASS_MAPPINGS = {
    "YANPStatefulMultiline": StatefulMultiline,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANPStatefulMultiline": "Stateful Multiline",
}
