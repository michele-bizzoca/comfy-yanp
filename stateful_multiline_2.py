class StatefulMultiline2:
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
    DESCRIPTION = "Multiline text input with two independently saved defaults."

    def get_text(self, Text=""):
        return (Text,)


NODE_CLASS_MAPPINGS = {
    "YANPStatefulMultiline2": StatefulMultiline2,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANPStatefulMultiline2": "Stateful Multiline 2",
}
