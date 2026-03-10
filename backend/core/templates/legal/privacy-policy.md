---
version: "1.0"
effective_date: "2025-01-01"
---

## 1. Introduction

Monie ("we", "our", or "us"), operated by **{{ operator_name }}**{% if is_individual %} (an individual){% endif %}, provides a personal finance tracking application. This Privacy Policy explains how we collect, use, and protect your personal data when you use Monie.

By registering for Monie, you agree to the collection and use of information in accordance with this policy.

## 2. Data We Collect

**Account data:**

- Email address (required, used for authentication)
- Full name (optional)
- Password (stored as a secure hash — never in plain text)

**Financial data:**

- Transactions (income and expense records)
- Budgets and categories
- Planned transactions
- Currency exchange records
- Period balances

**Technical data:**

- IP address — stored temporarily in Redis for rate limiting only (auto-expires, typically within 60 seconds)
- IP address at time of consent — stored with consent records for legal audit purposes

**Preferences:**

- Calendar start day preference

## 3. How We Use Your Data

- Providing the Monie service (personal finance tracking and budgeting)
- Authenticating your identity via JWT tokens
- Rate limiting to prevent abuse and protect the service
- Maintaining an audit trail of your consent (GDPR compliance)

## 4. Legal Basis (GDPR Article 6)

- **Consent (Art. 6(1)(a)):** You explicitly agree to our Terms of Service and Privacy Policy at registration.
- **Legitimate interest (Art. 6(1)(f)):** Rate limiting and security measures to protect our service and users.

## 5. Data Retention

- Account and financial data: retained until you delete your account
- Consent records: retained for legal compliance even after account deletion
- Rate limiting data: automatically expires (Redis TTL, typically 60 seconds)

## 6. Your Rights (GDPR)

- **Right to Access:** Export all your data from *Profile Settings → Account → Export All My Data*
- **Right to Rectification:** Update your profile from *Profile Settings → Profile Information*
- **Right to Erasure:** Delete your account from *Profile Settings → Account → Delete My Account*
- **Right to Data Portability:** Download your data in JSON format via the export feature
- **Right to Withdraw Consent:** Contact us at {{ contact_email }}

To exercise any rights, use the in-app features above or contact us at {{ contact_email }}.

## 7. Data Sharing

- We do not share your personal data with third parties
- We do not use analytics or tracking services
- We do not use advertising networks

## 8. Cookies & Local Storage

We use `localStorage` to store your authentication token. This is strictly functional — it allows you to stay logged in between sessions. We do not use tracking cookies or analytics cookies. No cookie consent banner is required as we use no tracking storage.

## 9. Data Security

- All data is transmitted over HTTPS/TLS
- Passwords are hashed using industry-standard algorithms
- Role-based access control for shared workspaces
- Rate limiting to prevent brute-force attacks

## 10. Contact

For privacy-related questions or to exercise your rights, contact:

**{{ operator_name }}**{% if contact_address %}

{{ contact_address }}{% endif %}

Email: {{ contact_email }}

## 11. Changes to This Policy

We may update this Privacy Policy when our practices change or when required by law. When we make significant changes, we will notify registered users via email or in-app notification. Continued use of Monie after changes constitutes acceptance of the updated policy.
