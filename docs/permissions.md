# Role-Based Permissions Matrix

This document describes the permission system and access control matrix for Monie.

## Permission Layers

The application implements a four-layer security model:

```
Layer 1: Authentication (JWT Validation)
   └── Is this a valid user?

Layer 2: Workspace Membership
   └── Does user belong to target workspace?

Layer 3: Role-Based Permissions
   └── Does user's role allow this action?

Layer 4: Resource Ownership Validation
   └── Does resource belong to user's workspace?
```

## Role Hierarchy

| Role | Level | Description |
|------|-------|-------------|
| **Owner** | 1 (Highest) | Full workspace control, can manage all members |
| **Admin** | 2 | Can manage members (with restrictions) and all data |
| **Member** | 3 | Can create/edit/delete budget data only |
| **Viewer** | 4 (Lowest) | Read-only access to all data |

## Complete Permissions Matrix

### Budget Account Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View budget accounts | ✓ | ✓ | ✓ | ✓ |
| Create budget account | ✓ | ✓ | ✗ | ✗ |
| Edit budget account | ✓ | ✓ | ✗ | ✗ |
| Delete budget account | ✓ | ✓ | ✗ | ✗ |
| Archive/Unarchive | ✓ | ✓ | ✗ | ✗ |

### Budget Period Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View periods | ✓ | ✓ | ✓ | ✓ |
| Create period | ✓ | ✓ | ✓ | ✗ |
| Edit period | ✓ | ✓ | ✓ | ✗ |
| Delete period | ✓ | ✓ | ✓ | ✗ |
| Copy period | ✓ | ✓ | ✓ | ✗ |

### Category Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View categories | ✓ | ✓ | ✓ | ✓ |
| Create category | ✓ | ✓ | ✓ | ✗ |
| Edit category | ✓ | ✓ | ✓ | ✗ |
| Delete category | ✓ | ✓ | ✓ | ✗ |
| Import categories | ✓ | ✓ | ✓ | ✗ |

### Budget Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View budgets | ✓ | ✓ | ✓ | ✓ |
| Create budget | ✓ | ✓ | ✓ | ✗ |
| Edit budget | ✓ | ✓ | ✓ | ✗ |
| Delete budget | ✓ | ✓ | ✓ | ✗ |

### Transaction Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View transactions | ✓ | ✓ | ✓ | ✓ |
| Create transaction | ✓ | ✓ | ✓ | ✗ |
| Edit transaction | ✓ | ✓ | ✓ | ✗ |
| Delete transaction | ✓ | ✓ | ✓ | ✗ |

### Planned Transaction Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View planned | ✓ | ✓ | ✓ | ✓ |
| Create planned | ✓ | ✓ | ✓ | ✗ |
| Edit planned | ✓ | ✓ | ✓ | ✗ |
| Delete planned | ✓ | ✓ | ✓ | ✗ |
| Execute planned | ✓ | ✓ | ✓ | ✗ |
| Import planned | ✓ | ✓ | ✓ | ✗ |

### Currency Exchange Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View exchanges | ✓ | ✓ | ✓ | ✓ |
| Create exchange | ✓ | ✓ | ✓ | ✗ |
| Edit exchange | ✓ | ✓ | ✓ | ✗ |
| Delete exchange | ✓ | ✓ | ✓ | ✗ |

### Period Balance Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View balances | ✓ | ✓ | ✓ | ✓ |
| Edit opening balance | ✓ | ✓ | ✓ | ✗ |
| Recalculate balances | ✓ | ✓ | ✓ | ✗ |

### Workspace Member Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View members list | ✓ | ✓ | ✓ | ✓ |
| Add new member | ✓ | ✓ | ✗ | ✗ |
| Change member role | ✓ | ✓* | ✗ | ✗ |
| Remove member | ✓ | ✓* | ✗ | ✗ |
| Reset member password | ✓ | ✓* | ✗ | ✗ |

**\* Admin Restrictions:**
- Cannot manage other admins
- Cannot manage the owner
- Can only manage members and viewers

### Workspace Settings

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View workspace settings | ✓ | ✓ | ✓ | ✓ |
| Update workspace name | ✓ | ✓ | ✗ | ✗ |
| Delete workspace | ✓ | ✗ | ✗ | ✗ |

## Backend Enforcement

All permissions are enforced server-side in Django Ninja endpoints:

```python
from common.auth import JWTAuth
from core.dependencies import require_workspace_access, require_role

# Authentication required
@router.get('/endpoint', auth=JWTAuth())
def endpoint(request):
    user = request.auth  # Authenticated User instance

# Workspace access and role validation
# Checked within endpoint handlers via WorkspaceMember queries

# Example: Owner/Admin only actions
membership = WorkspaceMember.objects.get(
    workspace=workspace,
    user=request.auth
)
if membership.role not in ['owner', 'admin']:
    raise HttpError(403, 'Insufficient permissions')

# Example: Write access (owner, admin, member)
if membership.role == 'viewer':
    raise HttpError(403, 'Viewers cannot modify data')
```

## Frontend Visibility

The frontend hides UI elements based on user role:

```typescript
const { canManageBudgetAccounts, canManageBudgetData, canManageMembers } = usePermissions();

// Button visibility
{canManageBudgetAccounts && <Button>Add Account</Button>}
{canManageBudgetData && <Button>Add Transaction</Button>}
{canManageMembers && <Button>Add Member</Button>}
```

## Error Responses

| Code | Description |
|------|-------------|
| 401 | Not authenticated (invalid/missing token) |
| 403 | Not authorized (insufficient permissions) |
| 404 | Resource not found (or access denied to hide existence) |

## Security Notes

1. **Zero Trust**: Every request validates authentication, workspace membership, and role permissions
2. **Resource Isolation**: Users cannot access resources from other workspaces
3. **Cascading Access**: Resources inherit workspace scope through relationships
4. **Audit Trail**: All data records track created_by and updated_by user IDs
