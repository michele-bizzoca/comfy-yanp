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
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "generate"
    CATEGORY = "YANP/utils"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # The node must be reconsidered on every queue so that Stop=Off
        # can generate a fresh seed.
        return float("nan")

    def generate(self, Stop=False, unique_id=None):
        key = str(unique_id)

        if Stop and key in _MEMORY:
            seed = _MEMORY[key]
        else:
            seed = secrets.randbelow(2**63)
            _MEMORY[key] = seed

        return {
            "ui": {
                "seed": [str(seed)],
            },
            "result": (seed,),
        }


NODE_CLASS_MAPPINGS = {
    "YANPSmartSeed": SmartSeed,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANPSmartSeed": "Smart Seed",
}
