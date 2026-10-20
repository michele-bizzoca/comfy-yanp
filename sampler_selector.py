"""YANP: choose a KSampler sampler name."""

import comfy.samplers


class SamplerSelector:
    CATEGORY = "YANP/sampling"
    FUNCTION = "select"
    RETURN_TYPES = (comfy.samplers.KSampler.SAMPLERS,)
    RETURN_NAMES = ("sampler_name",)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"sampler_name": (comfy.samplers.KSampler.SAMPLERS,)}}

    def select(self, sampler_name):
        return (sampler_name,)


NODE_CLASS_MAPPINGS = {"YANP_SamplerSelector": SamplerSelector}
NODE_DISPLAY_NAME_MAPPINGS = {"YANP_SamplerSelector": "Sampler Selector (YANP)"}
