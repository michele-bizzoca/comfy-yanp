import secrets


_MEMORY = {}


class SmartSeed:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Stop": ("BOOLEAN", {
                    "default": False,
                    "label_on": "On",
                    "label_off": "Off",
                }),
            },
            "optional": {
                # Real backend widget: much more reliable with the current
                # ComfyUI frontend than a widget created only from JavaScript.
                "Seed": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "dynamicPrompts": False,
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "generate"
    CATEGORY = "YANP/utils"

    # Make the node execute even when its seed output is not connected, so the
    # in-node preview is always updated.
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Force one execution per queued run in BOTH Stop states.
        # When Stop is On the value does not change, but the UI preview is still
        # sent to the frontend.
        return float("nan")

    def generate(self, Stop=False, Seed="", unique_id=None):
        key = str(unique_id)

        if Stop:
            # If Stop is already On before this node has ever generated a seed,
            # create one seed once and immediately hold it.
            if key not in _MEMORY:
                _MEMORY[key] = secrets.randbelow(2**63)

            seed = _MEMORY[key]
        else:
            seed = secrets.randbelow(2**63)
            _MEMORY[key] = seed

        # Use the same UI-output convention as ComfyUI's core Preview as Text
        # node. This is emitted on every execution, including Stop = On.
        return {
            "ui": {
                "text": (str(seed),),
            },
            "result": (seed,),
        }


NODE_CLASS_MAPPINGS = {
    "YANPSmartSeed": SmartSeed,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANPSmartSeed": "Smart Seed",
}
