# Role and Permission Matrix

| Capability | Customer | Shop | Rider | Agent | Operations | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Own profile and documents | CRUD | CRUD | CRUD | CRUD | Read | Read |
| Create orders | CRUD | - | - | - | On behalf | On behalf |
| Fulfil assigned work | - | Update print | Update delivery | Update attest | Override with reason | Override with reason |
| Partner verification | - | Own submission | Own submission | Own submission | Review | Approve/reject |
| Pricing/catalogue | Read | Own config | - | Own config | Propose | Manage |
| Refunds/settlements | Read own | Read own | Read own | Read own | Prepare | Approve |
| Audit and platform settings | - | - | - | - | Restricted | Full |

Authorization must combine role checks with resource ownership, partner assignment and explicit permissions. Admin overrides require a reason and audit event.

Rider identity is taken from the authenticated session, never a request-supplied rider ID. Rider applications remain pending until an administrator approves them; approval changes are audited and non-approved riders cannot go online, view assignments or update delivery status.
