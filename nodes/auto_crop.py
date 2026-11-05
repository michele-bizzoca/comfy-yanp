class AutoCrop:
    CATEGORY = "Comfy YANP/Masks"
    FUNCTION = "run"
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    DESCRIPTION = (
        "Crops the image and mask to the smallest rectangle containing positive mask "
        "pixels. Batches share one rectangle. An empty mask keeps the original size."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",), "mask": ("MASK",)}}

    def run(self, image, mask):
        if image.shape[1:3] != mask.shape[1:3]:
            raise ValueError("Auto Crop requires an image and mask of the same width and height.")

        image_count, mask_count = image.shape[0], mask.shape[0]
        if image_count != mask_count and min(image_count, mask_count) != 1:
            raise ValueError("Auto Crop requires matching batch sizes or a single image or mask.")

        foreground = (mask > 0).any(dim=0)
        rows = foreground.any(dim=1).nonzero(as_tuple=True)[0]
        if rows.numel():
            columns = foreground.any(dim=0).nonzero(as_tuple=True)[0]
            top, bottom = rows[[0, -1]].tolist()
            left, right = columns[[0, -1]].tolist()
            image = image[:, top:bottom + 1, left:right + 1, :]
            mask = mask[:, top:bottom + 1, left:right + 1]

        count = max(image_count, mask_count)
        return image.expand(count, -1, -1, -1), mask.expand(count, -1, -1)


NODE_CLASS_MAPPINGS = {"yanp_auto_crop": AutoCrop}
NODE_DISPLAY_NAME_MAPPINGS = {"yanp_auto_crop": "Auto Crop"}
