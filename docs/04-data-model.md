# Database and ER Diagram

The initial Prisma schema contains identity and order foundations. Domain modules should add tables through migrations rather than placing business state in JSON blobs.

```mermaid
erDiagram
  USERS ||--o{ ORDERS : places
  USERS ||--o{ USER_ROLES : has
  ROLES ||--o{ USER_ROLES : grants
  ORDERS ||--o{ ORDER_STATUS_HISTORY : records
  ORDERS ||--o{ DOCUMENTS : contains
  ORDERS ||--o{ PAYMENTS : has
  ORDERS ||--o{ DELIVERY_TASKS : dispatches
  USERS { uuid id PK
    string phone UK
    enum role
  }
  ORDERS { uuid id PK
    uuid customer_id FK
    string service_type
    string status
    decimal total_amount
  }
```

Planned tables are grouped as identity, partners, catalogue, orders, documents, delivery, finance and operations. Use UUID primary keys, foreign keys, composite indexes for operational queries, decimal money values and append-only status/audit records.
