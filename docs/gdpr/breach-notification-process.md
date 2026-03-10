# Data Breach Notification Process (GDPR Articles 33 & 34)

> **Note:** Replace all `[placeholder]` values with actual information before going live.

## Overview

Under GDPR Articles 33 and 34, we must:
- Notify the supervisory authority within **72 hours** of becoming aware of a breach (Art. 33)
- Notify affected data subjects **without undue delay** if the breach is likely to result in high risk (Art. 34)

---

## 1. Detection & Classification

### Immediate Actions (0–2 hours)

1. Confirm the incident is a genuine data breach (not a false alarm)
2. Classify severity:
   - **Low:** Internal systems only, no personal data exposed, no external access
   - **Medium:** Limited personal data exposed (e.g., email addresses), low risk to individuals
   - **High:** Sensitive personal data exposed, financial data, credentials compromised
3. Document: time of discovery, nature of breach, data affected, approximate number of individuals

### Breach Types to Monitor

- Unauthorized access to user accounts or database
- Accidental exposure of user data (e.g., misconfigured API, logging of sensitive data)
- Loss or theft of data (e.g., backup compromise)
- Ransomware or data destruction

---

## 2. Containment (0–4 hours)

1. Isolate affected systems if necessary
2. Revoke compromised credentials or tokens
3. Preserve logs and evidence (do NOT delete)
4. Notify internal stakeholders: [CTO / Security Lead / Legal]
5. Assess whether breach is ongoing

---

## 3. Authority Notification (within 72 hours)

If the breach is likely to result in a risk to individuals' rights and freedoms:

**Notify:** [Supervisory Authority — e.g., UODO (Poland), ICO (UK), BfDI (Germany)]

**Required information (Art. 33(3)):**
- Nature of the breach (categories and approximate number of individuals affected)
- Name and contact of DPO or other contact point
- Likely consequences of the breach
- Measures taken or proposed to address the breach

**Template notification subject:** `GDPR Data Breach Notification — Monie — [Date]`

If notification cannot be made within 72 hours, provide notification as soon as possible with explanation of delay.

---

## 4. User Notification (Art. 34 — High Risk Only)

Notify affected users **without undue delay** if the breach is likely to result in **high risk** to their rights and freedoms (e.g., financial data compromised, credentials exposed).

**Notification method:** Email to affected users' registered email addresses

**Template subject:** `Important: Security Notice Regarding Your Monie Account`

**Notification must include:**
- Clear description of the nature of the breach
- Name and contact details of DPO or contact point
- Likely consequences
- Measures taken to address the breach
- Recommended actions for affected individuals (e.g., change password)

---

## 5. Post-Incident Review

Within 2 weeks of resolution:

1. Root cause analysis document
2. Impact assessment (actual vs. estimated)
3. Remediation actions implemented
4. Process improvements to prevent recurrence
5. Update breach register with final details

---

## 6. Internal Breach Register

Maintain a log of all breaches (including those not reported to authorities):

| Field | Description |
|-------|-------------|
| Date discovered | When the breach was first detected |
| Date of breach | When the breach actually occurred (if known) |
| Nature | Type of breach and data involved |
| Individuals affected | Approximate count and categories |
| Consequences | Actual or potential impact |
| Measures taken | Containment and remediation actions |
| Notified authority | Yes/No, date |
| Notified individuals | Yes/No, date |

---

## 7. Contact List

| Role | Contact |
|------|---------|
| Security Lead | [Name, email, phone] |
| Legal / DPO | [Name, email, phone] |
| Supervisory Authority | [Authority name, notification portal URL] |
| Incident Response | [External IR team if contracted] |
