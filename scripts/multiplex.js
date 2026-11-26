import { app } from "../../scripts/app.js";

const MAX_INPUTS = 16;
const portNumber = port => {
    const match = /^input_(\d+)$/.exec(port?.name ?? "");
    if (!match) return -1;
    const n = Number(match[1]);
    return n < MAX_INPUTS ? n : -1;
};

app.registerExtension({
    name: "yanp.multiplex.dynamicInputs",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPMultiplex") return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        const originalConfigure = nodeType.prototype.onConfigure;
        const originalConnectionsChange = nodeType.prototype.onConnectionsChange;

        function update() {
            if (this._yanpMuxBusy || !this.inputs) return;
            this._yanpMuxBusy = true;
            try {
                // Keep all indices up to the highest connected socket,
                // including holes, plus one spare trailing socket.
                let highest = -1;
                for (const port of this.inputs) {
                    const n = portNumber(port);
                    if (n >= 0 && port.link != null) highest = Math.max(highest, n);
                }
                const wanted = Math.min(MAX_INPUTS, highest + 2);
                let changed = false;
                for (let i = this.inputs.length - 1; i >= 0; --i) {
                    const port = this.inputs[i];
                    if (portNumber(port) >= wanted && port.link == null) {
                        this.removeInput(i);
                        changed = true;
                    }
                }
                for (let n = 0; n < wanted; ++n) {
                    if (!this.inputs.some(port => portNumber(port) === n)) {
                        this.addInput(`input_${n}`, "*");
                        changed = true;
                    }
                }
                if (changed) {
                    const [width, height] = this.computeSize();
                    this.setSize([Math.max(this.size?.[0] ?? width, width), height]);
                    this.setDirtyCanvas?.(true, true);
                }
            } finally {
                this._yanpMuxBusy = false;
            }
        }

        function schedule() {
            if (this._yanpMuxBusy || this._yanpMuxQueued) return;
            this._yanpMuxQueued = true;
            // Defer until LiteGraph has restored/applied the actual links.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                this._yanpMuxQueued = false;
                update.call(this);
            }));
        }

        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            schedule.call(this);
            return result;
        };
        nodeType.prototype.onConfigure = function () {
            const result = originalConfigure?.apply(this, arguments);
            schedule.call(this);
            return result;
        };
        nodeType.prototype.onConnectionsChange = function () {
            const result = originalConnectionsChange?.apply(this, arguments);
            schedule.call(this);
            return result;
        };
    },
});
