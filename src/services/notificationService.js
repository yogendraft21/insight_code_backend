/**
 * Notification Service
 * Handles sending notifications via Slack and email
 */
const axios = require('axios');
const nodemailer = require('nodemailer');
const { slack, email } = require('../config/env');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    // Initialize email transporter if configured
    if (email.enabled) {
      this.transporter = nodemailer.createTransport({
        host: email.host,
        port: email.port,
        secure: email.port === 465,
        auth: {
          user: email.user,
          pass: email.pass
        }
      });
    }
  }

  /**
   * Send notification
   * @param {Object} options - Notification options
   * @param {string} options.type - Notification type ('pr_opened', 'review_completed', etc.)
   * @param {Object} options.data - Notification data
   * @param {Array} options.channels - Notification channels ('slack', 'email')
   * @param {Object} options.recipients - Notification recipients
   * @returns {Promise<Object>} Notification results
   */
  async send(options) {
    const { type, data, channels = ['slack', 'email'], recipients } = options;
    
    const results = {
      slack: { sent: false, error: null },
      email: { sent: false, error: null }
    };
    
    // Format message based on notification type
    const message = this.formatMessage(type, data);
    
    // Send to each requested channel
    const promises = [];
    
    if (channels.includes('slack') && slack.enabled) {
      promises.push(
        this.sendSlack(message)
          .then(() => { results.slack.sent = true; })
          .catch(error => { results.slack.error = error.message; })
      );
    }
    
    if (channels.includes('email') && email.enabled && recipients?.email) {
      promises.push(
        this.sendEmail(recipients.email, message.subject, message.emailBody)
          .then(() => { results.email.sent = true; })
          .catch(error => { results.email.error = error.message; })
      );
    }
    
    await Promise.all(promises);
    return results;
  }

  /**
   * Send Slack notification
   * @param {Object} message - Formatted message
   * @returns {Promise<void>}
   */
  async sendSlack(message) {
    try {
      await axios.post(slack.webhookUrl, {
        blocks: message.slackBlocks
      });
      
      logger.info('Slack notification sent successfully');
    } catch (error) {
      logger.error('Error sending Slack notification', { error: error.message });
      throw new Error(`Failed to send Slack notification: ${error.message}`);
    }
  }

  /**
   * Send email notification
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} body - Email body (HTML)
   * @returns {Promise<void>}
   */
  async sendEmail(to, subject, body) {
    if (!this.transporter) {
      throw new Error('Email transport not configured');
    }
    
    try {
      const result = await this.transporter.sendMail({
        from: email.from,
        to,
        subject,
        html: body
      });
      
      logger.info('Email notification sent successfully', { messageId: result.messageId });
    } catch (error) {
      logger.error('Error sending email notification', { error: error.message });
      throw new Error(`Failed to send email notification: ${error.message}`);
    }
  }

  /**
   * Format message based on notification type
   * @param {string} type - Notification type
   * @param {Object} data - Notification data
   * @returns {Object} Formatted message for different channels
   */
  formatMessage(type, data) {
    switch (type) {
      case 'pr_opened':
        return {
          subject: `New Pull Request: ${data.title}`,
          slackBlocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*New Pull Request*: <${data.url}|${data.title}>\nRepository: ${data.repository}\nAuthor: ${data.author}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${data.description || 'No description provided'}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View PR'
                  },
                  url: data.url
                }
              ]
            }
          ],
          emailBody: `
            <h2>New Pull Request</h2>
            <p><strong>Title:</strong> ${data.title}</p>
            <p><strong>Repository:</strong> ${data.repository}</p>
            <p><strong>Author:</strong> ${data.author}</p>
            <p><strong>Description:</strong> ${data.description || 'No description provided'}</p>
            <p><a href="${data.url}">View Pull Request</a></p>
          `
        };
        
      case 'review_completed':
        return {
          subject: `AI Review Completed: ${data.title}`,
          slackBlocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*AI Review Completed*: <${data.url}|${data.title}>\nRepository: ${data.repository}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Summary:*\n${data.summary}`
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Issues:* ${data.issueCount}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Suggestions:* ${data.suggestionCount}`
                }
              ]
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View Review'
                  },
                  url: data.url
                }
              ]
            }
          ],
          emailBody: `
            <h2>AI Review Completed</h2>
            <p><strong>Pull Request:</strong> ${data.title}</p>
            <p><strong>Repository:</strong> ${data.repository}</p>
            <h3>Summary</h3>
            <p>${data.summary}</p>
            <p><strong>Issues:</strong> ${data.issueCount}</p>
            <p><strong>Suggestions:</strong> ${data.suggestionCount}</p>
            <p><a href="${data.url}">View Review</a></p>
          `
        };
        
      case 'review_failed':
        return {
          subject: `AI Review Failed: ${data.title}`,
          slackBlocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*AI Review Failed*: <${data.url}|${data.title}>\nRepository: ${data.repository}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Error:*\n${data.error}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View PR'
                  },
                  url: data.url
                }
              ]
            }
          ],
          emailBody: `
            <h2>AI Review Failed</h2>
            <p><strong>Pull Request:</strong> ${data.title}</p>
            <p><strong>Repository:</strong> ${data.repository}</p>
            <p><strong>Error:</strong> ${data.error}</p>
            <p><a href="${data.url}">View Pull Request</a></p>
          `
        };
        
      default:
        return {
          subject: 'Notification from PR AI Reviewer',
          slackBlocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Notification from PR AI Reviewer`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: JSON.stringify(data, null, 2)
              }
            }
          ],
          emailBody: `
            <h2>Notification from PR AI Reviewer</h2>
            <pre>${JSON.stringify(data, null, 2)}</pre>
          `
        };
    }
  }
}

module.exports = new NotificationService();