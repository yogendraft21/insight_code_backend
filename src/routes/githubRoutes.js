const express = require('express');
const githubController = require('../controllers/githubController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public routes (no auth required)
router.post('/webhook', githubController.webhookHandler);
router.get('/callback', githubController.oauthCallback);
router.get('/installation/callback', githubController.postInstallCallback);

// Protected routes (auth required)
router.post('/prepare-installation', authenticate, githubController.prepareInstallation);
router.get('/installation', authenticate, githubController.checkInstallation);
router.get('/repositories', authenticate, githubController.listRepositories);
router.get('/repositories/:owner/:repo/config', authenticate, githubController.getRepositoryConfig);
router.put('/repositories/:owner/:repo/config', authenticate, githubController.updateRepositoryConfig);

module.exports = router;