"""YANP: choose a KSampler sampler name."""

import comfy.samplers


class SamplerSelector:
    CATEGORY = "YANP/input"
    FUNCTION = "select"
    RETURN_TYPES = (comfy.samplers.KSampler.SAMPLERS,)
    RETURN_NAMES = ("sampler_name",)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"input-sampler": (comfy.samplers.KSampler.SAMPLERS,)}}

    def select(self, **kwargs):
        return (kwargs["input-sampler"],)


NODE_CLASS_MAPPINGS = {"YANP_SamplerSelector": SamplerSelector}
NODE_DISPLAY_NAME_MAPPINGS = {"YANP_SamplerSelector": "Input - Sampler"}
