/* eslint-env node */
// Notification helpers for SMS (Twilio) and email (SMTP via Nodemailer).
// SMS requirements:
//   - TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN from your console.
//   - Either a Messaging Service SID or a phone number that can send SMS.
// Email requirements:
//   - Access to an SMTP server (Gmail app password, Mailgun, etc.). Those
//     servers require host, port, username, password, and a "from" address,
//     which we read from .env so threshold evaluators can simply call the
//     helper without caring about credentials.
// Keeping this in a dedicated service keeps the rest of the app clean.

import twilio from "twilio";
import nodemailer from "nodemailer";

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TWILIO_MESSAGING_SERVICE_SID,
  EMAIL_SMTP_HOST,
  EMAIL_SMTP_PORT,
  EMAIL_SMTP_USER,
  EMAIL_SMTP_PASS,
  EMAIL_FROM_ADDRESS,
} = process.env;

const twilioEnabled = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN); // SMS toggled by env

const emailPort = EMAIL_SMTP_PORT ? Number(EMAIL_SMTP_PORT) : null;
const nodemailerConfigured = Boolean(
  EMAIL_SMTP_HOST &&
  emailPort &&
  EMAIL_SMTP_USER &&
  EMAIL_SMTP_PASS &&
  EMAIL_FROM_ADDRESS,
);

const twilioClient = twilioEnabled ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

const mailTransport = nodemailerConfigured
  ? nodemailer.createTransport({
      host: EMAIL_SMTP_HOST,
      port: emailPort,
      secure: emailPort === 465,
      auth: {
        user: EMAIL_SMTP_USER,
        pass: EMAIL_SMTP_PASS,
      },
    })
  : null;

export function isSmsEnabled() {
  return twilioEnabled && Boolean(TWILIO_MESSAGING_SERVICE_SID || TWILIO_PHONE_NUMBER);
}

export function isEmailEnabled() {
  return Boolean(mailTransport);
}

export async function sendSmsAlert({ to, body }) {
  if (!isSmsEnabled()) {
    throw new Error("Twilio SMS is not configured.");
  }
  if (!to || !body) {
    throw new Error("SMS alert requires 'to' number and message body.");
  }

  const payload = { to, body };
  if (TWILIO_MESSAGING_SERVICE_SID) {
    payload.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
  } else {
    payload.from = TWILIO_PHONE_NUMBER;
  }

  return twilioClient.messages.create(payload);
}

export async function sendEmailAlert({ to, subject, text, html }) {
  if (!isEmailEnabled()) {
    throw new Error("Email notifications are not configured.");
  }
  if (!to) {
    throw new Error("Email alert requires a 'to' address.");
  }

  const payload = {
    from: EMAIL_FROM_ADDRESS,
    to,
    subject: subject || "Homelab Insights Alert",
    text: text || html || "",
  };

  if (html) {
    payload.html = html;
  }

  return mailTransport.sendMail(payload);
}

export async function sendMultiChannelAlert({ smsRecipients = [], emailRecipients = [], message, subject, html }) {
  const smsPromises = [];
  if (message && isSmsEnabled()) {
    smsRecipients.forEach((recipient) => {
      smsPromises.push(sendSmsAlert({ to: recipient, body: message }));
    });
  }

  const emailPromises = [];
  if (isEmailEnabled()) {
    emailRecipients.forEach((recipient) => {
      emailPromises.push(
        sendEmailAlert({
          to: recipient,
          subject,
          text: message,
          html,
        }),
      );
    });
  }

  return Promise.all([...smsPromises, ...emailPromises]);
}
