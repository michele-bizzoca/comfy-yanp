from comfy_execution.graph_utils import ExecutionBlocker


ANY = "*"


class YANPIdentity:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input": (ANY,),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)
    FUNCTION = "passthrough"
    CATEGORY = "yanp/utils"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def passthrough(self, input):
        return (input,)


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
                # Lazy means the upstream branch is requested only while connected.
                # Optional allows the socket to remain physically disconnected.
                "input": (ANY, {"lazy": True}),
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch"
    CATEGORY = "yanp/utils"

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
            # Silently block every downstream consumer, like a disconnected branch.
            return (ExecutionBlocker(None),)
        return (input,)


NODE_CLASS_MAPPINGS = {
    "YANPIdentity": YANPIdentity,
    "YANPSimpleSwitch": YANPSimpleSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANPIdentity": "Identity",
    "YANPSimpleSwitch": "Simple Switch",
}
