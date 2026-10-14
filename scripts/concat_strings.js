import { app } from "../../scripts/app.js";

const MAX_STRINGS = 8;
const MIN_STRINGS = 1;
const PREFIX = "string_";

app.registerExtension({
    name: "yanp.concatStrings.dynamicInputs",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPStringConcatenate") return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        const originalConfigure = nodeType.prototype.onConfigure;
        const originalConnectionsChange = nodeType.prototype.onConnectionsChange;

        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            this._yanpConcatBusy = false;
            this._yanpConcatQueued = false;

            const isStringPort = port => /^string_[1-8]$/.test(port?.name ?? "") && port.type === "STRING";
            const slotIndex = name => (this.inputs || []).findIndex(port => port.name === name && port.type === "STRING");

            this._yanpConcatUpdate = () => {
                if (this._yanpConcatBusy || !this.inputs) return;
                this._yanpConcatBusy = true;
                try {
                    // Only touch the sockets owned by this node; never touch
                    // the separator widget (even when converted to an input).
                    const current = this.inputs.filter(isStringPort);
                    const connected = current.filter(port => port.link != null);
                    const unconnected = current.filter(port => port.link == null);
                    const ordered = [...connected, ...unconnected];
                    const indices = [];
                    this.inputs.forEach((port, index) => {
                        if (isStringPort(port)) indices.push(index);
                    });

                    // Move the socket objects, not their links, to preserve
                    // connections. Keep the links' target_slot in sync.
                    indices.forEach((index, i) => { this.inputs[index] = ordered[i]; });
                    indices.forEach(index => {
                        const port = this.inputs[index];
                        if (port.link == null) return;
                        const link = this.graph?.links?.[port.link];
                        if (!link) return;
                        if (Array.isArray(link)) link[4] = index;
                        else link.target_slot = index;
                    });
                    ordered.forEach((port, i) => { port.name = `${PREFIX}${i + 1}`; });

                    // One empty trailing socket, with two minimum slots. A
                    // fully connected 8-port node has no spare socket.
                    const wanted = Math.min(MAX_STRINGS, Math.max(MIN_STRINGS, connected.length + 1));
                    for (let i = MAX_STRINGS; i > wanted; --i) {
                        const index = slotIndex(`${PREFIX}${i}`);
                        if (index >= 0 && this.inputs[index].link == null) this.removeInput(index);
                    }
                    for (let i = 1; i <= wanted; ++i) {
                        if (slotIndex(`${PREFIX}${i}`) < 0) this.addInput(`${PREFIX}${i}`, "STRING");
                    }

                    const [width, height] = this.computeSize();
                    this.setSize([Math.max(210, this.size?.[0] ?? width), height]);
                    this.setDirtyCanvas?.(true, true);
                } finally {
                    this._yanpConcatBusy = false;
                }
            };

            this._yanpConcatScheduleUpdate = () => {
                if (this._yanpConcatQueued) return;
                this._yanpConcatQueued = true;
                // Wait until LiteGraph has actually applied disconnects and
                // workflow restoration has populated all links.
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    this._yanpConcatQueued = false;
                    this._yanpConcatUpdate?.();
                }));
            };
            this._yanpConcatScheduleUpdate();
            return result;
        };

        nodeType.prototype.onConfigure = function () {
            const result = originalConfigure?.apply(this, arguments);
            this._yanpConcatScheduleUpdate?.();
            return result;
        };

        nodeType.prototype.onConnectionsChange = function () {
            const result = originalConnectionsChange?.apply(this, arguments);
            this._yanpConcatScheduleUpdate?.();
            return result;
        };
    },
});
