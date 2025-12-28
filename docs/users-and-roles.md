# Users and Roles

This document describes the user management system, role hierarchy, and member management in Monie.

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

## Role Definitions

### Owner

The highest permission level within a workspace.

**Capabilities:**
- Full control over workspace settings
- Manage all budget accounts, periods, and data
- Add, edit, and remove any member
- Reset password for any member
- Cannot be removed from workspace
- Only one owner per workspace

**Use Case:** Workspace creator or primary administrator

### Admin

High-level access for workspace management.

**Capabilities:**
- Manage budget accounts (create, edit, delete)
- Full access to all budget data
- Add new members to workspace
- Manage members with lower roles (member, viewer)
- Reset passwords for members and viewers

**Restrictions:**
- Cannot manage other admins
- Cannot manage the owner
- Cannot delete the workspace

**Use Case:** Team leads, department managers, or trusted collaborators

### Member

Standard access for daily budget operations.

**Capabilities:**
- Create and manage budget periods
- Create and manage categories and budgets
- Record and manage transactions
- Manage planned transactions
- Record currency exchanges
- View all workspace data

**Restrictions:**
- Cannot create or manage budget accounts
- Cannot manage other users
- Cannot change workspace settings

**Use Case:** Team members who actively track expenses and budgets

### Viewer

Read-only access for monitoring and oversight.

**Capabilities:**
- View all budget accounts and periods
- View all transactions and budgets
- View reports and balances
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
1. Enter email, role, optional name, and password (for new users)
2. If user exists: Add to workspace
3. If user doesn't exist: Create with provided password
4. Share credentials securely with new user
```

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
   - Workspace with user as owner
   - Default "General" budget account
   - Workspace membership (owner role)
4. JWT token returned
```

### Login

```
1. User provides email and password
2. System validates credentials
3. JWT token returned with:
   - user_id
   - email
   - current_workspace_id
4. Token valid for 60 minutes (configurable)
```

### Password Requirements

- Minimum 8 characters
- Stored using bcrypt hashing
- Never logged or returned in responses

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
