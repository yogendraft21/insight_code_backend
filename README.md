# GitHub PR AI Reviewer

A comprehensive Node.js application for automated AI-powered code reviews of GitHub pull requests, built with MongoDB and following MVC architecture.

## Features

- GitHub App integration for repository access
- OAuth authentication for users
- Automated AI code reviews using OpenAI
- Detailed feedback with code suggestions
- Notification system for Slack and email
- Repository-specific configuration
- Comprehensive metrics and reporting

## Architecture

This application follows the MVC (Model-View-Controller) pattern with a clear separation of concerns:

```
project-root/
├── src/
│   ├── config/       # Configuration files
│   ├── controllers/  # Request handlers
│   ├── models/       # MongoDB schemas
│   ├── routes/       # API routes
│   ├── services/     # Business logic
│   ├── middlewares/  # Express middlewares
│   ├── utils/        # Helper functions
│   ├── app.js        # Express app setup
│   └── server.js     # Server entry point
```

## Getting Started

### Prerequisites

- Node.js 18 or higher
- MongoDB
- GitHub account (for creating a GitHub App)
- OpenAI API key

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/github-pr-ai-reviewer.git
   cd github-pr-ai-reviewer
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on `.env.example` and update with your credentials.

4. Start the server:
   ```
   npm run dev
   ```

### Setting Up a GitHub App

1. Go to GitHub Developer Settings > GitHub Apps > New GitHub App
2. Configure the app with:
   - Webhook URL: Your server URL + `/github/webhook`
   - Permissions:
     - Repository: Contents (Read), Pull requests (Read & Write)
     - Organization: Members (Read)
   - Subscribe to events: Pull request, Installation

## Usage

### Authentication Flow

1. Users authenticate via GitHub OAuth
2. The system stores user credentials securely
3. JWT tokens are used for API authentication

### Pull Request Review Process

1. When a PR is opened or updated, GitHub sends a webhook event
2. The system retrieves PR details and changed files
3. The AI service analyzes code changes and generates feedback
4. Review comments are posted to the GitHub PR
5. Users receive notifications about the completed review

### API Endpoints

#### Authentication
- `GET /auth/github` - Redirect to GitHub OAuth
- `GET /auth/github/callback` - OAuth callback
- `GET /auth/me` - Get current user profile
- `POST /auth/logout` - Log out user

#### GitHub Integration
- `POST /github/webhook` - Webhook endpoint for GitHub events
- `GET /github/repositories` - List repositories
- `GET /github/repositories/:owner/:repo/config` - Get repository configuration
- `PUT /github/repositories/:owner/:repo/config` - Update repository configuration

#### Reviews
- `POST /review/trigger` - Manually trigger a review
- `GET /review/status/:reviewId` - Get review status
- `GET /review/list/:owner/:repo/:prNumber` - List reviews for a PR

#### Notifications
- `GET /notifications/preferences` - Get notification preferences
- `PUT /notifications/preferences` - Update notification preferences
- `POST /notifications/test` - Send test notification

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.