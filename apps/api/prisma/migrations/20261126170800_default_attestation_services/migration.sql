INSERT INTO "PlatformCatalogService" (
  "code",
  "name",
  "description",
  "serviceFee",
  "estimatedDays",
  "enabled",
  "requiresOriginals",
  "requiredOriginals",
  "supportingDocuments",
  "updatedAt"
)
VALUES
  (
    'degree-attestation',
    'Degree certificate attestation',
    'Verification and attestation of an academic degree certificate.',
    4500,
    7,
    TRUE,
    TRUE,
    ARRAY['Original degree certificate'],
    ARRAY['National identity document'],
    CURRENT_TIMESTAMP
  ),
  (
    'birth-certificate-copy',
    'Certified birth certificate copy',
    'Request and delivery coordination for a certified birth certificate copy.',
    2500,
    5,
    TRUE,
    FALSE,
    ARRAY[]::TEXT[],
    ARRAY['Applicant identity document', 'Birth details'],
    CURRENT_TIMESTAMP
  ),
  (
    'document-legalization',
    'Document legalization',
    'Document review and legalization coordination.',
    6000,
    10,
    TRUE,
    TRUE,
    ARRAY['Original document'],
    ARRAY['National identity document'],
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO NOTHING;
