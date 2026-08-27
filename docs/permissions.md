# Role-Based Permissions Matrix

This document describes the permission system and access control matrix for Owlgarth Finances.

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

Two role groups drive enforcement:
- **`ADMIN_ROLES`** (owner, admin) - structural resources: accounts, budgets,
  periods, and enabled currencies.
- **`WRITE_ROLES`** (owner, admin, member) - day-to-day records: transactions,
  transfers, categories, planned transactions, category budget amounts, receipts.

### Account Management (`ADMIN_ROLES`)

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View accounts + balances | ✓ | ✓ | ✓ | ✓ |
| Create account | ✓ | ✓ | ✗ | ✗ |
| Edit account | ✓ | ✓ | ✗ | ✗ |
| Archive / Unarchive | ✓ | ✓ | ✗ | ✗ |
| Delete account (record-free) | ✓ | ✓ | ✗ | ✗ |

### Currency Management (`ADMIN_ROLES`)

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View catalog + enabled currencies | ✓ | ✓ | ✓ | ✓ |
| Enable / disable / create custom currency | ✓ | ✓ | ✗ | ✗ |
| Reorder enabled currencies (first = primary) | ✓ | ✓ | ✗ | ✗ |

### Budget & Period Management (`ADMIN_ROLES`)

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View budgets, periods, summaries | ✓ | ✓ | ✓ | ✓ |
| Create / edit / archive budget | ✓ | ✓ | ✗ | ✗ |
| Create / edit / delete period (custom cadence) | ✓ | ✓ | ✗ | ✗ |

### Category & Planned-Amount Management (`WRITE_ROLES`)

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View categories | ✓ | ✓ | ✓ | ✓ |
| Create / edit / archive / delete category | ✓ | ✓ | ✓ | ✗ |
| Set / clear category budget amount | ✓ | ✓ | ✓ | ✗ |

### Transaction Management (`WRITE_ROLES`)

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View transactions | ✓ | ✓ | ✓ | ✓ |
| Create / edit / delete transaction | ✓ | ✓ | ✓ | ✗ |
| Bulk-reassign account | ✓ | ✓ | ✓ | ✗ |
| Manage line items | ✓ | ✓ | ✓ | ✗ |

### Receipt Attachment & Extraction (`WRITE_ROLES`)

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View / download attachments | ✓ | ✓ | ✓ | ✓ |
| Upload / delete attachment | ✓ | ✓ | ✓ | ✗ |
| Trigger extraction / parse receipt | ✓ | ✓ | ✓ | ✗ |

> Extraction actions additionally require the parser to be configured
> (`PARSER_URL`); otherwise the endpoints return `503` and the UI hides them.

### Transfer Management (`WRITE_ROLES`)

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View transfers | ✓ | ✓ | ✓ | ✓ |
| Create / edit / delete transfer | ✓ | ✓ | ✓ | ✗ |

### Planned Transaction Management (`WRITE_ROLES`)

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| View planned | ✓ | ✓ | ✓ | ✓ |
| Create / edit / delete / execute planned | ✓ | ✓ | ✓ | ✗ |

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

### Workspace Management

| Action | Owner | Admin | Member | Viewer |
|--------|:-----:|:-----:|:------:|:------:|
| Create new workspace | ✓ | ✓ | ✓ | ✓ |
| Switch between workspaces | ✓ | ✓ | ✓ | ✓ |
| Leave workspace (non-owner) | ✗ | ✓ | ✓ | ✓ |
| Delete workspace (owner only) | ✓ | ✗ | ✗ | ✗ |

## Backend Enforcement

All permissions are enforced server-side in Django Ninja endpoints:

```python
from common.auth import JWTAuth, WorkspaceJWTAuth
from common.permissions import require_role
from workspaces.models import ADMIN_ROLES, WRITE_ROLES

# Authentication + workspace validation (for workspace-scoped endpoints)
@router.get('/endpoint', auth=WorkspaceJWTAuth())
def endpoint(request):
    user = request.auth  # Authenticated User instance
    workspace_id = request.auth.current_workspace_id  # Guaranteed to be set
    
    # Use for_workspace() for queries
    transactions = Transaction.objects.for_workspace(workspace_id)

# Authentication only (for non-workspace endpoints)
@router.get('/workspaces', auth=JWTAuth())
def list_workspaces(request):
    return Workspace.objects.filter(members__user=request.auth)

# Role validation
membership = WorkspaceMember.objects.get(
    workspace_id=workspace_id,
    user=request.auth
)
if membership.role not in ADMIN_ROLES:
    raise HttpError(403, 'Insufficient permissions')

# Or use require_role helper
require_role(request.auth, workspace_id, WRITE_ROLES)
```

## Frontend Visibility

The frontend hides UI elements based on user role:

```typescript
const { canManageAccounts, canManageCurrencies, canWrite, canManageMembers } = usePermissions();

// Button visibility
{canManageAccounts && <Button>New account</Button>}   // ADMIN_ROLES (also budgets)
{canManageCurrencies && <Button>Manage currencies</Button>}  // ADMIN_ROLES - gates the workspace-settings currencies section
{canWrite && <Button>New transaction</Button>}         // WRITE_ROLES (records)
{canManageMembers && <Button>Add member</Button>}

// canManageAccounts / canManageCurrencies / canWrite are the new-model aliases
// of canManageBudgetAccounts / canManageBudgetData (both still exported);
// canManageCurrencies is the same ADMIN_ROLES check as canManageAccounts.
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
