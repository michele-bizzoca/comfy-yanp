import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const MAX = 8;
const KEY = /^io_([1-8])$/;
const id = s => s?._yanpId || Number(KEY.exec(s?.name || "")?.[1]) || 0;
const busy = p => p.input?.link != null || (p.output?.links?.length || 0) > 0;

app.registerExtension({
    name: "yanp.loraLoader",
    beforeRegisterNodeDef(Node, definition) {
        if (definition.name !== "YANPLoraLoader") return;
        const proto = Node.prototype;
        const oldCreate = proto.onNodeCreated;
        const oldConfigure = proto.onConfigure;
        const oldSerialize = proto.onSerialize;
        const oldConnections = proto.onConnectionsChange;
        const oldDraw = proto.onDrawForeground;

        proto.onNodeCreated = function (...args) {
            const result = oldCreate?.apply(this, args);
            this.serialize_widgets = false;
            this._rows = [];
            this._nextRow = 0;
            this._names = [];
            this._restoring = false;
            this._scheduled = false;
            this._updating = false;

            const hidden = name => {
                const w = this.widgets?.find(w => w.name === name);
                if (!w) return null;
                w.hidden = true;
                w.options ??= {};
                w.options.hidden = true;
                w.computeSize = () => [0, -4];
                return w;
            };
            const data = hidden("loraData");
            const order = hidden("portOrder");
            const saveRows = () => {
                const values = this._rows.map(r => ({
                    enabled: !!r.enable.value, name: r.lora.value || "",
                    strength_model: Number(r.model.value), strength_clip: Number(r.clip.value),
                }));
                if (data) data.value = JSON.stringify(values);
                (this.properties ??= {}).yanpLoraRows = values;
                this.setDirtyCanvas?.(true, true);
                return values;
            };
            const addRow = (value = {}) => {
                const n = ++this._nextRow;
                const r = {};
                r.enable = this.addWidget("toggle", `enable_${n}`, value.enabled ?? true, saveRows);
                r.lora = this.addWidget("combo", `lora_${n}`, value.name ?? "", saveRows,
                    { values: () => [...new Set([...this._names, r.lora?.value].filter(Boolean))] });
                r.model = this.addWidget("number", `strength_model_${n}`, value.strength_model ?? 1,
                    saveRows, { min: -10, max: 10, step: 0.1, step2: 0.05, precision: 2 });
                r.clip = this.addWidget("number", `strength_clip_${n}`, value.strength_clip ?? 1,
                    saveRows, { min: -10, max: 10, step: 0.1, step2: 0.05, precision: 2 });
                r.remove = this.addWidget("button", `remove_${n}`, null, () => {
                    const gone = new Set(Object.values(r));
                    this.widgets = this.widgets.filter(w => !gone.has(w));
                    this._rows.splice(this._rows.indexOf(r), 1);
                    saveRows();
                });
                this._rows.push(r);
                saveRows();
            };
            this._restoreRows = values => {
                const previous = new Set(this._rows.flatMap(r => Object.values(r)));
                this.widgets = (this.widgets || []).filter(w => !previous.has(w));
                this._rows = [];
                for (const value of values) addRow(value);
                saveRows();
            };
            this.addWidget("button", "+ Add LoRA", null, () => addRow());

            // _yanpId never changes. Only `label` is user-editable.
            // If LiteGraph's Rename changes `name`, capture it as a label and
            // put back the canonical backend key before prompt serialization.
            const normalize = (socket, n, side) => {
                socket._yanpId = n;
                const key = `io_${n}`;
                const fallback = `I/O ${n}`;
                const saved = this.properties?.yanpLabels?.[key]?.[side];
                if (socket.name !== key && socket.name) socket.label = socket.name;
                else if (!socket.label || socket.label === key || socket.label.toLowerCase() === fallback.toLowerCase())
                    socket.label = saved || fallback;
                socket.name = key;
                socket.type = "*";
            };
            const pairs = () => {
                const map = new Map();
                for (const [side, field] of [["inputs", "input"], ["outputs", "output"]])
                    for (const socket of this[side] || []) {
                        const n = id(socket);
                        if (!n || n > MAX) continue;
                        if (!map.has(n)) map.set(n, {});
                        map.get(n)[field] = socket;
                    }
                return map;
            };
            const addPair = n => {
                this.addInput(`io_${n}`, "*");
                this.addOutput(`io_${n}`, "*");
                normalize(this.inputs.at(-1), n, "inputs");
                normalize(this.outputs.at(-1), n, "outputs");
            };
            const refreshLinks = () => {
                for (const [side, field, arrayIndex] of [
                    ["inputs", "target_slot", 4], ["outputs", "origin_slot", 2]
                ]) (this[side] || []).forEach((socket, index) => {
                    const links = side === "inputs" ? [socket.link] : (socket.links || []);
                    for (const linkId of links) {
                        const link = this.graph?.links?.[linkId];
                        if (link) {
                            if (Array.isArray(link)) link[arrayIndex] = index;
                            else link[field] = index;
                        }
                    }
                });
            };
            const reconcile = () => {
                if (this._restoring || this._updating) return;
                this._updating = true;
                try {
                    // The Python schema declares eight OUTPUTS. ComfyUI may
                    // reinstate these during execution/serialization. Never
                    // construct their missing INPUT halves: they are not real pairs.
                    let all = pairs();
                    const occupied = [...all].filter(([, p]) => busy(p));
                    const empties = [...all].filter(([, p]) => !busy(p));
                    // Prefer an existing complete spare. Otherwise reserve the
                    // smallest free identity. Keep just ONE spare pair.
                    const spare = occupied.length < MAX
                        ? (empties.find(([, p]) => p.input && p.output)?.[0]
                           ?? empties[0]?.[0]
                           ?? Array.from({length: MAX}, (_, i) => i + 1)
                               .find(n => !all.has(n)))
                        : null;
                    const keep = new Set([...occupied.map(([n]) => n), spare].filter(Boolean));
                    // Remove ghosts BEFORE creating missing halves.
                    for (const side of ["inputs", "outputs"])
                        this[side] = (this[side] || []).filter(s => !id(s) || keep.has(id(s)));
                    all = pairs();
                    for (const n of keep) {
                        const pair = all.get(n) || {};
                        if (!pair.input) {
                            this.addInput(`io_${n}`, "*");
                            normalize(this.inputs.at(-1), n, "inputs");
                        }
                        if (!pair.output) {
                            this.addOutput(`io_${n}`, "*");
                            normalize(this.outputs.at(-1), n, "outputs");
                        }
                    }
                    // A pair has one stable position on BOTH sides. Never sort the
                    // two socket arrays independently (which can rotate ports).
                    // Existing occupied pairs retain their relative order; only
                    // the empty spare is placed last.
                    all = pairs();
                    const orderIds = [
                        ...all.keys().filter(n => busy(all.get(n))),
                        ...all.keys().filter(n => !busy(all.get(n))),
                    ];
                    for (const [side, field] of [["inputs", "input"], ["outputs", "output"]]) {
                        const sockets = this[side];
                        const rest = sockets.filter(s => !id(s));
                        const ports = orderIds.map(n => all.get(n)[field]).filter(Boolean);
                        sockets.splice(0, sockets.length, ...ports, ...rest);
                        for (const s of ports) normalize(s, id(s), side);
                    }
                    refreshLinks();
                    if (order) order.value = JSON.stringify(this.outputs.filter(s => id(s)).map(s => `io_${id(s)}`));
                    this.setDirtyCanvas?.(true, true);
                } finally { this._updating = false; }
            };
            this._reconcile = reconcile;
            this._schedule = () => {
                if (this._scheduled || this._restoring) return;
                this._scheduled = true;
                setTimeout(() => { this._scheduled = false; reconcile(); }, 0);
            };
            // First pair is created immediately, not by a connection callback.
            // Assign IDs to sockets restored/declared by the backend as early as possible.
            for (const s of [...(this.inputs || []), ...(this.outputs || [])])
                if (KEY.test(s.name || "")) s._yanpId = Number(KEY.exec(s.name)[1]);
            this._schedule();
            api.fetchApi("/yanp/lora_loader/loras").then(r => r.json())
                .then(v => { this._names = Array.isArray(v) ? v : []; this.setDirtyCanvas?.(true, true); })
                .catch(() => {});
            return result;
        };
        // Wildcard inputs/outputs: don't delegate to inherited type restrictions.
        proto.onConnectInput = () => true;
        proto.onConnectOutput = () => true;
        proto.onConnectionsChange = function (...args) {
            const value = oldConnections?.apply(this, args);
            this._schedule?.();
            return value;
        };
        // In some ComfyUI versions the first input connection skips callbacks.
        // A cheap state signature catches it, plus user-initiated renames.
        proto.onDrawForeground = function (...args) {
            const value = oldDraw?.apply(this, args);
            const signature = [
                ...(this.inputs || []).map(s => `${s.link}:${s.name}:${s.label}`),
                ...(this.outputs || []).map(s => `${s.links?.join(",")}:${s.name}:${s.label}`)
            ].join("|");
            if (signature !== this._signature) {
                this._signature = signature;
                this._schedule?.();
            }
            return value;
        };
        proto.onConfigure = function (info, ...args) {
            this._restoring = true;
            try {
                const value = oldConfigure?.call(this, info, ...args);
                for (const side of ["inputs", "outputs"])
                    (this[side] || []).forEach((s, i) => {
                        s._yanpId = Number(KEY.exec(s.name || "")?.[1]) ||
                            Number(KEY.exec(info?.[side]?.[i]?.name || "")?.[1]) || s._yanpId;
                    });
                if (Array.isArray(info?.properties?.yanpLoraRows))
                    this._restoreRows?.(info.properties.yanpLoraRows);
                (this.properties ??= {}).yanpLabels = info?.properties?.yanpLabels || {};
                return value;
            } finally { this._restoring = false; this._schedule?.(); }
        };
        proto.onSerialize = function (data, ...args) {
            const value = oldSerialize?.call(this, data, ...args);
            delete data.widgets_values;
            data.properties ??= {};
            data.properties.yanpLoraRows = this._rows.map(r => ({
                enabled: !!r.enable.value, name: r.lora.value || "",
                strength_model: Number(r.model.value), strength_clip: Number(r.clip.value)
            }));
            data.properties.yanpLabels = {};
            for (const side of ["inputs", "outputs"])
                for (const s of this[side] || []) if (id(s))
                    (data.properties.yanpLabels[`io_${id(s)}`] ??= {})[side] = s.label;
            return value;
        };
    },
    setup() {
        const queue = app.queuePrompt.bind(app);
        app.queuePrompt = async (...args) => {
            for (const node of app.graph?._nodes || []) {
                if (node.type !== "YANPLoraLoader") continue;
                for (const input of node.inputs || []) {
                    const n = id(input);
                    if (!n || input.link == null) continue;
                    const link = app.graph.links?.[input.link];
                    const source = app.graph.getNodeById?.(link?.origin_id);
                    const kind = source?.outputs?.[link?.origin_slot]?.type?.toUpperCase();
                    if (kind && kind !== "*" && kind !== "MODEL" && kind !== "CLIP")
                        throw Error(`LoRA Loader I/O ${n}: unsupported input type ${kind}`);
                    const output = node.outputs?.find(s => id(s) === n);
                    for (const linkId of output?.links || []) {
                        const edge = app.graph.links?.[linkId];
                        const target = app.graph.getNodeById?.(edge?.target_id);
                        const expected = target?.inputs?.[edge?.target_slot]?.type?.toUpperCase();
                        if (kind && kind !== "*" && expected && expected !== "*" && kind !== expected)
                            throw Error(`LoRA Loader I/O ${n}: ${kind} connected to ${expected}`);
                    }
                }
            }
            return queue(...args);
        };
    },
});
