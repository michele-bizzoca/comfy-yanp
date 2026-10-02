from comfy_execution.graph_utils import ExecutionBlocker


ANY = "*"


class YANPSimpleSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Connected": ("BOOLEAN", {
                    "default": True,
                    "label_on": "On",
                    "label_off": "Off",
                }),
            },
            "optional": {
                "input": (ANY, {"lazy": True}),
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch"
    CATEGORY = "YANP/utils"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def check_lazy_status(cls, Connected, input=None, **kwargs):
        if Connected and input is None:
            return ["input"]
        return []

    def switch(self, Connected, input=None):
        if not Connected:
            return (ExecutionBlocker(None),)
        return (input,)


NODE_CLASS_MAPPINGS = {
    "YANPSimpleSwitch": YANPSimpleSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANPSimpleSwitch": "Simple Switch",
}
