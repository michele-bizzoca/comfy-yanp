import { app } from "../../scripts/app.js";

const TYPES = new Set(["mask_min", "mask_max"]);
const LIMIT = 64;
const isMask = input => /^mask_[1-9]\d*$/.test(input.name);

function syncMaskPorts(node) {
  if (node.__updatingMaskPorts || !node.inputs) return;
  node.__updatingMaskPorts = true;
  try {
    const connected = node.inputs.filter(input => isMask(input) && input.link != null);
    const highest = Math.max(1, ...connected.map(input => Number(input.name.slice(5))));
    const needed = Math.max(2, Math.min(LIMIT, highest + 1));

    // Remove only unused trailing sockets, preserving connected sockets and indices.
    for (let index = node.inputs.length - 1; index >= 0; --index) {
      const input = node.inputs[index];
      if (isMask(input) && Number(input.name.slice(5)) > needed && input.link == null) {
        node.removeInput(index);
      }
    }

    const existing = new Set(node.inputs.map(input => input.name));
    for (let index = 1; index <= needed; ++index) {
      const name = `mask_${index}`;
      if (!existing.has(name)) node.addInput(name, "MASK");
    }
    node.setSize(node.computeSize());
    node.setDirtyCanvas?.(true, true);
  } finally {
    node.__updatingMaskPorts = false;
  }
}

function scheduleMaskPorts(node) {
  if (node.__updatingMaskPorts || node.__maskPortsScheduled) return;
  node.__maskPortsScheduled = true;
  queueMicrotask(() => {
    node.__maskPortsScheduled = false;
    syncMaskPorts(node);
  });
}

app.registerExtension({
  name: "comfy-yanp.dynamic-mask-minmax",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!TYPES.has(nodeData.name)) return;

    for (const hook of ["onNodeCreated", "onConfigure"]) {
      const original = nodeType.prototype[hook];
      nodeType.prototype[hook] = function (...args) {
        const result = original?.apply(this, args);
        scheduleMaskPorts(this);
        return result;
      };
    }

    const onConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function (...args) {
      const result = onConnectionsChange?.apply(this, args);
      if (args[0] === 1) scheduleMaskPorts(this);
      return result;
    };
  },
  loadedGraphNode(node) {
    if (TYPES.has(node.comfyClass ?? node.type)) scheduleMaskPorts(node);
  },
});
