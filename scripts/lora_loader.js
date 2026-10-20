import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Same socket lifecycle as YANP Embedding Loader: consecutive pairs,
// one free pair after the last occupied pair, eight pairs maximum.
const MAX = 8;
const key = n => `io_${n}`;
const number = socket => socket?._yanpPortId || Number(/^io_([1-8])$/.exec(socket?.name || "")?.[1]) || 0;

app.registerExtension({
    name: "yanp.loraLoader",
    async beforeRegisterNodeDef(Node, definition) {
        if (definition.name !== "YANPLoraLoader") return;
        const proto = Node.prototype;
        const original = {
            created: proto.onNodeCreated,
            configured: proto.onConfigure,
            serialized: proto.onSerialize,
            connection: proto.onConnectionsChange,
            draw: proto.onDrawForeground,
        };

        proto.onNodeCreated = function (...args) {
            const result = original.created?.apply(this, args);
            this.serialize_widgets = false;
            this._yanpRows = [];
            this._yanpRowSerial = 0;
            this._yanpLoraNames = [];
            this._yanpPairCount = 1;
            this._yanpRestoring = false;
            this._yanpScheduled = false;

            const hide = name => {
                const widget = this.widgets?.find(w => w.name === name);
                if (!widget) return null;
                widget.hidden = true;
                widget.options ??= {};
                widget.options.hidden = true;
                widget.computeSize = () => [0, -4];
                for (const prop of ["element", "inputEl"])
                    if (widget[prop]?.style) widget[prop].style.display = "none";
                return widget;
            };
            const dataWidget = hide("loraData");
            hide("portOrder"); // Legacy backend field, no longer needed for fixed positions.

            const dirty = () => {
                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            };
            const fit = () => {
                const min = this.computeSize?.();
                if (min && this.size)
                    this.setSize?.([Math.max(this.size[0], min[0]), Math.max(this.size[1], min[1])]);
                dirty();
            };

            // Each socket has a permanent numeric identity. LiteGraph may use
            // socket.name for Rename; restore the backend key and keep the edit
            // as the visible label instead. No socket indices are ever sorted.
            const recognize = (socket, n, side) => {
                if (!socket) return;
                socket._yanpPortId = n;
                const canonical = key(n);
                const defaultLabel = `I/O ${n}`;
                const saved = this.properties?.yanpLoraLabels?.[canonical]?.[side];
                if (socket.name !== canonical && socket.name) {
                    socket.label = socket.name;
                } else if (!socket.label || socket.label === canonical ||
                           socket.label.toLowerCase() === defaultLabel.toLowerCase()) {
                    socket.label = saved || defaultLabel;
                }
                socket.name = canonical;
                socket.type = "*";
            };
            const indexOf = (side, n) => (this[side] || []).findIndex(s => number(s) === n);
            const get = (side, n) => (this[side] || []).find(s => number(s) === n);
            const connected = n => get("inputs", n)?.link != null || !!get("outputs", n)?.links?.length;

            // Identical to Embedding Loader's updatePairCount: only trim the
            // trailing sockets, never move or renumber a connected slot.
            const setPairs = count => {
                count = Math.max(1, Math.min(MAX, Math.trunc(count) || 1));
                for (let n = MAX; n > count; --n) {
                    let i = indexOf("inputs", n);
                    if (i >= 0 && !connected(n)) this.removeInput(i);
                    i = indexOf("outputs", n);
                    if (i >= 0 && !connected(n)) this.removeOutput(i);
                }
                for (let n = 1; n <= count; ++n) {
                    // The first pair is normally declared by Python, but use
                    // the same code path as every other pair if it is absent.
                    if (indexOf("inputs", n) < 0) this.addInput(key(n), "*");
                    if (indexOf("outputs", n) < 0) this.addOutput(key(n), "*");
                    recognize(get("inputs", n), n, "inputs");
                    recognize(get("outputs", n), n, "outputs");
                }
                this._yanpPairCount = count;
                (this.properties ??= {}).yanpLoraPairCount = count;
                fit();
            };
            const refresh = () => {
                if (this._yanpRestoring) return;
                // First observe every existing connection, THEN delete unused
                // trailing pairs. This matters during workflow restoration.
                let highest = 0;
                for (let n = 1; n <= MAX; ++n)
                    if (connected(n)) highest = n;
                setPairs(Math.min(MAX, highest + 1));
            };
            this._yanpSetPairs = setPairs;
            this._yanpRefresh = refresh;
            this._yanpSchedule = () => {
                if (this._yanpRestoring || this._yanpScheduled) return;
                this._yanpScheduled = true;
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    this._yanpScheduled = false;
                    refresh();
                }));
            };

            // The Embedding Loader's initial cleanup, preserving pair 1.
            for (let n = MAX; n > 1; --n) {
                let i = indexOf("inputs", n);
                if (i >= 0) this.removeInput(i);
                i = indexOf("outputs", n);
                if (i >= 0) this.removeOutput(i);
            }
            setPairs(1);

            const round = value => {
                const n = Number(value);
                return Number.isFinite(n) ? Math.round(n * 100) / 100 : 1;
            };
            const state = () => this._yanpRows.map(r => ({
                enabled: !!r.enable.value,
                name: r.lora.value || "",
                strength_model: round(r.model.value),
                strength_clip: round(r.clip.value),
            }));
            const sync = () => {
                const value = state();
                if (dataWidget) dataWidget.value = JSON.stringify(value);
                (this.properties ??= {}).yanpLoraRows = value;
                dirty();
            };
            const labels = () => {
                this._yanpRows.forEach((r, i) => {
                    for (const [widget, title] of [
                        [r.enable, "Enable"], [r.lora, "LoRA"],
                        [r.model, "Model Strength"], [r.clip, "CLIP Strength"],
                        [r.remove, "− Remove"],
                    ]) widget.label = `${title} ${i + 1}`;
                });
                dirty();
            };
            const addRow = (saved = {}, save = true) => {
                const serial = ++this._yanpRowSerial;
                const r = {};
                const name = part => `yanpLora_${serial}_${part}`;
                r.enable = this.addWidget("toggle", name("enable"), saved.enabled ?? true, sync);
                r.lora = this.addWidget("combo", name("lora"), saved.name ?? "", sync,
                    { values: () => [...new Set([...this._yanpLoraNames, r.lora?.value].filter(Boolean))] });
                r.model = this.addWidget("number", name("model"), round(saved.strength_model ?? 1), sync,
                    { min: -10, max: 10, step: 0.1, step2: 0.05, precision: 2 });
                r.clip = this.addWidget("number", name("clip"), round(saved.strength_clip ?? 1), sync,
                    { min: -10, max: 10, step: 0.1, step2: 0.05, precision: 2 });
                r.remove = this.addWidget("button", name("remove"), null, () => {
                    const gone = new Set(Object.values(r));
                    this.widgets = this.widgets.filter(w => !gone.has(w));
                    this._yanpRows = this._yanpRows.filter(item => item !== r);
                    labels();
                    sync();
                });
                for (const w of Object.values(r)) (w.options ??= {}).serialize = false;
                this._yanpRows.push(r);
                labels();
                if (save) sync();
            };
            this._yanpGetRows = state;
            this._yanpRestoreRows = values => {
                const old = new Set(this._yanpRows.flatMap(r => Object.values(r)));
                this.widgets = (this.widgets || []).filter(w => !old.has(w));
                this._yanpRows = [];
                for (const row of values) addRow(row, false);
                sync();
            };
            const button = this.addWidget("button", "+ Add LoRA", null, () => addRow());
            (button.options ??= {}).serialize = false;

            // Capture renames on either side, including the *first* input,
            // independently of the connection lifecycle.
            this._yanpCaptureLabels = () => {
                for (let n = 1; n <= MAX; ++n)
                    for (const side of ["inputs", "outputs"])
                        if (get(side, n)) recognize(get(side, n), n, side);
            };
            this._yanpCaptureLabels();
            api.fetchApi("/yanp/lora_loader/loras")
                .then(r => r.json()).then(names => {
                    this._yanpLoraNames = Array.isArray(names) ? names : [];
                    dirty();
                }).catch(() => {});
            return result;
        };

        proto.onConnectionsChange = function (...args) {
            const result = original.connection?.apply(this, args);
            this._yanpSchedule?.();
            return result;
        };
        proto.onDrawForeground = function (...args) {
            const result = original.draw?.apply(this, args);
            this._yanpCaptureLabels?.();
            return result;
        };
        proto.onConfigure = function (info, ...rest) {
            const rows = info?.properties?.yanpLoraRows;
            const snapshot = Array.isArray(rows) ? rows.map(r => ({ ...r })) : null;
            const requested = Math.max(1, Math.min(MAX,
                Number(info?.properties?.yanpLoraPairCount || 1)));
            this._yanpRestoring = true;
            this._yanpSetPairs?.(requested);
            const result = original.configured?.call(this, info, ...rest);
            // Record IDs by slot name before accepting user-visible renames.
            for (let n = 1; n <= MAX; ++n)
                for (const side of ["inputs", "outputs"])
                    for (const socket of this[side] || [])
                        if (socket.name === key(n)) socket._yanpPortId = n;
            const inferred = Math.max(requested,
                ...(info?.inputs || []).filter(s => s.link != null)
                    .map(s => Number(/^io_([1-8])$/.exec(s.name || "")?.[1]) || 1),
                ...(info?.outputs || []).filter(s => s.links?.length)
                    .map(s => Number(/^io_([1-8])$/.exec(s.name || "")?.[1]) || 1));
            this._yanpSetPairs?.(inferred);
            this._yanpRestoring = false;
            this._yanpCaptureLabels?.();
            if (snapshot) this._yanpRestoreRows?.(snapshot);
            this._yanpSchedule?.();
            return result;
        };
        proto.onSerialize = function (info, ...args) {
            this._yanpCaptureLabels?.();
            const result = original.serialized?.call(this, info, ...args);
            delete info.widgets_values;
            info.properties ??= {};
            info.properties.yanpLoraRows = this._yanpGetRows?.() ?? [];
            info.properties.yanpLoraPairCount = this._yanpPairCount ?? 1;
            const labels = {};
            for (const side of ["inputs", "outputs"])
                for (const s of this[side] || []) {
                    const n = number(s);
                    if (n && s.label) (labels[key(n)] ??= {})[side] = s.label;
                }
            info.properties.yanpLoraLabels = labels;
            return result;
        };
    },
});
