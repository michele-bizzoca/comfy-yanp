import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "yanp.stateful_multiline_2",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPStatefulMultiline2") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onSerialize = nodeType.prototype.onSerialize;
        const onConfigure = nodeType.prototype.onConfigure;

        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            this.properties ??= {};

            if (typeof this.properties.MultilineDefault1 !== "string") {
                this.properties.MultilineDefault1 = "";
            }

            if (typeof this.properties.MultilineDefault2 !== "string") {
                this.properties.MultilineDefault2 = "";
            }

            if (typeof this.properties.MultilineCurrentText !== "string") {
                this.properties.MultilineCurrentText = "";
            }

            const textWidget = this.widgets?.find(
                widget => widget.name === "Text"
            );

            const markDirty = () => {
                this.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            };

            const syncCurrentText = () => {
                if (!textWidget) return;

                this.properties.MultilineCurrentText =
                    String(textWidget.value ?? "");

                markDirty();
            };

            const setDefault = index => {
                if (!textWidget) return;

                syncCurrentText();
                this.properties[`MultilineDefault${index}`] =
                    String(textWidget.value ?? "");
                markDirty();
            };

            const loadDefault = index => {
                if (!textWidget) return;

                const value = String(
                    this.properties?.[`MultilineDefault${index}`] ?? ""
                );

                textWidget.value = value;
                this.properties.MultilineCurrentText = value;
                textWidget.callback?.(value, app.canvas, this);
                markDirty();
            };

            if (textWidget) {
                const originalCallback = textWidget.callback;

                textWidget.callback = (...args) => {
                    const callbackResult =
                        originalCallback?.apply(textWidget, args);
                    syncCurrentText();
                    return callbackResult;
                };
            }

            const BUTTON_HEIGHT = 22;
            const ROW_GAP = 6;
            const BOX_PADDING_TOP = 0;
            const BOX_PADDING_BOTTOM = 10;
            const HORIZONTAL_GAP = 6;
            const CONTROLS_SHIFT_UP = 10;
            const CONTROLS_HEIGHT =
                (BUTTON_HEIGHT * 2) + ROW_GAP +
                BOX_PADDING_TOP + BOX_PADDING_BOTTOM;

            const makeButton = (label, callback) => {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = label;
                button.style.width = "100%";
                button.style.minWidth = "0";
                button.style.maxWidth = "100%";
                button.style.height = `${BUTTON_HEIGHT}px`;
                button.style.boxSizing = "border-box";
                button.style.padding = "0 6px";
                button.style.margin = "0";
                button.style.overflow = "hidden";
                button.style.textOverflow = "ellipsis";
                button.style.whiteSpace = "nowrap";
                // Match ComfyUI's normal widget/button palette instead of
                // using the browser/theme accent button color.
                button.style.background = "var(--comfy-input-bg, #222)";
                button.style.color = "var(--input-text, #ddd)";
                button.style.border = "1px solid var(--border-color, #555)";
                button.style.borderRadius = "4px";
                button.style.cursor = "pointer";
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    callback();
                });
                return button;
            };

            // One fixed-height box containing all four buttons. The two columns use
            // equal flexible tracks. Keep only the inter-column gap: no outer
            // horizontal padding, so the buttons reach the box edges on resize.
            const controlsBox = document.createElement("div");
            controlsBox.style.display = "grid";
            controlsBox.style.gridTemplateColumns =
                "minmax(0, 1fr) minmax(0, 1fr)";
            controlsBox.style.gridTemplateRows =
                `${BUTTON_HEIGHT}px ${BUTTON_HEIGHT}px`;
            controlsBox.style.columnGap = `${HORIZONTAL_GAP}px`;
            controlsBox.style.rowGap = `${ROW_GAP}px`;
            controlsBox.style.width = "100%";
            controlsBox.style.minWidth = "0";
            controlsBox.style.maxWidth = "100%";
            controlsBox.style.height = `${CONTROLS_HEIGHT}px`;
            controlsBox.style.minHeight = `${CONTROLS_HEIGHT}px`;
            controlsBox.style.maxHeight = `${CONTROLS_HEIGHT}px`;
            controlsBox.style.boxSizing = "border-box";
            controlsBox.style.padding = `${BOX_PADDING_TOP}px 0 ${BOX_PADDING_BOTTOM}px 0`;
            controlsBox.style.margin = "0";
            // ComfyUI leaves some vertical breathing room before DOM widgets.
            // Move the controls into part of that gap so most of the extra space
            // stays below the second row, while keeping 5 px more above
            // than in the previous layout.
            controlsBox.style.transform = `translateY(-${CONTROLS_SHIFT_UP}px)`;
            controlsBox.style.overflow = "hidden";

            controlsBox.append(
                makeButton("Set Default 1", () => setDefault(1)),
                makeButton("Set Default 2", () => setDefault(2)),
                makeButton("Load Default 1", () => loadDefault(1)),
                makeButton("Load Default 2", () => loadDefault(2)),
            );

            this.addDOMWidget?.(
                "Default Controls",
                "yanp-default-controls-box",
                controlsBox,
                {
                    serialize: false,
                    hideOnZoom: false,
                    getMinHeight: () => CONTROLS_HEIGHT,
                    getMaxHeight: () => CONTROLS_HEIGHT,
                    getHeight: () => CONTROLS_HEIGHT,
                }
            );

            // Recompute the node only after the fixed-height controls box has
            // been registered, preserving the user's chosen width.
            requestAnimationFrame(() => {
                const computed = this.computeSize?.();
                if (!computed) return;

                const currentWidth = this.size?.[0] ?? computed[0];
                const currentHeight = this.size?.[1] ?? 0;
                const requiredHeight = computed[1] + 10;

                if (currentHeight < requiredHeight) {
                    this.setSize?.([currentWidth, requiredHeight]);
                }

                markDirty();
            });

            return result;
        };

        nodeType.prototype.onSerialize = function (data) {
            const result = onSerialize?.apply(this, arguments);

            const textWidget = this.widgets?.find(
                widget => widget.name === "Text"
            );

            data.properties ??= {};
            this.properties ??= {};

            if (textWidget) {
                this.properties.MultilineCurrentText =
                    String(textWidget.value ?? "");
            }

            data.properties.MultilineDefault1 =
                String(this.properties.MultilineDefault1 ?? "");
            data.properties.MultilineDefault2 =
                String(this.properties.MultilineDefault2 ?? "");
            data.properties.MultilineCurrentText =
                String(this.properties.MultilineCurrentText ?? "");

            return result;
        };

        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, arguments);

            this.properties ??= {};
            this.properties.MultilineDefault1 =
                String(info?.properties?.MultilineDefault1 ?? "");
            this.properties.MultilineDefault2 =
                String(info?.properties?.MultilineDefault2 ?? "");
            this.properties.MultilineCurrentText =
                String(info?.properties?.MultilineCurrentText ?? "");

            const currentText = this.properties.MultilineCurrentText;

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
