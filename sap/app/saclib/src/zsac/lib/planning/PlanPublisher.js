/** Publish Data: writes the unpublished changes of a PlanBuffer to the provider, model by model, then empties the buffer. */
sap.ui.define([], function () {
  "use strict";

  return {
    /** @returns {Promise<number>} number of values written; rejects (buffer kept) when the provider refuses */
    async publish(plan, provider) {
      let n = 0;
      for (const modelId of plan.models()) {
        const rows = plan.pending(modelId);
        await provider.writeFacts(modelId, rows);
        n += rows.length;
      }
      plan.clear();
      return n;
    }
  };
});
