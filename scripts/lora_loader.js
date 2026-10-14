import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const LIMIT = 8;
const TYPES = ["model", "clip"];
const SOCKET = /^(model|clip)_([1-8])$/;
const slotType = name => SOCKET.exec(name)?.[1] ?? null;
// LiteGraph uses * (and sometimes an empty type) for wildcard sockets.
// Wildcards are compatible with both banks, but MODEL and CLIP are not
// interchangeable with each other.
const compatible = (peerType, ourType) => {
    if (peerType == null || peerType === "" || peerType === "*" || peerType === "ANY") return true;
    if (Array.isArray(peerType)) return peerType.some(type => compatible(type, ourType));
    return peerType === ourType;
};
const occupied = (socket, side) => side === "inputs"
    ? socket?.link != null : (socket?.links?.length ?? 0) > 0;

app.registerExtension({
    name: "yanp.loraLoader",
    async beforeRegisterNodeDef(Node, definition) {
        if (definition.name !== "YANPLoraLoader") return;
        const proto = Node.prototype;
        const created = proto.onNodeCreated;
        const configured = proto.onConfigure;
        const connectionsChanged = proto.onConnectionsChange;
        const serialized = proto.onSerialize;
        const connectInput = proto.onConnectInput;
        const connectOutput = proto.onConnectOutput;

        proto.onNodeCreated = function (...args) {
            const result = created?.apply(this, args);
            this._yanpRows = [];
            this._yanpNames = [];
            this._yanpNamesReady = false;
            this._yanpSerial = 0;
            this._yanpUpdating = false;
            this._yanpScheduled = false;
            this._yanpConfiguring = false;

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

            // Paired sockets are managed per bank. A pair is occupied if EITHER
            // its input or its output has a connection. One free pair is retained.
            // Reuse existing socket OBJECTS; never recreate a connected socket.
            const sockets = side => this[side] || [];
            const get = (side, name) => sockets(side).find(s => s.name === name);
            const addPair = (kind, number) => {
                const name = `${kind}_${number}`;
                if (!get("inputs", name)) this.addInput(name, kind.toUpperCase());
                if (!get("outputs", name)) this.addOutput(name, kind.toUpperCase());
            };
            const refreshLinks = side => {
                sockets(side).forEach((socket, index) => {
                    const ids = side === "inputs"
                        ? (socket.link == null ? [] : [socket.link]) : (socket.links || []);
                    for (const id of ids) {
                        const link = this.graph?.links?.[id];
                        if (!link) continue;
                        if (Array.isArray(link)) link[side === "inputs" ? 4 : 2] = index;
                        else link[side === "inputs" ? "target_slot" : "origin_slot"] = index;
                    }
                });
            };
            const removeSocket = (side, socket) => {
                const index = sockets(side).indexOf(socket);
                if (index < 0) return;
                // Called ONLY on an unconnected socket.
                if (side === "inputs") this.removeInput(index);
                else this.removeOutput(index);
            };
            const repairTypes = () => {
                for (const side of ["inputs", "outputs"])
                    for (const socket of sockets(side)) {
                        const kind = slotType(socket.name);
                        if (!kind) continue;
                        // Dynamic/wildcard peers may temporarily overwrite a
                        // socket type. The bank identity ALWAYS wins.
                        socket.type = kind.toUpperCase();
                    }
            };

            const reconcile = () => {
                if (this._yanpUpdating || this._yanpConfiguring || !this.inputs || !this.outputs) return;
                this._yanpUpdating = true;
                try {
                    repairTypes();
                    for (const kind of TYPES) {
                        // Gather existing pairs by their ORIGINAL numeric identity.
                        const pairs = new Map();
                        for (const side of ["inputs", "outputs"]) {
                            for (const socket of sockets(side)) {
                                const match = SOCKET.exec(socket.name);
                                if (!match || match[1] !== kind) continue;
                                const number = +match[2];
                                if (!pairs.has(number)) pairs.set(number, {});
                                pairs.get(number)[side] = socket;
                            }
                        }
                        // Split into connected pairs and completely vacant pairs.
                        const ordered = [...pairs.keys()].sort((a, b) => a - b);
                        const used = ordered.filter(n =>
                            occupied(pairs.get(n).inputs, "inputs") ||
                            occupied(pairs.get(n).outputs, "outputs"));
                        const free = ordered.filter(n => !used.includes(n));
                        const keep = used.map(n => pairs.get(n));
                        if (used.length < LIMIT) keep.push(free.length ? pairs.get(free[0]) : {});
                        const keepSet = new Set(keep);
                        for (const pair of pairs.values()) {
                            if (keepSet.has(pair)) continue;
                            // Remove only fully unlinked pairs.
                            removeSocket("inputs", pair.inputs);
                            removeSocket("outputs", pair.outputs);
                        }
                        // Rename atomically using temporary names to avoid collisions.
                        for (const [index, pair] of keep.entries())
                            for (const side of ["inputs", "outputs"])
                                if (pair[side]) pair[side].name = `__yanp_${kind}_${side}_${index}`;
                        for (const [index, pair] of keep.entries()) {
                            const name = `${kind}_${index + 1}`;
                            if (pair.inputs) pair.inputs.name = name;
                            else this.addInput(name, kind.toUpperCase());
                            if (pair.outputs) pair.outputs.name = name;
                            else this.addOutput(name, kind.toUpperCase());
                        }
                        // When the bank was absent it still needs pair #1.
                        if (!keep.length) addPair(kind, 1);
                    }
                    // Canonical ordering on BOTH sides, preserving link IDs.
                    for (const side of ["inputs", "outputs"]) {
                        const array = sockets(side);
                        const ports = array.filter(s => slotType(s.name));
                        const other = array.filter(s => !slotType(s.name));
                        ports.sort((a, b) => {
                            const x = SOCKET.exec(a.name), y = SOCKET.exec(b.name);
                            return x[1] === y[1] ? +x[2] - +y[2] : x[1] === "model" ? -1 : 1;
                        });
                        array.splice(0, array.length, ...ports, ...other);
                        refreshLinks(side);
                    }
                    repairTypes();
                    if (orderWidget) orderWidget.value = JSON.stringify(
                        this.outputs.filter(s => slotType(s.name)).map(s => s.name));
                    layout();
                } finally {
                    this._yanpUpdating = false;
                }
            };
            this._yanpReconcile = reconcile;
            this._yanpSchedule = () => {
                if (this._yanpUpdating || this._yanpConfiguring || this._yanpScheduled) return;
                this._yanpScheduled = true;
                // Connection callbacks can run BEFORE the link is detached.
                // A macrotask observes the committed graph, once per batch.
                setTimeout(() => {
                    this._yanpScheduled = false;
                    reconcile();
                }, 0);
            };
            // On creation, ComfyUI may expose the static 16 outputs; reduce
            // them only after the node and graph have finished initializing.
            this._yanpSchedule();
            api.fetchApi("/yanp/lora_loader/loras")
                .then(response => response.json())
                .then(names => {
                    this._yanpNames = Array.isArray(names) ? names : [];
                    this._yanpNamesReady = true;
                    this.setDirtyCanvas?.(true, true);
                })
                .catch(() => { this._yanpNames = []; });
            return result;
        };

        // Preserve LiteGraph polymorphism: wildcard sockets accept MODEL or
        // CLIP. Only reject an explicit MODEL <-> CLIP mismatch. Never infer
        // our port's type from its peer; the port name is authoritative.
        proto.onConnectInput = function (slot, outputType, ...rest) {
            const socket = this.inputs?.[slot];
            const kind = slotType(socket?.name);
            if (kind) {
                socket.type = kind.toUpperCase();
                if (!compatible(outputType, socket.type)) return false;
            }
            const allowed = connectInput?.call(this, slot, outputType, ...rest) ?? true;
            if (kind) socket.type = kind.toUpperCase();
            return allowed;
        };
        proto.onConnectOutput = function (slot, inputType, ...rest) {
            const socket = this.outputs?.[slot];
            const kind = slotType(socket?.name);
            if (kind) {
                socket.type = kind.toUpperCase();
                if (!compatible(inputType, socket.type)) return false;
            }
            const allowed = connectOutput?.call(this, slot, inputType, ...rest) ?? true;
            if (kind) socket.type = kind.toUpperCase();
            return allowed;
        };
        proto.onConnectionsChange = function (...args) {
            const result = connectionsChanged?.apply(this, args);
            // Reassert port identities after dynamic peers have updated types.
            for (const side of ["inputs", "outputs"])
                for (const socket of this[side] || []) {
                    const kind = slotType(socket.name);
                    if (kind) socket.type = kind.toUpperCase();
                }
            this._yanpSchedule?.();
            return result;
        };
        proto.onConfigure = function (info, ...rest) {
            this._yanpConfiguring = true;
            try {
                const result = configured?.call(this, info, ...rest);
                const rows = info?.properties?.yanpLoraRows;
                if (Array.isArray(rows)) this._yanpRestore?.(rows);
                return result;
            } finally {
                this._yanpConfiguring = false;
                this._yanpSchedule?.();
            }
        };
        proto.onSerialize = function (data, ...rest) {
            this._yanpReconcile?.();
            const result = serialized?.call(this, data, ...rest);
            data.properties ??= {};
            data.properties.yanpLoraRows = this._yanpState?.() ?? [];
            return result;
        };
    },
});
