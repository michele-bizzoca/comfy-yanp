import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "yanp.embeddingLoader",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "EmbeddingLoader") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onConfigure = nodeType.prototype.onConfigure;
        const onSerialize = nodeType.prototype.onSerialize;
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        const MAX_PAIRS = 8;

        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            const hideEmbeddingData = () => {
                const dataWidget = this.widgets?.find(
                    widget => widget.name === "embeddingData"
                );

                if (!dataWidget) return;

                // Keep the backend value serializable, but hide its UI on both
                // legacy canvas widgets and the current Vue/widget renderer.
                dataWidget.hidden = true;
                dataWidget.options = dataWidget.options || {};
                dataWidget.options.hidden = true;
                dataWidget.computeSize = () => [0, -4];

                for (const key of ["element", "inputEl"]) {
                    const element = dataWidget[key];
                    if (element?.style) element.style.display = "none";
                }

                this._yanpEmbeddingDataWidget = dataWidget;
            };

            // Retain the legacy Position widget for old saved workflows, but
            // use an independent Before/After selector on every embedding row.
            const hideGlobalPosition = () => {
                const widget = this.widgets?.find(w => w.name === "Position");
                if (!widget) return;
                widget.hidden = true;
                widget.options = widget.options || {};
                widget.options.hidden = true;
                widget.computeSize = () => [0, -4];
                for (const key of ["element", "inputEl"]) {
                    if (widget[key]?.style) widget[key].style.display = "none";
                }
            };

            hideEmbeddingData();
            hideGlobalPosition();

            requestAnimationFrame(() => {
                hideEmbeddingData();
                hideGlobalPosition();
                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            });

            this._yanpEmbeddingRows = [];
            this._yanpEmbeddingNames = [];
            this._yanpEmbeddingSerial = 0;

            // Show one spare pair. Connecting its input OR output reveals the next.
            // Disconnecting unused trailing pairs hides them again (max 8).
            this._yanpPairCount = 1;
            this._yanpRestoringPairs = false;
            this._yanpPairsUpdateScheduled = false;
            // The Python backend advertises eight output slots. Hide unused
            // sockets on BOTH sides without touching unrelated inputs/widgets.
            for (let n = MAX_PAIRS; n > 1; n--) {
                const name = `prompt_${n}`;
                const inputIndex = this.inputs?.findIndex(s => s.name === name) ?? -1;
                const outputIndex = this.outputs?.findIndex(s => s.name === name) ?? -1;
                if (inputIndex >= 0) this.removeInput(inputIndex);
                if (outputIndex >= 0) this.removeOutput(outputIndex);
            }

            const fitMinimumHeight = (initial = false) => {
                const calculated = this.computeSize?.();
                if (!calculated) return;
                const current = this.size ?? calculated;
                // Fit the initially created node once. Afterwards preserve any
                // user resize, including during unrelated undo/redo operations.
                // Only grow if newly added sockets need more room.
                const width = Math.max(current[0], calculated[0]);
                const height = initial ? calculated[1] : Math.max(current[1], calculated[1]);
                if (width !== current[0] || height !== current[1]) {
                    this.setSize?.([width, height]);
                    this.setDirtyCanvas?.(true, true);
                }
            };

            const updatePairCount = (count) => {
                count = Math.max(1, Math.min(MAX_PAIRS, Math.trunc(Number(count) || 1)));
                // Reconcile physical sockets by name, not just the cached count.
                // Undo/redo and onConfigure can restore/remove sockets independently
                // of _yanpPairCount; relying on the cache creates empty duplicates.
                for (let n = MAX_PAIRS; n > count; n--) {
                    const name = `prompt_${n}`;
                    const inputIndex = this.inputs?.findIndex(s => s.name === name) ?? -1;
                    const outputIndex = this.outputs?.findIndex(s => s.name === name) ?? -1;
                    if (inputIndex >= 0) this.removeInput(inputIndex);
                    if (outputIndex >= 0) this.removeOutput(outputIndex);
                }
                for (let n = 2; n <= count; n++) {
                    const name = `prompt_${n}`;
                    if (!(this.inputs || []).some(s => s.name === name)) this.addInput(name, 'STRING');
                    if (!(this.outputs || []).some(s => s.name === name)) this.addOutput(name, 'STRING');
                }
                this._yanpPairCount = count;
                this.properties ??= {};
                this.properties.embeddingLoaderPairCount = count;
                fitMinimumHeight();
                app.graph?.setDirtyCanvas?.(true, true);
            };
            const pairIsConnected = (index) => {
                const name = index === 1 ? 'prompt' : `prompt_${index}`;
                const input = this.inputs?.find(slot => slot.name === name);
                const output = this.outputs?.find(slot => slot.name === name);
                return (input?.link != null) || !!output?.links?.length;
            };

            // Normalize sockets restored from older workflows. Keep any linked
            // socket, and discard extra *unlinked* copies of the same slot.
            // Do not remove linked sockets: doing so would destroy user cables.
            const cleanLegacySockets = () => {
                let changed = false;
                for (const side of ["input", "output"]) {
                    const sockets = () => side === "input" ? (this.inputs || []) : (this.outputs || []);
                    const linked = slot => side === "input"
                        ? slot.link != null : (slot.links?.length ?? 0) > 0;
                    const remove = index => side === "input"
                        ? this.removeInput(index) : this.removeOutput(index);

                    for (let n = 1; n <= MAX_PAIRS; n++) {
                        const name = n === 1 ? "prompt" : `prompt_${n}`;
                        const indices = sockets().map((slot, i) => slot.name === name ? i : -1)
                            .filter(i => i >= 0);
                        if (indices.length <= 1) continue;
                        // Prefer the connected occurrence if one exists.
                        const retained = indices.find(i => linked(sockets()[i])) ?? indices[0];
                        for (const i of indices.slice().reverse()) {
                            if (i !== retained && !linked(sockets()[i])) {
                                remove(i);
                                changed = true;
                            }
                        }
                    }
                }
                return changed;
            };

            const refreshPairs = () => {
                if (this._yanpRestoringPairs) return;
                cleanLegacySockets();
                let highest = 0;
                for (let i = 1; i <= MAX_PAIRS; i++) {
                    if (pairIsConnected(i)) highest = i;
                }
                // Removes unused pre-existing trailing pairs as well as new ones.
                updatePairCount(Math.min(MAX_PAIRS, highest + 1));
            };

            this._yanpSchedulePairRefresh = () => {
                if (this._yanpRestoringPairs || this._yanpPairsUpdateScheduled) return;
                this._yanpPairsUpdateScheduled = true;
                // Wait for link restoration to complete before pruning sockets.
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    this._yanpPairsUpdateScheduled = false;
                    refreshPairs();
                }));
            };
            this._yanpSetPairCount = updatePairCount;
            this._yanpGetPairCount = () => this._yanpPairCount;

            const roundStrength = (value) => {
                const number = Number(value ?? 1.0);
                return Number.isFinite(number) ? parseFloat(number.toFixed(2)) : 1.0;
            };

            const getState = () =>
                this._yanpEmbeddingRows.map(row => ({
                    enabled: !!row.Enable.value,
                    name: row.Embedding.value || "",
                    strength: roundStrength(row.Strength.value),
                    position: row.Position.value,
                }));

            const sync = () => {
                const state = getState();
                const serialized = JSON.stringify(state);

                if (this._yanpEmbeddingDataWidget) {
                    this._yanpEmbeddingDataWidget.value = serialized;
                }

                this.properties ??= {};
                this.properties.embeddingLoaderState = state;

                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            };

            const renumberRows = () => {
                this._yanpEmbeddingRows.forEach((row, index) => {
                    const number = index + 1;
                    for (const [key, title] of [
                        ["Enable", `Enable ${number}`],
                        ["Embedding", `Embedding ${number}`],
                        ["Strength", `Strength ${number}`],
                        ["Position", `Position ${number}`],
                        ["Remove", `− Remove ${number}`],
                    ]) {
                        // The name is a permanent, unique widget key. Changing it
                        // or reusing one triggers '#1' on Vue widget registration.
                        // Only the user-facing label gets renumbered.
                        row[key].label = title;
                    }
                });
                this.widgets = [...(this.widgets || [])];
                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            };

            const removeRow = (row) => {
                const doomed = new Set([
                    row.Enable,
                    row.Embedding,
                    row.Strength,
                    row.Position,
                    row.Remove,
                ]);

                this.widgets = (this.widgets || []).filter(widget => !doomed.has(widget));
                this._yanpEmbeddingRows = this._yanpEmbeddingRows.filter(candidate => candidate !== row);

                renumberRows();
                sync();

                requestAnimationFrame(() => {
                    this.setDirtyCanvas?.(true, true);
                    app.graph?.setDirtyCanvas?.(true, true);
                });
            };

            const addRow = (saved = null, doSync = true) => {
                const index = this._yanpEmbeddingRows.length + 1;
                const row = {};
                // Never recycle widget identifiers, even after removing a row.
                const serial = ++this._yanpEmbeddingSerial;
                const widgetKey = (kind) => `yanpEmbedding_${serial}_${kind}`;

                row.Enable = this.addWidget(
                    "toggle",
                    widgetKey("Enable"),
                    saved?.enabled ?? true,
                    () => sync(),
                    {
                        on: "On",
                        off: "Off",
                    }
                );

                row.Embedding = this.addWidget(
                    "combo",
                    widgetKey("Embedding"),
                    saved?.name ?? "",
                    () => sync(),
                    { values: () => this._yanpEmbeddingNames || [] }
                );

                row.Strength = this.addWidget(
                    "number",
                    widgetKey("Strength"),
                    roundStrength(saved?.strength ?? 1.0),
                    (value) => {
                        const rounded = roundStrength(value);
                        if (row.Strength.value !== rounded) {
                            row.Strength.value = rounded;
                        }
                        sync();
                    },
                    {
                        min: 0.0,
                        max: 2.0,
                        step2: 0.05,
                        step: 0.5,
                        precision: 2,
                    }
                );

                row.Position = this.addWidget(
                    "combo",
                    widgetKey("Position"),
                    saved?.position === "After" ? "After" : "Before",
                    () => sync(),
                    { values: ["Before", "After"] }
                );

                row.Remove = this.addWidget(
                    "button",
                    widgetKey("Remove"),
                    null,
                    () => removeRow(row)
                );

                // Row controls are frontend-only. Their persistent state is
                // serialized through embeddingData / embeddingLoaderState,
                // never as independent backend input fields.
                for (const widget of Object.values(row)) {
                    widget.options ??= {};
                    widget.options.serialize = false;
                }

                this._yanpEmbeddingRows.push(row);
                renumberRows();

                if (doSync) sync();
                app.graph?.setDirtyCanvas?.(true, true);
            };

            const clearRows = () => {
                const doomed = new Set();
                for (const row of this._yanpEmbeddingRows) {
                    doomed.add(row.Enable);
                    doomed.add(row.Embedding);
                    doomed.add(row.Strength);
                    doomed.add(row.Position);
                    doomed.add(row.Remove);
                }
                this.widgets = (this.widgets || []).filter(widget => !doomed.has(widget));
                this._yanpEmbeddingRows = [];
            };

            const restoreState = (state) => {
                if (!Array.isArray(state)) return;

                clearRows();
                state.forEach(row => addRow(row, false));
                sync();
            };

            this._yanpRestoreEmbeddingState = restoreState;
            this._yanpGetEmbeddingState = getState;

            // Embeddings have their own position selector in each row.
            const addEmbeddingButton = this.addWidget("button", "+ Add Embedding", null, () => addRow());
            // A button is not an API input. Without this flag some ComfyUI
            // frontends send "+ Add Embedding" to the Python validator.
            addEmbeddingButton.options ??= {};
            addEmbeddingButton.options.serialize = false;

            api.fetchApi("/yanp/embedding_loader/embeddings")
                .then(response => response.json())
                .then(names => {
                    this._yanpEmbeddingNames = Array.isArray(names) ? names : [];
                    this.setDirtyCanvas?.(true, true);
                })
                .catch(() => {
                    this._yanpEmbeddingNames = [];
                });

            // The native initial height can reflect all eight backend output slots.
            requestAnimationFrame(() => {
                // Do not overwrite a size restored by onConfigure in the meantime.
                if (!this._yanpEmbeddingConfigured) fitMinimumHeight(true);
            });
            return result;
        };

        nodeType.prototype.onConnectionsChange = function () {
            const result = onConnectionsChange?.apply(this, arguments);
            this._yanpSchedulePairRefresh?.();
            return result;
        };

        nodeType.prototype.onConfigure = function (info) {
            // Capture the saved state BEFORE the original configure logic:
            // widget callbacks invoked during loading can overwrite properties.
            const savedState = info?.properties?.embeddingLoaderState;
            const snapshot = Array.isArray(savedState)
                ? savedState.map(row => ({ ...row }))
                : null;

            // Migrate older workflows with only the global Before/After widget.
            const legacyPositionIndex = info?.widgets_values_named?.Position != null
                ? info.widgets_values_named.Position
                : null;
            const legacyPosition = legacyPositionIndex || (() => {
                const widgetIndex = this.widgets?.findIndex(w => w.name === "Position") ?? -1;
                return widgetIndex >= 0 ? info?.widgets_values?.[widgetIndex] : null;
            })();
            if (snapshot && (legacyPosition === "After" || legacyPosition === "Before")) {
                for (const row of snapshot) {
                    if (!row.position) row.position = legacyPosition;
                }
            }

            const savedPairs = Math.max(1, Math.min(MAX_PAIRS,
                Number(info?.properties?.embeddingLoaderPairCount || 1)));
            // Restore before LiteGraph reinstates links to dynamic slots.
            this._yanpRestoringPairs = true;
            this._yanpSetPairCount?.(savedPairs);
            const result = onConfigure?.apply(this, arguments);
            this._yanpEmbeddingConfigured = true;
            // Older workflows may have the dynamic slots but no property.
            const inferredPairs = Math.max(
                1,
                savedPairs,
                ...(info?.inputs || []).filter(s => s.link != null).map(s =>
                    s.name === 'prompt' ? 1 : (Number(/^prompt_(\d+)$/.exec(s.name)?.[1]) || 0)
                )
            );
            this._yanpSetPairCount?.(inferredPairs);
            this._yanpRestoringPairs = false;
            // Links can be restored after onConfigure, so reconcile next tick.
            this._yanpSchedulePairRefresh?.();

            // Restore synchronously. A deferred animation frame could apply an
            // old snapshot after the user has already changed the node.
            if (snapshot) {
                this._yanpRestoreEmbeddingState?.(snapshot);
            }

            return result;
        };

        nodeType.prototype.onSerialize = function (data) {
            const result = onSerialize?.apply(this, arguments);

            data.properties ??= {};
            data.properties.embeddingLoaderState = this._yanpGetEmbeddingState?.() ?? [];
            data.properties.embeddingLoaderPairCount = this._yanpGetPairCount?.() ?? 1;

            return result;
        };
    },
});
