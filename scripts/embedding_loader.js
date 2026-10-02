import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "yanp.embedding.loader",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "EmbeddingLoader") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            // Hidden backend state used to serialize the dynamic rows.
            const dataWidget = this.widgets?.find(w => w.name === "embedding_data");
            if (dataWidget) {
                dataWidget.type = "hidden";
                dataWidget.computeSize = () => [0, -4];
            }

            this._yanpEmbeddingRows = [];

            const roundStrength = (value) => {
                const n = Number(value ?? 1.0);
                return Number.isFinite(n) ? parseFloat(n.toFixed(2)) : 1.0;
            };

            const sync = () => {
                if (!dataWidget) return;

                dataWidget.value = JSON.stringify(
                    this._yanpEmbeddingRows.map(row => ({
                        enabled: !!row.enable.value,
                        name: row.embedding.value || "",
                        strength: roundStrength(row.strength.value),
                    }))
                );

                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            };

            const renumberRows = () => {
                this._yanpEmbeddingRows.forEach((row, i) => {
                    const n = i + 1;
                    row.enable.name = `enable ${n}`;
                    row.embedding.name = `embedding ${n}`;
                    row.strength.name = `strength ${n}`;
                    row.remove.name = `− Remove ${n}`;
                });
            };

            const removeRow = (row) => {
                const doomed = new Set([
                    row.enable,
                    row.embedding,
                    row.strength,
                    row.remove,
                ]);

                this.widgets = (this.widgets || []).filter(w => !doomed.has(w));
                this._yanpEmbeddingRows = this._yanpEmbeddingRows.filter(x => x !== row);
                renumberRows();
                sync();

                requestAnimationFrame(() => {
                    this.setDirtyCanvas?.(true, true);
                    app.graph?.setDirtyCanvas?.(true, true);
                });
            };

            const addRow = (saved = null) => {
                const index = this._yanpEmbeddingRows.length + 1;
                const row = {};

                row.enable = this.addWidget(
                    "toggle",
                    `enable ${index}`,
                    saved?.enabled ?? true,
                    () => sync()
                );

                row.embedding = this.addWidget(
                    "combo",
                    `embedding ${index}`,
                    saved?.name ?? "",
                    () => sync(),
                    { values: () => this._yanpEmbeddingNames || [] }
                );

                row.strength = this.addWidget(
                    "number",
                    `strength ${index}`,
                    roundStrength(saved?.strength ?? 1.0),
                    (value) => {
                        const rounded = roundStrength(value);
                        if (row.strength.value !== rounded) {
                            row.strength.value = rounded;
                        }
                        sync();
                    },
                    {
                        min: 0.0,
                        max: 2.0,
                        // Current frontend uses step2 directly. Legacy step is /10.
                        step2: 0.05,
                        step: 0.5,
                        precision: 2,
                    }
                );

                row.remove = this.addWidget(
                    "button",
                    `− Remove ${index}`,
                    null,
                    () => removeRow(row)
                );

                this._yanpEmbeddingRows.push(row);
                sync();
                app.graph?.setDirtyCanvas?.(true, true);
            };

            this.addWidget("button", "+ Add Embedding", null, () => addRow());

            api.fetchApi("/yanp/embedding_loader/embeddings")
                .then(r => r.json())
                .then(names => {
                    this._yanpEmbeddingNames = Array.isArray(names) ? names : [];
                    this.setDirtyCanvas?.(true, true);
                })
                .catch(() => {
                    this._yanpEmbeddingNames = [];
                });

            // Restore rows saved in the workflow.
            try {
                const saved = JSON.parse(dataWidget?.value || "[]");
                if (Array.isArray(saved)) saved.forEach(addRow);
            } catch {
                // Ignore malformed state from an older workflow.
            }

            return r;
        };
    },
});
