# Users and Roles

This document describes the user management system, role hierarchy, and member management in Owlgarth Finances.

## User Model

Each user in the system has the following attributes:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `email` | Email address (unique, used for login) |
| `password_hash` | Bcrypt-hashed password |
| `full_name` | Display name (optional) |
| `current_workspace_id` | Currently active workspace |
| `is_active` | Whether user can log in |
| `created_at` | Account creation timestamp |
| `password_changed_at` | Last password change; invalidates refresh tokens issued before it |

## Role Definitions

### Owner

The highest permission level within a workspace.

**Capabilities:**
- Full control over workspace settings
- Manage all accounts, budgets, currencies, and records
- Add, edit, and remove any member
- Reset password for any member
- Reset 2FA for any member (they must set it up again at next login)
- Cannot be removed from workspace
- Only one owner per workspace

**Use Case:** Workspace creator or primary administrator

### Admin

High-level access for workspace management.

**Capabilities:**
- Manage accounts (create, edit, archive, delete) and enabled currencies
- Manage budgets and periods; full access to all records
- Add new members to workspace
- Manage members with lower roles (member, viewer)
- Reset passwords for members and viewers
- Reset 2FA for members and viewers

**Restrictions:**
- Cannot manage other admins
- Cannot manage the owner
- Cannot delete the workspace

**Use Case:** Team leads, department managers, or trusted collaborators

### Member

Standard access for daily budget operations.

**Capabilities:**
- Create and manage categories and set category budget amounts
- Record and manage transactions (incl. line items and receipt attachments)
- Record transfers between accounts
- Manage and execute planned transactions
- View all workspace data

**Restrictions:**
- Cannot create or manage accounts, budgets, periods, or currencies
- Cannot manage other users
- Cannot change workspace settings

**Use Case:** Team members who actively track expenses and budgets

### Viewer

Read-only access for monitoring and oversight.

**Capabilities:**
- View all accounts and balances
- View all transactions, transfers, budgets, and periods
- View reports and receipts
- View workspace member list

**Restrictions:**
- Cannot create or modify any data
- Cannot manage users
- Cannot change any settings

**Use Case:** Stakeholders, auditors, or family members who need visibility without edit access

## User Hierarchy Diagram

```
Workspace
│
├── Owner (1)
│   └── Full control
│
├── Admin (0-N)
│   └── Manage members + data
│
├── Member (0-N)
│   └── Manage data only
│
└── Viewer (0-N)
    └── Read-only access
```

## Workspace Membership

Users are connected to workspaces through the `workspace_members` table:

| Field | Description |
|-------|-------------|
| `workspace_id` | Target workspace |
| `user_id` | User being granted access |
| `role` | Permission level (owner/admin/member/viewer) |
| `created_at` | When membership was created |

### Membership Rules

1. **One Owner Per Workspace**: Each workspace has exactly one owner (the creator)
2. **Multiple Memberships**: A user can belong to multiple workspaces with different roles
3. **Role Per Workspace**: The same user can be an owner in one workspace and a viewer in another
4. **No Self-Management**: Users cannot change their own role or remove themselves (except by leaving)

## Member Management Operations

### Adding a New Member

```
Actor: Owner or Admin
Target: Any email address

Process:
1. Enter email, role, optional name, and optional password
2. If user exists: Add to workspace (password ignored); they get an "added" email
3. If user doesn't exist:
   - With a password: create the user with it as their initial password
     (shared with them out-of-band); they get an invitation email
   - Without a password: create the user with an unusable password; they get
     an invitation email with a set-password link (a standard reset-token
     link, consumed at /reset-password) and cannot log in until they set one
```

The API response is identical whether the user already existed or was just created -
it does not reveal which (anti-enumeration).

### Changing a Member's Role

```
Actor: Owner or Admin
Target: Member with lower permissions

Rules:
- Owner can change any member's role
- Admin can only change member/viewer roles
- Cannot change own role
- Cannot change owner's role
```

### Removing a Member

```
Actor: Owner or Admin
Target: Member with lower permissions

Rules:
- Owner can remove any member except themselves
- Admin can only remove members/viewers
- Removed user loses workspace access
- User account is NOT deleted (only membership)
```

### Password Reset

```
Actor: Owner or Admin
Target: Member with lower permissions

Rules:
- Owner can reset for admin/member/viewer
- Admin can only reset for member/viewer
- Cannot reset own password via this feature
- User must be notified of new password
- Resetting a member's 2FA follows the same hierarchy (see 2FA Reset below)
```

### 2FA Reset

```
Actor: Owner or Admin
Target: Member with lower permissions (must have 2FA enabled)

Rules:
- Same hierarchy as password reset: owner resets for
  admin/member/viewer, admin only for member/viewer
- Cannot reset own 2FA via this feature
- Cannot reset the owner's 2FA
- The member is emailed a notice and must set up 2FA
  again at next login
```

### Leaving a Workspace

```
Actor: Any member except owner
Target: Self

Rules:
- Owner cannot leave (must transfer ownership first)
- Membership is removed
- current_workspace_id unset if it was this workspace
- User account remains for other workspaces
```

## Authentication Flow

### Registration

```
1. User provides email, password, full_name, workspace_name
2. System validates:
   - Email not already in use
   - Password meets requirements (8+ chars)
3. System creates:
   - User account
   - Workspace with user as owner (the chosen currency set enabled,
      first = primary)
   - Default "Main" account and "General" budget
   - Workspace membership (owner role)
   - Optional sample data if requested at registration
4. Access + refresh JWTs returned
5. A verification email is sent (its token is consumed via
   POST /api/auth/verify-email; POST /api/auth/resend-verification re-sends
   it, rate-limited). Login does not require a verified email - verification
   status never gates authentication
```

A duplicate email returns a generic error that never reveals whether the address is
registered; the owner of the existing account is emailed a "registration attempt"
notice instead (anti-enumeration).

### Login

```
1. User provides email and password
2. System validates credentials
3. 2FA off: an access + refresh token pair is returned
4. 2FA on: a short-lived temporary token is returned instead and must be
   exchanged (with a TOTP or recovery code) at POST /api/auth/verify-2fa,
   which then issues the token pair
5. Access tokens are short-lived; POST /api/auth/refresh rotates the pair,
   and refresh tokens issued before the user's last password change are
   rejected
```

Login attempts are rate-limited per IP and per account (email) - exceeding either
limit returns `429 Too Many Requests`. Unknown-email logins run the same password
hash check as wrong-password ones, so response timing cannot reveal whether an
email is registered.

See [workflow.md](workflow.md) for the canonical authentication narrative.

### Two-Factor Authentication (2FA)

- **Enabling:** users opt in from Settings: `POST /api/users/me/2fa/setup`
  returns a QR code + secret for an authenticator app; confirming a code via
  `POST /api/users/me/2fa/verify-setup` enables 2FA and returns single-use
  recovery codes (shown once; regenerable with the password via
  `POST /api/users/me/2fa/regenerate-codes`). Disabling
  (`POST /api/users/me/2fa/disable`) also requires the password.
- **Login:** with 2FA enabled, login returns a temporary token that is exchanged
  for the token pair at `POST /api/auth/verify-2fa` with a TOTP or recovery
  code. Both code kinds are single-use (TOTP has a timestep replay guard);
  recovery codes are stored hashed.
- **Storage:** 2FA secrets are Fernet-encrypted (`TWO_FACTOR_ENCRYPTION_KEY`;
  empty falls back to a `SECRET_KEY`-derived key).
- **Admin reset:** owners/admins can reset a lower-role member's 2FA via
  `POST /api/workspaces/{id}/members/{userId}/reset-2fa` (same hierarchy as
  password reset - see [2FA Reset](#2fa-reset)); the member is emailed a
  notice and must set 2FA up again.

### Password Requirements

- Minimum 8 characters
- Stored using bcrypt hashing
- Never logged or returned in responses
- Changing a password (self-service, reset, or admin reset) invalidates all refresh tokens issued before the change

## Multi-Workspace Scenarios

### Personal + Work Workspaces

```
User: john@example.com

Workspace "Personal Budget"
  └── Role: Owner

Workspace "Company Finance"
  └── Role: Admin

Workspace "Family Budget"
  └── Role: Member
```

### Team Collaboration

```
Workspace "Marketing Team Budget"
├── Owner: sarah@company.com
├── Admin: mike@company.com
├── Member: alice@company.com
├── Member: bob@company.com
└── Viewer: cfo@company.com
```

## Data Isolation

- Users can only see data from workspaces they belong to
- Switching workspaces changes all data views
- Cross-workspace data access is blocked at the API level
- Resources validate workspace ownership on every operation
