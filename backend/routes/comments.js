const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/commentController");

// Test / analyze (no pageId in path)
router.post("/test", ctrl.testAnalysis);
router.get("/accounts", ctrl.listReplyDeskAccounts);

// Playbook — global first, then optional per-account
router.get("/playbook/global", ctrl.getGlobalPlaybook);
router.put("/playbook/global", ctrl.updateGlobalPlaybook);
router.get("/playbook/:pageId", ctrl.getPlaybook);
router.put("/playbook/:pageId", ctrl.updatePlaybook);
router.delete("/playbook/:pageId", ctrl.resetPlaybook);
router.post("/guidebook/clone-to-page/:pageId", ctrl.cloneGuidebookToPage);
router.post("/guidebook/override/:pageId/:category", ctrl.overrideGuidebookCategory);

// Guidebook CRUD
router.post("/guidebook/seed", ctrl.seedGuidebook);
router.get("/guidebook/list", ctrl.listGuidebook);
router.get("/guidebook/:id", ctrl.getGuidebookEntry);
router.post("/guidebook", ctrl.createGuidebookEntry);
router.put("/guidebook/:id", ctrl.updateGuidebookEntry);
router.delete("/guidebook/:id", ctrl.deleteGuidebookEntry);

// Per-page comment inbox
router.get("/:pageId/stats", ctrl.getInboxStats);
router.get("/:pageId/report", ctrl.getReport);
router.get("/:pageId/inbox", ctrl.getInbox);
router.post("/:pageId/analyze", ctrl.analyzePage);

// Single comment actions
router.get("/item/:id", ctrl.getComment);
router.patch("/item/:id/review", ctrl.reviewComment);
router.post("/item/:id/reanalyze", ctrl.reanalyzeComment);
router.post("/item/:id/add-to-guidebook", ctrl.addCommentToGuidebook);

module.exports = router;
