# GDPR Compliance Documentation

This directory contains documentation for Moniteria's GDPR compliance implementation.

## Documents

| Document | Description |
|----------|-------------|
| [Data Processing Records](./data-processing-records.md) | Article 30 records of processing activities |
| [Breach Notification Process](./breach-notification-process.md) | Articles 33/34 incident response procedures |
| Privacy Policy | Available at `/privacy` in the application |
| Terms of Service | Available at `/terms` in the application |

## Technical Implementation

### Consent Management (Articles 6, 7)

- **Model:** `UserConsent` in `backend/users/models.py`
- **Service:** `UserService.record_consent`, `withdraw_consent`, `get_active_consents` in `backend/users/services.py`
- **Endpoints:**
  - `GET /api/users/me/consents` — list active consents
  - `POST /api/users/me/consents` — grant consent
  - `DELETE /api/users/me/consents/{type}` — withdraw consent
- **Registration:** Consent is recorded during user registration (`backend/core/api.py`)
- **Frontend:** Checkbox on `/register` page requiring acceptance before account creation

### Right to Erasure (Article 17)

- **Service:** `UserService.delete_account` in `backend/users/services.py`
- **Endpoints:**
  - `GET /api/users/me/deletion-check` — pre-deletion impact summary
  - `DELETE /api/users/me` — permanently delete account (requires password)
- **Frontend:** Delete Account section in Profile Settings → Account tab
- **Cascade behavior:**
  - Solo-owned workspaces: fully deleted with all budget data
  - Shared workspace memberships: membership removed, workspace data preserved
  - `created_by`/`updated_by` on financial records: set to NULL (anonymized)
  - `UserConsent` records: retained with `user=NULL` for GDPR audit trail

### Right to Access & Portability (Articles 15, 20)

- **Service:** `UserService.export_all_data` in `backend/users/services.py`
- **Endpoint:** `GET /api/users/me/export` — downloads JSON file with all personal data
- **Rate limit:** 3 exports per hour
- **Frontend:** Export button in Profile Settings → Account tab
- **Includes:** Profile, preferences, consents, all workspace/budget/transaction data

### Public-Facing Pages

- `/privacy` — Privacy Policy
- `/terms` — Terms of Service

Legal documents are served from the database. Templates serve as a one-time seed.

| Variable | Description |
|----------|-------------|
| `LEGAL_OPERATOR_NAME` | Company or individual name |
| `LEGAL_OPERATOR_TYPE` | `'company'` or `'individual'` |
| `LEGAL_CONTACT_EMAIL` | Contact email address |
| `LEGAL_CONTACT_ADDRESS` | Physical address (optional) |
| `LEGAL_JURISDICTION` | Legal jurisdiction |

To update policies:

**Option 1: Edit templates and reseed**
1. Edit the markdown file in `backend/core/templates/legal/`
2. Bump the `version` in YAML frontmatter
3. Run `python manage.py seed_legal_documents`
4. Users with old versions will be prompted to re-consent

**Option 2: Django Admin (self-hosted)**
1. Open `/admin/core/legaldocument/`
2. Add new record with updated content
3. Check `is_active` and save (previous version auto-deactivates)

## Data Subject Rights Summary

| Right | Implementation |
|-------|---------------|
| Access (Art. 15) | `/api/users/me/export` |
| Rectification (Art. 16) | `/api/users/me` (PATCH) |
| Erasure (Art. 17) | `/api/users/me` (DELETE) |
| Portability (Art. 20) | `/api/users/me/export` (JSON download) |
| Withdraw Consent (Art. 7) | `/api/users/me/consents/{type}` (DELETE) |
