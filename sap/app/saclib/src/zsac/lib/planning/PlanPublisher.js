/** Publish Data: writes the unpublished changes of a PlanBuffer to the provider, model by model, then empties the buffer. */
sap.ui.define(["sap/m/MessageBox"], function (MessageBox) {
  "use strict";

  return {
    /**
     * Version work (copy, publish, revert, lock, delete, data actions) reads published data. When there are unpublished changes the
     * planner is asked to publish them first.
     * @returns {Promise<boolean>} true when it is fine to go on
     */
    async settle(plan, provider, why) {
      if (!plan.dirty) { return true; }
      const ok = await new Promise((resolve) => MessageBox.confirm(why + " works on published data. Publish your " + plan.count + " unpublished changes first?", {
        actions: ["Publish Data", MessageBox.Action.CANCEL], emphasizedAction: "Publish Data", onClose: (a) => resolve(a === "Publish Data") }));
      if (!ok) { return false; }
      await this.publish(plan, provider);
      return true;
    },

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
