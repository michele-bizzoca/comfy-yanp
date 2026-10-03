import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "yanp.smart_seed.ui",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "YANPSmartSeed") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onConfigure = nodeType.prototype.onConfigure;
        const onExecuted = nodeType.prototype.onExecuted;

        const MAX_63_MASK = 0x7fffffffffffffffn;

        function newSeed() {
            // Generate an exact non-negative 63-bit integer and keep it as a
            // string in the widget so JavaScript never loses integer precision.
            if (globalThis.crypto?.getRandomValues) {
                const words = new Uint32Array(2);
                globalThis.crypto.getRandomValues(words);
                const value =
                    (BigInt(words[0] & 0x7fffffff) << 32n) |
                    BigInt(words[1]);
                return (value & MAX_63_MASK).toString();
            }

            // Extremely old/non-browser fallback. Still produces a valid seed.
            const high = Math.floor(Math.random() * 0x80000000);
            const low = Math.floor(Math.random() * 0x100000000);
            return ((BigInt(high) << 32n) | BigInt(low)).toString();
        }

        function getSeedWidget(node) {
            return node.widgets?.find(widget => widget.name === "Seed");
        }

        function isValidSeed(value) {
            if (value === undefined || value === null) return false;

            const text = String(value).trim();
            if (!/^\d+$/.test(text)) return false;

            try {
                const seed = BigInt(text);
                return seed >= 0n && seed <= MAX_63_MASK;
            } catch {
                return false;
            }
        }

        function ensureSeed(node) {
            const seedWidget = getSeedWidget(node);
            if (!seedWidget) return;

            if (!isValidSeed(seedWidget.value)) {
                seedWidget.value = newSeed();
            }
        }

        function setDisplayedSeed(node, value) {
            const seedWidget = getSeedWidget(node);
            if (!seedWidget || value === undefined || value === null) return;

            seedWidget.value = String(value);
            node.setDirtyCanvas?.(true, true);
            app.graph?.setDirtyCanvas?.(true, true);
        }

        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            // A Smart Seed always owns a valid seed, even before its first run.
            ensureSeed(this);

            // Preserve the exact size used by the current committed version.
            this.setSize?.([250, 60]);

            return result;
        };

        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);

            // onNodeCreated runs before workflow values are restored. Check
            // again afterwards so old workflows with an empty Seed are fixed.
            ensureSeed(this);

            return result;
        };

        nodeType.prototype.onExecuted = function (message) {
            const result = onExecuted?.apply(this, arguments);

            // Python returns {"ui": {"text": (seed,)}}; ComfyUI exposes that
            // here as message.text. Whatever Python actually used becomes the
            // visible/persistent Seed for the following run.
            let value = message?.text;
            if (Array.isArray(value)) value = value[0];

            if (value === undefined || value === null) {
                value = message?.seed;
                if (Array.isArray(value)) value = value[0];
            }

            if (value !== undefined && value !== null) {
                setDisplayedSeed(this, value);
            } else {
                ensureSeed(this);
            }

            return result;
        };
    },
});
