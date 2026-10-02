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
    CATEGORY = "YANP/utils"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def passthrough(self, input):
        return (input,)


NODE_CLASS_MAPPINGS = {
    "YANPIdentity": YANPIdentity,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YANPIdentity": "Identity",
}
