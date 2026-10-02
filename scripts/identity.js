import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "yanp.identity.ui",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPIdentity") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            const current = this.size || [140, 60];
            this.setSize?.([Math.max(current[0], 170), current[1]]);

            return r;
        };
    },
});
