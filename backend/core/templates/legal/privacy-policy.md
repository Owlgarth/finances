---
version: "2.1"
effective_date: "2026-08-24"
---

## 1. Introduction

Owlgarth Finances ("we", "our", or "us"), operated by **{{ operator_name }}**{% if is_individual %} (an individual){% endif %}, provides a personal finance tracking application. This Privacy Policy explains how we collect, use, and protect your personal data when you use Owlgarth Finances.

By registering for Owlgarth Finances, you agree to the collection and use of information in accordance with this policy.

## 2. Data We Collect

**Account data:**

- Email address (required, used for authentication)
- Full name (optional)
- Password (stored as a secure hash — never in plain text)

**Financial data:**

- Accounts and their balances
- Transactions (income, expense, and balance adjustments) and their line items
- Transfers between your accounts
- Budgets, categories, and planned transactions

**Receipt attachments:**

- Images or PDFs of receipts you choose to upload and attach to transactions
- Line items and totals extracted from those receipts (see Section 7)

**Technical data:**

- IP address — stored temporarily in Redis for rate limiting only (auto-expires, typically within 60 seconds)
- IP address at time of consent — stored with consent records for legal audit purposes

**Preferences:**

- Calendar start day preference

**Security data:**

- Two-factor authentication (2FA) status and usage metadata (enabled/disabled, last used timestamp)
- 2FA secret is stored encrypted and never exported or shared in any form

## 3. How We Use Your Data

- Providing the Owlgarth Finances service (personal finance tracking and budgeting)
- Authenticating your identity via JWT tokens
- Rate limiting to prevent abuse and protect the service
- Maintaining an audit trail of your consent (GDPR compliance)
- Extracting line items and totals from receipts you upload, when you request it (see Section 7)

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

## 7. Receipt Storage & Extraction

Receipt attachments are personal data and are handled as follows:

- **Storage:** Uploaded receipt files are stored in private object storage. They are never publicly accessible; the app retrieves them only through short-lived, signed links generated for your authenticated session.
- **Optional extraction:** If you choose "Extract items" (or create a transaction from a receipt), the receipt image is sent to a receipt-extraction service to read its text, so we can pre-fill the total, date, and line items for your review. Extraction is entirely optional — if the operator has not configured an extraction service, the feature is unavailable and no receipt ever leaves our storage.
- **Where extraction runs:** The extraction service may be self-hosted by the operator or provided by a third-party model provider, depending on this deployment's configuration. When a third-party provider is used, the receipt image is transmitted to that provider solely to perform the extraction. The service is stateless and is not instructed to retain your image; however, a third-party provider's own retention and processing are governed by that provider's terms. Operators who require that no data leaves their infrastructure should configure a self-hosted model.
- **Deletion:** Deleting a receipt, its transaction, or your account removes the stored file from object storage along with the database records.

## 8. Data Sharing

- Apart from the optional receipt extraction described in Section 7, we do not share your personal data with third parties
- We do not use analytics or tracking services
- We do not use advertising networks

## 9. Cookies & Local Storage

We use `localStorage` to store your authentication token. This is strictly functional — it allows you to stay logged in between sessions. We do not use tracking cookies or analytics cookies. No cookie consent banner is required as we use no tracking storage.

## 10. Data Security

- All data is transmitted over HTTPS/TLS
- Passwords are hashed using industry-standard algorithms
- Two-factor authentication (TOTP) available for additional account protection
- 2FA secrets are encrypted at rest and recovery codes are stored as hashes
- Role-based access control for shared workspaces
- Rate limiting to prevent brute-force attacks

## 11. Contact

For privacy-related questions or to exercise your rights, contact:

**{{ operator_name }}**{% if contact_address %}

{{ contact_address }}{% endif %}

Email: {{ contact_email }}

## 12. Changes to This Policy

We may update this Privacy Policy when our practices change or when required by law. When we make significant changes, we will notify registered users via email or in-app notification. Continued use of Owlgarth Finances after changes constitutes acceptance of the updated policy.
