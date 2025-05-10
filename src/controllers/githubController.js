const githubService = require('../services/githubService');
const Repository = require('../models/Repository');
const Installation = require('../models/Installation');
const { asyncHandler } = require('../middlewares/errorHandler');

const webhookHandler = asyncHandler(async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;
  
  await githubService.handleWebhook(event, payload);
  
  res.status(200).json({ message: 'Webhook received' });
});

const prepareInstallation = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  const result = await githubService.prepareInstallation(userId);
  
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  
  res.json({
    success: true,
    oauthUrl: result.oauthUrl
  });
});

const oauthCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || !state) {
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard/repositories?error=missing_params`);
  }
  
  const result = await githubService.handleOAuthCallback(code, state);
  
  if (!result.success) {
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard/repositories?error=${encodeURIComponent(result.error)}`);
  }
  
  // Redirect to GitHub App installation page
  res.redirect(result.installationUrl);
});

const checkInstallation = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  // Find active installation for this user
  const installation = await Installation.findOne({
    userId: userId,
    status: 'active',
    isActive: true
  });
  
  if (!installation) {
    return res.json({
      installed: false,
      organizationName: null,
      installationId: null,
      accountType: null
    });
  }
  
  res.json({
    installed: true,
    organizationName: installation.accountLogin,
    installationId: installation.installationId,
    accountType: installation.accountType
  });
});

const postInstallCallback = asyncHandler(async (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/dashboard/repositories?installation=success`);
});

const listRepositories = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  // Find user's installation
  const installation = await Installation.findOne({
    userId: userId,
    status: 'active',
    isActive: true
  });
  
  if (!installation) {
    return res.json({ repositories: [] });
  }
  
  // Find repositories for this installation
  const repositories = await Repository.find({ 
    installationId: installation.installationId,
    isActive: true 
  });
  
  res.json({ repositories });
});

const getRepositoryConfig = asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  
  const repository = await Repository.findByFullName(fullName);
  
  if (!repository) {
    return res.status(404).json({ error: 'Repository not found' });
  }
  
  res.json({ config: repository.configuration });
});

const updateRepositoryConfig = asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  const config = req.body;
  
  const repository = await Repository.findByFullName(fullName);
  
  if (!repository) {
    return res.status(404).json({ error: 'Repository not found' });
  }
  
  repository.configuration = {
    ...repository.configuration,
    ...config
  };
  
  await repository.save();
  
  res.json({ config: repository.configuration });
});

module.exports = {
  webhookHandler,
  prepareInstallation,
  oauthCallback,
  checkInstallation,
  postInstallCallback,
  listRepositories,
  getRepositoryConfig,
  updateRepositoryConfig
};