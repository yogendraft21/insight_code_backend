const express = require("express");
const pullRequestController = require("../controllers/pullRequestController");
const { authenticate } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", authenticate, pullRequestController.getUserPullRequests);

router.get(
  "/repository/:repositoryId",
  authenticate,
  pullRequestController.getRepositoryPullRequests
);

router.post("/sync", authenticate, pullRequestController.syncPullRequests);

router.post(
  "/sync/:repositoryId",
  authenticate,
  pullRequestController.syncRepositoryPullRequests
);

router.post(
  "/:pullRequestId/review",
  authenticate,
  pullRequestController.triggerReview
);

module.exports = router;
