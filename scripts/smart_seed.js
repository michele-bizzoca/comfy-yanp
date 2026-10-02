import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "yanp.smart_seed.ui",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPSmartSeed") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onExecuted = nodeType.prototype.onExecuted;

        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            this._yanpSeedPreview = "—";
            this.setSize?.([200, 60]);

            return r;
        };

        nodeType.prototype.onExecuted = function (message) {
            const r = onExecuted?.apply(this, arguments);

            const value = message?.seed?.[0];

            if (value !== undefined) {
                this._yanpSeedPreview = String(value);
                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            }

            return r;
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;

        nodeType.prototype.onDrawForeground = function (ctx) {
            onDrawForeground?.apply(this, arguments);

            if (this.flags?.collapsed) return;

            ctx.save();
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const y = this.size[1] - 10;
            ctx.fillText(
                this._yanpSeedPreview ?? "—",
                this.size[0] / 2,
                y
            );

            ctx.restore();
        };
    },
});
