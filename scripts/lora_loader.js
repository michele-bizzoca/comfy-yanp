import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Eight polymorphic pairs maximum; retain occupied pairs plus one spare.
const CAPACITY = 8;
const SOCKET = /^io_([1-9]\d*)$/;
const idOf = s => s?._yanpId || Number(SOCKET.exec(s?.name || "")?.[1]) || 0;
const used = (p) => p.input?.link != null || !!p.output?.links?.length;
const typeOf = t => typeof t === "string" ? t.toUpperCase() : "";

app.registerExtension({
    name: "yanp.loraLoader",
    async beforeRegisterNodeDef(Node, definition) {
        if (definition.name !== "YANPLoraLoader") return;
        const proto = Node.prototype;
        const created = proto.onNodeCreated;
        const configured = proto.onConfigure;
        const connectionsChanged = proto.onConnectionsChange;
        const connectInput = proto.onConnectInput;
        const connectOutput = proto.onConnectOutput;
        const serialized = proto.onSerialize;
        const drawForeground = proto.onDrawForeground;

        proto.onNodeCreated = function (...args) {
            const result = created?.apply(this, args);
            // Dynamic widgets are persisted in properties.yanpLoraRows.
            // Never store their positional widgets_values array: added buttons
            // and rows would shift indices and corrupt restored widget values.
            this.serialize_widgets = false;
            this._yanpRows = [];
            this._yanpNames = [];
            this._yanpNamesReady = false;
            this._yanpSerial = 0;
            this._yanpUpdating = false;
            this._yanpScheduled = false;
            this._yanpConfiguring = false;
            this._yanpWasConfigured = false;
            this._yanpInitialLayoutDone = false;
            this._yanpSavedLabels = null;

            const hide = name => {
                const widget = this.widgets?.find(w => w.name === name);
                if (!widget) return null;
                widget.hidden = true;
                widget.options ??= {};
                widget.options.hidden = true;
                widget.computeSize = () => [0, -4];
                for (const key of ["element", "inputEl"])
                    if (widget[key]?.style) widget[key].style.display = "none";
                return widget;
            };
            const dataWidget = hide("loraData");
            const orderWidget = hide("portOrder");
            const rounded = value => {
                const n = Number(value);
                return Number.isFinite(n) ? Math.round(n * 100) / 100 : 1;
            };
            const state = () => this._yanpRows.map(row => ({
                enabled: !!row.enable.value, name: row.lora.value || "",
                strength_model: rounded(row.model.value),
                strength_clip: rounded(row.clip.value),
            }));
            const sync = () => {
                const data = state();
                if (dataWidget) dataWidget.value = JSON.stringify(data);
                this.properties ??= {};
                this.properties.yanpLoraRows = data;
                this.setDirtyCanvas?.(true, true);
            };
            // Respect the node size chosen by the user. In particular, never
            // reset height during dynamic socket reconciliation: doing so makes
            // manual resizing appear broken (the node snaps back immediately).
            const layout = () => {
                this.setDirtyCanvas?.(true, true);
            };
            const renameRows = () => this._yanpRows.forEach((row, index) => {
                for (const [widget, label] of [
                    [row.enable, "Enable"], [row.lora, "LoRA"],
                    [row.model, "Model Strength"], [row.clip, "CLIP Strength"],
                    [row.remove, "− Remove"],
                ]) widget.label = `${label} ${index + 1}`;
            });
            const addRow = (entry = {}, update = true) => {
                const id = ++this._yanpSerial;
                const row = {};
                row.enable = this.addWidget("toggle", `enable_${id}`,
                    entry.enabled ?? true, sync, { on: "On", off: "Off" });
                row.lora = this.addWidget("combo", `lora_${id}`,
                    entry.name ?? "", sync, { values: () => {
                        const names = this._yanpNames;
                        const selected = row.lora?.value ?? entry.name;
                        return !this._yanpNamesReady && selected && !names.includes(selected)
                            ? [...names, selected] : names;
                    }});
                row.model = this.addWidget("number", `strength_model_${id}`,
                    rounded(entry.strength_model ?? 1), sync,
                    { min: -10, max: 10, step: 0.1, step2: 0.05, precision: 2 });
                row.clip = this.addWidget("number", `strength_clip_${id}`,
                    rounded(entry.strength_clip ?? 1), sync,
                    { min: -10, max: 10, step: 0.1, step2: 0.05, precision: 2 });
                row.remove = this.addWidget("button", `remove_${id}`, null, () => {
                    const widgets = new Set(Object.values(row));
                    this.widgets = this.widgets.filter(w => !widgets.has(w));
                    this._yanpRows = this._yanpRows.filter(r => r !== row);
                    renameRows(); sync(); layout();
                });
                this._yanpRows.push(row);
                renameRows();
                if (update) sync();
                layout();
            };
            this._yanpState = state;
            this._yanpRestore = saved => {
                if (!Array.isArray(saved)) return;
                const old = new Set(this._yanpRows.flatMap(row => Object.values(row)));
                this.widgets = (this.widgets || []).filter(w => !old.has(w));
                this._yanpRows = [];
                for (const entry of saved) addRow(entry, false);
                sync();
            };
            this.addWidget("button", "+ Add LoRA", null, () => addRow());

            // All sockets remain wildcard (*). Only the Python executor
            // identifies actual MODEL/CLIP objects.
            const getPairs = () => {
                const pairs = new Map();
                for (const s of this.inputs || []) {
                    const id = idOf(s);
                    if (id >= 1 && id <= CAPACITY) {
                        if (!pairs.has(id)) pairs.set(id, {});
                        pairs.get(id).input = s;
                    }
                }
                for (const s of this.outputs || []) {
                    const id = idOf(s);
                    if (id >= 1 && id <= CAPACITY) {
                        if (!pairs.has(id)) pairs.set(id, {});
                        pairs.get(id).output = s;
                    }
                }
                return pairs;
            };
            const label = (s, id, side) => {
                // LiteGraph's Rename may change name OR label; the true input
                // key must remain io_N, while its displayed label is editable.
                const key = `io_${id}`;
                const automatic = /^i\/o \d+$/i;
                if (s.name !== key && s.name && !automatic.test(s.name))
                    s._yanpCustom = s.name;
                if (s.label && s.label !== s._yanpShown &&
                    s.label !== key && !automatic.test(s.label))
                    s._yanpCustom = s.label;
                s._yanpCustom ??= this.properties?.yanpPortLabels?.[key]?.[side];
                s._yanpId = id;
                s.name = key;
                s.type = "*";
                s._yanpShown = s._yanpCustom || `I/O ${id}`;
                s.label = s._yanpShown;
            };
            const addPair = id => {
                const key = `io_${id}`;
                this.addInput(key, "*");
                this.addOutput(key, "*");
                label(this.inputs.at(-1), id, "inputs");
                label(this.outputs.at(-1), id, "outputs");
            };
            const reconcile = () => {
                if (this._yanpUpdating || this._yanpConfiguring) return;
                this._yanpUpdating = true;
                try {
                    // Complete any half-pairs, preserving each socket's identity.
                    for (const [id, pair] of getPairs()) {
                        if (!pair.input) this.addInput(`io_${id}`, "*");
                        if (!pair.output) this.addOutput(`io_${id}`, "*");
                    }

                    // Keep every occupied pair and exactly one empty pair.
                    // Deleting a middle pair never changes another pair's io_N.
                    let pairs = getPairs();
                    const empty = [...pairs].filter(([, p]) => !used(p)).map(([id]) => id);
                    const lastId = idOf(this.outputs?.at(-1));
                    const spare = pairs.size && [...pairs.values()].every(p => !used(p))
                        ? [...pairs.keys()][0]
                        : (empty.includes(lastId) ? lastId : null);
                    for (const id of empty.filter(id => id !== spare)) {
                        const pair = pairs.get(id);
                        const inputIndex = this.inputs.indexOf(pair.input);
                        const outputIndex = this.outputs.indexOf(pair.output);
                        if (inputIndex !== -1) this.removeInput(inputIndex);
                        if (outputIndex !== -1) this.removeOutput(outputIndex);
                    }

                    pairs = getPairs();
                    if (!pairs.size || (![...pairs.values()].some(p => !used(p)) && pairs.size < CAPACITY)) {
                        const taken = new Set(pairs.keys());
                        let id = 1;
                        while (taken.has(id)) id++;
                        addPair(id);
                    }

                    // Deleting a slot changes positional LiteGraph indices. Repair
                    // link endpoints explicitly without disconnecting any links.
                    for (const [side, field] of [["inputs", "target_slot"], ["outputs", "origin_slot"]]) {
                        (this[side] || []).forEach((socket, index) => {
                            const links = side === "inputs" ? [socket.link] : (socket.links || []);
                            for (const linkId of links) {
                                if (linkId == null) continue;
                                const link = this.graph?.links?.[linkId];
                                if (!link) continue;
                                if (Array.isArray(link)) link[side === "inputs" ? 4 : 2] = index;
                                else link[field] = index;
                            }
                        });
                    }

                    for (const [id, p] of getPairs()) {
                        if (p.input) label(p.input, id, "inputs");
                        if (p.output) label(p.output, id, "outputs");
                    }
                    if (orderWidget) orderWidget.value = JSON.stringify(
                        this.outputs.filter(idOf).map(s => `io_${idOf(s)}`));
                    if (!this._yanpInitialLayoutDone) {
                        this._yanpInitialLayoutDone = true;
                        if (!this._yanpWasConfigured) this.setSize?.(this.computeSize?.());
                    }
                    layout();
                } finally { this._yanpUpdating = false; }
            };
            this._yanpReconcile = reconcile;
            this._yanpSignature = () => [
                ...(this.inputs || []).map(s => s.link ?? ""),
                ...(this.outputs || []).map(s => (s.links || []).join(",")),
            ].join("|");
            this._yanpSchedule = () => {
                if (this._yanpConfiguring || this._yanpScheduled) return;
                this._yanpScheduled = true;
                setTimeout(() => {
                    this._yanpScheduled = false;
                    if (this._yanpUpdating) return this._yanpSchedule();
                    reconcile();
                    this._yanpLastSignature = this._yanpSignature();
                }, 0);
            };
            this._yanpSchedule();
            api.fetchApi("/yanp/lora_loader/loras")
                .then(r => r.json())
                .then(names => {
                    this._yanpNames = Array.isArray(names) ? names : [];
                    this._yanpNamesReady = true;
                    layout();
                }).catch(() => {});
            return result;
        };

        // Callback fallback when the first socket is connected.
        proto.onConnectInput = function (...args) {
            const result = connectInput?.apply(this, args) ?? true;
            if (result !== false) this._yanpSchedule?.();
            return result;
        };
        proto.onConnectOutput = function (...args) {
            const result = connectOutput?.apply(this, args) ?? true;
            if (result !== false) this._yanpSchedule?.();
            return result;
        };
        proto.onConnectionsChange = function (...args) {
            const result = connectionsChanged?.apply(this, args);
            this._yanpSchedule?.();
            return result;
        };
        // Fallback for ComfyUI versions that omit the first input callback.
        proto.onDrawForeground = function (...args) {
            const result = drawForeground?.apply(this, args);
            if (!this._yanpUpdating && !this._yanpConfiguring &&
                this._yanpSignature?.() !== this._yanpLastSignature)
                this._yanpSchedule?.();
            return result;
        };
        proto.onConfigure = function (info, ...args) {
            this._yanpWasConfigured = true;
            this._yanpConfiguring = true;
            try {
                const result = configured?.call(this, info, ...args);
                if (Array.isArray(info?.properties?.yanpLoraRows))
                    this._yanpRestore?.(info.properties.yanpLoraRows);
                // Preserve persisted custom labels independently for each side.
                this.properties ??= {};
                this.properties.yanpPortLabels = info?.properties?.yanpPortLabels || {};
                return result;
            } finally {
                this._yanpConfiguring = false;
                this._yanpSchedule?.();
            }
        };
        proto.onSerialize = function (data, ...args) {
            this._yanpReconcile?.();
            const result = serialized?.call(this, data, ...args);
            delete data.widgets_values;
            data.properties ??= {};
            data.properties.yanpLoraRows = this._yanpState?.() || [];
            data.properties.yanpPortLabels = {};
            for (const side of ["inputs", "outputs"])
                for (const s of this[side] || []) {
                    const id = idOf(s);
                    if (!id) continue;
                    if (s._yanpCustom)
                        (data.properties.yanpPortLabels[`io_${id}`] ??= {})[side] = s._yanpCustom;
                }
            return result;
        };
    },
    setup() {
        const originalQueue = app.queuePrompt.bind(app);
        app.queuePrompt = async (...args) => {
            validateConnections();
            return originalQueue(...args);
        };
    },
});

// Graph-level check immediately before execution (no socket type changes).
function validateConnections() {
        const graph = app.graph;
        for (const node of graph?._nodes || []) {
            if (node.type !== "YANPLoraLoader") continue;
            const inputs = new Map((node.inputs || []).map(s => [idOf(s), s]));
            for (const out of node.outputs || []) {
                const id = idOf(out);
                if (!id) continue;
                const input = inputs.get(id);
                const link = graph.links?.[input?.link];
                const origin = graph.getNodeById?.(link?.origin_id);
                const source = origin?.outputs?.[link?.origin_slot];
                const incoming = typeOf(source?.type);
                if (incoming && incoming !== "*" && incoming !== "MODEL" && incoming !== "CLIP")
                    throw new Error(`LoRA Loader: I/O ${id} expects MODEL or CLIP, got ${incoming}`);
                for (const linkId of out.links || []) {
                    const edge = graph.links?.[linkId];
                    const target = graph.getNodeById?.(edge?.target_id);
                    const expected = typeOf(target?.inputs?.[edge?.target_slot]?.type);
                    if (incoming && incoming !== "*" && expected && expected !== "*" && incoming !== expected)
                        throw new Error(`LoRA Loader: I/O ${id} ${incoming} connected to ${expected}`);
                }
            }
        }
}
