import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "yanp.smart_seed.ui",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPSmartSeed") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onExecuted = nodeType.prototype.onExecuted;

        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            const seedWidget = this.widgets?.find(
                widget => widget.name === "Seed"
            );

            if (seedWidget) {
                // Preview only: do not persist this display value into the
                // workflow. It will be repopulated after execution.
                seedWidget.serialize = false;
                seedWidget.options ??= {};
                seedWidget.options.serialize = false;
            }

            this.setSize?.([250, 60]);

            return result;
        };

        nodeType.prototype.onExecuted = function (message) {
            const result = onExecuted?.apply(this, arguments);

            const seedWidget = this.widgets?.find(
                widget => widget.name === "Seed"
            );

            if (!seedWidget) return result;

            // Standard ComfyUI UI-output shape:
            // {"ui": {"text": ("123",)}} -> message.text == ["123"]
            let value = message?.text;

            if (Array.isArray(value)) {
                value = value[0];
            }

            // Fallback for unusual wrappers while keeping the standard path
            // above as the primary one.
            if (value === undefined || value === null) {
                value = message?.seed;
                if (Array.isArray(value)) value = value[0];
            }

            if (value !== undefined && value !== null) {
                seedWidget.value = String(value);

                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            }

            return result;
        };
    },
});
