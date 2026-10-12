class _AnyInputDict(dict):
    """Allow ComfyUI to forward dynamically created optional sockets."""
    def __contains__(self, key):
        return True


class YANPStringConcatenate:
    MAX_STRINGS = 8

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "string_1": ("STRING", {"forceInput": True}),
                "string_2": ("STRING", {"forceInput": True}),
                "separator": ("STRING", {
                    "default": "",
                    "multiline": False
                }),
            },
            "optional": {
                f"string_{i}": ("STRING", {"forceInput": True})
                for i in range(3, cls.MAX_STRINGS + 1)
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "concatenate"
    CATEGORY = "YANP/text"

    def concatenate(self, string_1, string_2, separator="", **kwargs):
        values = [string_1, string_2]
        dynamic = sorted(
            ((int(key[7:]), value) for key, value in kwargs.items()
             if key.startswith("string_") and key[7:].isdigit()),
            key=lambda item: item[0],
        )
        values.extend(value for _, value in dynamic)
        return (separator.join(str(value) for value in values if value is not None),)


NODE_CLASS_MAPPINGS = {"YANPStringConcatenate": YANPStringConcatenate}
NODE_DISPLAY_NAME_MAPPINGS = {"YANPStringConcatenate": "Concat Strings"}
