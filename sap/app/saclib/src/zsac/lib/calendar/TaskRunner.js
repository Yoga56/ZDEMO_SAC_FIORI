/**
 * What a planning task of the calendar does when it is run (the parts that need no dialog).
 *
 *   TaskRunner.lock(provider, event) -> Promise<{ ok, message }>   locks (or, with Config.Mode "UNLOCK", unlocks) the version of a data locking task
 *   TaskRunner.target(event) -> text of what the task will do
 *
 * A data action task and a multi action task are run through the run dialog of the action (DataActionRun), which asks for the parameters
 * kept in Config.Values and shows the result; the calendar records the outcome with CalendarEngine.afterRun.
 */
sap.ui.define(["./CalendarEngine"], function (Engine) {
  "use strict";

  const mode = (event) => (Engine.normalize(event).Config.Mode === "UNLOCK" ? "UNLOCK" : "LOCK");

  function target(event) {
    const e = Engine.normalize(event);
    if (e.Type === "LOCK") { return (mode(e) === "UNLOCK" ? "Unlocks" : "Locks") + " version " + (e.VersionId || "(none chosen)") + " of " + (e.ModelId || "(no plan chosen)"); }
    return e.Config.ActionId ? "Runs " + e.Config.ActionId : "No action chosen";
  }

  async function lock(provider, event) {
    const e = Engine.normalize(event);
    if (e.Type !== "LOCK") { throw new Error("This is not a data locking task"); }
    if (!e.ModelId || !e.VersionId) { throw new Error("Choose the model and the version to lock"); }
    const version = (await provider.listVersions(e.ModelId)).find((v) => v.VersionId === e.VersionId);
    if (!version) { throw new Error("Version " + e.VersionId + " does not exist in " + e.ModelId); }
    const lockIt = mode(e) === "LOCK";
    if (!!version.Locked === lockIt) { return { ok: true, message: "Version " + version.VersionId + " was already " + (lockIt ? "locked" : "unlocked") }; }
    await provider.saveVersion(Object.assign({}, version, { Locked: lockIt }));
    return { ok: true, message: "Version " + version.VersionId + " " + (lockIt ? "locked" : "unlocked") };
  }

  return { lock, target, mode };
});
