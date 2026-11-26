from comfy_execution.graph import ExecutionBlocker


class YANPMultiplex:
    MAX_INPUTS = 16

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {"default": 0, "min": 0, "max": cls.MAX_INPUTS - 1}),
            },
            "optional": {
                f"input_{i}": ("*", {"lazy": True, "forceInput": True})
                for i in range(cls.MAX_INPUTS)
            },
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
    FUNCTION = "multiplex"
    CATEGORY = "Comfy YANP/Circuits"

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        # Every data socket accepts any ComfyUI type; index must remain INT.
        if "index" in input_types and input_types["index"] not in ("INT", "*"):
            return "Multiplex index must be an INT"
        return True

    @classmethod
    def _selected(cls, index):
        if not isinstance(index, int) or not 0 <= index < cls.MAX_INPUTS:
            raise ValueError("Multiplex index must be between 0 and 15")
        return f"input_{index}"

    @classmethod
    def check_lazy_status(cls, index, **kwargs):
        name = cls._selected(index)
        if kwargs.get(name) is None:
            return [name]
        return []

    def multiplex(self, index, **kwargs):
        value = kwargs.get(self._selected(index))
        # A missing selected socket blocks downstream execution, never falls
        # back to a different branch.
        return (ExecutionBlocker(None) if value is None else value,)


NODE_CLASS_MAPPINGS = {"YANPMultiplex": YANPMultiplex}
NODE_DISPLAY_NAME_MAPPINGS = {"YANPMultiplex": "Multiplex"}
