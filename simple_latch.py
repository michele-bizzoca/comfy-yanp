from comfy_execution.graph_utils import ExecutionBlocker


ANY = "*"

_MEMORY = {}


class MemoryLatch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Pass": ("BOOLEAN", {
                    "default": True,
                    "label_on": "On",
                    "label_off": "Off",
                }),
            },
            "optional": {
                "input": (ANY, {"lazy": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)
    FUNCTION = "latch"
    CATEGORY = "YANP/utils"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def check_lazy_status(cls, Pass, input=None, unique_id=None, **kwargs):
        if Pass and input is None:
            return ["input"]
        return []

    def latch(self, Pass, input=None, unique_id=None):
        key = str(unique_id)

        if not Pass:
            if key in _MEMORY:
                return (_MEMORY[key],)

            return (ExecutionBlocker(None),)

        _MEMORY[key] = input
        return (input,)


NODE_CLASS_MAPPINGS = {
    "YANPMemoryLatch": MemoryLatch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANPMemoryLatch": "Simple Latch",
}
