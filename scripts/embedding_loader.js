import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "yanp.embeddingLoader",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "EmbeddingLoader") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onConfigure = nodeType.prototype.onConfigure;
        const onSerialize = nodeType.prototype.onSerialize;

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

            hideEmbeddingData();

            requestAnimationFrame(() => {
                hideEmbeddingData();
                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            });

            this._yanpEmbeddingRows = [];
            this._yanpEmbeddingNames = [];

            const roundStrength = (value) => {
                const number = Number(value ?? 1.0);
                return Number.isFinite(number) ? parseFloat(number.toFixed(2)) : 1.0;
            };

            const getState = () =>
                this._yanpEmbeddingRows.map(row => ({
                    enabled: !!row.Enable.value,
                    name: row.Embedding.value || "",
                    strength: roundStrength(row.Strength.value),
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
                    row.Enable.name = `Enable ${number}`;
                    row.Embedding.name = `Embedding ${number}`;
                    row.Strength.name = `Strength ${number}`;
                    row.Remove.name = `− Remove ${number}`;
                });
            };

            const removeRow = (row) => {
                const doomed = new Set([
                    row.Enable,
                    row.Embedding,
                    row.Strength,
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

                row.Enable = this.addWidget(
                    "toggle",
                    `Enable ${index}`,
                    saved?.enabled ?? true,
                    () => sync(),
                    {
                        on: "On",
                        off: "Off",
                    }
                );

                row.Embedding = this.addWidget(
                    "combo",
                    `Embedding ${index}`,
                    saved?.name ?? "",
                    () => sync(),
                    { values: () => this._yanpEmbeddingNames || [] }
                );

                row.Strength = this.addWidget(
                    "number",
                    `Strength ${index}`,
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

                row.Remove = this.addWidget(
                    "button",
                    `− Remove ${index}`,
                    null,
                    () => removeRow(row)
                );

                this._yanpEmbeddingRows.push(row);

                if (doSync) sync();
                app.graph?.setDirtyCanvas?.(true, true);
            };

            const clearRows = () => {
                const doomed = new Set();
                for (const row of this._yanpEmbeddingRows) {
                    doomed.add(row.Enable);
                    doomed.add(row.Embedding);
                    doomed.add(row.Strength);
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

            // Keep this button after Position and before the dynamic rows.
            this.addWidget("button", "+ Add Embedding", null, () => addRow());

            api.fetchApi("/yanp/embedding_loader/embeddings")
                .then(response => response.json())
                .then(names => {
                    this._yanpEmbeddingNames = Array.isArray(names) ? names : [];
                    this.setDirtyCanvas?.(true, true);
                })
                .catch(() => {
                    this._yanpEmbeddingNames = [];
                });

            return result;
        };

        nodeType.prototype.onConfigure = function (info) {
            // Capture the saved state BEFORE the original configure logic:
            // widget callbacks invoked during loading can overwrite properties.
            const savedState = info?.properties?.embeddingLoaderState;
            const snapshot = Array.isArray(savedState)
                ? savedState.map(row => ({ ...row }))
                : null;

            const result = onConfigure?.apply(this, arguments);

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

            return result;
        };
    },
});
