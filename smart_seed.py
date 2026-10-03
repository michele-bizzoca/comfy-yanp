import secrets


MAX_SEED = 2**63


class SmartSeed:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Random": ("BOOLEAN", {
                    "default": True,
                    "label_on": "On",
                    "label_off": "Off",
                }),
            },
            "optional": {
                "Seed": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "dynamicPrompts": False,
                }),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "generate"
    CATEGORY = "YANP/utils"

    # Keep the node active even if its output is not connected, so a newly
    # generated random seed can always be sent back to the visible Seed field.
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, Random=True, Seed="", **kwargs):
        # Random mode must execute on every queued run. With Random disabled,
        # the visible Seed value fully determines the output.
        if Random:
            return float("nan")
        return str(Seed)

    @staticmethod
    def _new_seed():
        return secrets.randbelow(MAX_SEED)

    @classmethod
    def _parse_seed(cls, value):
        try:
            seed = int(str(value).strip())
        except (TypeError, ValueError):
            return cls._new_seed()

        if 0 <= seed < MAX_SEED:
            return seed

        return cls._new_seed()

    def generate(self, Random=True, Seed=""):
        if Random:
            seed = self._new_seed()
        else:
            # Seed should already exist in the frontend. This fallback keeps
            # the contract true even for old/invalid workflows or API calls.
            seed = self._parse_seed(Seed)

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
