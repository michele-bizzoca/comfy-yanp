import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Eight positions of backend capacity, but only occupied I/O pairs plus one
// spare are created in the interface. Each pair carries MODEL or CLIP.
const CAPACITY = 8;
const SOCKET = /^io_([1-9]\d*)$/;
const occupied = (socket, side) => side === "inputs"
    ? socket?.link != null : (socket?.links?.length ?? 0) > 0;
const VALID_TYPES = new Set(["MODEL", "CLIP"]);
const normalized = type => typeof type === "string" ? type.toUpperCase() : "";

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

            // Slots are paired by identity: io_N input <-> io_N output.
            // A row is occupied if either endpoint is connected. Maintain ONE
            // empty row after all occupied rows, up to the eight-row capacity.
            const sides = ["inputs", "outputs"];
            const sockets = side => this[side] || [];
            // Pair identity is private and independent of the user-visible label.
            // LiteGraph may rename either `label` or `name` depending on the UI.
            const portId = socket => {
                if (Number.isInteger(socket?._yanpId)) return socket._yanpId;
                const match = SOCKET.exec(socket?.name || "");
                return match ? Number(match[1]) : null;
            };
            const isPort = socket => portId(socket) != null;
            const linked = (socket, side) => occupied(socket, side);
            const reconcile = () => {
                if (this._yanpUpdating || this._yanpConfiguring || !this.inputs || !this.outputs) return;
                this._yanpUpdating = true;
                try {
                    // Remove obsolete sockets from the previous MODEL/CLIP loader.
                    // Old saved nodes (or a stale backend schema) can expose
                    // model_1..8 / clip_1..8 alongside the new io_1 socket.
                    // Never disconnect existing links without the user's consent.
                    for (const side of sides) {
                        const array = sockets(side);
                        for (let index = array.length - 1; index >= 0; index--) {
                            const socket = array[index];
                            if (!/^(model|clip)_\d+$/.test(socket?.name || "")) continue;
                            if (linked(socket, side)) continue;
                            if (side === "inputs") this.removeInput(index);
                            else this.removeOutput(index);
                        }
                    }
                    // Preserve the identity, name, label, and slot index of ALL
                    // existing ports. Only newly allocated ports receive a name.
                    const pairs = new Map();
                    for (const side of sides) {
                        for (const socket of sockets(side)) {
                            const id = portId(socket);
                            if (id == null || id < 1 || id > CAPACITY) continue;
                            socket._yanpId = id;
                            // LiteGraph's Rename action may edit `name` instead of
                            // `label`. Keep the user's text as the visible label,
                            // but keep io_N as the backend input key. In particular
                            // io_1 on the LEFT must remain executable after rename.
                            const canonical = `io_${id}`;
                            if (socket.name !== canonical) {
                                if (socket.name && socket.name !== socket._yanpInternalName &&
                                    !/^i\/o \d+$/i.test(socket.name))
                                    socket._yanpCustomLabel = socket.name;
                                socket.name = canonical;
                            }
                            if (socket.label != null &&
                                socket.label !== socket._yanpAutoLabel &&
                                socket.label !== socket._yanpCustomLabel &&
                                socket.label !== canonical &&
                                !/^((I\/O|model|clip) \d+)$/i.test(socket.label))
                                socket._yanpCustomLabel = socket.label;
                            const saved = this._yanpSavedLabels?.[canonical]?.[side];
                            if (!socket._yanpCustomLabel && saved)
                                socket._yanpCustomLabel = saved;
                            // Always enforce the canonical uppercase display label.
                            // LiteGraph may restore an auto-label as lowercase "i/o N".
                            socket._yanpAutoLabel = `I/O ${id}`;
                            socket.label = socket._yanpCustomLabel ?? socket._yanpAutoLabel;
                            socket._yanpInternalName = canonical;
                            if (!pairs.has(id)) pairs.set(id, {});
                            pairs.get(id)[side] = socket;
                        }
                    }
                    const isUsed = pair => sides.some(side => linked(pair[side], side));
                    const removeTail = (side, socket) => {
                        if (!socket) return true;
                        const array = sockets(side);
                        const index = array.indexOf(socket);
                        if (index < 0) return true;
                        // Never delete a socket in the middle: that would shift
                        // LiteGraph slot indices and may break existing links.
                        if (index !== array.length - 1 || linked(socket, side)) return false;
                        if (side === "inputs") this.removeInput(index);
                        else this.removeOutput(index);
                        return true;
                    };

                    // Drop only surplus EMPTY pairs at the very end. A free
                    // pair in the middle remains untouched, even after unplugging.
                    // Always retain exactly one free pair if capacity permits.
                    const ordered = () => {
                        const ids = [];
                        for (const socket of [...sockets("outputs"), ...sockets("inputs")]) {
                            const id = portId(socket);
                            if (id != null && pairs.has(id) && !ids.includes(id)) ids.push(id);
                        }
                        return ids;
                    };
                    let ids = ordered();
                    while (ids.length > 1) {
                        const last = pairs.get(ids.at(-1));
                        if (isUsed(last)) break;
                        const anyOtherSpare = ids.slice(0, -1).some(id => !isUsed(pairs.get(id)));
                        if (!anyOtherSpare) break;
                        // Only remove the last actual socket on EACH side.
                        if (sides.some(side => last[side] &&
                            sockets(side).indexOf(last[side]) !== sockets(side).length - 1)) break;
                        for (const side of sides) removeTail(side, last[side]);
                        pairs.delete(ids.at(-1));
                        ids = ordered();
                    }

                    // Complete a missing endpoint without touching the existing
                    // endpoint's name or its position in the corresponding array.
                    const addEndpoint = (id, side) => {
                        const name = `io_${id}`;
                        if (side === "inputs") this.addInput(name, "*");
                        else this.addOutput(name, "*");
                        const socket = sockets(side).at(-1);
                        socket._yanpId = id;
                        socket._yanpCustomLabel = this._yanpSavedLabels?.[name]?.[side] ?? null;
                        socket.label = socket._yanpCustomLabel ?? `I/O ${id}`;
                        socket._yanpAutoLabel = `I/O ${id}`;
                        socket._yanpInternalName = name;
                        return socket;
                    };
                    for (const id of ids) {
                        const pair = pairs.get(id);
                        for (const side of sides)
                            if (!pair[side]) pair[side] = addEndpoint(id, side);
                    }

                    // If every existing pair is occupied, append one new pair.
                    // Its number is the smallest currently available, not a
                    // renumbering of previously created ports.
                    if (ids.length < CAPACITY && ids.every(id => isUsed(pairs.get(id)))) {
                        let id = 1;
                        while (pairs.has(id)) id++;
                        if (id <= CAPACITY) {
                            pairs.set(id, {
                                inputs: addEndpoint(id, "inputs"),
                                outputs: addEndpoint(id, "outputs"),
                            });
                        }
                    }
                    // Outputs are bound by position in Python, so communicate
                    // exactly their current order without sorting/reindexing.
                    if (orderWidget) orderWidget.value = JSON.stringify(
                        sockets("outputs").filter(isPort).map(s => `io_${portId(s)}`));
                    if (!this._yanpInitialLayoutDone) {
                        this._yanpInitialLayoutDone = true;
                        if (!this._yanpWasConfigured) {
                            const minimum = this.computeSize?.();
                            if (Array.isArray(minimum) && minimum.every(Number.isFinite))
                                this.setSize?.(minimum);
                        }
                    }
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
            // The backend declares a virtual capacity, but UI removes unused sockets
            // once node creation/configuration has completed.
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

        // A free wildcard pair must not be rejected by hooks inherited from
        // ComfyUI or earlier extension code.  LiteGraph checks normal socket
        // compatibility itself; we only reject known MODEL/CLIP conflicts.
        // Crucially, callbacks are called BEFORE the link exists.
        proto.onConnectInput = function (slot, outputType, ...rest) {
            const socket = this.inputs?.[slot];
            const id = socket?._yanpId ?? (SOCKET.exec(socket?.name || "")?.[1] | 0);
            if (!id) return connectInput?.call(this, slot, outputType, ...rest) ?? true;
            const incoming = normalized(outputType);
            if (incoming && incoming !== "*" && !VALID_TYPES.has(incoming)) return false;
            const other = this.outputs?.find(s => (s._yanpId ?? Number(SOCKET.exec(s.name || "")?.[1])) === id);
            if (VALID_TYPES.has(incoming) && other?.links?.length &&
                VALID_TYPES.has(normalized(other.type)) && normalized(other.type) !== incoming)
                return false;
            return true;
        };
        proto.onConnectOutput = function (slot, inputType, ...rest) {
            const socket = this.outputs?.[slot];
            const id = socket?._yanpId ?? (SOCKET.exec(socket?.name || "")?.[1] | 0);
            if (!id) return connectOutput?.call(this, slot, inputType, ...rest) ?? true;
            const requested = normalized(inputType);
            if (requested && requested !== "*" && !VALID_TYPES.has(requested)) return false;
            const other = this.inputs?.find(s => (s._yanpId ?? Number(SOCKET.exec(s.name || "")?.[1])) === id);
            if (VALID_TYPES.has(requested) && other?.link != null &&
                VALID_TYPES.has(normalized(other.type)) && normalized(other.type) !== requested)
                return false;
            return true;
        };
        proto.onConnectionsChange = function (...args) {
            const result = connectionsChanged?.apply(this, args);
            this._yanpSchedule?.();
            return result;
        };
        proto.onConfigure = function (info, ...rest) {
            this._yanpWasConfigured = true;
            this._yanpConfiguring = true;
            try {
                const result = configured?.call(this, info, ...rest);
                const rows = info?.properties?.yanpLoraRows;
                if (Array.isArray(rows)) this._yanpRestore?.(rows);
                this._yanpSavedLabels = info?.properties?.yanpPortLabels || null;
                // Some LiteGraph versions preserve a rename in `name` instead
                // of `label`. Capture it before the next canonicalization.
                for (const side of ["inputs", "outputs"])
                    for (const socket of this[side] || []) {
                        const id = socket._yanpId ?? Number(SOCKET.exec(socket.name || "")?.[1]);
                        if (!id || id > CAPACITY) continue;
                        const value = socket.label && socket.label !== socket.name ? socket.label
                            : (socket.name !== `io_${id}` ? socket.name : null);
                        if (value && !/^((I\/O|model|clip) \d+)$/i.test(value)) {
                            this._yanpSavedLabels ??= {};
                            (this._yanpSavedLabels[`io_${id}`] ??= {})[side] = value;
                        }
                    }
                return result;
            } finally {
                this._yanpConfiguring = false;
                this._yanpSchedule?.();
            }
        };
        proto.onSerialize = function (data, ...rest) {
            this._yanpReconcile?.();
            const result = serialized?.call(this, data, ...rest);
            // Strip any inherited positional widget serialization.
            // The complete editable row state is stored below by name.
            delete data.widgets_values;
            data.properties ??= {};
            data.properties.yanpLoraRows = this._yanpState?.() ?? [];
            data.properties.yanpPortLabels = {};
            for (const side of ["inputs", "outputs"])
                for (const socket of this[side] || []) {
                    const id = socket._yanpId ?? Number(SOCKET.exec(socket.name || "")?.[1]);
                    if (!id || id > CAPACITY) continue;
                    const key = `io_${id}`;
                    const custom = socket._yanpCustomLabel ??
                        (socket.label && socket.label !== socket._yanpAutoLabel &&
                         socket.label !== socket.name ? socket.label : null);
                    if (custom)
                        (data.properties.yanpPortLabels[key] ??= {})[side] = custom;
                }
            return result;
        };
    },
});
