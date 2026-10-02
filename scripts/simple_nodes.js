import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "yanp.simple_nodes.ui",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPIdentity" && nodeData.name !== "YANPSimpleSwitch") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            if (nodeData.name === "YANPIdentity") {
                const current = this.size || [140, 60];
                this.setSize?.([200, 60]);
            }

            if (nodeData.name === "YANPSimpleSwitch") {
                const current = this.size || [140, 60];
                this.setSize?.([200, 60]);

                // Force the visible toggle labels to On / Off even on frontend
                // versions that ignore backend label_on / label_off casing.
                const connected = this.widgets?.find(w => w.name === "Connected");
                if (connected) {
                    connected.options = connected.options || {};
                    connected.options.on = "On";
                    connected.options.off = "Off";
                }
            }

            return r;
        };
    },
});
