import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "yanp.simple_switch.ui",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPSimpleSwitch") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            const current = this.size || [140, 60];
            this.setSize?.([94, current[1]]);

            const connected = this.widgets?.find(w => w.name === "Connected");
            if (connected) {
                connected.options = connected.options || {};
                connected.options.on = "On";
                connected.options.off = "Off";
                connected.options.label_on = "On";
                connected.options.label_off = "Off";
            }

            return r;
        };
    },
});
