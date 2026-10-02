import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "yanp.stateful_multiline",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPStatefulMultiline") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onSerialize = nodeType.prototype.onSerialize;
        const onConfigure = nodeType.prototype.onConfigure;

        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            this.properties ??= {};

            if (typeof this.properties.MultilineDefault !== "string") {
                this.properties.MultilineDefault = "";
            }

            if (typeof this.properties.MultilineCurrentText !== "string") {
                this.properties.MultilineCurrentText = "";
            }

            const textWidget = this.widgets?.find(
                widget => widget.name === "Text"
            );

            const syncCurrentText = () => {
                if (!textWidget) return;

                this.properties.MultilineCurrentText =
                    String(textWidget.value ?? "");

                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            };

            if (textWidget) {
                const originalCallback = textWidget.callback;

                textWidget.callback = (...args) => {
                    const result = originalCallback?.apply(textWidget, args);
                    syncCurrentText();
                    return result;
                };
            }

            this.addWidget(
                "button",
                "Set Default",
                null,
                () => {
                    if (!textWidget) return;

                    syncCurrentText();

                    this.properties.MultilineDefault =
                        String(textWidget.value ?? "");

                    this.setDirtyCanvas?.(true, true);
                    app.graph?.setDirtyCanvas?.(true, true);
                }
            );

            this.addWidget(
                "button",
                "Load Default",
                null,
                () => {
                    if (!textWidget) return;

                    const value =
                        String(this.properties?.MultilineDefault ?? "");

                    textWidget.value = value;
                    this.properties.MultilineCurrentText = value;

                    textWidget.callback?.(value, app.canvas, this);

                    this.setDirtyCanvas?.(true, true);
                    app.graph?.setDirtyCanvas?.(true, true);
                }
            );

            return result;
        };

        nodeType.prototype.onSerialize = function (data) {
            const result = onSerialize?.apply(this, arguments);

            const textWidget = this.widgets?.find(
                widget => widget.name === "Text"
            );

            data.properties ??= {};

            if (textWidget) {
                this.properties.MultilineCurrentText =
                    String(textWidget.value ?? "");
            }

            data.properties.MultilineDefault =
                String(this.properties?.MultilineDefault ?? "");
            data.properties.MultilineCurrentText =
                String(this.properties?.MultilineCurrentText ?? "");

            return result;
        };

        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, arguments);

            this.properties ??= {};
            this.properties.MultilineDefault =
                String(info?.properties?.MultilineDefault ?? "");
            this.properties.MultilineCurrentText =
                String(info?.properties?.MultilineCurrentText ?? "");

            const currentText =
                this.properties.MultilineCurrentText;

            requestAnimationFrame(() => {
                const textWidget = this.widgets?.find(
                    widget => widget.name === "Text"
                );

                if (!textWidget) return;

                textWidget.value = currentText;
                textWidget.callback?.(
                    currentText,
                    app.canvas,
                    this
                );

                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            });

            return result;
        };
    },
});
