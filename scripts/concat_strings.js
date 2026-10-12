import { app } from "/scripts/app.js";

const PREFIX = "string_";
const isStringSocket = (input) => /^string_\d+$/.test(input.name);

app.registerExtension({
    name: "YANP.StringConcatenate.DynamicInputs",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPStringConcatenate") return;

        const previous = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (...args) {
            const result = previous?.apply(this, args);
            if (args[0] !== 1 || this._yanpUpdatingInputs) return result;

            this._yanpUpdatingInputs = true;
            try {
                let sockets = this.inputs.filter(isStringSocket);
                // Keep one free input after the last connected input, if possible.
                while (sockets.length > 2 && !sockets.at(-1).link && !sockets.at(-2).link) {
                    const index = this.inputs.indexOf(sockets.at(-1));
                    this.removeInput(index);
                    sockets = this.inputs.filter(isStringSocket);
                }
                if (sockets.at(-1)?.link != null) {
                    const largest = Math.max(...sockets.map((s) => Number(s.name.slice(PREFIX.length))));
                    this.addInput(`${PREFIX}${largest + 1}`, "STRING");
                }
                this.setSize(this.computeSize());
            } finally {
                this._yanpUpdatingInputs = false;
            }
            return result;
        };
    },
});
