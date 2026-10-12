import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const MAX_PAIRS = 8;

app.registerExtension({
    name: "yanp.loraLoader",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPLoraLoader") return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        const originalConfigure = nodeType.prototype.onConfigure;
        const originalSerialize = nodeType.prototype.onSerialize;
        const originalConnectionsChange = nodeType.prototype.onConnectionsChange;

        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            this._yanpLoraRows = [];
            this._yanpLoraNames = [];
            this._yanpLoraNamesLoaded = false;
            this._yanpLoraSerial = 0;
            this._yanpLoraBusy = false;
            this._yanpLoraQueued = false;

            const hidden = this.widgets?.find(w => w.name === "loraData");
            this._yanpLoraDataWidget = hidden;
            if (hidden) {
                hidden.hidden = true;
                hidden.options ??= {};
                hidden.options.hidden = true;
                hidden.computeSize = () => [0, -4];
                for (const key of ["element", "inputEl"]) {
                    if (hidden[key]?.style) hidden[key].style.display = "none";
                }
            }

            const round = value => {
                const n = Number(value);
                return Number.isFinite(n) ? Number(n.toFixed(2)) : 1;
            };
            const state = () => this._yanpLoraRows.map(r => ({
                enabled: !!r.enabled.value,
                name: r.lora.value || "",
                strength_model: round(r.model.value),
                strength_clip: round(r.clip.value),
            }));
            const sync = () => {
                const value = state();
                if (this._yanpLoraDataWidget) this._yanpLoraDataWidget.value = JSON.stringify(value);
                this.properties ??= {};
                this.properties.yanpLoraRows = value;
                this.setDirtyCanvas?.(true, true);
            };
            const rename = () => this._yanpLoraRows.forEach((r, i) => {
                const n = i + 1;
                for (const [w, title] of [[r.enabled, "Enable"], [r.lora, "LoRA"],
                     [r.model, "Model Strength"], [r.clip, "CLIP Strength"],
                     [r.remove, "− Remove"]]) {
                    w.label = `${title} ${n}`;
                }
            });
            const addRow = (saved = {}, shouldSync = true) => {
                const id = ++this._yanpLoraSerial;
                const row = {};
                row.enabled = this.addWidget("toggle", `enable_${id}`, saved.enabled ?? true, sync, {on: "On", off: "Off"});
                // While the asynchronous model list is loading, keep the saved
                // selection in the combo's available values. Otherwise ComfyUI
                // can briefly classify an existing LoRA as missing on restore.
                row.lora = this.addWidget("combo", `lora_${id}`, saved.name ?? "", sync,
                    {values: () => {
                        const names = this._yanpLoraNames;
                        const selected = row.lora?.value ?? saved.name;
                        return !this._yanpLoraNamesLoaded && selected && !names.includes(selected)
                            ? [...names, selected] : names;
                    }});
                row.model = this.addWidget("number", `strength_model_${id}`, round(saved.strength_model ?? 1), sync,
                    {min: -10, max: 10, step: 0.1, step2: 0.05, precision: 2});
                row.clip = this.addWidget("number", `strength_clip_${id}`, round(saved.strength_clip ?? 1), sync,
                    {min: -10, max: 10, step: 0.1, step2: 0.05, precision: 2});
                row.remove = this.addWidget("button", `remove_${id}`, null, () => {
                    const doomed = new Set(Object.values(row));
                    this.widgets = this.widgets.filter(w => !doomed.has(w));
                    this._yanpLoraRows = this._yanpLoraRows.filter(r => r !== row);
                    rename(); sync(); this._yanpLoraLayout();
                });
                this._yanpLoraRows.push(row);
                rename();
                if (shouldSync) sync();
                this._yanpLoraLayout();
            };
            this._yanpLoraGetState = state;
            this._yanpLoraRestore = saved => {
                if (!Array.isArray(saved)) return;
                const doomed = new Set(this._yanpLoraRows.flatMap(r => Object.values(r)));
                this.widgets = (this.widgets || []).filter(w => !doomed.has(w));
                this._yanpLoraRows = [];
                saved.forEach(item => addRow(item, false));
                sync();
            };
            this.addWidget("button", "+ Add LoRA", null, () => addRow());

            // Manage MODEL/CLIP by *name*, never by absolute slot index.
            // Other inputs (e.g. loraData converted to an input) must not be
            // counted or overwritten as part of a MODEL/CLIP pair.
            const inputIndex = name => (this.inputs || []).findIndex(s => s.name === name);
            const outputIndex = name => (this.outputs || []).findIndex(s => s.name === name);
            const hasInputLink = name => {
                const i = inputIndex(name);
                return i >= 0 && this.inputs[i].link != null;
            };
            const hasOutputLink = name => {
                const i = outputIndex(name);
                return i >= 0 && (this.outputs[i].links?.length ?? 0) > 0;
            };
            const pairUsed = n => ["model", "clip"].some(key =>
                hasInputLink(`${key}_${n}`) || hasOutputLink(`${key}_${n}`)
            );
            const removePair = n => {
                // Indexes shift on removal: re-find each port by its actual name.
                for (const key of ["clip", "model"]) {
                    const name = `${key}_${n}`;
                    let i = inputIndex(name);
                    if (i >= 0) this.removeInput(i);
                    i = outputIndex(name);
                    if (i >= 0) this.removeOutput(i);
                }
            };
            const addPair = n => {
                if (inputIndex(`model_${n}`) < 0) this.addInput(`model_${n}`, "MODEL");
                if (inputIndex(`clip_${n}`) < 0) this.addInput(`clip_${n}`, "CLIP");
                if (outputIndex(`model_${n}`) < 0) this.addOutput(`model_${n}`, "MODEL");
                if (outputIndex(`clip_${n}`) < 0) this.addOutput(`clip_${n}`, "CLIP");
            };
            // Compact pairs after disconnection, including gaps in the middle.
            // Move socket objects without disconnecting their links; then update
            // the corresponding LiteGraph link slot indices.
            this._yanpLoraUpdate = () => {
                if (this._yanpLoraBusy || !this.inputs || !this.outputs) return;
                this._yanpLoraBusy = true;
                try {
                    // Compact based on *both* sides together to keep each input
                    // MODEL/CLIP aligned with its corresponding outputs.
                    const occupied = [];
                    const empty = [];
                    for (let n = 1; n <= MAX_PAIRS; n++) {
                        if (inputIndex(`model_${n}`) < 0 && outputIndex(`model_${n}`) < 0) continue;
                        (pairUsed(n) ? occupied : empty).push(n);
                    }
                    const oldOrder = [...occupied, ...empty];
                    if (oldOrder.length) {
                        const reorder = (side) => {
                            const sockets = side === "input" ? this.inputs : this.outputs;
                            const oldSlots = new Map();
                            for (const n of oldOrder) {
                                oldSlots.set(n, ["model", "clip"].map(key =>
                                    sockets.find(s => s.name === `${key}_${n}`)
                                ));
                            }
                            const all = new Set([...oldSlots.values()].flat().filter(Boolean));
                            const indices = [];
                            sockets.forEach((slot, index) => { if (all.has(slot)) indices.push(index); });
                            const orderedSockets = oldOrder.flatMap(n => oldSlots.get(n)).filter(Boolean);
                            indices.forEach((index, k) => { sockets[index] = orderedSockets[k]; });
                            indices.forEach((index) => {
                                const slot = sockets[index];
                                const ids = side === "input"
                                    ? (slot.link == null ? [] : [slot.link])
                                    : (slot.links || []);
                                for (const id of ids) {
                                    const link = this.graph?.links?.[id];
                                    if (!link) continue;
                                    if (Array.isArray(link)) link[side === "input" ? 4 : 2] = index;
                                    else link[side === "input" ? "target_slot" : "origin_slot"] = index;
                                }
                            });
                            orderedSockets.forEach((slot, k) => {
                                slot.name = `${k % 2 ? "clip" : "model"}_${Math.floor(k / 2) + 1}`;
                            });
                        };
                        reorder("input");
                        reorder("output");
                    }
                    const wanted = Math.max(1, Math.min(MAX_PAIRS, occupied.length + 1));
                    for (let n = MAX_PAIRS; n > wanted; n--) removePair(n);
                    for (let n = 1; n <= wanted; n++) addPair(n);
                    this._yanpLoraPairs = wanted;
                    this._yanpLoraLayout();
                } finally {
                    this._yanpLoraBusy = false;
                }
            };
            this._yanpLoraScheduleUpdate = () => {
                if (this._yanpLoraQueued) return;
                this._yanpLoraQueued = true;
                // On disconnection LiteGraph can call the callback before the
                // graph removes the link. Defer until that mutation completes.
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    this._yanpLoraQueued = false;
                    this._yanpLoraUpdate?.();
                }));
            };
            this._yanpLoraLayout = () => {
                const [w, h] = this.computeSize();
                this.setSize([Math.max(220, w), h]);
                this.setDirtyCanvas?.(true, true);
            };

            // Start with precisely one named MODEL/CLIP pair per side.
            // Prune all extra pairs by name: do not accidentally delete or
            // rename a non-pair input such as `loraData`.
            for (let n = MAX_PAIRS; n > 1; n--) removePair(n);
            addPair(1);
            this._yanpLoraPairs = 1;
            this._yanpLoraLayout();

            api.fetchApi("/yanp/lora_loader/loras")
                .then(r => r.json())
                .then(names => {
                    this._yanpLoraNames = Array.isArray(names) ? names : [];
                    this._yanpLoraNamesLoaded = true;
                    this.setDirtyCanvas?.(true, true);
                }).catch(() => { this._yanpLoraNames = []; });
            return result;
        };

        nodeType.prototype.onConnectionsChange = function () {
            const result = originalConnectionsChange?.apply(this, arguments);
            this._yanpLoraScheduleUpdate?.();
            return result;
        };
        nodeType.prototype.onConfigure = function (info) {
            const saved = info?.properties?.yanpLoraRows;
            const snapshot = Array.isArray(saved) ? saved.map(x => ({...x})) : null;
            const result = originalConfigure?.apply(this, arguments);
            if (snapshot) this._yanpLoraRestore?.(snapshot);
            this._yanpLoraScheduleUpdate?.();
            return result;
        };
        nodeType.prototype.onSerialize = function (data) {
            const result = originalSerialize?.apply(this, arguments);
            data.properties ??= {};
            data.properties.yanpLoraRows = this._yanpLoraGetState?.() ?? [];
            return result;
        };
    },
});
