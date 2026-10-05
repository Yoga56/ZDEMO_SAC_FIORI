sap.ui.define([], function () {
  "use strict";

  /** How each kind of file looks and where it opens. `open(controller, file)` navigates to the editor. */
  const TYPES = {
    FOLDER: { label: "Folder", icon: "sap-icon://folder-full" },
    STORY: { label: "Story", icon: "sap-icon://business-objects-experience", open: (c, f) => c.navTo("story", { id: f.ObjectId }) },
    MODEL: { label: "Dataset", icon: "sap-icon://database", open: (c, f) => c.navTo("modeller", { id: f.ObjectId }) },
    DATAACTION: { label: "Data Action", icon: "sap-icon://workflow-tasks", open: (c, f) => c.router().navTo("dataactions", { query: { id: f.ObjectId } }) },
    MULTIACTION: { label: "Multi Action", icon: "sap-icon://process", open: (c, f) => c.router().navTo("multiactions", { query: { id: f.ObjectId } }) }
  };

  return {
    TYPES,
    icon: (t) => (TYPES[t] || TYPES.FOLDER).icon,
    label: (t) => (TYPES[t] || { label: t }).label,
    open(controller, file) { const t = TYPES[file.Type]; if (t && t.open) { t.open(controller, file); } }
  };
});
