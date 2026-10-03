import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "yanp.simple_latch.ui",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPMemoryLatch") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            const current = this.size || [200, 60];
            this.setSize?.([200, 60]);

            return r;
        };
    },
});
