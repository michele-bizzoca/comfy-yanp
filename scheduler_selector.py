"""YANP: choose a KSampler scheduler name."""

import comfy.samplers


class SchedulerSelector:
    CATEGORY = "YANP/sampling"
    FUNCTION = "select"
    RETURN_TYPES = (comfy.samplers.KSampler.SCHEDULERS,)
    RETURN_NAMES = ("scheduler",)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"scheduler": (comfy.samplers.KSampler.SCHEDULERS,)}}

    def select(self, scheduler):
        return (scheduler,)


NODE_CLASS_MAPPINGS = {"YANP_SchedulerSelector": SchedulerSelector}
NODE_DISPLAY_NAME_MAPPINGS = {"YANP_SchedulerSelector": "Scheduler Selector (YANP)"}
