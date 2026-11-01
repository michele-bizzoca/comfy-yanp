import { app } from "../../scripts/app.js";

const NODE_TYPE = "mask_majority";
const MIN_INPUTS = 2;
const MAX_INPUTS = 8;
const isMaskInput = input => /^mask_[1-8]$/.test(input.name);

function maskInputs(node) {
  return (node.inputs ?? [])
    .filter(isMaskInput)
    .sort((a, b) => Number(a.name.slice(5)) - Number(b.name.slice(5)));
}

function refreshNode(node) {
  node.setSize?.(node.computeSize());
  node.setDirtyCanvas?.(true, true);
}

function renumberMaskInputs(node) {
  const masks = maskInputs(node);
  masks.forEach((input, index) => {
    input.name = `mask_${index + 1}`;
    input.label = input.name;
  });
}

function addMaskInput(node) {
  const masks = maskInputs(node);
  if (masks.length >= MAX_INPUTS) return;
  const next = masks.length + 1;
  node.addInput(`mask_${next}`, "MASK");
  refreshNode(node);
}

function removeMaskInput(node, name) {
  const masks = maskInputs(node);
  if (masks.length <= MIN_INPUTS) return;
  const input = masks.find(item => item.name === name);
  if (!input) return;
  const index = node.inputs.indexOf(input);
  if (index < 0) return;

  // LiteGraph disconnects the selected slot and adjusts the remaining link slots.
  node.removeInput(index);
  renumberMaskInputs(node);
  refreshNode(node);
}

function ensureMinimumMaskInputs(node) {
  if (!node.inputs) return;
  while (maskInputs(node).length < MIN_INPUTS) {
    const next = maskInputs(node).length + 1;
    node.addInput(`mask_${next}`, "MASK");
  }
  renumberMaskInputs(node);
  refreshNode(node);
}

function initializeNewNodeInputs(node) {
  if (!node.inputs) return;
  const masks = maskInputs(node);
  // INPUT_TYPES declares all possible sockets; a new node starts with two visible.
  for (let i = masks.length - 1; i >= MIN_INPUTS; --i) {
    const index = node.inputs.indexOf(masks[i]);
    if (index >= 0) node.removeInput(index);
  }
  ensureMinimumMaskInputs(node);
}

function ensureAddButton(node) {
  if (node.__maskMajorityAddButton || !node.addWidget) return;
  node.__maskMajorityAddButton = node.addWidget(
    "button",
    "Add mask input",
    null,
    () => addMaskInput(node)
  );
}

app.registerExtension({
  name: "comfy-yanp.dynamic-mask-majority",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function (...args) {
      const result = onNodeCreated?.apply(this, args);
      initializeNewNodeInputs(this);
      ensureAddButton(this);
      return result;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (...args) {
      const result = onConfigure?.apply(this, args);
      queueMicrotask(() => {
        ensureMinimumMaskInputs(this);
        ensureAddButton(this);
      });
      return result;
    };

    const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      getExtraMenuOptions?.call(this, canvas, options);
      const masks = maskInputs(this);
      if (masks.length <= MIN_INPUTS) return;
      options.push(null);
      for (const input of masks) {
        const name = input.name;
        options.push({
          content: `Remove ${name}`,
          callback: () => removeMaskInput(this, name),
        });
      }
    };
  },
  loadedGraphNode(node) {
    if (node.comfyClass === NODE_TYPE || node.type === NODE_TYPE) {
      queueMicrotask(() => {
        ensureMinimumMaskInputs(node);
        ensureAddButton(node);
      });
    }
  },
});
