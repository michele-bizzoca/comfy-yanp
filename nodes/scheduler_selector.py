"""YANP: choose a KSampler scheduler name."""

import comfy.samplers


class SchedulerSelector:
    CATEGORY = "Comfy YANP/Input"
    FUNCTION = "select"
    RETURN_TYPES = (comfy.samplers.KSampler.SCHEDULERS,)
    RETURN_NAMES = ("scheduler",)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"input-scheduler": (comfy.samplers.KSampler.SCHEDULERS,)}}

    def select(self, **kwargs):
        return (kwargs["input-scheduler"],)


NODE_CLASS_MAPPINGS = {"YANP_SchedulerSelector": SchedulerSelector}
NODE_DISPLAY_NAME_MAPPINGS = {"YANP_SchedulerSelector": "Input - Scheduler"}
