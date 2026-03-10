# Records of Processing Activities (GDPR Article 30)

> **Note:** Replace all `[placeholder]` values with actual information before going live.

## Controller Information

| Field | Value |
|-------|-------|
| Data Controller | [Company Name], [Address] |
| Contact | [your-email@example.com] |
| DPO | [If appointed — name and contact; otherwise N/A] |

---

## Processing Activity 1: User Account Management

| Field | Value |
|-------|-------|
| Purpose | User authentication and account management |
| Legal Basis | Consent (Art. 6(1)(a)) |
| Categories of Data Subjects | Registered users |
| Categories of Personal Data | Email address, full name (optional), hashed password, account status, timestamps |
| Recipients | None — no third-party sharing |
| Transfers to Third Countries | None (or specify hosting provider location) |
| Retention Period | Until account deletion |
| Technical Measures | JWT authentication, HTTPS/TLS, password hashing, rate limiting |

---

## Processing Activity 2: Financial Data Tracking

| Field | Value |
|-------|-------|
| Purpose | Personal finance tracking and budgeting |
| Legal Basis | Consent (Art. 6(1)(a)) — performance of service agreed to at registration |
| Categories of Data Subjects | Registered users |
| Categories of Personal Data | Transactions, budgets, categories, planned transactions, currency exchanges, period balances, workspace memberships |
| Recipients | None — data only accessible to workspace members |
| Transfers to Third Countries | None |
| Retention Period | Until account or workspace deletion |
| Technical Measures | Role-based access control, workspace isolation, HTTPS/TLS |

---

## Processing Activity 3: Consent Tracking

| Field | Value |
|-------|-------|
| Purpose | GDPR compliance — recording and auditing user consent |
| Legal Basis | Legal obligation (Art. 6(1)(c)) |
| Categories of Data Subjects | Registered users |
| Categories of Personal Data | Consent type, document version, grant/withdrawal timestamps, IP address at time of consent |
| Recipients | None |
| Transfers to Third Countries | None |
| Retention Period | Retained for legal compliance purposes even after account deletion |
| Technical Measures | Immutable audit records (soft-delete with withdrawn_at timestamp) |

---

## Processing Activity 4: Rate Limiting

| Field | Value |
|-------|-------|
| Purpose | Security — preventing abuse and brute-force attacks |
| Legal Basis | Legitimate interest (Art. 6(1)(f)) |
| Categories of Data Subjects | All visitors and users |
| Categories of Personal Data | IP address |
| Recipients | None |
| Transfers to Third Countries | None |
| Retention Period | Automatically expires (Redis TTL, typically 60 seconds) |
| Technical Measures | Redis with TTL-based expiry |

---

## Organizational Measures

- Access to production systems restricted to authorized personnel
- Role-based access control within the application
- Workspace isolation ensures data is only visible to authorized workspace members
- Regular security reviews
